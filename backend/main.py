"""
FastAPI Backend for PrepMeAI
"""
import sys
import os
import io

# Ensure stdout and stderr support UTF-8 (prevents UnicodeEncodeError when printing emojis on Windows)
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add project root to path so `core/` is importable from anywhere
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import health, tutor, quiz, auth, profile, planner, analytics
from routers.exam import router as exam_router
from db.database import init_db, close_db, engine
from sqlalchemy import text


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting PrepMeAI API...")
    await init_db()
    print("✅ Database initialized")

    # Pre-build RAG index for science PDF so first user request is fast
    import asyncio
    from services.rag_service import get_or_build_index
    science_pdf = os.getenv("PDF_SCIENCE_PATH", "ncert_science_8.pdf")
    if not os.path.isabs(science_pdf):
        science_pdf = os.path.abspath(os.path.join(PROJECT_ROOT, science_pdf))
    if os.path.exists(science_pdf):
        print(f"🔥 Warming up RAG index: {science_pdf}")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, get_or_build_index, science_pdf)
        print("✅ RAG index ready")
    else:
        print(f"⚠️  Science PDF not found at {science_pdf}, skipping warmup")

    yield

    print("🛑 Shutting down PrepMeAI API...")
    await close_db()
    print("✅ Cleanup complete")


app = FastAPI(
    title="PrepMeAI API",
    description="AI-powered personalized study platform backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["Health"])
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(planner.router)
app.include_router(analytics.router)
app.include_router(tutor.router)
app.include_router(quiz.router)
app.include_router(exam_router)


@app.get("/")
async def root():
    return {"service": "PrepMeAI API", "version": "1.0.0", "docs": "/docs"}
