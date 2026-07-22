"""
RAG (Retrieval-Augmented Generation) Service
Handles PDF ingestion, embedding, retrieval, and LLM generation
"""
import os
import re
import json
import hashlib
import numpy as np
from typing import List, Dict, Tuple, Optional
import fitz  # PyMuPDF
from groq import Groq
from config import get_settings
from utils.paths import get_pdf_path

settings = get_settings()

# ── Module-level index cache (persists across requests, cleared on restart) ────
_index_cache: Dict[str, Tuple[List[Dict], Optional[np.ndarray]]] = {}
_embedder = None
PAGE_OFFSET = 20  # skip first 20 pages (foreword, TOC, committee listings)

# ── Subject → PDF File Mapping ────────────────────────────────────────────────
SUBJECT_PDF_MAP = {
    "science":        "ncert_science_8.pdf",
    "maths":          "ncert_maths_8.pdf",
    "mathematics":    "ncert_maths_8.pdf",
    "social":         "ncert_social_8.pdf",
    "social science": "ncert_social_8.pdf",
    "social studies": "ncert_social_8.pdf",
    "social_studies": "ncert_social_8.pdf",
    "english":        "ncert_english_8.pdf",
}

def _resolve_pdf_path(subject: str = "science") -> str:
    """Resolve subject name to a canonical absolute PDF path."""
    pdf_path = get_pdf_path(subject)
    print(f"[rag] subject={subject} resolved_pdf={pdf_path} exists={pdf_path.exists()}")
    return str(pdf_path)


def _canonical_subject(subject: Optional[str]) -> str:
    value = (subject or "science").lower().strip()
    if value in ("maths", "mathematics"):
        return "maths"
    if value in ("social", "social science", "social studies", "social_studies"):
        return "social"
    if value == "english":
        return "english"
    return "science"

# ── Topic → Chapter number mapping ────────────────────────────────────────────
TOPIC_TO_CHAPTER: Dict[str, int] = {
    # NCERT Class 8 Science
    "Exploring the Investigative World of Science": 1,
    "The Invisible Living World: Beyond Our Naked Eye": 2,
    "Health: The Ultimate Treasure": 3,
    "Electricity: Magnetic and Heating Effects": 4,
    "Exploring Forces": 5,
    "Pressure, Winds, Storms, and Cyclones": 6,
    "Particulate Nature of Matter": 7,
    "Nature of Matter: Elements, Compounds, and Mixtures": 8,
    "The Amazing World of Solutes, Solvents, and Solutions": 9,
    "Light: Mirrors and Lenses": 10,
    "Keeping Time with the Skies": 11,
    # NCERT Class 8 Maths
    "Rational Numbers": 1,
    "Linear Equations in One Variable": 2,
    "Linear Equations": 2,
    "Understanding Quadrilaterals": 3,
    "Practical Geometry": 4,
    "Data Handling": 5,
    "Squares and Square Roots": 6,
    "Squares & Square Roots": 6,
    "Cubes and Cube Roots": 7,
    "Cubes & Cube Roots": 7,
    "Comparing Quantities": 8,
    "Algebraic Expressions and Identities": 9,
    "Algebraic Expressions": 9,
    "Mensuration": 10,
    "Exponents and Powers": 11,
    "Exponents & Powers": 11,
    "Direct and Inverse Proportions": 12,
    "Direct & Inverse Proportions": 12,
    "Factorisation": 13,
    "Introduction to Graphs": 14,
    # NCERT Class 8 Social Science
    "Natural Resources and Their Conservation": 1,
    "Reshaping India's Political Map": 2,
    "The Rise of the Marathas": 3,
    "The Colonial Era in India": 4,
    "Universal Franchise and India's Electoral System": 5,
    "The Parliamentary System: Legislature and Executive": 6,
    "Factors of Production": 7,
    # NCERT Class 8 English
    "The Wit that Won Hearts": 1,
    "A Concrete Example": 2,
    "Wisdom Paves the Way": 3,
    "A Tale of Valour: Major Somnath Sharma and the Battle of Badgam": 4,
    "Somebody's Mother": 5,
    "Verghese Kurien: I Too Had A Dream": 6,
    "The Case of the Fifth Word": 7,
    "The Magic Brush of Dreams": 8,
    "Spectacular Wonders": 9,
    "The Cherry Tree": 10,
    "Harvest Hymn": 11,
    "Waiting for the Rain": 12,
    "Feathered Friend": 13,
    "Magnifying Glass": 14,
    "Bibha Chowdhuri: The Beam of Light that Lit the Path for Women in Indian Science": 15,
}

