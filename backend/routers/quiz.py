"""
Quiz API — question generation, assessment, misconception detection, mistake journal
"""
import os
import re
import json
import uuid
import random
import datetime
from datetime import datetime as dt
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from services.rag_service import retrieve, groq_chat, assess_answer, TOPIC_TO_CHAPTER
from config import get_settings
from db.database import get_db
from db.models import User, QuizMistake, QuizAttempt, MasteryScore
from db.crud import create
from routers.deps import get_current_user
from utils.paths import get_pdf_path
from services.quiz_service import (
    build_recent_questions_context,
    get_recent_questions,
    is_question_too_similar,
    log_recent_question_state,
    register_generated_question,
)

router = APIRouter(prefix="/api/quiz", tags=["Quiz"])
settings = get_settings()

QUESTION_TYPES = ["mcq", "truefalse", "fillblank", "short"]

SCIENCE_DEPENDENCIES = {
    "Pressure, Winds, Storms, and Cyclones": ["Exploring Forces"],
    "Light: Mirrors and Lenses": ["Exploring Forces"],
    "The Amazing World of Solutes, Solvents, and Solutions": 
      ["Particulate Nature of Matter",
       "Nature of Matter: Elements, Compounds, and Mixtures"],
    "Nature of Matter: Elements, Compounds, and Mixtures": 
      ["Particulate Nature of Matter"],
    "Health: The Ultimate Treasure": 
      ["The Invisible Living World: Beyond Our Naked Eye"],
    "Electricity: Magnetic and Heating Effects": ["Exploring Forces"],
}

MATHS_DEPENDENCIES = {
    "Linear Equations in One Variable": ["Rational Numbers"],
    "Understanding Quadrilaterals": ["Practical Geometry"],
    "Squares and Square Roots": ["Rational Numbers"],
    "Cubes and Cube Roots": ["Squares and Square Roots"],
    "Algebraic Expressions and Identities": 
      ["Linear Equations in One Variable"],
    "Factorisation": ["Algebraic Expressions and Identities"],
    "Comparing Quantities": ["Rational Numbers"],
    "Direct and Inverse Proportions": ["Comparing Quantities"],
    "Introduction to Graphs": ["Data Handling"],
    "Mensuration": ["Understanding Quadrilaterals"],
    "Exponents and Powers": ["Squares and Square Roots"],
}

SOCIAL_DEPENDENCIES = {
    "The Rise of the Marathas": ["Reshaping India's Political Map"],
    "The Colonial Era in India": ["The Rise of the Marathas"],
    "The Parliamentary System: Legislature and Executive": 
      ["Universal Franchise and India's Electoral System"],
}

ENGLISH_DEPENDENCIES = {
    # English chapters are mostly independent literary pieces with minimal prerequisites
}


# ── Difficulty label ───────────────────────────────────────────────────────────
def _difficulty_label(d: float) -> str:
    if d <= 0.35:
        return ("EASY — Remember and Understand level. "
                "Ask simple factual questions directly stated in the text. "
                "One correct answer should be obvious from the content.")
    elif d <= 0.65:
        return ("MEDIUM — Apply and Analyse level. "
                "Require understanding relationships between concepts. "
                "Use why/how questions that need reasoning beyond a single sentence.")
    else:
        return ("HARD — Evaluate and Create level. "
                "Require inference, comparison, or application to new scenarios "
                "not explicitly stated in the text.")


# ── Question generation (single Groq call with self-validation) ────────────────
VALIDATION_MODEL = "llama-3.1-8b-instant"


def _generation_models() -> list:
    return [settings.groq_model_primary, settings.groq_model_fallback]


