# RAG Implementation Guide - PrepMeAI

## Overview
This document explains how RAG (Retrieval-Augmented Generation) is implemented in PrepMeAI to ensure accurate, grounded responses from the NCERT Science Class 8 PDF.

## Architecture

### 1. **PDF Ingestion & Chunking**
**File**: `backend/services/rag_service.py` → `extract_chunks()`

- **Process**: PyMuPDF (fitz) extracts text from PDF pages
- **Chunking Strategy**: 3-page sliding windows, split into paragraphs
- **Minimum Chunk Size**: 60 characters to filter noise
- **Metadata**: Each chunk stores page numbers and a hash for deduplication

```python
chunks = [
    {
        "text": "Paragraph content...",
        "pages": "1–3",
        "chunk_hash": "a1b2c3d4"
    },
    ...
]
```

### 2. **Vector Embeddings (Dense Retrieval)**
**File**: `backend/services/rag_service.py` → `build_index()`

- **Model**: `sentence-transformers/all-MiniLM-L6-v2`
  - 384-dimensional embeddings
  - Fast inference (~50ms for query encoding)
  - Good balance between speed and accuracy
  
- **Vector Database**: In-memory NumPy arrays (cached with `@lru_cache`)
  - For production: Consider Pinecone, Weaviate, or Qdrant
  - Current approach: Sufficient for single PDF (~200-300 chunks)

- **Normalization**: L2 normalization for cosine similarity

```python
embeddings = embedder.encode(texts, normalize_embeddings=True)
# Shape: (num_chunks, 384)
```

### 3. **Hybrid Retrieval**
**File**: `backend/services/rag_service.py` → `retrieve()`

**Why Hybrid?**
- Dense (semantic) search: Captures meaning, handles synonyms
- BM25 (lexical) search: Exact keyword matching, handles rare terms

**Formula**:
```
final_score = 0.7 × cosine_similarity + 0.3 × bm25_score
```

**Steps**:
1. Encode query using same embedding model
2. Compute cosine similarity with all chunk embeddings
3. Compute BM25 scores (term frequency + document length normalization)
4. Combine scores (70% dense, 30% sparse)
5. Return top-k chunks (default: 5)

### 4. **LLM Generation with Context**
**File**: `backend/services/rag_service.py` → `rag_answer()`, `assess_answer()`

**Process**:
1. Retrieve relevant chunks from PDF
2. Build context string with page citations
3. Create system prompt with instructions
4. Send to Groq API (Llama 3.3 70B)
5. Return answer + sources

**Key Features**:
- **Grounding**: System prompt explicitly forbids hallucination
- **Depth Adaptation**: Adjusts explanation complexity based on student mastery
- **Source Attribution**: Returns page numbers for verification

```python
messages = [
    {
        "role": "system",
        "content": "Answer using ONLY the provided textbook content. Do not hallucinate."
    },
    {
        "role": "user",
        "content": f"Context:\n{retrieved_chunks}\n\nQuestion: {question}"
    }
]
```

## Granular Difficulty Levels

### 5 Difficulty Classes
Implemented in both backend assessment and frontend UI:

| Level | Range | Label | Description | Assessment Criteria |
|-------|-------|-------|-------------|---------------------|
| 1 | 0.0-0.2 | Very Easy | Recall & Definitions | Correct term/definition |
| 2 | 0.2-0.4 | Easy | Basic Understanding | Concept + 1 example |
| 3 | 0.4-0.6 | Medium | Application | Explanation + real-world application |
| 4 | 0.6-0.8 | Hard | Analysis | Comparison + reasoning |
| 5 | 0.8-1.0 | Very Hard | Synthesis | Multiple concepts + evaluation |

**Adaptive Difficulty**:
- Score ≥80%: Increase difficulty by 0.1
- Score <50%: Decrease difficulty by 0.1
- Ensures optimal challenge level

## Dynamic Assessment

### Assessment Pipeline
**File**: `backend/services/rag_service.py` → `assess_answer()`

1. **Retrieve Ground Truth**: Fetch relevant PDF chunks for the question
2. **Build Rubric**: Generate difficulty-specific marking criteria
3. **LLM Evaluation**: Groq compares student answer vs. textbook content
4. **Structured Output**: JSON with detailed feedback

**Output Schema**:
```json
{
  "score": 75,
  "max_score": 100,
  "correctness": "partially_correct",
  "remarks": "You correctly explained X but missed Y...",
  "key_points_covered": ["Concept A", "Example B"],
  "key_points_missed": ["Concept C", "Detail D"],
  "improvement_suggestions": "Try to include...",
  "model_answer": "According to NCERT page 215...",
  "difficulty_level": 0.5,
  "sources_used": 3
}
```

