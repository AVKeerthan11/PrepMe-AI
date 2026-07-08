"""
Planner router — full study plan with priority scoring, micro-goals, and reactive scheduling
"""
import uuid
import json
import datetime
from typing import List, Optional, Set, Dict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func

from db.database import get_db
from db.models import User, StudySession, MasteryScore, QuizAttempt
from db.crud import (
    get_mastery_scores_by_user, get_mastery_score_by_topic,
    upsert_mastery_score, create
)
from routers.deps import get_current_user

router = APIRouter(prefix="/api/planner", tags=["Planner"])

# ── Weightage tables ───────────────────────────────────────────────────────────
SCIENCE_WEIGHTAGE = {
    "Exploring the Investigative World of Science": 0.08,
    "The Invisible Living World: Beyond Our Naked Eye": 0.09,
    "Health: The Ultimate Treasure": 0.09,
    "Electricity: Magnetic and Heating Effects": 0.10,
    "Exploring Forces": 0.10,
    "Pressure, Winds, Storms, and Cyclones": 0.09,
    "Particulate Nature of Matter": 0.09,
    "Nature of Matter: Elements, Compounds, and Mixtures": 0.09,
    "The Amazing World of Solutes, Solvents, and Solutions": 0.09,
    "Light: Mirrors and Lenses": 0.09,
    "Keeping Time with the Skies": 0.09,
}
MATHS_TOPICS = [
    "Rational Numbers",
    "Linear Equations in One Variable",
    "Understanding Quadrilaterals",
    "Practical Geometry",
    "Data Handling",
    "Squares and Square Roots",
    "Cubes and Cube Roots",
    "Comparing Quantities",
    "Algebraic Expressions and Identities",
    "Mensuration",
    "Exponents and Powers",
    "Direct and Inverse Proportions",
    "Factorisation",
    "Introduction to Graphs",
]
MATHS_WEIGHTAGE = {t: round(1 / len(MATHS_TOPICS), 3) for t in MATHS_TOPICS}

SOCIAL_TOPICS = [
    "Natural Resources and Their Conservation",
    "Reshaping India's Political Map",
    "The Rise of the Marathas",
    "The Colonial Era in India",
    "Universal Franchise and India's Electoral System",
    "The Parliamentary System: Legislature and Executive",
    "Factors of Production",
]
SOCIAL_WEIGHTAGE = {t: round(1 / len(SOCIAL_TOPICS), 3) for t in SOCIAL_TOPICS}

ENGLISH_TOPICS = [
    "The Wit that Won Hearts",
    "A Concrete Example",
    "Wisdom Paves the Way",
    "A Tale of Valour: Major Somnath Sharma and the Battle of Badgam",
    "Somebody's Mother",
    "Verghese Kurien: I Too Had A Dream",
    "The Case of the Fifth Word",
    "The Magic Brush of Dreams",
    "Spectacular Wonders",
    "The Cherry Tree",
    "Harvest Hymn",
    "Waiting for the Rain",
    "Feathered Friend",
    "Magnifying Glass",
    "Bibha Chowdhuri: The Beam of Light that Lit the Path for Women in Indian Science",
]
ENGLISH_WEIGHTAGE = {t: round(1 / len(ENGLISH_TOPICS), 3) for t in ENGLISH_TOPICS}

SESSION_MINUTES = 45


# ── Helpers ────────────────────────────────────────────────────────────────────

def _weightage_for(user: User) -> dict:
    subject = (user.subject or "science").lower()
    if "science" in subject:
        return SCIENCE_WEIGHTAGE
    elif "math" in subject:
        return MATHS_WEIGHTAGE
    elif "social" in subject:
        return SOCIAL_WEIGHTAGE
    elif "english" in subject:
        return ENGLISH_WEIGHTAGE
    return SCIENCE_WEIGHTAGE


