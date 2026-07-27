# PrepMeAI — RAG System & Full Tech Stack Deep Dive

---

## Part 1: What is RAG and Why We Use It

RAG stands for **Retrieval-Augmented Generation**. It is an AI architecture pattern that combines two systems:

1. A **retrieval system** — finds relevant passages from a knowledge source (in our case, NCERT textbooks in PDF form)
2. A **generative model** — reads those passages and writes an answer grounded in them

Without RAG, a language model answers from its training data, which can be outdated, wrong, or fabricated (this is called hallucination). For an education application, hallucination is dangerous — a student might memorise incorrect science facts.

With RAG, the model is forced to work only from the text we retrieve. It cannot make things up because the system prompt tells it: "Answer using ONLY the provided textbook content."

---

## Part 2: The Complete RAG Pipeline (Step by Step)

The entire pipeline lives in `backend/services/rag_service.py`.

### Phase 1 — PDF Ingestion and Chunking

**What happens:**

The NCERT PDF is opened using PyMuPDF (the `fitz` library). The first 20 pages are skipped because they contain the foreword, table of contents, and committee listings — content that would add noise to retrieval without educational value.

```
PAGE_OFFSET = 20  # skip first 20 pages
```

Pages are then read in **windows of 3 pages at a time**. This sliding window approach groups physically adjacent content together, which preserves context that might be split across a page break.

```
chunk_pages = 3
for start in range(PAGE_OFFSET, page_count, chunk_pages):
    end = min(start + chunk_pages, page_count)
```

Within each 3-page window, the raw text is split by double newlines (`\n{2,}`) to produce individual paragraphs. Only paragraphs longer than 60 characters are kept — this discards captions, figure labels, and single-word headers.

Each surviving paragraph becomes one **chunk** with the following metadata:

| Field | Description |
|---|---|
| `text` | The paragraph text |
| `pages` | Page range, e.g. `"21–23"` |
| `page_num` | Starting page number |
| `chapter_num` | Detected chapter number (or None) |
| `chunk_hash` | 8-character MD5 hash of the text, used for deduplication |

**Chapter detection:**

As each page is scanned, a regex looks for explicit chapter headers:

```
r"chapter\s+(\d+)\s*(?:[—–\-]|\n|$)"
```

When a header is found (e.g. "Chapter 4 —"), the `current_chapter` counter updates. All subsequent chunks inherit that chapter number until a new header is found. This "sticky" assignment means chunks between two chapter headers are correctly labelled even when a chapter spans many pages.

---

### Phase 2 — Embedding Generation

**What an embedding is:**

An embedding is a list of numbers (a vector) that represents the *meaning* of a piece of text. Two sentences that mean similar things will produce vectors that point in similar directions in this high-dimensional space, even if they use completely different words. This is what allows semantic (meaning-based) search to work.

**The model used:**

```
all-MiniLM-L6-v2
```

This is a sentence transformer model from the `sentence-transformers` library, originally published by researchers at Microsoft and Hugging Face. It is a fine-tuned version of the MiniLM architecture.

Key properties:
- Output dimension: **384 floats per vector**
- Model size: ~80MB on disk
- Runs locally on CPU — no API call needed
- Trained on over 1 billion sentence pairs to produce semantically meaningful embeddings
- Fast enough for real-time use

**How it is loaded:**

The model is lazy-loaded once per server process using a module-level global variable:

```python
_embedder = None

def get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedder
```

The first request after startup pays the loading cost (~2 seconds). All subsequent requests reuse the same in-memory model object with zero loading overhead.

**Encoding all chunks:**

```python
embs = embedder.encode(
    texts,
    batch_size=64,
    show_progress_bar=False,
    normalize_embeddings=True,
).astype("float32")
```

- `batch_size=64`: processes 64 chunks at a time for efficiency
- `normalize_embeddings=True`: each vector is scaled so its length (L2 norm) equals exactly 1.0. This is important — it converts cosine similarity into a simple dot product (explained below)
- `.astype("float32")`: converts to 32-bit floats to reduce memory usage vs 64-bit

The result is a 2D NumPy array of shape `(N_chunks, 384)` — one 384-dimensional vector per chunk.

**The index cache:**

Both the chunk list and the embedding matrix are stored together in a Python dictionary:

```python
_index_cache: Dict[str, Tuple[List[Dict], Optional[np.ndarray]]] = {}
```

The cache key includes the subject name, PDF path, and a version string (`"chapters-v2"`). On a cache hit, retrieval skips the entire ingestion and embedding step. The cache lives in memory for the lifetime of the backend process — if the server restarts, it is rebuilt from the PDFs.

