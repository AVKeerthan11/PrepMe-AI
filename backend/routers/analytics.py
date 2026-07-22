"""
Analytics router — readiness score + priority queue
"""
import datetime
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.database import get_db
from db.models import User, QuizAttempt
from db.crud import get_mastery_scores_by_user
from routers.deps import get_current_user
from routers.planner import SCIENCE_WEIGHTAGE, MATHS_WEIGHTAGE
from core.personalization import compute_priority_queue, compute_readiness_index

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


def _normalize_subject(subject: Optional[str]) -> str:
    value = (subject or "science").lower()
    if "math" in value:
        return "maths"
    if "social" in value:
        return "social"
    if "english" in value:
        return "english"
    return "science"


def _weightage_for(user: User, subject_override: Optional[str] = None) -> dict:
    subject = _normalize_subject(subject_override or user.subject)
    if "science" in subject:
        return SCIENCE_WEIGHTAGE
    elif "math" in subject:
        return MATHS_WEIGHTAGE
    elif "social" in subject:
        from routers.planner import SOCIAL_WEIGHTAGE
        return SOCIAL_WEIGHTAGE
    elif "english" in subject:
        from routers.planner import ENGLISH_WEIGHTAGE
        return ENGLISH_WEIGHTAGE
    return SCIENCE_WEIGHTAGE


def _mastery_profile_for_subject(scores: list, user: User, subject_override: Optional[str] = None) -> dict:
    """Build mastery profile for active subject only; default missing topics to 0.5."""
    weightage = _weightage_for(user, subject_override)
    by_topic = {s.topic: s for s in scores if s.topic in weightage}
    profile = {}
    for topic in weightage:
        s = by_topic.get(topic)
        if s:
            profile[topic] = {
                "score": s.score,
                "sessions_done": s.sessions_done,
                "last_tested": s.last_tested.isoformat() if s.last_tested else None,
            }
        else:
            profile[topic] = {
                "score": 0.5,
                "sessions_done": 0,
                "last_tested": None,
            }
    return profile


@router.get("/")
async def get_analytics(
    subject: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scores = await get_mastery_scores_by_user(db, user.id)

    active_subject = _normalize_subject(subject or user.subject)
    weightage = _weightage_for(user, active_subject)
    subject_topics = set(weightage.keys())
    mastery_profile = _mastery_profile_for_subject(scores, user, active_subject)

    attempt_result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.user_id == user.id,
            QuizAttempt.topic.in_(subject_topics),
        )
    )
    attempts = list(attempt_result.scalars().all())

    exam_date = user.exam_date or (datetime.date.today() + datetime.timedelta(days=30))
    days_to_exam = max((exam_date - datetime.date.today()).days, 1)

    priority = compute_priority_queue(mastery_profile, weightage, days_to_exam)

    topic_perf = []
    for topic in sorted(mastery_profile.keys()):
        info = mastery_profile[topic]
        topic_attempts = [a for a in attempts if a.topic == topic]
        correct = sum(1 for a in topic_attempts if a.is_correct)
        total = len(topic_attempts)
        score = info["score"]
        tag = "Weak" if score < 0.5 else ("Building" if score < 0.7 else "Good")
        topic_perf.append({
            "topic": topic,
            "score": score,
            "tag": tag,
            "sessions_done": info["sessions_done"],
            "quiz_attempts": total,
            "quiz_accuracy": round(correct / total, 3) if total else None,
        })

    study_log = {}
    readiness = compute_readiness_index(
        mastery_profile, weightage, days_to_exam, study_log, user.daily_hours * 0.8
    )

    avg_mastery = sum(t["score"] for t in topic_perf) / max(len(topic_perf), 1)
    total_sessions = sum(t["sessions_done"] for t in topic_perf)

    scored_attempts = [a.score for a in attempts if a.score is not None]
    avg_score = round(sum(scored_attempts) / len(scored_attempts), 3) if scored_attempts else 0.0

    timed_attempts = [a.time_taken_seconds for a in attempts if a.time_taken_seconds is not None and a.time_taken_seconds > 0]
    avg_time_seconds = round(sum(timed_attempts) / len(timed_attempts), 3) if timed_attempts else 0.0

    return {
        "readiness": readiness,
        "days_to_exam": days_to_exam,
        "sessions_done": total_sessions,
        "avg_mastery": round(avg_mastery, 3),
        "avg_score": avg_score,
        "avg_time_seconds": avg_time_seconds,
        "topic_performance": topic_perf,
        "priority_queue": [
            {"topic": t, "score": s, "reason": r}
            for t, s, r in priority
            if t in subject_topics
        ],
        "subject": active_subject,
    }
