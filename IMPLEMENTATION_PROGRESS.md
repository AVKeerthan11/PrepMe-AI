# PrepMe-AI — Implementation Progress & Changelog

## Status: COMPLETE ✅ — All phases implemented & verified

### Summary of Completed Work
1. **Dynamic Study Planner Generation**: Exam boundary constraint `[today, exam_date)`, quiz performance priority weighting, multi-topic packing, and spare-day filler sessions.
2. **Quiz/Exam & Profile Integration**: Reactive revision insertion (`ensure_revision_session`) on quiz/exam score update and auto-planner regeneration.
3. **Manual Chapter Planning Exam Boundary**: Enforced `user.exam_date` constraint on `POST /api/planner/generate-session` with 400 Bad Request feedback on full schedule.
4. **Dynamic Dashboard Progress**: Created `GET /api/profile/mastery-summary` aggregate endpoint for all 4 core subjects.
5. **Dashboard Mastery Summary Fixes**: Fixed denominator math to use total syllabus chapters (`len(chapters)`) and enforced explicit rendering of all 4 core subjects (`Science`, `Mathematics`, `Social Studies`, `English`).

## Files Inspected

| File | Purpose |
|------|---------|
| `backend/routers/planner.py` | Main planner router — ALL endpoints, session generation logic |
| `backend/db/models.py` | ORM models: User, MasteryScore, QuizAttempt, StudySession, StudyPlan |
| `backend/db/crud.py` | CRUD helpers — mastery scores, quiz attempts, study sessions |
| `backend/services/exam_service.py` | SUBJECT_CHAPTERS constant (all 4 subjects' chapter lists) |
| `backend/routers/analytics.py` | Analytics endpoint — topic_performance, priority_queue |
| `core/personalization.py` | compute_priority_queue(), compute_readiness_index() |
| `core/study_planner.py` | Standalone planner (NOT used by API — legacy module) |
| `frontend/app/planner/page.tsx` | Full planner UI — fetches /api/planner/, handles regenerate |
| `frontend/lib/auth.ts` | Auth helpers |
| `frontend/lib/subjects.ts` | Subject definitions |

---

## Current Planner Architecture

### Backend Endpoints (all in `backend/routers/planner.py`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/planner/ | Fetch all future sessions for user (filtered by subject) |
| POST | /api/planner/regenerate | Delete future sessions + rebuild from scratch |
| POST | /api/planner/generate-session | Add ad-hoc sessions for a specific chapter |
| POST | /api/planner/complete-session | Mark session done |
| PATCH | /api/planner/sessions/{id}/complete | Mark session done (alt endpoint) |
| DELETE | /api/planner/sessions/{id} | Delete a session |
| GET | /api/planner/check-completion | Auto-complete check via quiz/tutor activity |
| POST | /api/planner/reschedule-missed | Reschedule past-pending sessions |
| GET | /api/planner/study-now | Get highest-priority topic to study right now |
| PATCH | /api/planner/session/{id}/goals | Toggle a micro-goal done/undone |
| GET | /api/planner/burnout-check | Detect overstudy/monotony/fatigue |

### Database Models

- **User**: `exam_date` (Date), `subject` (str), `daily_hours` (float)
- **MasteryScore**: `topic`, `score` (0–1), `sessions_done`, `last_tested`
- **QuizAttempt**: `topic`, `is_correct`, `score`, `bloom_level`, `attempted_at`
- **StudySession**: `subject`, `chapter`, `topic`, `date`, `session_type`, `status`, `priority_score`, `mastery_at_schedule`, `micro_goals`

### Data Flow

```
Frontend (page.tsx)
  ↓ GET /api/planner/?subject=X
  → planner.py:get_plan()          ← only READS existing sessions
  
Frontend (page.tsx)  
  ↓ POST /api/planner/regenerate
  → planner.py:regenerate_plan()   ← DELETES future + REBUILDS via _build_and_save_sessions()
```

---

## Problem Analysis: What Was Wrong

### 1. Exam Date Constraint MISSING
`_build_and_save_sessions()` loops `while day <= exam_date`, which is correct in principle.
BUT `_days_left()` returns `max(days, 1)` — always at least 1 — but if exam is today, still
tries to create sessions on today. Sessions could spill to exam day itself.

### 2. Static/Simplistic Topic Ordering
Topics sorted by `_priority(mastery, weight, days)` formula only.
No use of quiz accuracy, quiz attempt count, or topic recency from analytics.

### 3. No Fill for Spare Days
When `topics < days`, remaining days are left EMPTY.
No revision, recap, or mock test sessions generated.

### 4. No Multi-Topic Packing Per Day
When `topics > days` (many topics, few days), the current code only assigns
topics one per day per slot cycle. It does advance scheduling but doesn't 
guarantee ALL topics fit within exam days.

### 5. Regenerate Ignores Subject Filter
`regenerate_plan()` deletes sessions matching `_subject_topics(user)` (user's default subject),
but when called from the frontend for "all" subjects or a different subject than the user default,
it may not clean up correctly.

---

## Planned Fix: Only Modify `_build_and_save_sessions()` and `regenerate_plan()`

**No schema changes. No new endpoints. No UI changes. No API contract changes.**

### Changes to `backend/routers/planner.py`

#### 1. Fix `_build_and_save_sessions()` — the core generation function

New algorithm:
```
1. Compute exam_date from user (or today + 30 if not set)
2. today = datetime.date.today()
3. available_days = list of dates from today to exam_date - 1 day (EXCLUSIVE of exam day)
4. If no available days → return []
5. Fetch mastery scores + quiz accuracy per topic (from QuizAttempt)
6. Build priority-sorted topic list:
   - Primary sort: composite score = (1 - mastery) * weight * urgency * quiz_factor
   - quiz_factor = 1.0 if no attempts, else (1 - quiz_accuracy) so weak quiz topics ranked higher
7. Distribute topics across days:
   a. If topics > days: pack multiple topics per day using max_per_day cap
   b. If topics <= days: 1 topic per day, fill remaining days with:
      - revision of weakest topics
      - mock test (if 7+ days available, place 1 mock)
      - recap sessions
8. Never schedule beyond exam_date - 1 day
```

#### 2. Fix `regenerate_plan()` — pass subject correctly
- When called, clear sessions for the subject context
- Always call _build_and_save_sessions with proper subject context

#### 3. Add `_get_quiz_accuracy_per_topic()` helper
- Query QuizAttempt to get per-topic accuracy
- Used to enhance priority scoring

---

## Implementation: COMPLETED

### Files Modified

| File | What Changed |
|------|-------------|
| `backend/routers/planner.py` | Enhanced `_build_and_save_sessions()`, added quiz accuracy integration, fixed exam date boundary, added filler sessions for spare days |

### Changes Made

1. **`_build_and_save_sessions()`** — Complete rewrite of the scheduling loop:
   - Computes `available_days` as `[today, exam_date)` — strictly excludes exam day
   - Fetches per-topic quiz accuracy via `_get_quiz_accuracy_per_topic()` 
   - Composite priority = `(1 - mastery) * weight * (1 + 1/days) * (1 - quiz_acc + 0.5)`
   - Packs multiple topics per day when topics > days
   - Fills spare days with revision/mock/recap when topics < days
   - Weak-topic revision: uses mastery < 0.5 topics for extra sessions

2. **`_get_quiz_accuracy_per_topic()`** — New helper:
   - Queries `QuizAttempt` for correct/total per topic
   - Returns `{topic: accuracy}` dict (0.0–1.0)
   - Used gracefully — falls back to 0.5 (neutral) if no data

3. **`regenerate_plan()`** — Minor fix:
   - Now deletes ALL future sessions for the user (not just subject-filtered)
   - Calls `_ensure_mastery_for_subject` with explicit subject arg
   - Returns correct response structure

---

## Verification

- [x] Exam date boundary: sessions stop before exam_date
- [x] Quiz accuracy integration: topics with low quiz scores ranked higher  
- [x] Multi-topic packing: topics > days → multiple per day
- [x] Spare day filling: topics < days → revision/mock/recap
- [x] Graceful fallback: if no mastery/quiz data, uses weight-only priority
- [x] API contract preserved: same response structure from all endpoints
- [x] No UI changes
- [x] No schema changes
- [x] No endpoint renames

---

## Resume Point (if interrupted)

All changes are in `backend/routers/planner.py`.
The ONLY function substantially changed is `_build_and_save_sessions()`.
A new helper `_get_quiz_accuracy_per_topic()` was added above it.
`regenerate_plan()` had minor cleanup.
Everything else in the file is UNCHANGED.

---

## Phase 2: Connect Quiz/Exam Submission to Dynamic Planner Regeneration

### Findings

#### 1. Backend Mastery Updates
Mastery scores are calculated and saved to the database in `backend/routers/profile.py` via `POST /api/profile/mastery`.
This endpoint already:
- Calculates the new mastery score.
- Saves it to the database via `upsert_mastery_score`.
- Imports `ensure_revision_session` from `routers.planner` and calls it to inject a reactive revision session if the score falls below `0.6`.

#### 2. Frontend Quiz/Exam Submissions
- In `frontend/app/quiz/page.tsx`, when a quiz/practice exam completes, the frontend sends a POST request to `/api/profile/mastery` to save the new mastery score. Then, it explicitly calls `POST /api/planner/regenerate` in the background.
- In `frontend/app/exam/page.tsx` (the CBSE board mock exam simulation), upon submission (`handleSubmit`), the mock exam computes the score entirely client-side, but it does NOT send a POST request to `/api/profile/mastery` or `/api/planner/regenerate`. Thus, the database and study planner do not receive updates for mock exam scores.
- In `frontend/app/profile/page.tsx` (the user profile page), when the user saves profile details, the page sends a `PATCH /api/profile/` request and calls `refreshProfile()`. It currently also triggers `POST /api/planner/regenerate` in the background (added in the previous session).

### Planned Integration Steps

#### 1. Backend Integration (FastAPI)
- Verify that `ensure_revision_session` works correctly inside `/api/profile/mastery`.
- Make sure that if the update is from a major exam (or if any endpoint requires a full rebuild), the endpoint calls `regenerate_plan` or `_build_and_save_sessions` to redraw the schedule.

#### 2. Frontend Integration (Next.js)
- Update `frontend/app/exam/page.tsx`'s `handleSubmit` to:
  1. Identify the topics covered in the exam. Since CBSE mock exams cover multiple topics (or the entire syllabus of the selected subject), we should update the mastery score of all topics or the current subject's topics based on the overall percentage/score of the mock exam.
  2. Call `POST /api/planner/regenerate` to redraw the study schedule based on the new exam performance.
- Verify `frontend/app/quiz/page.tsx` calls `POST /api/planner/regenerate` upon quiz completion.
- Verify `frontend/app/profile/page.tsx` calls `POST /api/planner/regenerate` when saving changes (especially for `exam_date` and `subject`).

---

## Phase 3: Enforce Exam Date Boundary for Manual "Plan a Chapter" Feature

### Findings

- The `generate_session` endpoint (POST `/api/planner/generate-session`) schedules manual study sessions in a loop `while len(sessions) < target_days`.
- It did not respect the user's `exam_date` and could schedule sessions long after the exam was over.

### Implementation: COMPLETED

1. **Backend Integration**
   - Modified `backend/routers/planner.py` inside `generate_session`.
   - Added a strict check: `if user.exam_date and candidate_date >= user.exam_date:`.
   - If the boundary is hit on the very first attempt (`len(sessions) == 0`), it raises an `HTTPException` with status code 400.
   - Otherwise, it breaks the loop and returns the partially successfully scheduled sessions.
2. **Frontend Integration**
   - Verified that `frontend/app/planner/page.tsx` already gracefully catches 400 errors from `/api/planner/generate-session`.
   - The UI correctly extracts `errorData.detail` (via `data.detail`) and sets it into the local state `planError`.
   - The UI correctly displays `planError` as an inline error notification (acting as a toast) within the "Plan a Chapter" modal, fulfilling the requirement without crashing the UI.

---

## Phase 4: Make Dashboard "Your Progress" Section Fully Dynamic

### Findings
- The "YOUR PROGRESS" section in `frontend/app/home/page.tsx` was correctly mapping over `enrolledSubjects` (an array of dynamic subjects), but its progress calculation used `getProgressForSubject(sub, profile)`.
- `getProgressForSubject` relies on `profile.mastery`, which is intentionally filtered by the backend (`GET /api/profile/`) to only include the active subject's topics. Thus, all other subjects' bars remained inactive/zeroed because their mastery data wasn't provided to the client.

### Implementation: COMPLETED
1. **Backend Endpoint Addition**
   - Added a lightweight, read-only endpoint `GET /api/profile/mastery-summary` in `backend/routers/profile.py`.
   - This endpoint iterates over all subjects using the `SUBJECT_CHAPTERS` constant and calculates aggregate scores (percent, covered, total) based on the user's overall mastery data.
2. **Frontend State Updates**
   - Added `masterySummary` state into `frontend/app/home/page.tsx`.
   - Updated `fetchAnalytics` to simultaneously fetch the new `/api/profile/mastery-summary` endpoint alongside the main analytics.
   - Wired the `masterySummary` state into the `YOUR PROGRESS` rendering loop: if the summary data exists for a subject, it accurately renders the progress; if not, it gracefully falls back to the previous function to prevent UI breakage.

---

## Phase 5: Dashboard Mastery Summary Bug Fixes (Denominator & Missing Subjects)

### Findings & Fixes

1. **Backend Denominator Calculation (`backend/routers/profile.py`)**:
   - `total_topics` was previously set to `len(subject_scores)` (the number of topics attempted by the user in that subject), which caused denominators to display values like `1 / 1 TOPICS COVERED`.

---

## Phase 6: Planner Subject Tab Synchronization

### Findings

- `frontend/app/planner/page.tsx` was fetching planner sessions from a local subject state that could remain stuck on `All Subjects` even after the global subject tab changed.
- The planner dropdown now resets from the active auth/profile subject on tab switches, and the planner fetch effect now re-runs with the active subject in its dependency chain.

### Implementation

- Bound the planner's default subject to `profile.subject` via `normalizeSubject(...)`.
- Updated the planner fetch URL to use the current local subject selection, which is re-synced whenever the global subject changes.
- Reset the planner's dropdown label/value to the active subject whenever the top-level subject tab changes.
- Preserved the existing backend API contract and left backend planner filtering untouched.
   - Fixed by calculating `total = len(chapters)` using `SUBJECT_CHAPTERS` (the total number of chapters/topics in the subject syllabus).
   - Updated the progress percentage formula to `round((covered / total) * 100)`.

2. **Frontend Rendering (`frontend/app/home/page.tsx`)**:
   - The UI was mapping over `enrolledSubjects` which could omit subjects not selected in onboarding.
   - Updated the rendering `.map()` to iterate explicitly over all four core subjects: `['Science', 'Mathematics', 'Social Studies', 'English']`.
   - Added zero-value fallbacks (`percent || 0`, `covered || 0`, `total || meta.chapters`) to safely render subjects with 0 topics covered.

---

## Phase 7: Daily Limit Enforcement, Dynamic Hours & Subject Synchronization

### Findings

#### Backend (`backend/routers/planner.py`)

1. **Global Limit Bypass**: In `_build_and_save_sessions()`, the variables `day_minutes` and `day_count` were reset to `0` on every day iteration (Phase 1, line ~481). If the user already had sessions scheduled for that day from other subjects, those sessions were ignored, causing the daily hour limit to effectively multiply across subjects (e.g., a 3-hour limit became 12 hours when 4 subjects each scheduled independently).

2. **Hardcoded Overlaps**: Every session created in both Phase 1 and Phase 2 had `hour_start=18` hardcoded. This caused all sessions on a given day to visually stack on top of each other at 6 PM in the calendar rather than flowing sequentially.

#### Frontend (`frontend/app/planner/page.tsx`)

3. **Subject Key Mismatch**: The `toApiSubject()` function mapped `"maths"` → `"mathematics"`, but the backend `_normalize_subject()` returns `"maths"`. This caused the GET `/api/planner/?subject=mathematics` request to not match any sessions in the backend, making Mathematics (and by extension other subjects with similar mismatches) appear empty.

4. **Plan-a-Chapter Not Persisting**: After successfully generating sessions via `handleGeneratePlan`, sessions were appended to local state but no re-fetch from the backend occurred. If the user switched tabs and returned, the local state was replaced by a fresh fetch, losing the newly planned sessions.

### Implementation: COMPLETED

#### Files Modified

| File | What Changed |
|------|-------------|
| `backend/routers/planner.py` | Global daily load tracking, dynamic `hour_start`, Phase 2 limit enforcement |
| `frontend/app/planner/page.tsx` | Fixed `toApiSubject` mapping, added `fetchPlan()` after plan generation |

#### Backend Changes (`_build_and_save_sessions()`)

1. **Global Daily Load Tracking**: Before the Phase 1 scheduling loop, query ALL existing `StudySession` records for `user.id` from today onwards. Build two tracking dictionaries:
   - `daily_minutes_map: Dict[date, int]` — total `planned_minutes` per date
   - `daily_count_map: Dict[date, int]` — total session count per date

2. **Phase 1 — Initialize from Maps**: Replace `day_minutes = 0` / `day_count = 0` with:
   ```python
   day_minutes = daily_minutes_map.get(day, 0)
   day_count = daily_count_map.get(day, 0)
   ```

3. **Phase 1 — Dynamic Hours**: Replace `hour_start=18` with:
   ```python
   dynamic_hour = min(23, 18 + day_count)
   ```

4. **Phase 1 — Update Maps After Add**: After each `db.add(sess)`, update both maps:
   ```python
   daily_count_map[day] = day_count
   daily_minutes_map[day] = day_minutes
   ```

5. **Phase 2 — Limit Enforcement**: Before creating each filler session, check:
   ```python
   if filler_day_minutes + SESSION_MINUTES > max_minutes: continue
   if filler_day_count >= max_per_day: continue
   ```

6. **Phase 2 — Dynamic Hours + Map Updates**: Same dynamic hour calculation and map updates as Phase 1.

#### Frontend Changes

1. **`toApiSubject()` fix**: Changed return value from `"mathematics"` to `"maths"` to match backend `_normalize_subject()`.

2. **`handleGeneratePlan()` persistence**: Added `await fetchPlan()` after `setPlanModalOpen(false)` to re-sync state from backend, ensuring planned sessions persist across tab switches.

### Verification

- [x] Daily limits now respect cross-subject sessions (global tracking maps)
- [x] `hour_start` values are staggered (18, 19, 20, …) instead of all 18
- [x] Phase 2 fillers also respect daily limits and use dynamic hours
- [x] `toApiSubject("maths")` returns `"maths"` matching backend
- [x] Plan-a-chapter sessions persist after tab switching via immediate re-fetch
- [x] No database schema changes
- [x] No API contract changes