# Strict chapter header: "Chapter 11 —" or "Chapter 11\n" on the same page
_CHAPTER_HEADER = re.compile(
    r"chapter\s+(\d+)\s*(?:[—–\-]|\n|$)",
    re.IGNORECASE | re.MULTILINE,
)
_INDEX_CACHE_VERSION = "chapters-v2"


def _detect_chapter(page_text: str) -> Optional[int]:
    """
    Extract chapter number only from an explicit 'Chapter N' header on this page.
    Returns None if no header is found (caller inherits previous chapter).
    """
    m = _CHAPTER_HEADER.search(page_text)
    if not m:
        return None
    num = int(m.group(1))
    if 1 <= num <= 20:
        return num
    return None


def get_embedder():
    """Lazy-load sentence transformer model once per process."""
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        print("[rag] loading embedding model...")
        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
        print("[rag] embedding model ready")
    return _embedder


def get_or_build_index(pdf_path: str, cache_namespace: Optional[str] = None) -> Tuple[List[Dict], Optional[np.ndarray]]:
    """Return cached index for pdf_path, building it if not yet cached."""
    cache_key = f"{cache_namespace or pdf_path}::{pdf_path}::{_INDEX_CACHE_VERSION}"
    if cache_key in _index_cache:
        chunks, embs = _index_cache[cache_key]
        print(f"[rag] cache hit namespace={cache_namespace or 'global'} path={pdf_path} chunks={len(chunks)}")
        return _index_cache[cache_key]

    print(f"[rag] building index namespace={cache_namespace or 'global'} path={pdf_path} (skipping first {PAGE_OFFSET} pages)...")

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        print(f"[rag] ERROR opening PDF: {e}")
        _index_cache[cache_key] = ([], None)
        return [], None

    chunks: List[Dict] = []
    page_count = doc.page_count
    chunk_pages = 3
    current_chapter: Optional[int] = None  # track chapter as we scan forward

    for start in range(PAGE_OFFSET, page_count, chunk_pages):
        end = min(start + chunk_pages, page_count)

        # Collect per-page text and detect chapter transitions
        page_texts = []
        for i in range(start, end):
            pt = doc.load_page(i).get_text()
            detected = _detect_chapter(pt)
            if detected is not None:
                current_chapter = detected
            page_texts.append(pt)

        text = "\n".join(page_texts).strip()
        if len(text) < 80:
            continue

        paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if len(p.strip()) > 60]
        for para in paragraphs:
            chunks.append({
                "text": para,
                "pages": f"{start + 1}–{end}",
                "page_num": start + 1,
                "chapter_num": current_chapter,
                "chunk_hash": hashlib.md5(para.encode()).hexdigest()[:8],
            })

    doc.close()

    # Log chapter distribution so we can verify tagging
    chap_counts: Dict[Optional[int], int] = {}
    for c in chunks:
        k = c["chapter_num"]
        chap_counts[k] = chap_counts.get(k, 0) + 1
    print(f"[rag] extracted {len(chunks)} chunks (pages {PAGE_OFFSET + 1}–{page_count})")
    print(f"[rag] chapter distribution: { {k: v for k, v in sorted(chap_counts.items(), key=lambda x: (x[0] or 0))} }")

    if not chunks:
        _index_cache[cache_key] = ([], None)
        return [], None

    embedder = get_embedder()
    texts = [c["text"] for c in chunks]
    embs = embedder.encode(
        texts,
        batch_size=64,
        show_progress_bar=False,
        normalize_embeddings=True,
    ).astype("float32")

    print(f"[rag] index ready namespace={cache_namespace or 'global'} - {len(chunks)} chunks, embeddings shape {embs.shape}")
    _index_cache[cache_key] = (chunks, embs)
    return chunks, embs