def _build_combined_prompt(
    q_type: str,
    topic: str,
    context: str,
    difficulty: float,
    previous_questions: list,
    subject: str = "science",
    recent_questions_context: str = "",
    retry_note: str = "",
) -> str:
    diff_instr = _difficulty_label(difficulty)
    avoid_block = ""
    if previous_questions:
        listed = "\n".join(f"- {q}" for q in previous_questions)
        avoid_block = f"\n\nDO NOT generate any of these previously asked questions:\n{listed}\n"

    retry_block = f"\n{retry_note}\n" if retry_note else ""
    recent_block = f"\n{recent_questions_context}" if recent_questions_context else ""
    maths_rules = ""
    if subject == "maths":
        maths_rules = (
            "Do not use your own mathematical knowledge to verify or contradict the textbook. "
            "The explanation must only reference what is explicitly stated in the context.\n"
        )

    type_rules = ""
    if q_type == "truefalse":
        type_rules = (
            "For true/false: use a declarative STATEMENT (not a question). "
            "Do NOT start with How, Why, What, or Can.\n"
        )
    elif q_type == "fillblank":
        type_rules = (
            "For fill-blank: replace ONE important word or number in the MIDDLE of a sentence with ____ "
            "(not at the start or end). Include \"answer\" as the missing word.\n"
        )
    elif q_type == "mcq":
        type_rules = 'For MCQ: include "options" (4 choices A–D) and "correct" as the letter (A/B/C/D).\n'
    elif q_type == "short":
        type_rules = 'For short answer: include "reference_answer".\n'

    json_fields = (
        '"valid": true, "type": "' + q_type + '", "question": "...", "explanation": "..."'
    )
    if q_type == "mcq":
        json_fields += ', "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": "A"'
    elif q_type == "truefalse":
        json_fields += ', "correct": true'
    elif q_type == "fillblank":
        json_fields += ', "answer": "missing word"'
    else:
        json_fields += ', "reference_answer": "..."'

    return (
        f"Generate a {q_type} quiz question about {topic} for NCERT Class 8.\n"
        f"Based ONLY on this textbook content:\n{context}\n\n"
        f"DIFFICULTY: {diff_instr}\n"
        f"{avoid_block}{recent_block}{retry_block}{maths_rules}\n"
        "Requirements:\n"
        "- Question must be self-contained and clear\n"
        "- Must test a specific concept from the content\n"
        f"{type_rules}\n"
        "Return JSON only (no markdown fences):\n"
        "{\n"
        f"  {json_fields}\n"
        "}\n\n"
        "Set valid to false if you cannot generate a good question from this content."
    )


def _parse_question_json(raw: str) -> Optional[dict]:
    try:
        raw = re.sub(r"```json|```", "", raw).strip()
        return json.loads(raw)
    except Exception:
        return None


def _is_valid_response(data: dict) -> bool:
    """Self-reported validity from combined generation JSON."""
    valid = data.get("valid")
    if valid is False:
        return False
    if isinstance(valid, str):
        return valid.strip().lower() == "true"
    return bool(valid) and bool(data.get("question", "").strip())


def _normalize_question(data: dict, q_type: str) -> dict:
    """Strip validation field and normalize answer keys for the frontend."""
    out = {k: v for k, v in data.items() if k != "valid"}
    out["type"] = q_type
    if q_type == "fillblank" and "answer" in out and "correct" not in out:
        out["correct"] = out["answer"]
    return out


def _validate_question_external(data: dict, q_type: str) -> bool:
    """Optional fast validation call (not used in main path)."""
    question = data.get("question", "")
    validation_prompt = (
        f"Review this quiz question for a Class 8 student:\n"
        f"Question: {question}\nType: {q_type}\n\n"
        "Respond with ONLY the single word VALID or INVALID. No explanation.\n"
        "No numbering. No additional text. Just: VALID or INVALID"
    )
    try:
        raw = groq_chat(
            [{"role": "user", "content": validation_prompt}],
            model=VALIDATION_MODEL,
            temperature=0.1,
        )
        validation_text = raw.strip().upper()
        is_valid = validation_text.startswith("VALID")
        print(f"[quiz] validation: {q_type} -> {'VALID' if is_valid else 'INVALID'} ({validation_text[:30]})")
        return is_valid
    except Exception as e:
        print(f"[quiz] validation call failed: {e}")
        return False


