"""
Planner router — full study plan with priority scoring, micro-goals, and reactive scheduling
"""
import uuid
import json
import datetime
from typing import List, Optional, Set, Dict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, or_, Integer

from db.database import get_db
from db.models import User, StudySession, MasteryScore, QuizAttempt, DoubtSession
from db.crud import (
    get_mastery_scores_by_user, get_mastery_score_by_topic,
    upsert_mastery_score, create
)
from routers.deps import get_current_user
from services.exam_service import SUBJECT_CHAPTERS

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
PLANNER_SUBJECTS = ("science", "maths", "social", "english")


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
    if value == "all":
        return "all"
    if "math" in value:
        return "maths"
    if "social" in value:
        return "social"
    if "english" in value:
        return "english"
    return "science"


def _display_subject(subject: Optional[str]) -> str:
    normalized = _normalize_subject(subject)
    if normalized == "maths":
        return "Mathematics"
    if normalized == "social":
        return "Social Studies"
    if normalized == "english":
        return "English"
    if normalized == "all":
        return "All"
    return "Science"


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
    if subject == "all":
        topics: Set[str] = set()
        for chapter_list in SUBJECT_CHAPTERS.values():
            topics.update(chapter_list)
        return topics
    if subject is None:
        return set(_weightage_for(user).keys())
    return set(_weightage_for_subject(subject).keys())


def _filter_scores_for_subject(scores: list, user: User, subject: Optional[str] = None) -> list:
    topics = _subject_topics(user, subject)
    return [s for s in scores if s.topic in topics]


def _filter_sessions_for_subject(sessions: list, user: User, subject: Optional[str] = None) -> list:
    if subject == "all":
        return sessions
    topics = _subject_topics(user, subject)
    return [
        s for s in sessions
        if s.session_type == "break"
        or (getattr(s, "subject", None) and _normalize_subject(getattr(s, "subject", None)) == _normalize_subject(subject or user.subject))
        or s.topic in topics
    ]


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


def _session_type(mastery: float, quiz_attempts: int = 0, quiz_accuracy: Optional[float] = None) -> str:
    if quiz_attempts == 0:
        return "study"
    if quiz_accuracy is not None and quiz_accuracy < 0.6:
        return "practice"
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
        "subject": _display_subject(getattr(s, "subject", None) or "science"),
        "subject_key": _normalize_subject(getattr(s, "subject", None) or "science"),
        "chapter": getattr(s, "chapter", None) or s.topic,
        "topic": s.topic,
        "date": s.date.isoformat(),
        "hour_start": getattr(s, "hour_start", None),
        "status": s.status,
        "duration_minutes": s.planned_minutes,
        "session_type": s.session_type,
        "micro_goals": goals,
        "completed": s.status == "done",
        "priority_score": s.priority_score,
        "mastery_at_schedule_time": s.mastery_at_schedule,
    }


def _chapter_prerequisites(subject: str, chapter: str) -> List[str]:
    chapters = SUBJECT_CHAPTERS.get(_normalize_subject(subject), SUBJECT_CHAPTERS["science"])
    if chapter not in chapters:
        return []
    index = chapters.index(chapter)
    return chapters[:index]


async def _count_sessions_for_date(db: AsyncSession, user_id, session_date: datetime.date) -> int:
    result = await db.execute(
        select(func.count(StudySession.id)).where(
            StudySession.user_id == user_id,
            StudySession.date == session_date,
        )
    )
    return int(result.scalar_one() or 0)


async def _next_available_schedule_date(db: AsyncSession, user_id, start_date: datetime.date) -> datetime.date:
    candidate = start_date
    while True:
        if await _count_sessions_for_date(db, user_id, candidate) < 3:
            return candidate
        candidate += datetime.timedelta(days=1)


async def _find_session_for_completion(
    db: AsyncSession,
    user: User,
    chapter: str,
    session_date: datetime.date,
) -> Optional[StudySession]:
    result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == user.id,
            StudySession.date == session_date,
            StudySession.status == "pending",
            or_(StudySession.chapter == chapter, StudySession.topic == chapter),
        ).order_by(StudySession.id.asc())
    )
    return result.scalars().first()


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
    normalized_subject = _normalize_subject(subject)
    if normalized_subject == "all":
        weightage = {
            topic: weight
            for subject_key in PLANNER_SUBJECTS
            for topic, weight in _weightage_for_subject(subject_key).items()
        }
    else:
        weightage = _weightage_for_subject(subject) if subject is not None else _weightage_for(user)
    scores = await get_mastery_scores_by_user(db, user.id)
    existing_topics = {s.topic for s in scores}

    for topic in weightage:
        if topic not in existing_topics:
            await upsert_mastery_score(db, user.id, topic, 0.5, 0)

    await db.flush()
    scores = await get_mastery_scores_by_user(db, user.id)
    return _filter_scores_for_subject(scores, user, subject)