def cosine_scores(query_emb: np.ndarray, corpus_embs: np.ndarray) -> np.ndarray:
    return corpus_embs @ query_emb


def bm25_scores(query: str, chunks: List[Dict], k1: float = 1.5, b: float = 0.75) -> np.ndarray:
    tokens_q = set(query.lower().split())
    avgdl = sum(len(c["text"].split()) for c in chunks) / max(len(chunks), 1)
    scores = []
    for c in chunks:
        tokens_d = c["text"].lower().split()
        dl = len(tokens_d)
        freq = {t: tokens_d.count(t) for t in tokens_q if t in tokens_d}
        s = sum(
            f * (k1 + 1) / (f + k1 * (1 - b + b * dl / avgdl))
            for f in freq.values()
        )
        scores.append(s)
    return np.array(scores, dtype="float32")


_EXPLANATORY_VERBS = re.compile(
    r"\b(is|are|means|represents|defined as|when|if)\b", re.IGNORECASE
)
_MATHS_SKIP_LABELS = re.compile(r"\b(Activity|Table|Fig)\b", re.IGNORECASE)
_CONSECUTIVE_OPS = re.compile(r"[+\-×÷*/=]{4,}")
_STARTS_NUM_OR_OP = re.compile(r"^\s*[\d+\-×÷*/=]")


def _is_maths_pdf(pdf_path: str) -> bool:
    return "maths" in pdf_path.lower()


def _is_good_maths_chunk(text: str) -> bool:
    t = text.strip()
    if len(t) < 100:
        return False
    if _MATHS_SKIP_LABELS.search(t):
        return False
    if _CONSECUTIVE_OPS.search(t):
        return False
    if _STARTS_NUM_OR_OP.match(t):
        return False
    if not _EXPLANATORY_VERBS.search(t):
        return False
    return True


def _filter_maths_chunks(chunks: List[Dict], embs: Optional[np.ndarray]) -> Tuple[List[Dict], Optional[np.ndarray]]:
    """Keep only explanatory maths chunks suitable for question generation."""
    kept: List[Dict] = []
    indices: List[int] = []
    for i, c in enumerate(chunks):
        if _is_good_maths_chunk(c.get("text", "")):
            kept.append(c)
            indices.append(i)
    if kept:
        if embs is not None:
            embs = embs[indices]
        print(f"[rag] maths chunk filter: {len(chunks)} -> {len(kept)} explanatory chunks")
        return kept, embs
    print(f"[rag] maths chunk filter: no explanatory chunks passed, using unfiltered pool")
    return chunks, embs


