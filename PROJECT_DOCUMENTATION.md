# PrepMeAI — Complete Project Documentation

> For demo presentation, teacher Q&A, and future intern handoff.

---

## 1. What Is PrepMeAI?

PrepMeAI is an AI-powered adaptive learning platform built for Class 8 CBSE students. It helps students study smarter by:

- Answering questions using content from their actual NCERT textbooks (RAG-based AI tutor)
- Generating personalised quizzes that get harder or easier based on performance
- Building a day-by-day study plan from today until the exam date
- Tracking mastery across all chapters and predicting exam scores
- Generating full CBSE-format mock exam papers

The platform covers all 4 Class 8 subjects: Science, Mathematics, Social Studies, and English.

---

## 2. Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| Next.js 14 (React 18) | UI framework with server-side routing |
| TypeScript | Type-safe JavaScript |
| Tailwind CSS | Utility-first styling |
| Radix UI + shadcn/ui | Accessible, composable UI components |
| Framer Motion | Page and component animations |
| Lucide React | Icon library |
| React Context API | Global state (auth, theme, subject) |

### Backend
| Technology | Purpose |
|---|---|
| FastAPI (Python 3.10+) | REST API framework with async support |
| SQLAlchemy 2.0 (async) | ORM for database access |
| aiosqlite | Async SQLite driver (dev) |
| Alembic | Database migrations |
| Groq API (LLaMA 3.1 70B) | LLM for question generation, grading, tutoring |
| sentence-transformers | Local embedding model for semantic search |
| PyMuPDF (fitz) | PDF text extraction |
| NumPy | Vector math for similarity scoring |
| passlib + bcrypt | Password hashing |
| python-jose | JWT token generation and verification |
| gTTS | Text-to-speech for voice output |
| Pydantic v2 | Request/response validation |

### Infrastructure
| Layer | Dev Setup | Production Target |
|---|---|---|
| Database | SQLite (file: prepmeai.db) | PostgreSQL |
| AI/LLM | Groq Cloud API | Groq Cloud API |
| Embedding model | Local (all-MiniLM-L6-v2, loaded in-process) | Same or Redis-cached |
| Frontend hosting | localhost:3000 | Vercel |
| Backend hosting | localhost:8000 | Railway / Render / AWS |

---

## 3. Project Folder Structure

```
prepmeai/
├── frontend/                  # Next.js application
│   ├── app/
│   │   ├── page.tsx           # Landing page
│   │   ├── home/page.tsx      # Dashboard
│   │   ├── tutor/page.tsx     # AI tutor chat
│   │   ├── quiz/page.tsx      # Adaptive quiz
│   │   ├── planner/page.tsx   # Study planner
│   │   ├── analytics/page.tsx # Analytics dashboard
│   │   ├── exam/page.tsx      # Mock exam
│   │   ├── profile/page.tsx   # User settings
│   │   └── auth/              # Login and register
│   ├── components/
│   │   ├── layout/            # AppShell, Sidebar, Topnav
│   │   └── ui/                # Reusable UI components
│   ├── lib/                   # Auth context, subject config, utils
│   └── context/               # ThemeContext
│
├── backend/                   # FastAPI application
│   ├── routers/
│   │   ├── auth.py            # Signup/login
│   │   ├── quiz.py            # Question generation + grading
│   │   ├── tutor.py           # AI tutor endpoint
│   │   ├── planner.py         # Study session scheduling
│   │   ├── analytics.py       # Readiness score + topic performance
│   │   ├── exam.py            # Mock paper generation
│   │   ├── profile.py         # User profile and mastery
│   │   └── audio.py           # Text-to-speech
│   ├── services/
│   │   ├── rag_service.py     # RAG pipeline (PDF → chunks → embeddings → retrieval → LLM)
│   │   ├── question_enhancer.py
│   │   └── exam_service.py    # CBSE exam paper generator
│   ├── db/
│   │   ├── models.py          # SQLAlchemy ORM models
│   │   ├── database.py        # Async DB connection
│   │   ├── crud.py            # DB helper functions
│   │   └── migrations/        # Alembic migration files
│   ├── core/
│   │   └── personalization.py # Readiness index + priority queue formulas
│   ├── main.py                # FastAPI app entry point
│   └── config.py              # Settings (env vars)
│
├── ncert_science_8.pdf
├── ncert_maths_8.pdf
├── ncert_social_8.pdf
├── ncert_english_8.pdf
└── start-dev.bat              # One-click local startup script
```