def _normalize_subject(subject: Optional[str]) -> str:
    value = (subject or "science").lower()
    if "math" in value:
        return "maths"
    if "social" in value:
        return "social"
    if "english" in value:
        return "english"
    return "science"


def _weightage_for_subject(subject: Optional[str]) -> dict:
    normalized = _normalize_subject(subject)
    if normalized == "science":
        return SCIENCE_WEIGHTAGE
    if normalized == "maths":
        return MATHS_WEIGHTAGE
    if normalized == "social":
        return SOCIAL_WEIGHTAGE
    if normalized == "english":
        return ENGLISH_WEIGHTAGE
    return SCIENCE_WEIGHTAGE


def _subject_topics(user: User, subject: Optional[str] = None) -> Set[str]:
    if subject is None:
        return set(_weightage_for(user).keys())
    return set(_weightage_for_subject(subject).keys())


def _filter_scores_for_subject(scores: list, user: User, subject: Optional[str] = None) -> list:
    topics = _subject_topics(user, subject)
    return [s for s in scores if s.topic in topics]


def _filter_sessions_for_subject(sessions: list, user: User, subject: Optional[str] = None) -> list:
    topics = _subject_topics(user, subject)
    return [s for s in sessions if s.topic in topics or s.session_type == "break"]


def _max_sessions_per_day(user: User) -> int:
    daily = user.daily_hours if user.daily_hours is not None else 2.0
    # sessions_per_day = floor(daily_hours * 60 / 45), minimum 1
    return max(1, int(daily * 60 / SESSION_MINUTES))


def _max_minutes_per_day(user: User) -> int:
    daily = user.daily_hours if user.daily_hours is not None else 2.0
    # soft cap: daily_hours * 60 + 15
    return int(daily * 60) + 15


def _exam_date(user: User) -> datetime.date:
    return user.exam_date or (datetime.date.today() + datetime.timedelta(days=30))


def _days_left(user: User) -> int:
    return max((_exam_date(user) - datetime.date.today()).days, 1)


def _priority(mastery: float, weight: float, days: int) -> float:
    return round((1 - mastery) * weight * (1 + 1 / max(days, 1)), 4)


def _session_type(mastery: float, quiz_attempts: int = 0) -> str:
    if quiz_attempts == 0 or mastery < 0.4:
        return "study"
    elif mastery < 0.7:
        return "practice"
    else:
        return "revision"


def _micro_goals(session_type: str, topic: str) -> List[str]:
    if session_type == "study":
        return [
            f"Read {topic} section carefully",
            "Note key definitions",
            "Attempt 3 questions from Mistake Journal if available",
        ]
    elif session_type == "practice":
        return [
            f"Solve practice problems on {topic}",
            "Check your answers and note mistakes",
            "Try at least one harder question",
        ]
    elif session_type == "revision":
        return [
            f"Review your Mistake Journal for {topic}",
            "Re-attempt previously wrong questions",
            "Quiz yourself on weak points",
        ]
    else:
        return [
            f"Take a timed 5-question quiz on {topic}",
            "Aim for 80%+ accuracy",
            "Review any mistakes immediately",
        ]


def normalize_goals(goals_data) -> List[dict]:
    """Normalize old list of strings to new list of dicts with 'text' and 'done' fields."""
    if not goals_data:
        return []
    if not isinstance(goals_data, list):
        return []
    if len(goals_data) > 0 and isinstance(goals_data[0], str):
        return [{"text": g, "done": False} for g in goals_data]
    
    normalized = []
    for g in goals_data:
        if isinstance(g, dict):
            normalized.append({
                "text": g.get("text", ""),
                "done": bool(g.get("done", False))
            })
        elif isinstance(g, str):
            normalized.append({
                "text": g,
                "done": False
            })
    return normalized


