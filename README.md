# PrepMeAI (PrepMe-AI) — Project Overview & Runbook

> **Short brief:** PrepMeAI is an adaptive learning platform built with **Next.js (frontend)** and **FastAPI (backend)**. It uses **RAG (Retrieval-Augmented Generation)** over NCERT PDFs to generate quiz questions, evaluate student answers semantically, and provide an AI tutor with grounded answers.

---

## What this project does

- **AI Tutor (RAG Q&A):** Answer questions using retrieved excerpts from NCERT PDFs and show citations/sources.
- **Adaptive Quiz:** Generate questions from PDFs and adapt difficulty based on performance.
- **Semantic Evaluation:** Assess answers by meaning (not just keyword matching), producing structured feedback.
- **Voice Input/Output:** Transcribe student voice answers and read tutor/feedback aloud.
- **Dynamic Adaptive Study Planner:** Automatically schedules, packs, and reschedules study sessions based on priority score, mastery levels, quiz performance, and user exam date boundaries.
- **Cross-Subject Progress & Analytics:** Real-time progress bar summaries across all 4 core subjects (Science, Mathematics, Social Studies, English).

---

## Architecture (high level)

```
Frontend (Next.js) 
  -> calls -> Backend (FastAPI)

Backend
  -> RAG service reads NCERT PDFs (chunking + retrieval)
  -> Hybrid retrieval (semantic + keyword)
  -> Calls Groq LLM with retrieved context only

Result returned to UI with:
- Answer / feedback
- Citations / retrieved page references
- Difficulty / mastery signals
```

---

## Core API Endpoints Overview

### Planner & Scheduling (`/api/planner`)
- `GET /api/planner/`: Returns scheduled study sessions filtered by subject.
- `POST /api/planner/regenerate`: Rebuilds the user's study plan based on updated mastery scores, quiz performance, and exam dates.
- `POST /api/planner/generate-session`: Manually plans a chapter, strictly respecting user `exam_date` constraints (returns `400 Bad Request` if calendar before exam is full).
- `POST /api/planner/complete-session` & `PATCH /api/planner/sessions/{id}/complete`: Marks a session completed.
- `GET /api/planner/study-now`: Fetches highest-priority topic to study.

### Profile & Mastery (`/api/profile`)
- `GET /api/profile/`: Fetches user profile and active subject mastery.
- `POST /api/profile/mastery`: Updates mastery score for a topic and triggers reactive revision sessions if score < 0.6.
- `GET /api/profile/mastery-summary`: Returns aggregate progress stats (percent, topics covered, total syllabus topics) across all 4 core subjects.

---

## Repository structure

- `frontend/` — Next.js application
- `backend/` — FastAPI application
- `assets/` — images/static assets
- `ncert_*.pdf` — required textbook PDFs placed in the project root

---

## Prerequisites

- **Node.js 18+**
- **Python 3.10+**
- **Git**
- **Groq API key**

Get Groq key: https://console.groq.com/keys

---

## Environment variables

### 1) Backend environment (`backend/.env`)

Create `backend/.env` (or copy from template if present):

```bash
cd backend
copy .env.example .env
```

At minimum, set:

```env
GROQ_API_KEY=your_groq_api_key_here

# Example model names (use what your code expects)
GROQ_MODEL_PRIMARY=llama-3.1-70b-versatile
GROQ_MODEL_FALLBACK=llama3-70b-8192

# PDF paths (point to PDFs in project root)
PDF_SCIENCE_PATH=../ncert_science_8.pdf
PDF_MATHS_PATH=../ncert_maths_8.pdf
PDF_SOCIAL_PATH=../ncert_social_8.pdf
PDF_ENGLISH_PATH=../ncert_english_8.pdf
```

**Database:** in dev you can use SQLite (your code may use `DATABASE_URL`). For example:

```env
DATABASE_URL=sqlite+aiosqlite:///./prepmeai.db
```

> Do **not** commit `.env` files to GitHub.

### 2) Frontend environment (`frontend/.env.local`)

Create `frontend/.env.local`:

```bash
cd frontend
copy .env.local.example .env.local
```

At minimum:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

- Use the deployed backend URL for production (e.g., Railway/Render URL).

---

## Required PDFs

Place these files in the project root (same folder where `backend/` and `frontend/` live):

- `ncert_science_8.pdf`
- `ncert_maths_8.pdf`
- `ncert_social_8.pdf`
- `ncert_english_8.pdf`

The RAG pipeline depends on these PDFs being present.

---

## How to run locally (Windows-friendly)

### Option A: Use provided scripts (recommended)

```bash
start-dev.bat
```

This should start both backend and frontend.

### Option B: Run manually (recommended for debugging)

#### 1) Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Ensure backend/.env is configured
uvicorn main:app --reload --port 8000
```

Backend:
- http://localhost:8000
- API docs: http://localhost:8000/docs

#### 2) Frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend:
- http://localhost:3000

---

## Using ngrok (to expose locally)

This is useful when you want to test remote webhooks, QA devices, or share a temporary URL.

### Backend-first approach

1) Start backend locally (as above) on **8000**.
2) Start ngrok:

```bash
ngrok http 8000
```

You’ll get a public URL like:
- `https://abcd-12-34-56-78.ngrok-free.app`

3) Set frontend API URL to that backend URL:

`frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=https://abcd-12-34-56-78.ngrok-free.app
```

4) Restart frontend.

> If your backend enforces allowed origins (CORS), add the ngrok domain to backend CORS config.

### Frontend-first approach

Expose frontend on **3000**:

```bash
ngrok http 3000
```

Then browse the ngrok URL for the UI.

---

## Deployment notes (Vercel + Railway example)

- Deploy **frontend** to Vercel.
- Deploy **backend** to Railway.
- Set `NEXT_PUBLIC_API_URL` in Vercel to the deployed backend URL.
- Configure backend env vars (Groq key, PDF paths or storage, database).

---

## GitHub hygiene (important)

- Add `.env`, `.env.local`, database files (`*.db`), and large local files to `.gitignore`.
- This repo includes `.gitignore` files at root + per service.

---

## Quick smoke tests

1. Backend health:

```bash
curl http://localhost:8000/health
```

2. Open frontend:
- http://localhost:3000

3. Verify tutor:
- Go to **AI Tutor** and ask a known NCERT question.

---

## Notes / troubleshooting

- If the UI can’t reach the API: verify `NEXT_PUBLIC_API_URL` and that backend is running on port **8000**.
- If RAG says it can’t find PDFs: confirm `ncert_*.pdf` exist in project root and the backend PDF path variables are correct.
- If Groq errors: confirm `GROQ_API_KEY` is present in `backend/.env`.

---

## License

(Add your license text here)