---

### Phase 3 — Retrieval (the core algorithm)

Every time a student asks a question, the `retrieve()` function runs.

**Step 1 — Subject and PDF resolution**

The function resolves which PDF to search based on the `subject` parameter. Subject names are normalised — "mathematics", "maths", and "math" all map to the maths PDF.

**Step 2 — Chapter filtering**

If a `topic` argument is provided (e.g. "Exploring Forces"), it is looked up in the `TOPIC_TO_CHAPTER` dictionary to get a chapter number. Only chunks whose `chapter_num` matches are passed to the scoring step. This is called **chapter-scoped retrieval** and it solves a critical problem: without it, a question about Chapter 5 could retrieve the most semantically similar text from any chapter, including unrelated ones.

```python
target_chapter = TOPIC_TO_CHAPTER.get(topic) if topic else None
chapter_indices = [i for i, c in enumerate(all_chunks) if c.get("chapter_num") == target_chapter]
chunks = [all_chunks[i] for i in chapter_indices]
embs   = all_embs[chapter_indices]
```

**Step 3 — Maths chunk filtering**

For Mathematics PDFs, an additional filter runs. Maths textbooks contain a lot of symbolic content — tables of numbers, worked calculation steps, activity boxes — that are useless as question context. The filter keeps only chunks that:

- Are at least 100 characters long
- Do not contain Activity/Table/Fig labels
- Do not start with a number or operator
- Do not contain 4+ consecutive mathematical operators
- Contain at least one explanatory verb (is, are, means, defined as, when, if)

This ensures the LLM receives prose-based conceptual content rather than a wall of symbols.

**Step 4 — Dense (semantic) scoring**

The student's query is encoded into a 384-dim vector using the same embedding model:

```python
q_emb = embedder.encode([query], normalize_embeddings=True)[0].astype("float32")
```

Cosine similarity between the query vector and every chunk vector is computed. Because both are L2-normalised, cosine similarity equals the dot product:

```
cosine_similarity(A, B) = (A · B) / (|A| × |B|)

Since |A| = |B| = 1 (normalised):
cosine_similarity(A, B) = A · B
```

In code:
```python
def cosine_scores(query_emb, corpus_embs):
    return corpus_embs @ query_emb
```

This is a single matrix-vector multiplication — NumPy executes it as a highly optimised BLAS operation. For 500 chunks, this takes under 1 millisecond on CPU.

**The cosine similarity value:**
- Range: -1.0 to 1.0 (for normalised vectors: 0.0 to 1.0 in practice)
- 1.0 = identical meaning
- 0.0 = completely unrelated
- A score of ~0.7+ typically indicates strong semantic relevance

**Step 5 — BM25 (keyword) scoring**

BM25 stands for **Best Match 25**. It is a classical information retrieval algorithm that scores documents based on term frequency, adjusted for document length. It is the underlying algorithm that powers search engines like Elasticsearch.

The formula for a single query term `t` in document `d` is:

```
BM25(t, d) = f(t,d) × (k1 + 1)
             ─────────────────────────────────────────
             f(t,d) + k1 × (1 - b + b × (dl / avgdl))
```

Where:
- `f(t, d)` = number of times term `t` appears in document `d` (term frequency)
- `dl` = length of document `d` in words
- `avgdl` = average document length across all chunks
- `k1 = 1.5` — controls term frequency saturation (how much extra occurrences matter)
- `b = 0.75` — controls length normalisation (longer documents are penalised less)

The total BM25 score for a query is the sum of BM25 scores across all query terms present in the document.

Our implementation:
```python
def bm25_scores(query, chunks, k1=1.5, b=0.75):
    tokens_q = set(query.lower().split())
    avgdl = sum(len(c["text"].split()) for c in chunks) / max(len(chunks), 1)
    for c in chunks:
        tokens_d = c["text"].lower().split()
        dl = len(tokens_d)
        freq = {t: tokens_d.count(t) for t in tokens_q if t in tokens_d}
        s = sum(f * (k1 + 1) / (f + k1 * (1 - b + b * dl / avgdl)) for f in freq.values())
```

After computing raw BM25 scores, they are normalised to the [0, 1] range by dividing by the maximum score:

```python
bm25_norm = bm25 / (bm25.max() + 1e-9)
```

The `+ 1e-9` prevents division by zero when all scores are 0.

**Step 6 — Hybrid scoring (final ranking formula)**