def _generate_from_prompt(prompt: str, *, use_validation_model: bool = False) -> Optional[dict]:
    models = [VALIDATION_MODEL] if use_validation_model else _generation_models()
    for model in models:
        try:
            raw = groq_chat([{"role": "user", "content": prompt}], model=model, temperature=0.7)
            data = _parse_question_json(raw)
            if data:
                return data
        except Exception as e:
            print(f"[quiz] generate error with {model}: {e}")
    return None


def _log_chunks_used(chunks: list) -> None:
    for c in chunks:
        page_num = c.get("page_num") or str(c.get("pages", "?")).split("–")[0]
        chap = c.get("chapter_num")
        snippet = c.get("text", "")[:50].replace("\n", " ")
        print(f"[quiz] using chunk from page {page_num} chapter {chap}: {snippet}")


def _sample_chunks(chunks_sorted: list, exclude_hashes: Optional[set] = None) -> list:
    exclude_hashes = exclude_hashes or set()
    available = [c for c in chunks_sorted if c.get("chunk_hash") not in exclude_hashes]
    if not available:
        available = chunks_sorted
    n = len(available)
    if n >= 9:
        third = n // 3
        pool = (
            random.sample(available[:third], min(3, max(1, third))) +
            random.sample(available[third:2 * third], min(2, max(1, third))) +
            random.sample(available[2 * third:], min(2, max(1, n - 2 * third)))
        )
        return random.sample(pool, min(5, len(pool)))
    return random.sample(available, min(5, n))


# ── Misconception detection ────────────────────────────────────────────────────
def _detect_misconception(question: str, student_answer: str, correct_answer: str) -> str:
    prompt = (
        f"The student was asked: {question}\n"
        f"Their wrong answer was: {student_answer}\n"
        f"The correct answer is: {correct_answer}\n\n"
        "In 1-2 sentences, identify the specific misconception or gap in understanding that likely caused "
        "this wrong answer. Be specific, not generic. Do not say 'the student did not understand' — "
        "say exactly WHAT they misunderstood.\n"
        "Example: 'You likely confused pressure with force — pressure depends on both force AND the area "
        "it acts on, not just the magnitude of force.'\n"
        "Return only the misconception sentence, nothing else."
    )
    try:
        return groq_chat([{"role": "user", "content": prompt}], temperature=0.3)
    except Exception as e:
        print(f"[quiz] misconception detection failed: {e}")
        return ""


# ── Request / Response models ──────────────────────────────────────────────────
class QuestionRequest(BaseModel):
    topic: str
    difficulty: float = 0.5
    question_type: str = "mixed"
    question_index: int = 0
    subject: Optional[str] = None
    previous_questions: list = []


class AssessmentRequest(BaseModel):
    question: str
    question_type: str = "short"
    answer: str
    correct_answer: Optional[str] = None
    difficulty: float = 0.5
    subject: Optional[str] = None
    topic: Optional[str] = None          # for chapter-filtered retrieval
    time_taken_seconds: Optional[int] = None


class MistakeCreate(BaseModel):
    subject: str
    topic: str
    question: str
    student_answer: str
    correct_answer: str
    misconception: Optional[str] = None
    confidence: str = "unknown"


class TeachBackAssessmentRequest(BaseModel):
    topic: str
    subject: str
    concept: str
    student_answer: str
    mastery_score: float = 0.5


