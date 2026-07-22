# LLM-Based Exam Grading Implementation - Analysis Report

## FRONTEND

### File: `frontend/app/exam/page.tsx`

**Function Name:** `handleSubmit`  
**Line:** 177

**Grading Logic for Non-MCQ Questions:** Lines 197-219

**Current Implementation (Lines 197-219):**
```typescript
else if (ans.trim()) {
  // Minimum length check — at least 15 characters to count as a real attempt
  // Awards partial marks scaled by answer length up to full marks
  const minLength = 15
  const goodLength = q.marks * 40  // 40 chars per mark expected
  const ansLength = ans.trim().length

  if (ansLength >= goodLength) {
    // Full answer — award full marks
    marksObtained += q.marks
    correct++
  } else if (ansLength >= minLength) {
    // Partial answer — award 50% marks
    marksObtained += Math.floor(q.marks * 0.5)
    // Don't increment correct — partial credit only
  }
  // else: too short (gibberish) → 0 marks
}
```

**Available Answer Data:**
- `q.correct_answer` - Available in question object (for all question types)
- `ans` - Student's answer text (line 189)
- `q.marks` - Question marks (for scaling)
- `q.question_text` - Question content

---

## BACKEND - ROUTERS

### File: `backend/routers/exam.py`

**Full Contents (47 lines):**
- Line 1-6: Imports
- Line 8-11: Router setup
- Line 13-14: Constants (VALID_SUBJECTS, VALID_CLASSES)
- Line 17-19: ExamRequest model definition
- Line 22-40: `@router.post("/generate")` endpoint - generates exam paper

**Endpoint Definitions:**
- **POST `/api/exam/generate`** (Lines 22-40)
  - Takes: `ExamRequest` (subject, class_level, topic_filter, syllabus_scope)
  - Returns: Exam paper dictionary
  - Current: Only generates, does NOT grade

---

## BACKEND - SERVICES

### File: `backend/services/exam_service.py`

**Grading Function Status:** NONE EXISTS

**All Functions in File:**
- Line 81: `get_chapters_for_subject(subject: str) -> list`
- Line 87: `get_scoped_chapters(subject: str, scope: str = "full") -> list`
- Line 103: `_resolve_pdf(subject: str) -> str`
- Line 169: `_debug_label(section_name: str, stage: str) -> str`
- Line 173: `_clean_raw_output(raw: str) -> str`
- Line 178: `_log_raw_response(section_name: str, stage: str, raw: str) -> None`
- Line 184: `_extract_json(raw: str, section_name: str = "unknown", stage: str = "parsing")`
- Line 207: `_validate_required_keys(...) -> bool`
- Line 215: `_validate_generated_list(...) -> bool`
- Line 231: `_validate_mcq_item(...) -> bool`
- Line 237: `_validate_short_item(...) -> bool`
- Line 241: `_validate_case_item(...) -> bool`
- Line 250: `_validate_english_item(...) -> bool`
- Line 275: `_groq_generate_json(...)`
- Line 294: `_get_context_for_section(...)`
- Line 338: `_gen_mcq_section(section: dict, context: str, subject: str) -> list`
- Line 395: `_gen_short_section(section: dict, context: str, subject: str) -> list`
- Line 422: `_gen_case_study_section(section: dict, context: str, subject: str) -> list`
- Line 444: `_gen_english_section(section: dict, context: str, scoped_chapters: list) -> list`
- Line 526: `_fallback_questions(section: dict) -> list`
- Line 544: `_normalise(q: dict) -> dict`
- Line 568: `async def generate_exam_paper(subject: str, class_level: int, topic_filter: Optional[str] = None, syllabus_scope: str = "full") -> dict`

**Conclusion:** No grading/assessment function exists in exam_service.py

---

## BACKEND - RAG SERVICE

### File: `backend/services/rag_service.py`

**Function 1: assess_answer**

**Line:** 460

**Full Signature:**
```python
def assess_answer(question: str, student_answer: str, pdf_path: str = None,
                  difficulty_level: float = 0.5, topic: Optional[str] = None,
                  subject: str = "science") -> Dict:
```

**Parameters:**
- `question: str` - The question asked
- `student_answer: str` - Student's response
- `pdf_path: str = None` - Legacy parameter (overridden by subject)
- `difficulty_level: float = 0.5` - Question difficulty (0.0-1.0)
- `topic: Optional[str] = None` - Specific topic/chapter
- `subject: str = "science"` - Subject name (science/maths/social/english)

**Returns:** `Dict`

---

**Function 2: groq_chat**

**Line:** 360

**Full Signature:**
```python
def groq_chat(messages: List[Dict], model: str = None, temperature: float = 0.4) -> str:
```

**Parameters:**
- `messages: List[Dict]` - Chat messages with role/content
- `model: str = None` - LLM model (defaults to settings.groq_model_primary)
- `temperature: float = 0.4` - Generation temperature (0.0-1.0)

**Returns:** `str` (response text)

---

## SUMMARY TABLE

| Component | Location | Type | Status |
|-----------|----------|------|--------|
| Non-MCQ Grading Logic | frontend/app/exam/page.tsx:197-219 | Length-based heuristic | EXISTS (needs replacement) |
| Exam Generation | backend/routers/exam.py:22-40 | POST endpoint | EXISTS (no grading) |
| Exam Grading Service | backend/services/exam_service.py | Function | **NOT EXISTS** |
| assess_answer() | backend/services/rag_service.py:460 | Function | EXISTS (usable for grading) |
| groq_chat() | backend/services/rag_service.py:360 | Function | EXISTS (required for LLM calls) |

---

## IMPLEMENTATION PATH

**Step 1:** Create grading function in `backend/services/exam_service.py`
- Can use `assess_answer()` from rag_service.py as base
- Signature suggestion: `async def grade_subjective_answer(question: str, student_answer: str, correct_answer: str, marks: int, q_type: str, subject: str) -> dict`

**Step 2:** Add grading endpoint to `backend/routers/exam.py`
- New endpoint: POST `/api/exam/grade`
- Takes: question, student_answer, correct_answer, marks, question_type, subject
- Returns: grading result with score, explanation

**Step 3:** Update `frontend/app/exam/page.tsx` handleSubmit()
- Replace lines 197-219 (length-based heuristic)
- Call backend grading endpoint for each subjective question
- Use returned scores instead of length-based calculation

---

**Report Date:** January 2025  
**Status:** Analysis Complete - Ready for Implementation