def retrieve(
    query: str,
    pdf_path: str = None,
    top_k: int = 5,
    topic: Optional[str] = None,
    subject: Optional[str] = None,
) -> List[Dict]:
    """
    Hybrid retrieval: 70% dense + 30% BM25.
    If `topic` is provided and maps to a known chapter, restricts search to
    that chapter's chunks only — fixing the wrong-chapter retrieval problem.
    
    Args:
        query: Search query
        pdf_path: Legacy parameter, will be overridden by subject if provided
        top_k: Number of chunks to return
        topic: Topic name (maps to chapter)
        subject: Subject name (science/maths/social/english) - preferred over pdf_path
    """
    # Resolve PDF path from subject if provided, otherwise use pdf_path
    subject_key = _canonical_subject(subject)
    if subject:
        resolved_pdf_path = _resolve_pdf_path(subject_key)
    elif pdf_path:
        resolved_pdf_path = pdf_path
    else:
        subject_key = "science"
        resolved_pdf_path = _resolve_pdf_path(subject_key)
    
    all_chunks, all_embs = get_or_build_index(resolved_pdf_path, cache_namespace=subject_key)
    if not all_chunks:
        return []

    # ── Chapter filtering ─────────────────────────────────────────────────────
    target_chapter = TOPIC_TO_CHAPTER.get(topic) if topic else None
    if target_chapter is not None:
        # Find indices of chunks belonging to this chapter
        chapter_indices = [
            i for i, c in enumerate(all_chunks)
            if c.get("chapter_num") == target_chapter
        ]
        if chapter_indices:
            chunks = [all_chunks[i] for i in chapter_indices]
            embs   = all_embs[chapter_indices] if all_embs is not None else None
            print(f"[rag] chapter filter: subject={subject_key} topic='{topic}' -> chapter {target_chapter} -> {len(chunks)} chunks")
        else:
            # Chapter tagging may have failed for this PDF; fall back to full index
            print(f"[rag] chapter filter: no chunks found for chapter {target_chapter}, using full index")
            chunks, embs = all_chunks, all_embs
    else:
        chunks, embs = all_chunks, all_embs

    if subject and ("math" in subject.lower()):
        chunks, embs = _filter_maths_chunks(chunks, embs)
    elif pdf_path and _is_maths_pdf(resolved_pdf_path):
        chunks, embs = _filter_maths_chunks(chunks, embs)

    # ── Hybrid scoring ────────────────────────────────────────────────────────
    bm25 = bm25_scores(query, chunks)
    bm25_norm = bm25 / (bm25.max() + 1e-9)

    if embs is not None:
        embedder = get_embedder()
        q_emb = embedder.encode([query], normalize_embeddings=True)[0].astype("float32")
        dense = cosine_scores(q_emb, embs)
        hybrid = 0.7 * dense + 0.3 * bm25_norm
    else:
        hybrid = bm25_norm

    top_idx = np.argsort(hybrid)[::-1][:top_k]
    return [chunks[i] for i in top_idx]


# ── LLM Generation ─────────────────────────────────────────────────────────────
def groq_chat(messages: List[Dict], model: str = None, temperature: float = 0.4, max_tokens: int = 4000) -> str:
    """Call Groq API"""
    if not settings.groq_api_key:
        raise ValueError("GROQ_API_KEY not set")
    
    client = Groq(api_key=settings.groq_api_key)
    model = model or settings.groq_model_primary
    
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content.strip()


def get_depth_instructions(mastery_score: float) -> str:
    """Return depth-aware instructions based on mastery"""
    if mastery_score < 0.5:
        return (
            "The student's mastery is LOW. Use simple language, everyday analogies, "
            "avoid jargon. Break explanations into clear numbered steps. "
            "End with a very easy check-question."
        )
    elif mastery_score <= 0.75:
        return (
            "The student has MODERATE mastery. Give a clear explanation with one "
            "worked example. Use standard terminology but explain technical words. "
            "End with a medium-difficulty practice question."
        )
    else:
        return (
            "The student has HIGH mastery. Skip basics; focus on edge cases, "
            "advanced applications, and conceptual depth. Challenge them with a hard question."
        )