The two scores are combined with a weighted sum:

```
hybrid_score = 0.7 × dense_score + 0.3 × bm25_norm
```

In code:
```python
hybrid = 0.7 * dense + 0.3 * bm25_norm
```

Why this weighting?
- **Dense (0.7 weight):** Semantic search catches paraphrases, synonyms, and conceptually related content. A student asking "why does iron rust?" will match chunks about oxidation even if "rust" doesn't appear.
- **BM25 (0.3 weight):** Keyword matching catches exact technical terms. Subject-specific vocabulary like "photosynthesis" or "quadrilateral" should rank chunks that contain the exact word higher.

The top-k chunks (default 5) are returned sorted by descending hybrid score.

---

### Phase 4 — Generation (LLM Call)

The retrieved chunks are assembled into a context string with page numbers:

```python
context = "\n\n".join([f"[Page {c['pages']}]\n{c['text']}" for c in chunks])
```

A system prompt constrains the LLM to only use this content:

```
"You are an expert NCERT Class 8 Science tutor.
Answer questions using ONLY the provided textbook content.
Do not hallucinate or add information not in the context."
```

A **mastery-aware depth instruction** is added based on the student's current mastery score:

| Mastery Range | Instruction |
|---|---|
| < 0.5 (Low) | Simple language, everyday analogies, numbered steps, easy check-question |
| 0.5 – 0.75 (Moderate) | Standard explanation, one worked example, medium practice question |
| > 0.75 (High) | Skip basics, focus on edge cases and advanced applications, hard question |

The final prompt sent to Groq looks like:

```
[System]: You are an expert NCERT Class 8 Science tutor. Answer using ONLY the provided content...

[User]: Context from NCERT Class 8 Science:

[Page 45–47]
...retrieved paragraph 1...

[Page 48–50]
...retrieved paragraph 2...

Question: What is the difference between a physical change and a chemical change?

Answer:
```

The response from the LLM is returned along with page citations from the retrieved chunks.

---

## Part 3: Duplicate Detection and Question Fingerprinting

This lives in `backend/services/question_enhancer.py`.

When the enhanced question generation endpoint is used, each generated question receives a **fingerprint** — a 384-dimensional embedding of the question text:

```python
def get_question_fingerprint(question_text: str) -> list[float]:
    embedder = get_embedder()
    embedding = embedder.encode(question_text, convert_to_tensor=False)
    return embedding.tolist()
```

This fingerprint is stored in the frontend's `questionHistory` state and sent back with every subsequent question request.

**Duplicate check formula:**

For each new candidate question, cosine similarity is computed against every stored fingerprint:

```
similarity = (A · B) / (|A| × |B|)
```

Using `numpy.dot` and `numpy.linalg.norm`:

```python
similarity = dot(new_embedding, stored_embedding) / (
    norm(new_embedding) * norm(stored_embedding)
)
```

If any similarity exceeds **0.82** (the threshold), the question is flagged as a duplicate and the backend retries generation up to 3 times with a different chunk sample.

Why 0.82? At this threshold:
- "What is photosynthesis?" and "Define photosynthesis" score ~0.91 → blocked (same question, different phrasing)
- "What is photosynthesis?" and "How does light affect plant growth?" score ~0.55 → allowed (related but genuinely different)

---

## Part 4: Semantic Answer Assessment

When a student answers a short-answer question, `assess_answer()` retrieves 3 relevant chunks from the textbook and sends them along with the question and the student's answer to the LLM for grading.

The LLM grades based on **meaning, not keyword matching** using this rubric:

| Criterion | Weight | What it measures |
|---|---|---|
| Core Concept | 50% | Did the student capture the fundamental idea, even in informal language? |
| Scientific Terminology | 30% | Did they use correct vocabulary? |
| Misconceptions | 20% | Did they state any factually wrong ideas? |

The LLM returns a structured JSON response with:
- `overall_score` (0.0–1.0)
- `correctness` (correct / partially_correct / incorrect)
- `feedback_for_student` (conversational, acknowledges what they got right)
- `key_points_covered` and `key_points_missed`
- `adaptive_recommendation` (branch_up / branch_down / maintain)
- `next_difficulty_suggestion` (0.0–1.0 float)

The `adaptive_recommendation` drives the quiz difficulty system:

```
score >= 0.8  → branch_up   (increase difficulty by +0.08)
score <= 0.4  → branch_down (decrease difficulty by -0.10)
0.4 < score < 0.8 → maintain
```

---

## Part 5: Full Technology Stack