# ── Endpoints ──────────────────────────────────────────────────────────────────
@router.post("/generate-question")
async def create_question(
    req: QuestionRequest,
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        if req.question_type == "teach_back":
            concept = req.topic
            return {
                "question": f"Explain: {concept}",
                "type": "teach_back",
                "concept": concept
            }

        subject = (req.subject or current_student.subject or "science").lower()
        pdf_path = get_pdf_path(subject)
        if not pdf_path.exists():
            if subject == "maths":
                raise HTTPException(status_code=404, detail="Maths textbook not found. Please ensure ncert_maths_8.pdf is available.")
            raise HTTPException(status_code=404, detail=f"PDF not found: {pdf_path}")
        recent_questions = get_recent_questions(current_student.id.hex, subject, req.topic, limit=12)
        recent_questions_context = build_recent_questions_context(recent_questions)
        log_recent_question_state(current_student.id.hex, subject, req.topic)

        difficulty = max(0.0, min(1.0, req.difficulty))
        q_type = (QUESTION_TYPES[req.question_index % len(QUESTION_TYPES)]
                  if req.question_type in ("mixed",) or req.question_type not in QUESTION_TYPES
                  else req.question_type)

        topic_for_retrieve = req.topic
        chapter_num = TOPIC_TO_CHAPTER.get(topic_for_retrieve)
        print(
            f"[quiz] topic='{topic_for_retrieve}' -> chapter {chapter_num} "
            f"(lookup exact={topic_for_retrieve in TOPIC_TO_CHAPTER})"
        )
        chunks = retrieve(
            topic_for_retrieve, str(pdf_path), top_k=15,
            topic=topic_for_retrieve, subject=subject,
        )
        print(
            f"[quiz] topic='{topic_for_retrieve}' -> chapter {chapter_num} "
            f"-> {len(chunks)} chunks retrieved"
        )
        if not chunks:
            if subject in ("maths", "mathematics"):
                raise HTTPException(
                    status_code=404,
                    detail=f"No maths textbook content found for topic '{req.topic}'. "
                           "Check that ncert_maths_8.pdf is indexed and the topic name matches a chapter.",
                )
            raise HTTPException(status_code=404, detail=f"No content found for topic '{req.topic}' in the {subject} textbook")

        def _page_start(c: dict) -> int:
            try:
                return int(str(c.get("pages", "0")).split("–")[0])
            except Exception:
                return 0

        chunks_sorted = sorted(chunks, key=_page_start)

        def _finalize(data: dict, question_type: Optional[str] = None) -> dict:
            out = _normalize_question(data, question_type or q_type)
            out["difficulty"] = difficulty
            out["topic"] = req.topic
            return out

        sampled = _sample_chunks(chunks_sorted)
        _log_chunks_used(sampled)
        context = "\n\n".join(c["text"] for c in sampled)

        max_generation_rounds = 3
        used_hashes = set()
        for generation_round in range(max_generation_rounds):
            if generation_round == 0:
                sampled_round = sampled
                context_round = context
                retry_note = ""
            elif generation_round == 1:
                print(f"[quiz] first attempt invalid or repetitive, retrying with different chunks")
                used_hashes = {c.get("chunk_hash") for c in sampled}
                sampled_round = _sample_chunks(chunks_sorted, exclude_hashes=used_hashes)
                _log_chunks_used(sampled_round)
                context_round = "\n\n".join(c["text"] for c in sampled_round)
                retry_note = "Previous content did not yield a good question. Use different facts from this new context."
            else:
                print(f"[quiz] fallback attempt using factual MCQ")
                sampled_round = _sample_chunks(chunks_sorted, exclude_hashes=used_hashes)
                _log_chunks_used(sampled_round)
                context_round = "\n\n".join(c["text"] for c in sampled_round) if sampled_round else context
                retry_note = "Generate a simple, clear factual MCQ that is fully understandable on its own."

            prompt_round = _build_combined_prompt(
                q_type if generation_round < 2 else "mcq",
                req.topic,
                context_round,
                difficulty,
                req.previous_questions,
                subject,
                recent_questions_context=recent_questions_context,
                retry_note=retry_note,
            )
            data_round = _generate_from_prompt(prompt_round)
            if not data_round or not _is_valid_response(data_round):
                continue

            candidate = _finalize(data_round, question_type=q_type if generation_round < 2 else "mcq")
            if is_question_too_similar(candidate.get("question", ""), recent_questions):
                print(f"[quiz] recent-history similarity too high for round {generation_round + 1}, regenerating")
                continue

            register_generated_question(current_student.id.hex, subject, req.topic, candidate.get("question", ""))
            print(f"[quiz] generated valid {candidate.get('type', q_type)} question round={generation_round + 1}")
            return candidate

        raise HTTPException(status_code=500, detail="Failed to generate a valid question after trying all models")

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[quiz] UNEXPECTED ERROR in generate-question:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.post("/assess")
async def assess_student_answer(
    req: AssessmentRequest,
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subject = (req.subject or current_student.subject or "science").lower()
    pdf_path = get_pdf_path(subject)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"PDF not found: {pdf_path}")

    # ── Objective types: direct comparison ────────────────────────────────────
    if req.question_type in ("mcq", "truefalse", "fillblank") and req.correct_answer is not None:
        student = req.answer.strip().lower()
        correct = req.correct_answer.strip().lower()

        if req.question_type == "fillblank":
            is_correct = student == correct or correct in student or student in correct
        else:
            is_correct = student == correct

        misconception = ""
        if not is_correct:
            misconception = _detect_misconception(req.question, req.answer, req.correct_answer)

        result = {
            "overall_score": 1.0 if is_correct else 0.0,
            "score_percentage": 100 if is_correct else 0,
            "correctness": "correct" if is_correct else "incorrect",
            "feedback_for_student": "Well done!" if is_correct else f"The correct answer is: {req.correct_answer}",
            "key_points_covered": [],
            "key_points_missed": [],
            "model_answer": req.correct_answer,
            "misconception": misconception,
            "difficulty_level": req.difficulty,
            "sources_used": 0,
        }

    # ── Short answer: semantic grading ────────────────────────────────────────
    else:
        if not req.answer or len(req.answer.strip()) < 3:
            result = {
                "overall_score": 0.0, "score_percentage": 0,
                "correctness": "incorrect",
                "feedback_for_student": "Answer too short.",
                "key_points_covered": [], "key_points_missed": [],
                "model_answer": "", "misconception": "",
                "difficulty_level": req.difficulty, "sources_used": 0,
            }
        else:
            difficulty = max(0.0, min(1.0, req.difficulty))
            result = assess_answer(req.question, req.answer, str(pdf_path), difficulty, topic=req.topic, subject=subject)

            # Add misconception for wrong short answers (score < 0.5)
            is_wrong = result.get("overall_score", 1.0) < 0.5
            if is_wrong:
                model_ans = result.get("model_answer", "")
                result["misconception"] = _detect_misconception(req.question, req.answer, model_ans)
            else:
                result["misconception"] = ""

    # Save QuizAttempt
    is_correct = result.get("overall_score", 0.0) >= 0.5
    score_val = result.get("overall_score", 0.0)
    ref_answer = req.correct_answer or result.get("model_answer", "") or ""
    attempt_id = uuid.uuid4().hex

    stmt = text("""
        INSERT INTO quiz_attempts (
            id, user_id, topic, question_text, student_answer, 
            reference_answer, is_correct, bloom_level, attempted_at, 
            time_taken_seconds, score
        ) VALUES (
            :id, :user_id, :topic, :question_text, :student_answer, 
            :reference_answer, :is_correct, :bloom_level, :attempted_at, 
            :time_taken_seconds, :score
        )
    """)
    try:
        await db.execute(stmt, {
            "id": attempt_id,
            "user_id": current_student.id.hex,
            "topic": req.topic or "Unknown",
            "question_text": req.question,
            "student_answer": req.answer,
            "reference_answer": ref_answer,
            "is_correct": 1 if is_correct else 0,
            "bloom_level": req.question_type,
            "attempted_at": dt.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            "time_taken_seconds": req.time_taken_seconds or 0,
            "score": score_val or 0.0
        })
        await db.commit()
    except Exception as e:
        print(f"[quiz] failed to save QuizAttempt: {e}")

    return result


@router.get("/prerequisites")
async def get_prerequisites(
    topic: str,
    subject: str,
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subject_lower = subject.lower()
    if "science" in subject_lower:
        deps_map = SCIENCE_DEPENDENCIES
    elif "math" in subject_lower:
        deps_map = MATHS_DEPENDENCIES
    elif "social" in subject_lower:
        deps_map = SOCIAL_DEPENDENCIES
    elif "english" in subject_lower:
        deps_map = ENGLISH_DEPENDENCIES
    else:
        deps_map = {}

    prereqs = deps_map.get(topic, [])
    
    # Query MasteryProfile for student's scores on prerequisite topics
    mastery_gap = []
    if prereqs:
        stmt = select(MasteryScore).where(
            MasteryScore.user_id == current_student.id,
            MasteryScore.topic.in_(prereqs)
        )
        res = await db.execute(stmt)
        scores = res.scalars().all()
        
        found_topics = {s.topic: s.score for s in scores}
        for p in prereqs:
            score = found_topics.get(p, 0.5)  # default score is 0.5
            if score < 0.6:
                mastery_gap.append(p)
                
    return {
        "topic": topic,
        "prerequisites": prereqs,
        "mastery_gap": mastery_gap
    }


@router.get("/exam-prediction")
async def get_exam_prediction(
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from routers.planner import SCIENCE_WEIGHTAGE, MATHS_WEIGHTAGE, SOCIAL_WEIGHTAGE, ENGLISH_WEIGHTAGE
    
    subject = (current_student.subject or "science").lower()
    if "science" in subject:
        subject_topics = set(SCIENCE_WEIGHTAGE.keys())
    elif "math" in subject:
        subject_topics = set(MATHS_WEIGHTAGE.keys())
    elif "social" in subject:
        subject_topics = set(SOCIAL_WEIGHTAGE.keys())
    elif "english" in subject:
        subject_topics = set(ENGLISH_WEIGHTAGE.keys())
    else:
        subject_topics = set(SCIENCE_WEIGHTAGE.keys())

    # Get last 30 QuizAttempts for student's active subject
    stmt = select(QuizAttempt).where(
        QuizAttempt.user_id == current_student.id,
        QuizAttempt.topic.in_(subject_topics)
    ).order_by(QuizAttempt.attempted_at.desc()).limit(30)
    
    res = await db.execute(stmt)
    attempts = res.scalars().all()
    
    if not attempts:
        return {
            "predicted_score": 50.0,
            "confidence_level": "Medium",
            "topic_breakdown": []
        }
        
    attempts_by_topic = {}
    for a in attempts:
        attempts_by_topic.setdefault(a.topic, []).append(a)
        
    # Get MasteryScores for the student on these topics
    m_stmt = select(MasteryScore).where(
        MasteryScore.user_id == current_student.id,
        MasteryScore.topic.in_(attempts_by_topic.keys())
    )
    m_res = await db.execute(m_stmt)
    mastery_scores = m_res.scalars().all()
    mastery_map = {m.topic: m.score for m in mastery_scores}
    
    topic_breakdown = []
    for topic, topic_attempts in attempts_by_topic.items():
        total = len(topic_attempts)
        correct = sum(1 for a in topic_attempts if a.is_correct)
        accuracy = correct / total if total > 0 else 0.0
        
        # confidence_calibration: (Sure answers that were correct) / (total Sure answers) — default 0.5 if none
        confidence_calibration = 0.5
        
        mastery = mastery_map.get(topic, 0.5)
        
        topic_score = mastery * 0.5 + accuracy * 0.3 + confidence_calibration * 0.2
        topic_breakdown.append({
            "topic": topic,
            "score": round(topic_score, 4),
            "accuracy": round(accuracy, 4),
            "mastery": round(mastery, 4),
            "confidence_calibration": confidence_calibration
        })
        
    # predicted_score = average topic_score × 100
    avg_topic_score = sum(t["score"] for t in topic_breakdown) / len(topic_breakdown)
    predicted_score = round(avg_topic_score * 100, 2)
    
    confidence_level = "High" if predicted_score > 75 else ("Medium" if predicted_score > 50 else "Low")
    
    return {
        "predicted_score": predicted_score,
        "confidence_level": confidence_level,
        "topic_breakdown": topic_breakdown
    }


@router.post("/assess-teachback")
async def assess_teachback(
    req: TeachBackAssessmentRequest,
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prompt = (
        f"You are a Class 8 {req.subject} teacher. A student was asked to explain:\n"
        f"{req.concept}.\n"
        f"Their explanation: {req.student_answer}.\n"
        f"Grade on Accuracy (0-10), Completeness (0-10), Clarity (0-10).\n"
        f"Respond ONLY as JSON with no markdown:\n"
        f"{{\n"
        f"  \"score\": 0-100,\n"
        f"  \"accuracy\": 0-10,\n"
        f"  \"completeness\": 0-10,\n"
        f"  \"clarity\": 0-10,\n"
        f"  \"feedback\": \"2-3 sentence feedback\",\n"
        f"  \"missed_points\": [\"point1\", \"point2\"]\n"
        f"}}"
    )
    
    messages = [{"role": "user", "content": prompt}]
    
    try:
        response_text = groq_chat(messages, temperature=0.3)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Groq API call failed: {str(e)}")
        
    try:
        cleaned = re.sub(r"```json|```", "", response_text).strip()
        data = json.loads(cleaned)
    except Exception:
        try:
            import ast
            data = ast.literal_eval(cleaned)
        except Exception:
            data = {}
            for key in ["score", "accuracy", "completeness", "clarity"]:
                m = re.search(rf'"{key}"\s*:\s*(\d+)', response_text)
                if not m:
                    m = re.search(rf"'{key}'\s*:\s*(\d+)", response_text)
                if m:
                    data[key] = int(m.group(1))
            
            m_feedback = re.search(r'"feedback"\s*:\s*"([^"]+)"', response_text)
            if not m_feedback:
                m_feedback = re.search(r"'feedback'\s*:\s*'([^']+)'", response_text)
            data["feedback"] = m_feedback.group(1) if m_feedback else "Grading completed."
            
            m_missed = re.search(r'"missed_points"\s*:\s*(\[[^\]]*\])', response_text)
            if not m_missed:
                m_missed = re.search(r"'missed_points'\s*:\s*(\[[^\]]*\])", response_text)
            try:
                data["missed_points"] = json.loads(m_missed.group(1)) if m_missed else []
            except Exception:
                data["missed_points"] = []
                
    accuracy = data.get("accuracy", 5)
    completeness = data.get("completeness", 5)
    clarity = data.get("clarity", 5)
    
    score_val = accuracy * 4 + completeness * 3 + clarity * 3
    data["score"] = score_val
    
    # Save as QuizAttempt with question_type="teach_back", score=response.score/100
    attempt_id = uuid.uuid4().hex
    stmt = text("""
        INSERT INTO quiz_attempts (
            id, user_id, topic, question_text, student_answer, 
            reference_answer, is_correct, bloom_level, attempted_at, 
            time_taken_seconds, score
        ) VALUES (
            :id, :user_id, :topic, :question_text, :student_answer, 
            :reference_answer, :is_correct, :bloom_level, :attempted_at, 
            :time_taken_seconds, :score
        )
    """)
    try:
        await db.execute(stmt, {
            "id": attempt_id,
            "user_id": current_student.id.hex,
            "topic": req.topic,
            "question_text": f"Explain: {req.concept}",
            "student_answer": req.student_answer,
            "reference_answer": "",
            "is_correct": 1 if score_val >= 50 else 0,
            "bloom_level": "teach_back",
            "attempted_at": dt.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            "time_taken_seconds": 0,
            "score": score_val / 100.0
        })
        await db.commit()
    except Exception as e:
        print(f"[quiz] failed to save QuizAttempt in assess-teachback: {e}")
        
    return data


# ── Mistake Journal endpoints ──────────────────────────────────────────────────
@router.post("/mistakes")
async def save_mistake(
    body: MistakeCreate,
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mistake = QuizMistake(
        id=uuid.uuid4(),
        student_id=current_student.id,
        subject=body.subject,
        topic=body.topic,
        question=body.question,
        student_answer=body.student_answer,
        correct_answer=body.correct_answer,
        misconception=body.misconception,
        confidence=body.confidence,
    )
    await create(db, mistake)
    return {"ok": True, "id": str(mistake.id)}


@router.get("/mistakes")
async def get_mistakes(
    topic: Optional[str] = Query(None),
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(QuizMistake).where(QuizMistake.student_id == current_student.id)
    if topic:
        q = q.where(QuizMistake.topic == topic)
    q = q.order_by(QuizMistake.created_at.desc())
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "subject": m.subject,
            "topic": m.topic,
            "question": m.question,
            "student_answer": m.student_answer,
            "correct_answer": m.correct_answer,
            "misconception": m.misconception,
            "confidence": m.confidence,
            "created_at": m.created_at.isoformat(),
        }
        for m in rows
    ]


# ── Enhanced Question Generation ───────────────────────────────────────────────
from services.question_enhancer import (
    get_question_fingerprint,
    is_question_duplicate,
    check_prerequisites,
    generate_retry_question
)


class EnhancedQuestionRequest(BaseModel):
    topic: str
    difficulty: float = 0.5
    question_history: list[dict] = []  # [{text, embedding}]
    mastery_scores: dict = {}          # {topic: score}
    class_level: int = 8
    subject: Optional[str] = None
    retry_context: Optional[dict] = None  # {original_question, student_wrong_answer, correct_answer}


@router.post("/generate-question-enhanced")
async def generate_question_enhanced(
    req: EnhancedQuestionRequest,
    current_student: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    print(f"[enhanced] Request received: topic={req.topic}, enhanced_mode=True")
    print(f"[enhanced] Question history length: {len(req.question_history)}")
    print(f"[enhanced] Mastery scores: {req.mastery_scores}")
    
    subject = (req.subject or current_student.subject or "science").lower()
    pdf_path = get_pdf_path(subject)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"PDF not found: {pdf_path}")
    
    # ── RETRY MODE: Generate question targeting misconception ─────────────────
    if req.retry_context:
        print("[enhanced] Retry mode - generating misconception-targeted question")
        ctx = req.retry_context
        chunks = retrieve(req.topic, str(pdf_path), top_k=10, topic=req.topic, subject=subject)
        chunk_texts = [c["text"] for c in chunks]
        
        retry_q = generate_retry_question(
            ctx["original_question"],
            ctx["student_wrong_answer"],
            ctx["correct_answer"],
            req.topic,
            chunk_texts
        )
        
        # Add embedding
        retry_q["embedding"] = get_question_fingerprint(retry_q["question"])
        retry_q["difficulty"] = req.difficulty
        retry_q["topic"] = req.topic
        retry_q["sources"] = []
        retry_q["blocked"] = False
        retry_q["may_be_similar"] = False
        
        return retry_q
    
    # ── PREREQUISITE CHECK ─────────────────────────────────────────────────────
    print(f"[enhanced] Checking prerequisites for topic: {req.topic}")
    prereq_result = check_prerequisites(
        req.topic,
        req.class_level,
        subject,
        req.mastery_scores
    )
    print(f"[enhanced] Prerequisite check result: {prereq_result}")
    
    if not prereq_result["can_proceed"]:
        print(f"[enhanced] BLOCKING - weak prerequisites: {prereq_result['weak_prerequisites']}")
        return {
            "blocked": True,
            "reason": prereq_result["suggested_action"],
            "weak_prerequisites": prereq_result["weak_prerequisites"]
        }
    
    # ── GENERATE QUESTION WITH DUPLICATE CHECK ────────────────────────────────
    max_retries = 3
    last_question = None
    
    for attempt in range(max_retries):
        # Call existing generate_question logic
        q_req = QuestionRequest(
            topic=req.topic,
            difficulty=req.difficulty,
            question_type="mixed",
            question_index=attempt,
            subject=subject,
            previous_questions=[h["text"] for h in req.question_history]
        )
        
        question_data = await create_question(q_req, current_student, db)
        last_question = question_data
        
        # Check for duplicates
        is_dup = is_question_duplicate(
            question_data.get("question", ""),
            req.question_history,
            threshold=0.82
        )
        
        if not is_dup:
            break
        
        print(f"[enhanced] attempt {attempt + 1}: duplicate detected, retrying...")
    
    # ── ADD EMBEDDING AND FLAGS ────────────────────────────────────────────────
    q_text = last_question.get("question", "")
    embedding = get_question_fingerprint(q_text)
    
    return {
        **last_question,
        "embedding": embedding,
        "may_be_similar": is_dup,  # True if still duplicate after 3 tries
        "blocked": False
    }