async def _build_balanced_multi_subject_sessions(
    db: AsyncSession, user: User, scores: list
) -> List[StudySession]:
    """Build one global queue so every subject gets a slot before any repeats."""
    today = datetime.date.today()
    exam_date = _exam_date(user)
    available_days = [
        today + datetime.timedelta(days=offset)
        for offset in range((exam_date - today).days)
    ]
    if not available_days:
        return []

    total_daily_minutes = int((user.daily_hours if user.daily_hours is not None else 2.0) * 60)
    if total_daily_minutes < SESSION_MINUTES:
        return []
    exam_urgency = 1.0 / max((exam_date - today).days, 1)
    attempt_counts = await _get_quiz_attempt_counts(db, user.id)
    quiz_accuracy = await _get_quiz_accuracy_per_topic(db, user.id)

    score_by_topic = {score.topic: score for score in scores}
    queues: Dict[str, List[tuple]] = {}
    weights: Dict[str, float] = {}
    allocation_minutes: Dict[str, float] = {}
    scheduled_per_subject: Dict[str, int] = {key: 0 for key in PLANNER_SUBJECTS}
    for subject_key in PLANNER_SUBJECTS:
        topic_scores = [
            score_by_topic[topic]
            for topic in _weightage_for_subject(subject_key)
            if topic in score_by_topic
        ]
        if not topic_scores:
            continue
        average_mastery = sum(item.score for item in topic_scores) / len(topic_scores)
        weights[subject_key] = (1.0 - average_mastery) + exam_urgency
        candidates = []
        for item in topic_scores:
            accuracy = quiz_accuracy.get(item.topic)
            priority = (1.0 - item.score) * _weightage_for_subject(subject_key).get(item.topic, 0.08)
            if accuracy is not None:
                priority *= 1.5 - accuracy
            candidates.append((item.topic, item.score, round(priority, 4), _session_type(item.score, attempt_counts.get(item.topic, 0), accuracy)))
        queues[subject_key] = sorted(candidates, key=lambda entry: (entry[2], -entry[1]), reverse=True)

    # Start from an equal per-subject base, then scale it by each subject's
    # urgency weight. The weighted totals still add up to the daily budget.
    active_subjects = list(queues)
    base_minutes = total_daily_minutes / max(len(active_subjects), 1)
    average_weight = sum(weights.values()) / max(len(weights), 1)
    allocation_minutes = {
        key: base_minutes * (weights[key] / average_weight)
        for key in active_subjects
    }

    existing_result = await db.execute(
        select(StudySession).where(StudySession.user_id == user.id, StudySession.date >= today)
    )
    daily_minutes: Dict[datetime.date, int] = {}
    daily_counts: Dict[datetime.date, int] = {}
    for session in existing_result.scalars().all():
        daily_minutes[session.date] = daily_minutes.get(session.date, 0) + session.planned_minutes
        daily_counts[session.date] = daily_counts.get(session.date, 0) + 1

    sessions: List[StudySession] = []
    cycle_seen: Set[str] = set()
    local_scheduled: Dict[datetime.date, Set[str]] = {}
    for day in available_days:
        while daily_minutes.get(day, 0) + SESSION_MINUTES <= total_daily_minutes:
            eligible = [key for key, queue in queues.items() if queue]
            if not eligible:
                await db.flush()
                return sessions
            unseen = [key for key in eligible if key not in cycle_seen]
            if unseen:
                subject_key = max(unseen, key=lambda key: allocation_minutes[key])
            else:
                cycle_seen.clear()
                subject_key = max(
                    eligible,
                    key=lambda key: allocation_minutes[key] - scheduled_per_subject[key] * SESSION_MINUTES,
                )
            topic, mastery, priority, session_type = queues[subject_key].pop(0)
            if await _session_exists_on_date(db, user, topic, day, local_scheduled):
                continue
            day_count = daily_counts.get(day, 0)
            session = StudySession(
                id=uuid.uuid4(), user_id=user.id, subject=subject_key, chapter=topic,
                date=day, hour_start=min(23, 18 + day_count), topic=topic,
                planned_minutes=SESSION_MINUTES, session_type=session_type, status="pending",
                priority_score=priority, mastery_at_schedule=mastery,
                micro_goals=json.dumps(normalize_goals(_micro_goals(session_type, topic))),
            )
            db.add(session)
            sessions.append(session)
            local_scheduled.setdefault(day, set()).add(topic)
            daily_minutes[day] = daily_minutes.get(day, 0) + SESSION_MINUTES
            daily_counts[day] = day_count + 1
            scheduled_per_subject[subject_key] += 1
            cycle_seen.add(subject_key)
    await db.flush()
    return sessions


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