### Backend

**FastAPI**
- What it is: A modern Python web framework for building REST APIs
- Why it was chosen: Native async/await support, automatic OpenAPI docs at `/docs`, Pydantic request validation built in, very fast
- Role in this project: Hosts all API endpoints — auth, quiz, tutor, planner, analytics, exam generation

**Python 3.10+**
- What it is: The programming language the backend is written in
- Role: Runtime for all backend logic, ML operations, and API handling

**SQLAlchemy 2.0 (async)**
- What it is: Python's most widely used ORM (Object-Relational Mapper). An ORM lets you write Python classes instead of raw SQL to interact with the database
- Role: Defines all database tables as Python classes (User, MasteryScore, QuizAttempt, StudySession, etc.) and handles all DB reads/writes

**aiosqlite**
- What it is: An async driver for SQLite that lets SQLAlchemy work without blocking the server
- Role: In development, all data is stored in a single local file (`prepmeai.db`). The async driver means database operations don't freeze the server while waiting for disk I/O

**Alembic**
- What it is: A database migration tool for SQLAlchemy
- Role: When the database schema changes (e.g. adding an `avatar` column to the users table), Alembic generates and runs migration scripts so existing data is preserved

**Pydantic v2**
- What it is: A Python library for data validation using type annotations
- Role: Every API request body is defined as a Pydantic model. If the frontend sends wrong field types or missing fields, Pydantic rejects it automatically with a clear error — no manual validation code needed

**Groq API**
- What it is: A cloud inference service that runs open-source LLM models (primarily LLaMA by Meta) at very high speed using custom silicon called LPUs (Language Processing Units)
- Models used: `llama-3.1-8b-instant` (primary, fast) and `llama-3.3-70b-versatile` (fallback, more capable)
- Role: The brain of the system — generates quiz questions, grades student answers semantically, tutors students, writes micro-goals and study advice. All LLM calls are made via the Groq Python SDK

**sentence-transformers**
- What it is: A Python library providing pre-trained transformer models specifically optimised to produce sentence-level embeddings
- Model used: `all-MiniLM-L6-v2` (384 dimensions, ~80MB)
- Role: Converts text (both PDF chunks and student queries) into embedding vectors for semantic search. Runs entirely locally — no API call or internet connection required

**PyMuPDF (fitz)**
- What it is: A Python binding for the MuPDF library, used for reading and extracting content from PDF files
- Role: Opens the four NCERT PDF textbooks and extracts page text. Used in the chunking phase of the RAG pipeline

**NumPy**
- What it is: The foundational library for numerical computing in Python. Provides multi-dimensional arrays and highly optimised mathematical operations
- Role: Stores all embedding vectors as a 2D float32 array, computes cosine similarity via matrix multiplication (`@` operator), computes BM25 scores, runs `argsort` to rank chunks

**passlib + bcrypt**
- What it is: passlib is a Python password hashing library; bcrypt is the specific hashing algorithm
- Role: All user passwords are hashed before storage. bcrypt is intentionally slow, making brute-force attacks computationally expensive

**python-jose**
- What it is: A Python implementation of the JOSE (JSON Object Signing and Encryption) standards, used to create and verify JWT tokens
- Role: After login, the server creates a signed JWT containing the user's ID and expiry time. Every API request includes this token; the server verifies the signature to authenticate the user without hitting the database

**gTTS (Google Text-to-Speech)**
- What it is: A Python wrapper for Google's Text-to-Speech API
- Role: Converts tutor answers and feedback text into audio, enabling the voice output feature

**python-dotenv**
- What it is: Loads environment variables from a `.env` file into Python's `os.environ`
- Role: Keeps API keys and configuration out of the source code. The `backend/.env` file holds the Groq API key, PDF paths, and database URL

**httpx**
- What it is: A modern async HTTP client for Python
- Role: Used in the Whisper service to forward audio files to the external transcription endpoint

---

### Frontend

**Next.js 14 (React 18)**
- What it is: A full-stack React framework with file-based routing, server-side rendering, and optimised client-side navigation
- Role: The entire student-facing UI — landing page, quiz, tutor, planner, analytics, exam, profile. The App Router (`app/` directory) handles page routing

**TypeScript**
- What it is: A superset of JavaScript that adds static type checking
- Role: Every component, API response shape, and state variable has a declared type. This catches bugs at write-time rather than at runtime — for example, passing a string where a number is expected is a compile-time error