---

## 4. Database Design (SQLite / PostgreSQL)

All data is stored using SQLAlchemy ORM models. In development, this writes to a local `prepmeai.db` SQLite file. The same models work with PostgreSQL for production.

### Tables

**users** — one row per registered student
- `id` (UUID), `name`, `email`, `hashed_password`
- `subject` — active subject (science / maths / social / english)
- `exam_date` — date of their upcoming exam
- `daily_hours` — how many hours they can study per day
- `avatar` — selected avatar identifier

**mastery_scores** — tracks how well a student knows each topic
- `user_id` → users, `topic` (chapter name)
- `score` (0.0 to 1.0), `sessions_done`, `last_tested`

**quiz_attempts** — every question answered
- `user_id`, `topic`, `question_text`, `student_answer`, `reference_answer`
- `is_correct`, `score` (0.0–1.0), `bloom_level`, `time_taken_seconds`

**quiz_mistakes** — journal of wrong answers only
- `student_id`, `subject`, `topic`, `question`, `student_answer`, `correct_answer`
- `misconception` (AI-generated), `confidence` (sure/unsure/guessing)

**study_sessions** — the planner calendar
- `user_id`, `subject`, `topic`, `date`, `session_type` (study/practice/revision/mock)
- `status` (pending/done), `priority_score`, `mastery_at_schedule`, `micro_goals` (JSON)

**doubt_sessions** — tutor questions asked per chapter (used for planner tracking)

**study_plan** — plan metadata (exam date, daily hours, adherence rate)

---

## 5. How Each Feature Works

### 5.1 AI Tutor (RAG Q&A)

The tutor answers student questions strictly from NCERT textbook content. It never makes up information.

**Step-by-step flow:**
1. Student types a question on the tutor page
2. Frontend sends it to `POST /api/tutor/ask` with the current subject and mastery level
3. Backend runs the RAG pipeline (see Section 6 for deep dive)
4. Top 5 relevant text chunks are retrieved from the correct NCERT PDF
5. Those chunks + the question are sent to Groq LLaMA 3.1 70B as a prompt
6. The LLM generates an answer grounded only in that context
7. Response returned with the answer, page citations, and number of chunks used
8. The last 10 messages are kept in session memory for conversational context (not stored in DB)

**Mastery-aware depth:** The tutor prompt changes based on the student's mastery score:
- Score < 0.5 → simple language, analogies, step-by-step, easy check question
- Score 0.5–0.75 → standard explanation with one worked example
- Score > 0.75 → skip basics, focus on edge cases and advanced applications

### 5.2 Adaptive Quiz

The quiz generates questions from the textbook and adapts difficulty based on how well the student performs.