def rag_answer(question: str, pdf_path: str = None, mastery_score: float = 0.5,
               topic: Optional[str] = None, subject: str = "science") -> Dict:
    """RAG pipeline: retrieve relevant chunks and generate answer.
    
    Args:
        question: Student's question
        pdf_path: Legacy parameter (will be overridden by subject)
        mastery_score: Student's mastery level (0.0-1.0)
        topic: Specific topic/chapter name
        subject: Subject name (science/maths/social/english)
    """
    chunks = retrieve(question, pdf_path=pdf_path, top_k=5, topic=topic, subject=subject)

    if not chunks:
        return {
            "answer": "I couldn't find relevant information in the textbook. Please rephrase your question.",
            "sources": [],
            "retrieved_chunks": 0
        }

    # Build context
    context = "\n\n".join([f"[Page {c['pages']}]\n{c['text']}" for c in chunks])
    depth_inst = get_depth_instructions(mastery_score)

    # Map subject to display label
    subject_labels = {
        "science": "Science",
        "maths": "Mathematics", 
        "mathematics": "Mathematics",
        "social": "Social Science",
        "social science": "Social Science",
        "english": "English"
    }
    subject_label = subject_labels.get(subject.lower(), "Science")

    # Generate answer
    messages = [
        {
            "role": "system",
            "content": (
                f"You are an expert NCERT Class 8 {subject_label} tutor. "
                "Answer questions using ONLY the provided textbook content. "
                "Do not hallucinate or add information not in the context. "
                f"{depth_inst}\n\n"
                "If the context doesn't contain the answer, say so clearly."
            )
        },
        {
            "role": "user",
            "content": f"Context from NCERT Class 8 {subject_label}:\n\n{context}\n\nQuestion: {question}\n\nAnswer:"
        }
    ]

    answer = groq_chat(messages, temperature=0.3)

    return {
        "answer": answer,
        "sources": [{"pages": c["pages"], "preview": c["text"][:150] + "..."} for c in chunks[:3]],
        "retrieved_chunks": len(chunks)
    }


def assess_answer(question: str, student_answer: str, pdf_path: str = None,
                  difficulty_level: float = 0.5, topic: Optional[str] = None,
                  subject: str = "science") -> Dict:
    """Assess student's answer using RAG + LLM with semantic evaluation.
    
    Args:
        question: The question asked
        student_answer: Student's response
        pdf_path: Legacy parameter (will be overridden by subject)
        difficulty_level: Question difficulty (0.0-1.0)
        topic: Specific topic/chapter
        subject: Subject name (science/maths/social/english)
    """
    chunks = retrieve(question, pdf_path=pdf_path, top_k=3, topic=topic, subject=subject)
    context = "\n\n".join([c["text"] for c in chunks]) if chunks else "No context found"
    
    # Difficulty-based rubric
    if difficulty_level < 0.2:
        rubric = "Very Easy: Award full marks for correct recall/definition. Partial for incomplete."
    elif difficulty_level < 0.4:
        rubric = "Easy: Needs correct concept + one example. Partial for concept only."
    elif difficulty_level < 0.6:
        rubric = "Medium: Needs explanation + application. Partial for explanation without application."
    elif difficulty_level < 0.8:
        rubric = "Hard: Needs analysis + comparison. Partial for surface-level analysis."
    else:
        rubric = "Very Hard: Needs synthesis of multiple concepts + evaluation. Partial for incomplete synthesis."
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are an NCERT examiner using SEMANTIC EVALUATION. Grade based on MEANING, not keyword matching.\n\n"
                f"Difficulty Level: {difficulty_level:.1f}\n"
                f"Rubric: {rubric}\n\n"
                "EVALUATION CRITERIA:\n"
                "1. Core Concept (50%): Did they capture the fundamental idea? (Even if informal language)\n"
                "2. Scientific Terminology (30%): Did they use correct vocabulary?\n"
                "3. Misconceptions (20%): Did they state facts that need unlearning?\n\n"
                "ADAPTIVE BRANCHING LOGIC:\n"
                "- If score >= 0.8: Recommend BRANCH UP (increase difficulty)\n"
                "- If score <= 0.4: Recommend BRANCH DOWN (decrease difficulty)\n"
                "- If 0.4 < score < 0.8: Recommend MAINTAIN (same difficulty)\n\n"
                "Provide assessment in JSON format:\n"
                "{\n"
                '  "overall_score": <0.0-1.0 float>,\n'
                '  "score_percentage": <0-100 int>,\n'
                '  "core_concept_score": <0.0-1.0>,\n'
                '  "terminology_score": <0.0-1.0>,\n'
                '  "misconceptions_score": <0.0-1.0>,\n'
                '  "correctness": "<correct|partially_correct|incorrect>",\n'
                '  "tags": [<list of understanding tags like "understood_nucleus", "missing_vocab_membrane">],\n'
                '  "feedback_for_student": "<conversational feedback acknowledging what they got right, then gently correcting>",\n'
                '  "key_points_covered": [<concepts student understood>],\n'
                '  "key_points_missed": [<concepts student missed>],\n'
                '  "misconceptions_detected": [<any wrong facts that need unlearning>],\n'
                '  "improvement_suggestions": "<specific actionable advice>",\n'
                '  "model_answer": "<concise correct answer from textbook>",\n'
                '  "adaptive_recommendation": "<branch_up|branch_down|maintain>",\n'
                '  "next_difficulty_suggestion": <0.0-1.0 float>,\n'
                '  "mastery_status": "<strong|moderate|weak>"\n'
                "}"
            )
        },
        {
            "role": "user",
            "content": (
                f"Textbook Content:\n{context}\n\n"
                f"Question: {question}\n\n"
                f"Student's Answer: {student_answer}\n\n"
                "Assess this answer using SEMANTIC EVALUATION (meaning over keywords):"
            )
        }
    ]
    
    try:
        response = groq_chat(messages, temperature=0.2)
        # Extract JSON from response
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            assessment = json.loads(json_match.group())
        else:
            assessment = json.loads(response)
        
        # Add metadata
        assessment["difficulty_level"] = difficulty_level
        assessment["sources_used"] = len(chunks)
        assessment["evaluation_method"] = "semantic"
        
        # Ensure all required fields exist
        if "score_percentage" not in assessment and "overall_score" in assessment:
            assessment["score_percentage"] = int(assessment["overall_score"] * 100)
        
        return assessment
    except Exception as e:
        print(f"Assessment error: {e}")
        return {
            "overall_score": 0.0,
            "score_percentage": 0,
            "core_concept_score": 0.0,
            "terminology_score": 0.0,
            "misconceptions_score": 0.0,
            "correctness": "error",
            "tags": ["error_processing"],
            "feedback_for_student": "Error processing assessment. Please try again.",
            "key_points_covered": [],
            "key_points_missed": [],
            "misconceptions_detected": [],
            "improvement_suggestions": "Please rephrase your answer and try again.",
            "model_answer": "",
            "adaptive_recommendation": "maintain",
            "next_difficulty_suggestion": difficulty_level,
            "mastery_status": "unknown",
            "difficulty_level": difficulty_level,
            "sources_used": 0,
            "evaluation_method": "semantic"
        }


