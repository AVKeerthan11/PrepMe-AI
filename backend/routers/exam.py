"""
Exam router — CBSE mock exam generation and grading
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from services.exam_service import generate_exam_paper, grade_subjective_answer
from db.database import get_db
from routers.deps import get_current_user
from db.models import User

router = APIRouter(prefix="/api/exam", tags=["Exam"])

VALID_SUBJECTS = {"Science", "Mathematics", "Social Studies", "English"}
VALID_CLASSES  = {8, 9, 10}


class ExamRequest(BaseModel):
    subject: str
    class_level: int
    topic_filter: Optional[str] = None
    syllabus_scope: str = "full" 


class GradeRequest(BaseModel):
    question: str
    student_answer: str
    correct_answer: str
    marks: int
    question_type: str  # e.g., "vsa", "sa", "la", "letter", "paragraph", etc.
    subject: str = "science"
    question_context: Optional[str] = None  # For passage-based questions


class GradeResponse(BaseModel):
    score: float
    max_marks: int
    feedback: str
    key_points_covered: list
    key_points_missed: list
    improvement_suggestions: str
    model_answer: str


@router.post("/generate")
async def generate_exam(
    request: ExamRequest,
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if request.class_level not in VALID_CLASSES:
        raise HTTPException(status_code=400, detail="Exam mode only for Classes 8–10")
    if request.subject not in VALID_SUBJECTS:
        raise HTTPException(status_code=400, detail="Invalid subject")

    paper = await generate_exam_paper(
        request.subject,
        request.class_level,
        request.topic_filter,
        request.syllabus_scope,
    )
    return paper


@router.post("/grade", response_model=GradeResponse)
async def grade_question(
    request: GradeRequest,
    current_student: User = Depends(get_current_user),
):
    """
    Grade a subjective answer using LLM-based semantic evaluation.
    Supports VSA, SA, LA, letter, paragraph, and other subjective question types.
    """
    if not request.student_answer or not request.student_answer.strip():
        return GradeResponse(
            score=0,
            max_marks=request.marks,
            feedback="No answer provided.",
            key_points_covered=[],
            key_points_missed=[],
            improvement_suggestions="Please provide an answer to receive marks.",
            model_answer=request.correct_answer
        )
    
    try:
        result = await grade_subjective_answer(
            question=request.question,
            student_answer=request.student_answer,
            correct_answer=request.correct_answer,
            max_marks=request.marks,
            question_type=request.question_type,
            subject=request.subject,
            question_context=request.question_context
        )
        
        return GradeResponse(
            score=result["score"],
            max_marks=result["max_marks"],
            feedback=result["feedback"],
            key_points_covered=result["key_points_covered"],
            key_points_missed=result["key_points_missed"],
            improvement_suggestions=result["improvement_suggestions"],
            model_answer=result["model_answer"]
        )
    except Exception as e:
        print(f"Grading error: {e}")
        # Fallback: return partial marks based on answer length
        min_length = 15
        good_length = request.marks * 40
        ans_length = len(request.student_answer.strip())
        
        if ans_length >= good_length:
            score = request.marks
            feedback = "Good length and effort shown."
        elif ans_length >= min_length:
            score = request.marks * 0.5
            feedback = "Partial answer. More detail needed for full marks."
        else:
            score = 0
            feedback = "Answer too short. Please elaborate."
        
        return GradeResponse(
            score=score,
            max_marks=request.marks,
            feedback=feedback,
            key_points_covered=[],
            key_points_missed=[],
            improvement_suggestions="Provide more detailed answers with specific examples.",
            model_answer=request.correct_answer
        )


class ExamSubmission(BaseModel):
    subject: str
    percentage: float


@router.post("/submit")
async def submit_exam(
    request: ExamSubmission,
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a full mock board exam. Updates mastery scores of all topics/chapters
    for the given subject based on the exam score, and triggers planner regeneration.
    """
    from services.exam_service import get_chapters_for_subject
    from db.crud import get_mastery_score_by_topic, upsert_mastery_score
    from sqlalchemy import select
    from db.models import StudySession
    import datetime

    subject_lower = request.subject.lower()
    if subject_lower == "social studies":
        subject_lower = "social"
    elif subject_lower == "mathematics":
        subject_lower = "maths"

    chapters = get_chapters_for_subject(request.subject)
    score_fraction = request.percentage / 100.0

    # 1. Update mastery score for all topics of the subject
    for topic in chapters:
        existing = await get_mastery_score_by_topic(db, current_student.id, topic)
        old_score = existing.score if existing else 0.5
        old_sessions = existing.sessions_done if existing else 0

        # Weighted update: 70% old, 30% new exam score
        new_score = round((1.0 - 0.3) * old_score + 0.3 * score_fraction, 3)
        new_score = max(0.1, min(1.0, new_score))

        updated = await upsert_mastery_score(db, current_student.id, topic, new_score, old_sessions + 1)
        if updated.last_tested is None:
            updated.last_tested = datetime.date.today()
            await db.flush()

        # Reactive revision session if mastery falls below 0.6
        if new_score < 0.6:
            from routers.planner import ensure_revision_session
            await ensure_revision_session(db, current_student, topic, new_score)

    # 2. Trigger planner regeneration
    today = datetime.date.today()

    # Delete all future pending/scheduled sessions for this user
    result = await db.execute(
        select(StudySession).where(
            StudySession.user_id == current_student.id,
            StudySession.date >= today,
        )
    )
    for s in result.scalars().all():
        await db.delete(s)
    await db.flush()

    # Rebuild plan
    from routers.planner import _build_and_save_sessions, _ensure_mastery_for_subject
    scores = await _ensure_mastery_for_subject(db, current_student, subject_lower if subject_lower != "all" else None)
    if scores:
        await _build_and_save_sessions(
            db, current_student, scores,
            subject=subject_lower if subject_lower != "all" else None
        )

    await db.commit()
    return {"ok": True, "message": "Exam submitted successfully. Mastery updated and study plan regenerated."}