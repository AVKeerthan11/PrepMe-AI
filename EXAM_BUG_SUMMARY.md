# Exam Bugs - Summary Report

## BUG #1: DISPLAY BUG - English Questions Not Rendering

**File:** `frontend/app/exam/page.tsx`  
**Lines:** 348-401

### Problem
Backend generates English questions with types: `reading`, `grammar`, `letter`, `paragraph`, `rtc`, `short_answer`, `long_answer`

Frontend ONLY handles:
- Line 353: `q.type === "assertion_reason"`
- Line 354: `q.type === "case_study"`
- Line 375: Default (renders `q.question_text` which doesn't exist for English types)

**Result:** All English questions render blank (no content displayed)

### Affected Lines
- **Lines 353-375**: Question text rendering - **MISSING English type checks**
- **Lines 383-390**: Options rendering - **ONLY checks for MCQ/AR**
- **Lines 392-401**: Textarea fallback - **Treats all English types as simple text input**, losing nested structures

### What's Lost
- `reading`: `passage` and `sub_questions` array never displayed
- `grammar`: `questions` array never displayed
- `rtc`: `extracts` array and nested questions never displayed
- `letter`/`paragraph`: `prompt` never displayed

---

## BUG #2: GRADING BUG - Any Text = Full Marks

**File:** `frontend/app/exam/page.tsx`  
**Lines:** 244-249

### Problem
```typescript
// Line 244-249 (EXACT CODE)
else if (ans.trim()) {
  marksObtained += q.marks
  correct++
}
```

**Logic:** If answer has ANY text (even "xyz" or "gibberish"), award FULL marks and mark as CORRECT.

**Condition:** `ans.trim()` - just checks if text exists, NO validation of content

### Affected Question Types
- VSA (2 marks)
- SA (3 marks)  
- LA (5 marks)
- Case Study (4 marks each)
- **ALL English types** (reading, grammar, letter, paragraph, RTC, etc.)

### Example
```
Question: "What is photosynthesis?"
Student enters: "I don't know"
Result: ✓ CORRECT - Full marks awarded
```

---

## Files Requiring Modification

1. **frontend/app/exam/page.tsx** (MUST FIX)
   - Lines 348-401: Add rendering for English question types
   - Lines 244-249: Fix grading to validate answer content

2. **backend/routers/exam.py** (Optional - if backend grading needed)

3. **backend/services/exam_service.py** (Optional - if backend grading needed)

---

## Status

| Bug | Severity | Lines | Impact |
|-----|----------|-------|--------|
| English Display | CRITICAL | 348-401 | English exams completely broken |
| Subjective Grading | CRITICAL | 244-249 | 50-60% of questions auto-pass |

**Both bugs must be fixed for production use.**