async def _get_quiz_accuracy_per_topic(db: AsyncSession, user_id) -> Dict[str, float]:
    """Return {topic: accuracy} where accuracy = correct/total for each topic attempted.
    Returns 0.5 (neutral) for topics with no attempts."""
    result = await db.execute(
        select(QuizAttempt.topic, func.count(QuizAttempt.id), func.sum(
            # Cast is_correct bool to int: 1 for True, 0 for False
            QuizAttempt.is_correct.cast(Integer)
        ))
        .where(QuizAttempt.user_id == user_id)
        .group_by(QuizAttempt.topic)
    )
    accuracy_map: Dict[str, float] = {}
    for topic, total, correct in result.fetchall():
        if total and total > 0:
            accuracy_map[topic] = round((correct or 0) / total, 3)
    return accuracy_map


async def _build_and_save_sessions(
    db: AsyncSession, user: User, scores: list, subject: Optional[str] = None
) -> List[StudySession]:
    """
    Dynamically distribute study sessions across available days.

    Rules:
    - Available days = [today, exam_date) — exam day itself is NEVER scheduled.
    - Topics are sorted by composite priority: mastery gap × exam weight × urgency × quiz weakness.
    - If topics > available days: pack multiple topics per day (up to max_per_day cap).
    - If topics < available days: fill spare days with revision / weak-topic review / mock test / recap.
    - Falls back to weight-only priority if no mastery / quiz data exists.
    """
    today = datetime.date.today()
    exam_date = _exam_date(user)

    if _normalize_subject(subject) == "all":
        return await _build_balanced_multi_subject_sessions(db, user, scores)

    # Build list of schedulable dates — strictly BEFORE exam day
    available_days: List[datetime.date] = []
    cursor = today
    while cursor < exam_date:          # exam_date itself is excluded
        available_days.append(cursor)
        cursor += datetime.timedelta(days=1)

    if not available_days:
        return []

    total_days = len(available_days)
    days = total_days  # used for urgency calculation

    weightage = _weightage_for_subject(subject) if subject is not None else _weightage_for(user)
    max_per_day = _max_sessions_per_day(user)
    max_minutes = _max_minutes_per_day(user)

    # A subject with no completed work must still receive Phase 1 study
    # sessions during the final week. Mastery records are seeded at 0.5, so
    # sessions_done is the reliable signal that a topic was actually completed.
    subject_topics = _subject_topics(user, subject)
    completed_topics_query = select(func.count(MasteryScore.id)).where(
        MasteryScore.user_id == user.id,
        MasteryScore.topic.in_(subject_topics),
        MasteryScore.sessions_done > 0,
    )
    completed_topics_count = (await db.execute(completed_topics_query)).scalar() or 0
    days_until_exam = (exam_date - today).days
    is_revision_mode = days_until_exam <= 7 and completed_topics_count > 0

    # ── Ensure mastery records exist ───────────────────────────────────────────
    scores = _filter_scores_for_subject(scores, user, subject)
    if not scores:
        scores = await _ensure_mastery_for_subject(db, user, subject)

    # ── Fetch analytics data (quiz accuracy + attempt counts) ──────────────────
    attempt_counts: Dict[str, int] = await _get_quiz_attempt_counts(db, user.id)
    quiz_accuracy: Dict[str, float] = await _get_quiz_accuracy_per_topic(db, user.id)

    # ── Build priority-sorted topic list ───────────────────────────────────────
    # Composite priority = (1 - mastery) × weight × urgency × quiz_weakness_factor
    # quiz_weakness_factor: topics with low quiz accuracy get boosted priority.
    # If no quiz data exists, factor defaults to 1.0 (neutral — no bias).
    urgency = 1.0 + 1.0 / max(days, 1)

    sorted_topics: List[tuple] = []
    for s in scores:
        w = weightage.get(s.topic, 0.08)
        mastery = s.score
        attempts = attempt_counts.get(s.topic, 0)
        acc = quiz_accuracy.get(s.topic, None)    # None = no quiz data

        # quiz_factor: if accuracy data exists use (1.5 - accuracy) so weak topics
        # get up to 1.5× boost; if no data use 1.0 (neutral)
        quiz_factor = (1.5 - acc) if acc is not None else 1.0

        priority = round((1.0 - mastery) * w * urgency * quiz_factor, 4)
        stype = _session_type(mastery, attempts, acc)
        sorted_topics.append((s.topic, mastery, priority, stype))

    # Primary sort: highest priority first.
    # Secondary sort: lowest mastery first (tie-break toward weakest topics).
    sorted_topics.sort(key=lambda x: (x[2], -x[1]), reverse=True)

    if not sorted_topics:
        return []

    sessions: List[StudySession] = []
    local_scheduled: Dict[datetime.date, Set[str]] = {}

    # ── Track global daily load across ALL subjects ─────────────────────────────
    # Query every existing session for this user from today onwards so that
    # daily limits account for sessions already scheduled by other subjects.
    existing_result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == user.id,
            StudySession.date >= today,
        )
    )
    existing_sessions = list(existing_result.scalars().all())

    daily_minutes_map: Dict[datetime.date, int] = {}
    daily_count_map: Dict[datetime.date, int] = {}
    for es in existing_sessions:
        daily_minutes_map[es.date] = daily_minutes_map.get(es.date, 0) + es.planned_minutes
        daily_count_map[es.date] = daily_count_map.get(es.date, 0) + 1

    # ── Phase 1: schedule study topics across days ─────────────────────────────
    topic_index = 0
    for day in available_days:
        if topic_index >= len(sorted_topics):
            break

        # Initialize from global tracking maps (accounts for other subjects)
        day_minutes = daily_minutes_map.get(day, 0)
        day_count = daily_count_map.get(day, 0)

        while topic_index < len(sorted_topics):
            # Enforce per-day minute and session caps
            if day_minutes + SESSION_MINUTES > max_minutes:
                break
            if day_count >= max_per_day:
                break

            topic, mastery, priority, stype = sorted_topics[topic_index]

            # Skip if already scheduled on this day (DB or local buffer)
            if await _session_exists_on_date(db, user, topic, day, local_scheduled):
                topic_index += 1
                continue

            # Dynamic hour: stagger sessions based on how many are already on this day
            dynamic_hour = min(23, 18 + day_count)

            goals = normalize_goals(_micro_goals(stype, topic))
            sess = StudySession(
                id=uuid.uuid4(),
                user_id=user.id,
                subject=_normalize_subject(subject if subject is not None else user.subject),
                chapter=topic,
                date=day,
                hour_start=dynamic_hour,
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

            # Keep global tracking maps in sync
            daily_count_map[day] = day_count
            daily_minutes_map[day] = day_minutes

    # ── Phase 2: fill spare days when topics < available days ──────────────────
    # Identify days that have no sessions assigned yet
    days_used: Set[datetime.date] = {s.date for s in sessions}
    spare_days = [d for d in available_days if d not in days_used]

    if spare_days and sorted_topics:
        # Collect weak topics (mastery < 0.5) for revision filler
        weak_topics = [(t, m, p, st) for t, m, p, st in sorted_topics if m < 0.5]
        # If fewer weak topics than spare days, cycle through all topics
        filler_pool = weak_topics if is_revision_mode and weak_topics else sorted_topics

        # Determine if a mock test day should be inserted:
        # Insert one mock day if there are 7+ available days and exam date is far enough
        mock_inserted = False
        mock_threshold_day = exam_date - datetime.timedelta(days=3)

        for idx, day in enumerate(spare_days):
            # Enforce daily limits for Phase 2 fillers too
            filler_day_minutes = daily_minutes_map.get(day, 0)
            filler_day_count = daily_count_map.get(day, 0)
            if filler_day_minutes + SESSION_MINUTES > max_minutes:
                continue
            if filler_day_count >= max_per_day:
                continue

            # Reserve the last spare day before exam (within 3 days) for full revision
            days_to_exam = (exam_date - day).days

            if days_to_exam <= 3:
                # Full revision day
                filler_topic = "Full Revision"
                filler_stype = "revision"
                filler_goals = normalize_goals([
                    {"text": "Review all chapter summaries", "done": False},
                    {"text": "Redo your weakest quiz topics", "done": False},
                    {"text": "Go through your Mistake Journal", "done": False},
                ])
                filler_priority = 0.9
                filler_mastery = 0.0
            elif not mock_inserted and total_days >= 5 and day <= mock_threshold_day:
                # Insert one mock test day
                filler_topic = "Full Mock Test"
                filler_stype = "mock"
                filler_goals = normalize_goals([
                    {"text": "Attempt a timed full mock paper", "done": False},
                    {"text": "Aim for 80%+ accuracy", "done": False},
                    {"text": "Review every mistake immediately after", "done": False},
                ])
                filler_priority = 0.85
                filler_mastery = 0.0
                mock_inserted = True
            else:
                # Weak-topic revision / recap
                filler_entry = filler_pool[idx % len(filler_pool)]
                filler_topic_name, filler_m, _, _ = filler_entry
                # Skip if already scheduled today
                if await _session_exists_on_date(db, user, filler_topic_name, day, local_scheduled):
                    continue
                filler_topic = filler_topic_name
                filler_stype = "revision"
                filler_goals = normalize_goals(_micro_goals("revision", filler_topic_name))
                filler_priority = round((1.0 - filler_m) * urgency, 4)
                filler_mastery = filler_m

            # Dynamic hour: stagger based on existing sessions for this day
            filler_dynamic_hour = min(23, 18 + filler_day_count)

            filler_sess = StudySession(
                id=uuid.uuid4(),
                user_id=user.id,
                subject=_normalize_subject(subject if subject is not None else user.subject),
                chapter=filler_topic,
                date=day,
                hour_start=filler_dynamic_hour,
                topic=filler_topic,
                planned_minutes=SESSION_MINUTES,
                session_type=filler_stype,
                status="pending",
                priority_score=filler_priority,
                mastery_at_schedule=filler_mastery,
                micro_goals=json.dumps(filler_goals),
            )
            db.add(filler_sess)
            sessions.append(filler_sess)
            local_scheduled.setdefault(day, set()).add(filler_topic)

            # Keep global tracking maps in sync
            daily_count_map[day] = daily_count_map.get(day, 0) + 1
            daily_minutes_map[day] = daily_minutes_map.get(day, 0) + SESSION_MINUTES

    await db.flush()
    return sessions


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/")
async def get_plan(
    subject: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all study sessions for authenticated user, filtered by subject if provided."""
    today = datetime.date.today()
    days = _days_left(user)
    exam_countdown = days <= 7
    active_subject = _normalize_subject(subject or user.subject)
    include_all = active_subject == "all"

    # Query only user's sessions - NEVER seed or generate defaults
    result = await db.execute(
        select(StudySession)
        .where(
            StudySession.user_id == user.id,
            StudySession.date >= today,
        )
        .order_by(StudySession.date, StudySession.priority_score.desc())
    )
    all_sessions = list(result.scalars().all())
    
    # Filter by subject if not "all"
    sessions = all_sessions if include_all else _filter_sessions_for_subject(all_sessions, user, active_subject)

    # Recompute session_type from current mastery + attempt counts
    if sessions:
        scores = await get_mastery_scores_by_user(db, user.id)
        mastery_map = {s.topic: s.score for s in scores}
        attempt_counts = await _get_quiz_attempt_counts(db, user.id)
        quiz_accuracy = await _get_quiz_accuracy_per_topic(db, user.id)
        for sess in sessions:
            if sess.status == "pending":
                m = mastery_map.get(sess.topic, 0.5)
                a = attempt_counts.get(sess.topic, 0)
                new_type = _session_type(m, a, quiz_accuracy.get(sess.topic))
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


class GenerateSessionBody(BaseModel):
    subject: str
    chapter: str
    session_type: str = "study"  # "study" | "practice" | "revision" | "mock"
    preferred_hours: List[int] = Field(default_factory=list)
    days: int = 3
    duration_minutes: int = 45  # Duration per session in minutes


@router.post("/generate-session")
async def generate_session(
    body: GenerateSessionBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subject = _normalize_subject(body.subject)
    if subject == "all":
        subject = _normalize_subject(user.subject)

    # Convert normalized subject to SUBJECT_CHAPTERS key
    subject_key = subject
    if subject == "maths":
        subject_key = "mathematics"
    elif subject == "social":
        subject_key = "social studies"
    
    chapters = SUBJECT_CHAPTERS.get(subject_key, SUBJECT_CHAPTERS["science"])
    if body.chapter not in chapters:
        raise HTTPException(status_code=400, detail="Chapter not found for subject")

    prerequisites = _chapter_prerequisites(subject, body.chapter)
    preferred_hours = [hour for hour in body.preferred_hours if 0 <= int(hour) <= 23]
    if not preferred_hours:
        preferred_hours = [18]
    
    # Validate session_type
    session_type = body.session_type.lower()
    if session_type not in ["study", "practice", "revision", "mock"]:
        session_type = "study"
    
    # Validate and use duration_minutes
    duration_minutes = max(15, min(int(body.duration_minutes or 45), 180))  # Between 15 and 180 minutes

    today = datetime.date.today()
    target_days = max(1, min(int(body.days or 3), 7))
    sessions: List[StudySession] = []
    candidate_date = today + datetime.timedelta(days=1)
    study_session_count = 0

    while len(sessions) < target_days:
        candidate_date = await _next_available_schedule_date(db, user.id, candidate_date)

        if user.exam_date and candidate_date >= user.exam_date:
            if len(sessions) == 0:
                raise HTTPException(status_code=400, detail="Schedule full before exam.")
            break

        existing_same_day = await db.execute(
            select(StudySession.id).where(
                StudySession.user_id == user.id,
                StudySession.date == candidate_date,
                or_(StudySession.chapter == body.chapter, StudySession.topic == body.chapter),
            ).limit(1)
        )
        if existing_same_day.scalar_one_or_none() is not None:
            candidate_date += datetime.timedelta(days=1)
            continue

        hour_start = preferred_hours[len(sessions) % len(preferred_hours)]
        session = StudySession(
            id=uuid.uuid4(),
            user_id=user.id,
            subject=subject,
            chapter=body.chapter,
            date=candidate_date,
            hour_start=hour_start,
            topic=body.chapter,
            planned_minutes=duration_minutes,
            actual_minutes=0,
            session_type=session_type,
            status="pending",
            priority_score=0.0,
            mastery_at_schedule=0.5,
            micro_goals=json.dumps(normalize_goals(_micro_goals(session_type, body.chapter))),
        )
        db.add(session)
        sessions.append(session)
        study_session_count += 1
        
        # Insert break after every 2 study sessions on same day
        if study_session_count % 2 == 0 and study_session_count > 0:
            # Check if we already have 2 sessions on this date
            count_on_date = await _count_sessions_for_date(db, user.id, candidate_date)
            if count_on_date >= 2:
                # Add break session with next available hour
                next_hour = hour_start + 1 if hour_start < 23 else hour_start
                break_session = StudySession(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    subject=subject,
                    chapter="Break",
                    date=candidate_date,
                    hour_start=next_hour,
                    topic="Break",
                    planned_minutes=15,
                    actual_minutes=0,
                    session_type="break",
                    status="pending",
                    priority_score=0.0,
                    mastery_at_schedule=0.0,
                    micro_goals=json.dumps([]),
                )
                db.add(break_session)
                sessions.append(break_session)
        
        candidate_date += datetime.timedelta(days=1)

    await db.flush()

    return {
        "sessions": [_serialize_session(s) for s in sessions],
        "prerequisites": prerequisites,
    }


@router.patch("/sessions/{session_id}/complete")
async def complete_study_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a session as complete. Updates status and timestamp in database."""
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

    sess.status = "done"
    sess.actual_minutes = sess.planned_minutes
    # Set completed_at if the column exists (handle gracefully if it doesn't)
    if hasattr(sess, 'completed_at'):
        sess.completed_at = datetime.datetime.now()
    
    await db.commit()
    return _serialize_session(sess)


@router.delete("/sessions/{session_id}")
async def delete_study_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a study session from database. Returns 403 if session doesn't belong to user."""
    try:
        sess_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id format")

    result = await db.execute(
        select(StudySession).where(
            StudySession.id == sess_uuid,
        )
    )
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Verify ownership
    if sess.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this session")

    await db.delete(sess)
    await db.commit()
    return {"deleted": True, "session_id": session_id}


@router.get("/check-completion")
async def check_completion(
    subject: str,
    chapter: str,
    date: datetime.date,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    date_str = date.isoformat()

    quiz_result = await db.execute(
        select(func.count(QuizAttempt.id)).where(
            QuizAttempt.user_id == user.id,
            func.date(QuizAttempt.attempted_at) == date_str,
            QuizAttempt.topic.ilike(f"%{chapter}%"),
        )
    )
    quiz_count = int(quiz_result.scalar_one() or 0)

    tutor_result = await db.execute(
        select(func.count(DoubtSession.id)).where(
            DoubtSession.user_id == user.id,
            func.date(DoubtSession.created_at) == date_str,
            DoubtSession.chapter == chapter,
        )
    )
    tutor_count = int(tutor_result.scalar_one() or 0)

    if quiz_count >= 2 or tutor_count >= 3:
        sess = await _find_session_for_completion(db, user, chapter, date)
        if sess:
            sess.status = "done"
            sess.actual_minutes = sess.planned_minutes
            preferred_hours = [sess.hour_start] if sess.hour_start else [18]
            subject_key = _normalize_subject(subject)
            await db.flush()

            # Check for next chapter and auto-generate sessions
            chapters = SUBJECT_CHAPTERS.get(subject_key, SUBJECT_CHAPTERS["science"])
            next_chapter = None
            new_sessions_list = []
            
            if chapter in chapters:
                chapter_index = chapters.index(chapter)
                if chapter_index < len(chapters) - 1:
                    next_chapter = chapters[chapter_index + 1]
                    
                    # Generate sessions for next chapter
                    today = datetime.date.today()
                    candidate_date = today + datetime.timedelta(days=1)
                    for _ in range(3):  # Generate 3 sessions for next chapter
                        candidate_date = await _next_available_schedule_date(db, user.id, candidate_date)
                        
                        # Check if session already exists
                        existing = await db.execute(
                            select(StudySession.id).where(
                                StudySession.user_id == user.id,
                                StudySession.date == candidate_date,
                                or_(StudySession.chapter == next_chapter, StudySession.topic == next_chapter),
                            ).limit(1)
                        )
                        if existing.scalar_one_or_none() is None:
                            new_sess = StudySession(
                                id=uuid.uuid4(),
                                user_id=user.id,
                                subject=subject_key,
                                chapter=next_chapter,
                                date=candidate_date,
                                hour_start=preferred_hours[0],
                                topic=next_chapter,
                                planned_minutes=SESSION_MINUTES,
                                actual_minutes=0,
                                session_type="study",
                                status="pending",
                                priority_score=0.0,
                                mastery_at_schedule=0.5,
                                micro_goals=json.dumps(normalize_goals(_micro_goals("study", next_chapter))),
                            )
                            db.add(new_sess)
                            new_sessions_list.append(_serialize_session(new_sess))
                        candidate_date += datetime.timedelta(days=1)
                    
                    await db.flush()

            return {
                "completed": True,
                "session_id": str(sess.id),
                "session": _serialize_session(sess),
                "subject": subject,
                "chapter": chapter,
                "date": date_str,
                "next_chapter": next_chapter,
                "new_sessions": new_sessions_list,
            }

    return {
        "completed": False,
        "remaining_quiz": max(0, 2 - quiz_count),
        "remaining_tutor": max(0, 3 - tutor_count),
        "subject": subject,
        "chapter": chapter,
        "date": date_str,
        "next_chapter": None,
        "new_sessions": [],
    }


@router.post("/reschedule-missed")
async def reschedule_missed_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = datetime.date.today()
    result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == user.id,
            StudySession.status == "pending",
            StudySession.date < today,
        ).order_by(StudySession.date.asc(), StudySession.id.asc())
    )
    missed_sessions = list(result.scalars().all())

    rescheduled_sessions: List[dict] = []
    for sess in missed_sessions:
        new_date = await _next_available_schedule_date(db, user.id, today + datetime.timedelta(days=1))
        sess.date = new_date
        await db.flush()
        rescheduled_sessions.append(_serialize_session(sess))

    return {
        "rescheduled": len(rescheduled_sessions),
        "sessions": rescheduled_sessions,
    }


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
    quiz_accuracy = await _get_quiz_accuracy_per_topic(db, user.id)
    stype = _session_type(best.score, attempt_counts.get(best.topic, 0), quiz_accuracy.get(best.topic))

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
    subject: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = datetime.date.today()
    # A planner regeneration rebuilds the shared daily queue. A supplied
    # subject remains useful for scoped maintenance, while the normal path
    # deliberately includes every supported subject.
    active_subject = _normalize_subject(subject) if subject is not None else "all"

    # Delete ALL future pending sessions for this user (full rebuild)
    result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == user.id,
            StudySession.date >= today,
        )
    )
    future_sessions = list(result.scalars().all())
    for s in future_sessions:
        await db.delete(s)
    await db.flush()

    scores = await _ensure_mastery_for_subject(db, user, active_subject)
    if not scores:
        return {
            "sessions": [],
            "exam_countdown": False,
            "days_remaining": _days_left(user),
            "subject": active_subject,
        }

    sessions = await _build_and_save_sessions(
        db, user, scores,
        subject=active_subject
    )
    await db.commit()
    days = _days_left(user)

    return {
        "sessions": [_serialize_session(s) for s in sessions],
        "exam_countdown": days <= 7,
        "days_remaining": days,
        "subject": active_subject,
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

async def ensure_quiz_followup_session(
    db: AsyncSession, user: User, topic: str, score: float, subject: Optional[str] = None
) -> None:
    """Persist the practice/revision session produced by a completed chapter quiz."""
    subject_key = _normalize_subject(subject)
    if topic not in _subject_topics(user, subject_key):
        for candidate in PLANNER_SUBJECTS:
            if topic in _subject_topics(user, candidate):
                subject_key = candidate
                break
        else:
            return

    today = datetime.date.today()
    if score >= 0.6:
        result = await db.execute(
            select(StudySession).where(
                StudySession.user_id == user.id,
                StudySession.topic == topic,
                StudySession.session_type == "study",
                StudySession.status == "pending",
            )
        )
        for study_session in result.scalars().all():
            study_session.status = "done"
            study_session.actual_minutes = study_session.planned_minutes

    session_type = "practice" if score < 0.6 else "revision"
    window_end = today + datetime.timedelta(days=2)
    existing = await db.execute(
        select(StudySession.id).where(
            StudySession.user_id == user.id,
            StudySession.topic == topic,
            StudySession.session_type == session_type,
            StudySession.status == "pending",
            StudySession.date >= today,
            StudySession.date <= window_end,
        ).limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        return

    total_daily_minutes = int((user.daily_hours if user.daily_hours is not None else 2.0) * 60)
    candidate_dates = [today, today + datetime.timedelta(days=1), today + datetime.timedelta(days=2)]
    for candidate_date in candidate_dates:
        if user.exam_date and candidate_date >= user.exam_date:
            break
        load = await db.execute(
            select(StudySession.planned_minutes).where(
                StudySession.user_id == user.id,
                StudySession.date == candidate_date,
            )
        )
        planned_minutes = sum(row[0] for row in load.fetchall())
        if planned_minutes + SESSION_MINUTES > total_daily_minutes:
            continue
        count = await _count_sessions_for_date(db, user.id, candidate_date)
        priority = _priority(score, _weightage_for_subject(subject_key).get(topic, 0.08), _days_left(user))
        followup = StudySession(
            id=uuid.uuid4(), user_id=user.id, subject=subject_key, chapter=topic,
            date=candidate_date, hour_start=min(23, 18 + count), topic=topic,
            planned_minutes=SESSION_MINUTES, session_type=session_type, status="pending",
            priority_score=priority, mastery_at_schedule=score,
            micro_goals=json.dumps(normalize_goals(_micro_goals(session_type, topic))),
        )
        db.add(followup)
        await db.flush()
        return


async def ensure_revision_session(
    db: AsyncSession, user: User, topic: str, mastery: float
):
    """Backward-compatible wrapper for older callers."""
    if mastery < 0.6:
        await ensure_quiz_followup_session(db, user, topic, mastery, user.subject)