def _serialize_session(s: StudySession) -> dict:
    goals = []
    if s.micro_goals:
        try:
            goals = json.loads(s.micro_goals)
        except Exception:
            goals = []
    goals = normalize_goals(goals)
    return {
        "id": str(s.id),
        "topic": s.topic,
        "date": s.date.isoformat(),
        "duration_minutes": s.planned_minutes,
        "session_type": s.session_type,
        "micro_goals": goals,
        "completed": s.status == "done",
        "priority_score": s.priority_score,
        "mastery_at_schedule_time": s.mastery_at_schedule,
    }


async def _session_exists_on_date(
    db: AsyncSession,
    user: User,
    topic: str,
    session_date: datetime.date,
    local_scheduled: Optional[Dict[datetime.date, Set[str]]] = None,
) -> bool:
    if local_scheduled and topic in local_scheduled.get(session_date, set()):
        return True
    result = await db.execute(
        select(StudySession.id).where(
            StudySession.user_id == user.id,
            StudySession.topic == topic,
            StudySession.date == session_date,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _ensure_mastery_for_subject(db: AsyncSession, user: User, subject: Optional[str] = None) -> List[MasteryScore]:
    """Seed missing topic mastery at 0.5 for the active subject, then return subject scores."""
    weightage = _weightage_for_subject(subject) if subject is not None else _weightage_for(user)
    scores = await get_mastery_scores_by_user(db, user.id)
    existing_topics = {s.topic for s in scores}

    for topic in weightage:
        if topic not in existing_topics:
            await upsert_mastery_score(db, user.id, topic, 0.5, 0)

    await db.flush()
    scores = await get_mastery_scores_by_user(db, user.id)
    return _filter_scores_for_subject(scores, user)


async def _topic_has_pending_sessions(
    db: AsyncSession, user: User, topic: str, today: datetime.date
) -> Optional[bool]:
    result = await db.execute(
        select(StudySession.status).where(
            StudySession.user_id == user.id,
            StudySession.topic == topic,
            StudySession.date >= today,
        )
    )
    statuses = [row[0] for row in result.fetchall()]
    if not statuses:
        return None
    return any(st == "pending" for st in statuses)


async def _get_quiz_attempt_counts(db: AsyncSession, user_id) -> Dict[str, int]:
    """Return {topic: attempt_count} for all topics this user has attempted."""
    result = await db.execute(
        select(QuizAttempt.topic, func.count(QuizAttempt.id))
        .where(QuizAttempt.user_id == user_id)
        .group_by(QuizAttempt.topic)
    )
    return {row[0]: row[1] for row in result.fetchall()}


async def _build_and_save_sessions(
    db: AsyncSession, user: User, scores: list, subject: Optional[str] = None
) -> List[StudySession]:
    """Distribute sessions across all 7 days starting from today, never skip a day."""
    today = datetime.date.today()
    exam_date = _exam_date(user)
    days = _days_left(user)
    exam_countdown = days <= 7
    weightage = _weightage_for_subject(subject) if subject is not None else _weightage_for(user)
    max_per_day = _max_sessions_per_day(user)
    max_minutes = _max_minutes_per_day(user)

    scores = _filter_scores_for_subject(scores, user, subject)
    if not scores:
        scores = await _ensure_mastery_for_subject(db, user, subject)

    attempt_counts = await _get_quiz_attempt_counts(db, user.id)

    sorted_topics: List[tuple] = []
    for s in scores:
        w = weightage.get(s.topic, 0.08)
        p = _priority(s.score, w, days)
        attempts = attempt_counts.get(s.topic, 0)
        stype = _session_type(s.score, attempts)
        sorted_topics.append((s.topic, s.score, p, stype))
    sorted_topics.sort(key=lambda x: x[2], reverse=True)

    if not sorted_topics:
        return []

    sessions: List[StudySession] = []
    local_scheduled: Dict[datetime.date, Set[str]] = {}
    topic_index = 0
    day = today

    # Distribute: fill Mon→Sun in order, never skip a day, respect per-day caps
    while day <= exam_date and topic_index < len(sorted_topics):
        day_minutes = 0
        day_count = 0

        while topic_index < len(sorted_topics):
            # Hard stop: would exceed soft cap minutes
            if day_minutes + SESSION_MINUTES > max_minutes:
                break
            # Hard stop: would exceed session count cap
            if day_count >= max_per_day:
                # Allow one extra session only if remaining topics need it
                # and we haven't hit the minute cap yet
                if day_count >= max_per_day + 1:
                    break
                if day_minutes + SESSION_MINUTES > max_minutes:
                    break
                # one extra allowed — fall through

            topic, mastery, priority, stype = sorted_topics[topic_index]

            if await _session_exists_on_date(db, user, topic, day, local_scheduled):
                topic_index += 1
                continue

            goals = normalize_goals(_micro_goals(stype, topic))
            sess = StudySession(
                id=uuid.uuid4(),
                user_id=user.id,
                date=day,
                topic=topic,
                planned_minutes=SESSION_MINUTES,
                session_type=stype,
                status="pending",
                priority_score=priority,
                mastery_at_schedule=mastery,
                micro_goals=json.dumps(goals),
            )
            db.add(sess)
            sessions.append(sess)
            local_scheduled.setdefault(day, set()).add(topic)
            topic_index += 1
            day_count += 1
            day_minutes += SESSION_MINUTES

        day += datetime.timedelta(days=1)

    await db.flush()
    return sessions


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/")
async def get_plan(
    subject: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = datetime.date.today()
    days = _days_left(user)
    exam_countdown = days <= 7
    active_subject = _normalize_subject(subject or user.subject)

    result = await db.execute(
        select(StudySession)
        .where(
            StudySession.user_id == user.id,
            StudySession.date >= today,
        )
        .order_by(StudySession.date, StudySession.priority_score.desc())
    )
    sessions = _filter_sessions_for_subject(list(result.scalars().all()), user, active_subject)

    if not sessions:
        scores = await _ensure_mastery_for_subject(db, user, active_subject)
        if scores:
            sessions = await _build_and_save_sessions(db, user, scores, active_subject)

    # Always recompute session_type from current mastery + attempt counts
    if sessions:
        scores = await get_mastery_scores_by_user(db, user.id)
        mastery_map = {s.topic: s.score for s in scores}
        attempt_counts = await _get_quiz_attempt_counts(db, user.id)
        for sess in sessions:
            if sess.status == "pending":
                m = mastery_map.get(sess.topic, 0.5)
                a = attempt_counts.get(sess.topic, 0)
                new_type = _session_type(m, a)
                if sess.session_type != new_type:
                    sess.session_type = new_type
        await db.flush()

    return {
        "sessions": [_serialize_session(s) for s in sessions],
        "exam_countdown": exam_countdown,
        "days_remaining": days,
        "subject": active_subject,
    }


class CompleteSessionBody(BaseModel):
    session_id: str
    topic: str
    subject: str


@router.post("/complete-session")
async def complete_session(
    body: CompleteSessionBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudySession).where(
            StudySession.id == uuid.UUID(body.session_id),
            StudySession.user_id == user.id,
        )
    )
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    sess.status = "done"
    sess.actual_minutes = sess.planned_minutes
    await db.flush()

    existing = await get_mastery_score_by_topic(db, user.id, body.topic)
    if existing:
        existing.sessions_done += 1
        existing.last_tested = datetime.date.today()
        await db.flush()
        return {
            "ok": True,
            "topic": body.topic,
            "sessions_done": existing.sessions_done,
            "mastery": existing.score,
        }
    return {"ok": True, "topic": body.topic}


@router.get("/study-now")
async def study_now(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = datetime.date.today()
    days = _days_left(user)
    scores = await _ensure_mastery_for_subject(db, user)
    if not scores:
        raise HTTPException(status_code=404, detail="No mastery data found")

    weightage = _weightage_for(user)

    eligible = []
    for s in scores:
        pending = await _topic_has_pending_sessions(db, user, s.topic, today)
        if pending is False:
            continue
        eligible.append(s)

    if not eligible:
        raise HTTPException(status_code=404, detail="All scheduled topics are complete")

    if days <= 7:
        best = min(eligible, key=lambda s: s.score)
    else:
        best = max(
            eligible,
            key=lambda s: _priority(s.score, weightage.get(s.topic, 0.08), days),
        )

    attempt_counts = await _get_quiz_attempt_counts(db, user.id)
    stype = _session_type(best.score, attempt_counts.get(best.topic, 0))

    return {
        "topic": best.topic,
        "session_type": stype,
        "duration_minutes": SESSION_MINUTES,
        "mastery": best.score,
        "priority_score": _priority(best.score, weightage.get(best.topic, 0.08), days),
        "micro_goals": normalize_goals(_micro_goals(stype, best.topic)),
        "exam_countdown": days <= 7,
        "subject": user.subject,
    }


@router.post("/regenerate")
async def regenerate_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = datetime.date.today()
    subject_topics = _subject_topics(user)

    # Delete all future sessions for this student+subject (pending or otherwise), keep past
    result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == user.id,
            StudySession.date >= today,
        )
    )
    future_sessions = list(result.scalars().all())
    for s in future_sessions:
        if s.topic in subject_topics:
            await db.delete(s)
    await db.flush()

    scores = await _ensure_mastery_for_subject(db, user)
    if not scores:
        return {
            "sessions": [],
            "exam_countdown": False,
            "days_remaining": _days_left(user),
            "subject": user.subject,
        }

    sessions = await _build_and_save_sessions(db, user, scores)
    days = _days_left(user)

    return {
        "sessions": [_serialize_session(s) for s in sessions],
        "exam_countdown": days <= 7,
        "days_remaining": days,
        "subject": user.subject,
    }


class ToggleGoalBody(BaseModel):
    goal_index: int
    done: bool


@router.patch("/session/{session_id}/goals")
async def toggle_session_goal(
    session_id: str,
    body: ToggleGoalBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sess_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id format")

    result = await db.execute(
        select(StudySession).where(
            StudySession.id == sess_uuid,
            StudySession.user_id == user.id,
        )
    )
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    goals = []
    if sess.micro_goals:
        try:
            goals = json.loads(sess.micro_goals)
        except Exception:
            goals = []

    goals = normalize_goals(goals)

    if 0 <= body.goal_index < len(goals):
        goals[body.goal_index]["done"] = body.done
    else:
        raise HTTPException(status_code=400, detail="Goal index out of range")

    sess.micro_goals = json.dumps(goals)
    await db.flush()

    return _serialize_session(sess)


@router.get("/burnout-check")
async def burnout_check(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = datetime.date.today()
    start_date = today - datetime.timedelta(days=6)

    # 1. Over-study & Monotony
    # Query StudySessions in the last 7 days (date range [today-6, today])
    result = await db.execute(
        select(StudySession)
        .where(
            StudySession.user_id == user.id,
            StudySession.date >= start_date,
            StudySession.date <= today,
        )
        .order_by(StudySession.date.asc())
    )
    all_sessions_7_days = list(result.scalars().all())
    # Filter sessions for subject
    sessions_7_days = _filter_sessions_for_subject(all_sessions_7_days, user)

    # Initialize daily hours dict and topics dict for the last 7 days
    daily_hours = {}
    topics_by_day = {}
    for i in range(7):
        d = start_date + datetime.timedelta(days=i)
        daily_hours[d] = 0.0
        topics_by_day[d] = set()

    for s in sessions_7_days:
        # Over-study uses actual minutes spent on all sessions on that day
        # Sum s.actual_minutes. For pending, actual_minutes is 0
        if s.date in daily_hours:
            daily_hours[s.date] += s.actual_minutes

        # Monotony checks completed sessions for the topic (excluding break sessions)
        if s.status == "done" and s.topic and s.session_type != "break":
            if s.date in topics_by_day:
                topics_by_day[s.date].add(s.topic)

    # Check Over-study: daily hours > user.daily_hours * 1.5 for 3 consecutive days
    user_daily_hours = user.daily_hours if user.daily_hours is not None else 3.0
    threshold = user_daily_hours * 1.5
    overstudy_days_consec = 0
    has_overstudy = False
    for i in range(7):
        d = start_date + datetime.timedelta(days=i)
        hours = daily_hours[d] / 60.0
        if hours > threshold:
            overstudy_days_consec += 1
            if overstudy_days_consec >= 3:
                has_overstudy = True
        else:
            overstudy_days_consec = 0

    # Check Monotony: same topic 3 days in a row
    has_monotony = False
    for i in range(5):
        d1 = start_date + datetime.timedelta(days=i)
        d2 = start_date + datetime.timedelta(days=i+1)
        d3 = start_date + datetime.timedelta(days=i+2)
        common = topics_by_day[d1] & topics_by_day[d2] & topics_by_day[d3]
        if common:
            has_monotony = True
            break

    # 2. Fatigue: 0 break sessions in last 5 sessions (date <= today, sorted by date desc)
    result_fatigue = await db.execute(
        select(StudySession)
        .where(
            StudySession.user_id == user.id,
            StudySession.date <= today,
        )
        .order_by(StudySession.date.desc())
    )
    all_past_sessions = _filter_sessions_for_subject(list(result_fatigue.scalars().all()), user)
    last_5_sessions = all_past_sessions[:5]

    has_fatigue = False
    if len(last_5_sessions) >= 5:
        num_breaks = sum(1 for s in last_5_sessions if s.session_type == "break")
        if num_breaks == 0:
            has_fatigue = True

    # Build warnings list
    warnings = []
    if has_overstudy:
        warnings.append({
            "type": "overstudy",
            "message": f"You have exceeded your daily study limit of {user_daily_hours} hours by 1.5x for 3 consecutive days. Take it easy!"
        })
    if has_monotony:
        warnings.append({
            "type": "monotony",
            "message": "You studied the same topic 3 days in a row. Try varying your study topics!"
        })
    if has_fatigue:
        warnings.append({
            "type": "fatigue",
            "message": "You haven't scheduled any break sessions in your last 5 sessions. Remember to rest!"
        })

    return {
        "has_warning": len(warnings) > 0,
        "warnings": warnings
    }


# ── Reactive scheduling helper (called from profile router) ───────────────────

async def ensure_revision_session(
    db: AsyncSession, user: User, topic: str, mastery: float
):
    """If mastery < 0.6, ensure a revision session exists within the next 2 days."""
    if mastery >= 0.6:
        return

    if topic not in _subject_topics(user):
        return

    today = datetime.date.today()
    window_end = today + datetime.timedelta(days=2)

    result = await db.execute(
        select(StudySession.id).where(
            StudySession.user_id == user.id,
            StudySession.topic == topic,
            StudySession.date >= today,
            StudySession.date <= window_end,
        ).limit(1)
    )
    if result.scalar_one_or_none():
        return

    target_date = today + datetime.timedelta(days=1)
    weightage = _weightage_for(user)
    days = _days_left(user)
    priority = _priority(mastery, weightage.get(topic, 0.08), days)
    goals = normalize_goals(_micro_goals("revision", topic))

    sess = StudySession(
        id=uuid.uuid4(),
        user_id=user.id,
        date=target_date,
        topic=topic,
        planned_minutes=SESSION_MINUTES,
        session_type="revision",
        status="pending",
        priority_score=priority,
        mastery_at_schedule=mastery,
        micro_goals=json.dumps(goals),
    )
    db.add(sess)
    await db.flush()
    print(f"[planner] reactive session inserted for topic={topic} date={target_date}")