def generate_question(topic: str, difficulty_level: float, pdf_path: str) -> Dict:
    """
    Generate a question from the PDF content at specified difficulty
    """
    chunks = retrieve(topic, pdf_path, top_k=3)
    if not chunks:
        return {"error": "Topic not found in textbook"}
    
    context = "\n\n".join([c["text"] for c in chunks])
    
    if difficulty_level < 0.2:
        q_type = "a simple recall or definition question"
    elif difficulty_level < 0.4:
        q_type = "a basic understanding question requiring an example"
    elif difficulty_level < 0.6:
        q_type = "an application question with a real-world scenario"
    elif difficulty_level < 0.8:
        q_type = "an analysis question requiring comparison or reasoning"
    else:
        q_type = "a synthesis question combining multiple concepts"
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are an NCERT question paper setter. Generate questions ONLY from the provided textbook content. "
                f"Create {q_type} at difficulty level {difficulty_level:.1f}.\n\n"
                "Return JSON:\n"
                "{\n"
                '  "question": "<the question>",\n'
                '  "difficulty": <0.0-1.0>,\n'
                '  "expected_answer_length": "<short|medium|long>",\n'
                '  "key_concepts": [<list of concepts being tested>]\n'
                "}"
            )
        },
        {
            "role": "user",
            "content": f"Textbook Content:\n{context}\n\nGenerate a question about: {topic}"
        }
    ]
    
    try:
        response = groq_chat(messages, temperature=0.7)
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            question_data = json.loads(json_match.group())
        else:
            question_data = json.loads(response)
        
        question_data["sources"] = [{"pages": c["pages"]} for c in chunks[:2]]
        return question_data
    except Exception as e:
        print(f"Question generation error: {e}")
        return {"error": str(e)}