**Tailwind CSS**
- What it is: A utility-first CSS framework that provides single-purpose class names (`text-xs`, `font-bold`, `border-2`) instead of component-level stylesheets
- Role: All styling across the app. Enables rapid iteration without writing separate CSS files

**Radix UI + shadcn/ui**
- What it is: Radix UI provides unstyled, accessible React component primitives (Select, Dialog, Slider, etc.). shadcn/ui provides a pre-styled layer on top of Radix with Tailwind
- Role: Core interactive components — topic dropdowns, sliders for difficulty, modal dialogs, progress bars, all accessible by default (keyboard navigation, ARIA attributes)

**Framer Motion**
- What it is: A production-ready animation library for React
- Role: Page transition animations, the quiz question slide-in effect, XP badge fade-up animations

**Lucide React**
- What it is: A clean, consistent icon library with 1000+ SVG icons as React components
- Role: All icons throughout the UI (navigation icons, action buttons, status indicators)

**React Context API**
- What it is: React's built-in state sharing mechanism — data stored in a Context can be read by any component in the tree without prop drilling
- Role: `AuthContext` stores the logged-in user profile and `authFetch` (the JWT-authenticated fetch wrapper). `ThemeContext` / `SubjectThemeProvider` stores the active subject and background theme

---

### Infrastructure

**SQLite**
- What it is: A serverless, file-based relational database. The entire database is a single `.db` file
- Role: Stores all user data, mastery scores, quiz attempts, study sessions, and mistake journals in development. No separate database server process needed

**PostgreSQL (production target)**
- What it is: A full-featured, production-grade relational database
- Role: The intended database for deployment. Switching from SQLite requires only changing the `DATABASE_URL` environment variable — no code changes due to SQLAlchemy's abstraction

**ngrok**
- What it is: A tunnelling service that creates a temporary public HTTPS URL pointing to a local or Colab-hosted server
- Role: Used to expose the Whisper/WhisperX audio transcription server (running in Google Colab) to the internet so the backend can send audio files to it

**Vercel (frontend deployment target)**
- What it is: A cloud platform optimised for Next.js deployment with global CDN, automatic HTTPS, and zero-config builds
- Role: Hosts the frontend in production

**Railway / Render (backend deployment target)**
- What it is: Cloud platforms for deploying Python/Node applications with managed environments and automatic deploys from Git
- Role: Hosts the FastAPI backend in production

---

## Part 6: Data Flow Summary

```
Student types a question
        │
        ▼
Frontend (Next.js) — POST /api/tutor/ask
        │
        ▼
Backend (FastAPI) — rag_answer()
        │
        ├─ retrieve()
        │       ├─ get_or_build_index()       ← PyMuPDF + sentence-transformers
        │       ├─ chapter filter              ← TOPIC_TO_CHAPTER dict
        │       ├─ cosine_scores()             ← NumPy dot product
        │       ├─ bm25_scores()               ← BM25 formula
        │       └─ hybrid = 0.7×dense + 0.3×BM25
        │
        ├─ Build context string from top-5 chunks
        │
        ├─ get_depth_instructions()            ← mastery-aware prompt
        │
        └─ groq_chat()                         ← Groq API → LLaMA 3.1
                │
                ▼
        Answer + page citations returned to frontend
```

---

## Part 7: Why No LangChain or Vector Database?

LangChain is a popular framework that wraps RAG pipelines with abstractions. Vector databases (Pinecone, Chroma, FAISS) store embeddings persistently and offer scalable nearest-neighbour search.

This project deliberately avoids both for the following reasons:

**No LangChain:**
- The retrieval pattern needed (chapter-scoped hybrid BM25+dense) is specific enough that LangChain's generic chains would need to be heavily customised anyway
- Debugging LangChain errors is harder because the framework hides what's actually being sent to the LLM
- Direct control over the prompt, retrieval logic, and scoring gives more transparency for an educational context where answer quality matters

**No vector database:**
- The corpus is small: ~4 PDFs producing roughly 500–800 chunks each. This fits entirely in RAM as a NumPy array
- NumPy dot products over 500 vectors take under 1ms — a vector DB would be slower due to network overhead
- No additional infrastructure to deploy or maintain

**For production scale** (hundreds of PDFs, multiple simultaneous users):
- Replace the in-memory NumPy index with FAISS (a CPU/GPU-accelerated nearest-neighbour library) or a hosted vector DB like Pinecone
- Pre-compute embeddings at deploy time and load them on startup instead of building from PDFs
- This requires only changes to `get_or_build_index()` — the rest of the pipeline stays the same
