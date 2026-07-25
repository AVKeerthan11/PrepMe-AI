"""
Profile router — student info + mastery management
"""
import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import User, MasteryScore
from db.crud import get_mastery_scores_by_user, upsert_mastery_score
from routers.deps import get_current_user
from routers.planner import SCIENCE_WEIGHTAGE, MATHS_WEIGHTAGE

router = APIRouter(prefix="/api/profile", tags=["Profile"])


def _subject_topics(subject: str) -> set:
    w = SCIENCE_WEIGHTAGE if subject == "science" else MATHS_WEIGHTAGE
    return set(w.keys())


class ProfilePatch(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    exam_date: Optional[str] = None
    daily_hours: Optional[float] = None
    avatar: Optional[str] = None


class MasteryUpdateReq(BaseModel):
    topic: str
    correct: Optional[int] = None
    total: Optional[int] = None
    score: Optional[float] = None
    subject: Optional[str] = None


def _days_to_exam(user: User) -> int:
    if not user.exam_date:
        return 30
    return max((user.exam_date - datetime.date.today()).days, 0)


def _mastery_dict(scores: list, subject: str) -> dict:
    topics = _subject_topics(subject)
    weightage = SCIENCE_WEIGHTAGE if subject == "science" else MATHS_WEIGHTAGE
    by_topic = {s.topic: s for s in scores if s.topic in topics}
    result = {}
    for topic in weightage:
        s = by_topic.get(topic)
        if s:
            result[topic] = {
                "score": s.score,
                "sessions_done": s.sessions_done,
                "last_tested": s.last_tested.isoformat() if s.last_tested else None,
            }
        else:
            result[topic] = {
                "score": 0.5,
                "sessions_done": 0,
                "last_tested": None,
            }
    return result


@router.get("/")
async def get_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scores = await get_mastery_scores_by_user(db, user.id)
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "subject": user.subject,
        "exam_date": user.exam_date.isoformat() if user.exam_date else None,
        "days_to_exam": _days_to_exam(user),
        "daily_hours": user.daily_hours,
        "avatar": user.avatar,
        "mastery": _mastery_dict(scores, user.subject),
    }


@router.patch("/")
async def update_profile(
    body: ProfilePatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    schedule_changed = False
    if body.name is not None:
        user.name = body.name
    if body.subject is not None and body.subject in ("science", "maths"):
        if user.subject != body.subject:
            schedule_changed = True
        user.subject = body.subject
    if body.exam_date is not None:
        new_date = datetime.date.fromisoformat(body.exam_date)
        if user.exam_date != new_date:
            schedule_changed = True
        user.exam_date = new_date
    if body.daily_hours is not None:
        user.daily_hours = max(0.5, min(12.0, body.daily_hours))
    if body.avatar is not None:
        user.avatar = body.avatar
    await db.flush()

    # Auto-regenerate planner when exam_date or subject changes
    if schedule_changed:
        try:
            from routers.planner import regenerate_plan as _regen
            # Call the regeneration logic directly (reuse existing endpoint internals)
            from sqlalchemy import select, delete
            from db.models import StudySession
            today = datetime.date.today()
            result = await db.execute(
                select(StudySession).where(
                    StudySession.user_id == user.id,
                    StudySession.date >= today,
                )
            )
            for s in result.scalars().all():
                await db.delete(s)
            await db.flush()

            from routers.planner import _ensure_mastery_for_subject, _build_and_save_sessions
            scores = await _ensure_mastery_for_subject(db, user, None)
            if scores:
                await _build_and_save_sessions(db, user, scores)
        except Exception as e:
            print(f"[profile] auto-regenerate planner failed: {e}")

    return {"ok": True, "schedule_regenerated": schedule_changed}


@router.post("/mastery")
async def update_mastery(
    body: MasteryUpdateReq,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from db.crud import get_mastery_score_by_topic
    existing = await get_mastery_score_by_topic(db, user.id, body.topic)
    old_score = existing.score if existing else 0.5
    old_sessions = existing.sessions_done if existing else 0

    if body.score is not None:
        new_score = round(max(0.1, min(1.0, body.score)), 3)
    else:
        correct = body.correct if body.correct is not None else 0
        total = body.total if body.total is not None else 1
        accuracy = correct / max(total, 1)
        new_score = round((1 - 0.3) * old_score + 0.3 * accuracy, 3)
        new_score = max(0.1, min(1.0, new_score))

    updated = await upsert_mastery_score(db, user.id, body.topic, new_score, old_sessions + 1)
    if updated.last_tested is None:
        updated.last_tested = datetime.date.today()
        await db.flush()

    if new_score < 0.6:
        from routers.planner import ensure_revision_session
        await ensure_revision_session(db, user, body.topic, new_score)

    return {"topic": body.topic, "score": new_score, "sessions_done": old_sessions + 1}

@router.get("/mastery-summary")
async def get_mastery_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scores = await get_mastery_scores_by_user(db, user.id)
    from services.exam_service import SUBJECT_CHAPTERS
    
    summary = {}
    scores_by_topic = {s.topic: s.score for s in scores}
    
    for subject_key, chapters in SUBJECT_CHAPTERS.items():
        total = len(chapters)
        subject_scores = [scores_by_topic[ch] for ch in chapters if ch in scores_by_topic]
        covered = sum(1 for s in subject_scores if s >= 0.6)
        percent = round((covered / total) * 100) if total > 0 else 0
            
        # mapping subject_key ('mathematics' -> 'maths', 'social studies' -> 'social') to match AppSubject format
        app_subject = subject_key
        if subject_key == "mathematics":
            app_subject = "maths"
        elif subject_key == "social studies":
            app_subject = "social"
            
        summary[app_subject] = {
            "percent": percent,
            "covered": covered,
            "total": total
        }
        
    return summary
