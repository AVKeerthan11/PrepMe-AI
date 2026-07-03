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