## Voice Input/Output

### Speech Recognition (Voice Input)
**File**: `frontend/app/quiz/page.tsx`, `frontend/app/tutor/page.tsx`

- **API**: Web Speech API (`webkitSpeechRecognition`)
- **Mode**: Continuous recognition for quiz answers
- **Language**: English (can be configured)
- **Transcription**: Real-time text conversion

### Text-to-Speech (Read Aloud)
- **API**: Web Speech Synthesis API
- **Features**: 
  - Read questions aloud
  - Read AI responses
  - Read assessment feedback
- **Settings**: Rate 0.9, Pitch 1.0

## API Endpoints

### Tutor Endpoints
```
POST /api/tutor/ask
Body: {
  "question": "What causes seasons?",
  "mastery_score": 0.5
}
Response: {
  "answer": "...",
  "sources": [{pages, preview}],
  "retrieved_chunks": 5
}
```

### Quiz Endpoints
```
POST /api/quiz/generate-question
Body: {
  "topic": "Stars and Planets",
  "difficulty": 0.5
}
Response: {
  "question": "...",
  "difficulty": 0.5,
  "expected_answer_length": "medium",
  "key_concepts": [...],
  "sources": [{pages}]
}

POST /api/quiz/assess
Body: {
  "question": "...",
  "answer": "...",
  "difficulty": 0.5
}
Response: {
  "score": 75,
  "remarks": "...",
  ...
}
```

## How RAG Prevents Hallucination

1. **Retrieval First**: Always fetch PDF content before generation
2. **Explicit Instructions**: System prompt forbids external knowledge
3. **Source Attribution**: Every answer cites page numbers
4. **Context Window**: Only retrieved chunks are in LLM context
5. **Verification**: Frontend displays source previews for manual checking

## Vector Database Explanation

**Current Implementation**: In-memory NumPy arrays
- **Pros**: Simple, fast for small datasets, no external dependencies
- **Cons**: Not persistent, limited to single PDF

**Production Recommendation**: 
- **Pinecone/Weaviate**: For multi-document, multi-user scenarios
- **ChromaDB**: For local-first, embedded vector DB
- **FAISS**: For high-performance similarity search

**Why Vector DB?**
- Traditional search: Exact keyword matching
- Vector search: Semantic similarity (understands meaning)
- Example: "What causes day and night?" matches "Earth's rotation" even without exact words

## Performance Metrics

- **PDF Loading**: ~2-3 seconds (cached after first load)
- **Embedding Generation**: ~50ms per query
- **Retrieval**: ~10-20ms for top-5 chunks
- **LLM Generation**: ~2-4 seconds (Groq API)
- **Total Latency**: ~3-5 seconds per question

## Setup Instructions

1. **Install Dependencies**:
```bash
cd backend
pip install -r requirements.txt
```

2. **Set Environment Variables**:
```bash
# backend/.env
GROQ_API_KEY=your_key_here
PDF_PATH=../ncert_science_8.pdf
```

3. **Start Backend**:
```bash
cd backend
uvicorn main:app --reload --port 8000
```

4. **Start Frontend**:
```bash
cd frontend
npm run dev
```

5. **Test RAG**:
- Navigate to http://localhost:3000/tutor
- Ask: "What are constellations?"
- Verify sources show NCERT page numbers

## Mentor Requirements Checklist

✅ **Granular Difficulty**: 5 levels (0.0-1.0) with distinct assessment criteria
✅ **Advanced Q&A**: Context-aware responses adapt to student mastery
✅ **Dynamic Assessment**: Real-time evaluation using PDF content
✅ **Voice Input**: Speech-to-text for answers
✅ **Voice Output**: Text-to-speech for questions and feedback
✅ **RAG Integration**: Hybrid retrieval + Groq LLM
✅ **No Hallucination**: Grounded in PDF, source attribution
✅ **Detailed Feedback**: Points covered/missed, improvement suggestions
✅ **Adaptive Learning**: Difficulty adjusts based on performance

## Future Enhancements

1. **Personalized Learning Plans**: Use assessment data to generate study schedules
2. **Progress Tracking**: Store quiz history in database
3. **Multi-Document Support**: Extend to multiple textbooks
4. **Fine-tuned Embeddings**: Train custom model on NCERT corpus
5. **Caching**: Redis for frequently asked questions
6. **Analytics Dashboard**: Visualize mastery trends over time
//extra