**Step-by-step flow:**
1. Student selects a topic and the quiz starts at medium difficulty (0.5)
2. `POST /api/quiz/generate-question` is called with topic, difficulty, and question index
3. RAG retrieves 15 chunks from the correct chapter of the correct subject PDF
4. A question type is selected in rotation: MCQ → True/False → Fill-blank → Short answer
5. Groq generates the question using a difficulty-labelled prompt (Easy/Medium/Hard based on Bloom's Taxonomy)
6. The question is checked against the last 12 generated questions to avoid repetition
7. If a question is too similar to recent ones, a new one is generated (up to 3 attempts)
8. Student answers; `POST /api/quiz/assess` grades the answer:
   - MCQ/True-False/Fill-blank: exact string comparison
   - Short answer: semantic evaluation via Groq (grades by meaning, not keywords)
9. If wrong, a misconception is AI-detected and saved
10. The result is saved to `quiz_attempts` and, if wrong, to `quiz_mistakes`
11. Mastery score is updated for that topic
12. Difficulty adjusts: score ≥ 0.8 → branch up, score ≤ 0.4 → branch down, middle → maintain

**Question difficulty mapping (Bloom's Taxonomy):**
- 0.0–0.35: Easy — Remember/Understand (direct recall, definitions)
- 0.35–0.65: Medium — Apply/Analyse (reasoning, why/how)
- 0.65–1.0: Hard — Evaluate/Create (inference, comparison, new scenarios)

### 5.3 Study Planner

The planner builds a personalised study schedule from today until the exam date.

**Priority formula:**
```
priority = (1 - mastery) × topic_weight × urgency × quiz_weakness_factor

where:
  urgency = 1 + (1 / days_remaining)
  quiz_weakness_factor = (1.5 - quiz_accuracy) if quiz data exists, else 1.0 (neutral)
```

This means topics that are weak (low mastery), heavily weighted in the syllabus, have little time left, and have low quiz accuracy get scheduled first.

**Session type based on mastery:**
- mastery < 0.4 → "study" (read and learn the concept)
- mastery 0.4–0.7 → "practice" (solve problems)
- mastery > 0.7 → "revision" (review and strengthen)

**Scheduling algorithm:**
1. All dates from today up to (but not including) exam day are collected
2. Topics are sorted by composite priority score
3. Topics are distributed across days, respecting `daily_hours` cap (= sessions per day = floor(hours × 60 / 45))
4. Once all topics are scheduled, spare days are filled with:
   - Weak topic revision sessions (mastery < 0.5)
   - One mock test day (if 5+ days available)
   - Full revision day within 3 days of the exam
5. Each session gets 3 micro-goals (actionable steps) generated automatically
6. When a student marks a session complete, mastery `sessions_done` is incremented

### 5.4 Analytics Dashboard

**Readiness Score (0–100):**
```
readiness = (60% × avg_mastery) + (20% × adherence_rate) + (20% × time_on_task_factor)
```

**Topic Performance Table** — for each chapter:
- Mastery score (from `mastery_scores` table)
- Tag: Weak (< 0.5), Building (0.5–0.7), Good (> 0.7)
- Quiz attempts and accuracy from `quiz_attempts`
- Sessions completed

**Priority Queue** — topics sorted by `(1 - mastery) × weight × (1 + 1/days_left)`, showing what to study next.

**Exam Prediction Score:**
```
topic_score = (mastery × 0.5) + (quiz_accuracy × 0.3) + (confidence_calibration × 0.2)
predicted_score = average(topic_scores) × 100
```

### 5.5 Mock Exam Generator

Generates full CBSE-pattern exam papers section by section using RAG context.

**CBSE pattern (Science / Maths / Social Studies):**
| Section | Type | Questions | Marks |
|---|---|---|---|
| Section A | MCQ (includes 2 Assertion-Reason) | 10 | 1 each |
| Section B | Very Short Answer | 4 | 2 each |
| Section C | Short Answer | 3 | 3 each |
| Section D | Case Study (4 sub-questions) | 2 | 4 each |

**English pattern:**
| Section | Type |
|---|---|
| Section A | 2 Reading Comprehension passages (10 marks each) |
| Section B | Grammar + Letter writing + Paragraph (20 marks) |
| Section C | Literature: RTC + Short Answer + Long Answer (40 marks) |

Questions are generated per section using RAG context pulled from randomised chapters. The syllabus scope can be set to first half, second half, or full. Questions from different chapters are explicitly requested to avoid repetition.

### 5.6 Authentication

1. User registers with name, email, password, subject, exam date, and daily hours
2. Password is hashed with bcrypt before storing
3. On login, the hash is verified and a JWT token is returned
4. The token is stored in `localStorage` on the frontend
5. Every API call includes the token in the `Authorization: Bearer` header
6. Backend validates the token on every protected route using a FastAPI dependency (`get_current_user`)

---

## 6. RAG Implementation — Deep Dive

This is the core AI engine. RAG stands for Retrieval-Augmented Generation.

### What problem does RAG solve?

LLMs like LLaMA can hallucinate (make up facts). For an education app, this is unacceptable. RAG solves this by forcing the LLM to only use content retrieved from the actual textbook — it cannot go beyond what is in the NCERT PDF.

### How the RAG pipeline works (step by step):

**Phase 1 — PDF Ingestion (runs once on startup, then cached)**

1. The NCERT PDF is opened using PyMuPDF (`fitz`)
2. The first 20 pages are skipped (foreword, table of contents, committee listings)
3. Pages are read in windows of 3 pages at a time
4. Each window's text is split by double newlines into paragraphs
5. Only paragraphs longer than 60 characters are kept
6. Each chunk stores: text content, page range, chapter number, and a hash ID
7. Chapter numbers are detected by scanning for "Chapter N" headers on each page
8. All chunk texts are passed to the `all-MiniLM-L6-v2` sentence transformer model
9. The model converts each chunk into a 384-dimensional embedding vector
10. The chunks and embeddings are stored in a Python dictionary in memory (module-level cache)
11. This entire process runs in a background thread on server startup for the science PDF; other subjects are loaded on first request

**Phase 2 — Retrieval (runs on every question/tutor request)**

1. The student's query is converted to an embedding using the same sentence transformer
2. If a topic name is provided (e.g. "Exploring Forces"), it is mapped to a chapter number
3. Only chunks from that chapter are searched (chapter-filtered retrieval)
4. Two scoring methods run in parallel:
   - **Dense scoring (semantic, 70% weight):** cosine similarity between query embedding and all chunk embeddings — finds chunks that *mean* the same thing even with different words
   - **BM25 scoring (keyword, 30% weight):** term frequency scoring — finds chunks containing the exact words from the query
5. Final score = `0.7 × dense_score + 0.3 × BM25_score`
6. Top 5 chunks by hybrid score are returned

**Phase 3 — Generation**

1. Retrieved chunks are formatted as context with page references
2. A system prompt tells the LLM: "Answer using ONLY the provided content"
3. The question + context are sent to Groq LLaMA 3.1 70B
4. The LLM generates an answer grounded in the retrieved text
5. Page references from the chunks are returned as citations

### Does the project use LangChain or a vector database?

No. This project implements RAG from scratch without LangChain or any external vector store (no Pinecone, Chroma, FAISS, or Weaviate).

- Embeddings are computed using `sentence-transformers` (local Python library)
- Vectors are stored as NumPy arrays in memory
- Retrieval is done with pure NumPy dot products (cosine similarity on normalised vectors)
- The index lives in a Python dictionary (`_index_cache`) scoped to the backend process
- This is fast enough for a single-server setup; on restart the index is rebuilt from the PDFs

### Limitations of the current approach and how to scale it:

| Current | Production Scale |
|---|---|
| NumPy in-memory index | Replace with FAISS or a vector DB (Chroma, Pinecone, Qdrant) |
| Rebuilt on every server restart | Persist embeddings to disk or Redis |
| One process | Multiple backend instances share the same vector DB |
| 4 PDFs, ~few thousand chunks | Works for 100+ PDFs with a proper vector store |
| No embedding cache | Pre-compute and store embeddings at deploy time |

For deployment, the main change needed is to:
1. Run a one-time embedding script that saves chunk vectors to a file or vector DB
2. Load those pre-built vectors at startup instead of rebuilding from PDF each time
3. This removes the startup delay and works across multiple backend instances

---

## 7. Subjects and Content Coverage

| Subject | Chapters | Each Chapter Weight |
|---|---|---|
| Science | 11 chapters | Varies (9–10% each) |
| Mathematics | 14 chapters | ~7.1% each (equal) |
| Social Studies | 7 chapters | ~14.3% each (equal) |
| English | 15 chapters | ~6.7% each (equal) |

The weightage affects planner priority scoring — higher-weight topics get scheduled earlier when mastery is equal.

Science and Mathematics also have prerequisite dependencies (e.g., "Cubes and Square Roots" requires "Rational Numbers") — these are checked before generating quiz questions to flag mastery gaps in prerequisite topics.

---

## 8. API Endpoints Summary

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Get JWT token |
| `/api/profile/` | GET | Fetch user profile + mastery |
| `/api/profile/mastery` | POST | Update topic mastery |
| `/api/profile/mastery-summary` | GET | Cross-subject progress stats |
| `/api/quiz/generate-question` | POST | Generate one question |
| `/api/quiz/assess` | POST | Grade student answer |
| `/api/quiz/exam-prediction` | GET | Predicted exam score |
| `/api/quiz/prerequisites` | GET | Check prereq mastery gaps |
| `/api/tutor/ask` | POST | RAG-based Q&A |
| `/api/planner/` | GET | Get study sessions |
| `/api/planner/regenerate` | POST | Rebuild full study plan |
| `/api/planner/generate-session` | POST | Add manual session |
| `/api/planner/complete-session` | POST | Mark session done |
| `/api/planner/study-now` | GET | Highest-priority topic right now |
| `/api/analytics/` | GET | Readiness + topic performance |
| `/api/exam/generate` | POST | Generate CBSE mock paper |
| `/api/audio/tts` | POST | Text-to-speech |
| `/health` | GET | Server health check |

All endpoints except `/health`, `/api/auth/register`, and `/api/auth/login` require a valid JWT token.

Full interactive API docs are available at `http://localhost:8000/docs` when the backend is running.

---

## 9. How to Run Locally

**Prerequisites:** Python 3.10+, Node.js 18+, Groq API key (free at console.groq.com/keys)

**One-command start (Windows):**
```
start-dev.bat
```

**Manual start:**

Terminal 1 — Backend:
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Terminal 2 — Frontend:
```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:3000
- Backend + API docs: http://localhost:8000/docs

**Environment files needed:**
- `backend/.env` — must contain `GROQ_API_KEY` and PDF paths
- `frontend/.env.local` — must contain `NEXT_PUBLIC_API_URL=http://localhost:8000`

**PDFs needed in project root:**
- `ncert_science_8.pdf`, `ncert_maths_8.pdf`, `ncert_social_8.pdf`, `ncert_english_8.pdf`

---

## 10. Deployment Plan (for Future Interns)

| Step | Action | Service |
|---|---|---|
| 1 | Deploy backend | Railway or Render (set all env vars there) |
| 2 | Upload PDFs | Cloud storage (S3 / GCS) or include in repo |
| 3 | Deploy frontend | Vercel (set NEXT_PUBLIC_API_URL to backend URL) |
| 4 | Database | Migrate from SQLite to PostgreSQL (change DATABASE_URL) |
| 5 | Embeddings | Pre-build index, persist to Redis or disk |
| 6 | CORS | Add production frontend domain to allowed origins in `main.py` |

---

## 11. Key Design Decisions

**Why Groq instead of OpenAI?**
Groq provides LLaMA inference at very high speed (tokens per second) and has a free tier — suitable for a student project without high API costs.

**Why RAG instead of fine-tuning?**
Fine-tuning a model on NCERT content would require a labelled dataset and GPU training. RAG gives grounded, citation-backed answers with no training cost and can be updated just by swapping PDFs.

**Why SQLite for dev?**
Zero setup, single file, works on any machine. The SQLAlchemy ORM means switching to PostgreSQL for production only requires changing the connection string — no code changes.

**Why no LangChain?**
LangChain adds abstraction overhead and makes debugging harder. Since we only needed a specific hybrid retrieval pattern (chapter-filtered + hybrid BM25/dense), building it directly gave us more control and transparency.

**Why sentence-transformers locally instead of an embedding API?**
Avoids API calls and latency for every retrieval. The `all-MiniLM-L6-v2` model is small (80MB), fast, and accurate enough for this use case.
