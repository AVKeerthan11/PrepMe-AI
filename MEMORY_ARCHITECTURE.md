# PrepMeAI - Memory & Persistence Architecture

## Overview

PrepMeAI uses a **hybrid memory model** combining session-based and persistent database storage for different types of data.

---

## 1. AI Tutor - Conversation Memory

### Session-Based (In-Memory)
The tutor conversation history is **stored only during the active session**:

```typescript
// frontend/app/tutor/page.tsx
const [messages, setMessages] = useState<Msg[]>([])
const [history, setHistory] = useState<HistoryItem[]>([])
```

**Characteristics:**
- ✅ Kept in React state during the session
- ✅ Supports context-aware conversations (can refer to previous messages)
- ✅ Last 10 messages sent to backend for context
- ❌ Lost when page is refreshed
- ❌ Not persisted to database
- ❌ Not accessible on next session

### How It Works

1. **User asks a question** in the tutor chat
2. **Last 10 messages** are sent to backend as context:
```typescript
const historyToSend = [...history, { role: "user", content: q }].slice(-10)

authFetch("/api/tutor/ask", {
  body: JSON.stringify({
    question: q,
    conversation_history: history.slice(-10),  // Context
    topic: topic,
    mastery_score: mastery,
    subject: subject,
  }),
})
```

3. **Backend** uses this context for:
   - Understanding what the student has already learned
   - Providing follow-up answers (e.g., "Based on what we discussed...")
   - Adjusting difficulty based on previous questions

4. **AI Response** is stored in React state
5. **Clearing chat** removes all history:
```typescript
onClick={() => { setMessages([]); setHistory([]) }}
```

### Data Sent to Backend

```typescript
{
  question: "What is photosynthesis?",
  mastery_score: 0.65,
  subject: "science",
  topic: "The Invisible Living World",
  conversation_history: [
    { role: "user", content: "What are microorganisms?" },
    { role: "assistant", content: "Microorganisms are..." },
    { role: "user", content: "How do they reproduce?" },
    { role: "assistant", content: "..." }
  ]
}
```

### Backend Processing

```python
# backend/routers/tutor.py
@router.post("/ask")
async def ask_tutor(req: TutorRequest):
    chunks = retrieve(req.question, pdf_path, top_k=5)
    
    # Build conversation with history
    messages = [{"role": "system", "content": system_prompt}]
    for turn in req.conversation_history[-10:]:  # Last 10
        messages.append(turn)
    messages.append({"role": "user", "content": req.question})
    
    # Generate response with context
    response = groq_chat(messages)
    return response
```

---

## 2. Quiz Session - Persistence Model

### Fully Persistent (Database)

Quiz attempts are **always stored in the database** for analytics:

```python
# backend/routers/quiz.py - Line 510-542
# Save QuizAttempt
is_correct = result.get("overall_score", 0.0) >= 0.5
score_val = result.get("overall_score", 0.0)

stmt = text("""
    INSERT INTO quiz_attempts (
        id, user_id, topic, question_text, student_answer, 
        reference_answer, is_correct, bloom_level, attempted_at, 
        time_taken_seconds, score
    ) VALUES (...)
""")
await db.execute(stmt)
await db.commit()
```

**Characteristics:**
- ✅ Persisted immediately to database
- ✅ Accessible across sessions
- ✅ Used for analytics and exam predictions
- ✅ Can restart quiz and previous attempts are saved
- ✅ Generates "streak" based on consecutive correct answers
- ✅ Tracks misconceptions for personalization

### Quiz Attempt Data Stored

```python
class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    
    id: UUID                  # Unique attempt ID
    user_id: UUID             # Which student
    topic: str                # Which chapter/topic
    question_text: str        # The actual question
    student_answer: str       # What they answered
    reference_answer: str     # Correct answer
    is_correct: bool          # True/False
    bloom_level: str          # Question type (mcq, short, etc)
    attempted_at: datetime    # When they answered
    time_taken_seconds: int   # How long they took
    score: float              # 0.0-1.0 score
```

### Session-Based Quiz State (Frontend)

While taking a quiz, the current question and responses are in React state:

```typescript
// frontend/app/quiz/page.tsx
const [phase, setPhase] = useState<Phase>("setup")
const [config, setConfig] = useState<{topic, qType, mode, count, difficulty} | null>(null)
const [questions, setQuestions] = useState<QuizQuestion[]>([])
const [qIdx, setQIdx] = useState(0)
const [attempts, setAttempts] = useState<AttemptRecord[]>([])
const [currentAnswer, setCurrentAnswer] = useState("")
const [currentConfidence, setCurrentConfidence] = useState<Confidence>("guessing")
```

**This state is:**
- ✅ Used for quiz flow and UI
- ✅ Cleared when you leave the page
- ❌ Not persisted directly
- ℹ️ Data is saved to DB AFTER submission

---

## 3. Mistake Journal - Persistent Memory

### Database Storage

Wrong quiz answers are stored in a **Mistake Journal** for later review:

```python
# backend/routers/quiz.py - save_mistake endpoint
class QuizMistake(Base):
    __tablename__ = "quiz_mistakes"
    
    id: UUID
    student_id: UUID
    subject: str
    topic: str
    question: str
    student_answer: str
    correct_answer: str
    misconception: str        # AI-detected misconception
    confidence: str           # How sure student was (sure/unsure/guessing)
    created_at: datetime
```

**Misconception Detection:**

```python
def _detect_misconception(question, student_answer, correct_answer):
    prompt = f"""
    The student was asked: {question}
    Their wrong answer was: {student_answer}
    The correct answer is: {correct_answer}
    
    Identify the specific misconception (1-2 sentences).
    """
    return groq_chat([{"role": "user", "content": prompt}])
```

**Example Storage:**
```
Question: "Which organelle performs photosynthesis?"
Student Answer: "Mitochondria"
Correct Answer: "Chloroplast"
Misconception: "You likely confused the energy-producing organelle (mitochondria) with 
               the photosynthesis organelle (chloroplast). Both use energy, but mitochondria 
               is for respiration while chloroplasts are for photosynthesis."
```

### Using Mistake Journal

Later, students can:
1. Review mistakes
2. Practice the specific topics they got wrong
3. See patterns in their misconceptions
4. Retake quizzes on weak topics

---

## 4. Mastery Tracking - Persistent Memory

### Updated with Each Quiz

Every quiz attempt updates the student's mastery score:

```python
# Mastery updates after quiz submission
mastery_score = current_mastery * 0.7 + quiz_accuracy * 0.3
```

### Database Model

```python
class MasteryScore(Base):
    __tablename__ = "mastery_scores"
    
    id: UUID
    user_id: UUID
    topic: str                # Which chapter
    score: float              # 0.0-1.0 mastery level
    sessions_done: int        # Study sessions completed
    last_tested: date         # Last quiz attempt
    created_at: datetime
    updated_at: datetime
```

### Mastery Impacts

The mastery score influences:
- **AI Tutor Tone** - Beginner vs advanced explanations
- **Quiz Difficulty** - Easier or harder questions
- **Study Planner** - Which topics to prioritize
- **Analytics** - Readiness score calculation
- **Exam Prediction** - Predicted exam score

---

## 5. Study Plan - Session + Database

### Persistent Study Schedule

Study plans are stored in database but follow a session pattern:

```python
class StudySession(Base):
    __tablename__ = "study_sessions"
    
    id: UUID
    user_id: UUID
    date: date
    topic: str
    planned_minutes: int
    session_type: str         # study/practice/revision
    status: str               # pending/done
    priority_score: float
    micro_goals: JSON         # [{"text": "...", "done": false}, ...]
    created_at: datetime
    updated_at: datetime
```

### Session Flow

1. **Plan Created** - Stored in DB when user visits planner
2. **Session Active** - User works through micro-goals
3. **Session Complete** - Marked as "done" in DB
4. **Analytics Used** - Data feeds into progress tracking

---

## 6. Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     USER SESSION                             │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
    ┌────────┐          ┌────────┐         ┌────────┐
    │  TUTOR │          │  QUIZ  │         │ PLANNER│
    └────────┘          └────────┘         └────────┘
        │                   │                   │
        │ Session Memory    │ Database Storage  │ Database Storage
        │ (React State)     │ (QuizAttempt)     │ (StudySession)
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
            ┌───────────────────────────────────┐
            │   ANALYTICS & PERSONALIZATION     │
            ├───────────────────────────────────┤
            │ • Mastery Score Updates           │
            │ • Mistake Journal                 │
            │ • Study Progress                  │
            │ • Readiness Score                 │
            │ • Exam Prediction                 │
            └───────────────────────────────────┘
```

---

## 7. Key Differences Summary

| Feature | Tutor | Quiz | Planner | Analytics |
|---------|-------|------|---------|-----------|
| **Conversation Memory** | Session Only | ✅ Persistent | N/A | N/A |
| **Attempts/Answers** | N/A | ✅ Persistent | N/A | ✅ Persisted |
| **Misconceptions** | N/A | ✅ Persistent | N/A | ✅ Retrieved |
| **Schedule** | N/A | N/A | ✅ Persistent | ✅ Used |
| **Mastery Scores** | N/A | ✅ Updated | ✅ Used | ✅ Core |
| **Session State** | ✅ React State | ✅ React State | Read from DB | Read from DB |
| **Survives Refresh** | ❌ No | ✅ Yes (DB) | ✅ Yes | ✅ Yes |
| **Cross-Session** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |

---

## 8. Database Persistence Details

### What Gets Saved to Database

1. **QuizAttempt** - Every quiz answer
2. **QuizMistake** - Every wrong answer with misconception
3. **MasteryScore** - Current mastery per topic
4. **StudySession** - Study plan items
5. **User Profile** - Subject, exam date, daily hours

### What Stays in Memory

1. **Tutor Chat History** - Conversation during session
2. **Quiz Session State** - Current question being answered
3. **UI State** - Panels, selections, etc.

### Why This Design?

**Tutor Chat (Session Only):**
- ✅ Faster response times (no DB queries)
- ✅ Simpler context passing
- ✅ Fresh conversation each session
- ✅ Users expect chat to start fresh

**Quiz (Persistent):**
- ✅ Need to track progress over time
- ✅ Build mistake journal
- ✅ Calculate mastery scores
- ✅ Predict exam performance
- ✅ Enable analytics

---

## 9. Enhancement Opportunities

If you want to add persistent memory to the tutor:

### Option 1: Save Conversations to Database

```python
class TutorConversation(Base):
    __tablename__ = "tutor_conversations"
    
    id: UUID
    user_id: UUID
    topic: str
    messages: JSON           # [{role, content}, ...]
    created_at: datetime
    updated_at: datetime
```

**Benefits:**
- Resume conversations later
- Review what you learned
- Personalized suggestions

**Drawbacks:**
- More database load
- Slightly slower response
- Need cleanup strategy

### Option 2: Session-Based Cache with TTL

Keep tutor history in Redis for 1 hour:

```python
# Store in Redis with 1-hour expiry
redis.set(f"tutor:{user_id}:{topic}", 
          json.dumps(history), 
          ex=3600)
```

**Benefits:**
- Fast access
- Survives page refresh
- Expires automatically

### Option 3: Local Storage (Frontend)

```typescript
// Save to browser's localStorage
localStorage.setItem(`tutor_${topic}`, 
                     JSON.stringify(history))

// Load on page load
const saved = localStorage.getItem(`tutor_${topic}`)
if (saved) setHistory(JSON.parse(saved))
```

**Benefits:**
- No server storage needed
- Always available
- Works offline

---

## 10. Current Implementation Status

| Component | Storage Type | Status | Persistence |
|-----------|--------------|--------|-------------|
| **AI Tutor** | Session (React State) | ✅ Working | Per-session only |
| **Quiz** | Database + Session | ✅ Working | Fully persistent |
| **Mistake Journal** | Database | ✅ Working | Fully persistent |
| **Mastery Tracking** | Database | ✅ Working | Fully persistent |
| **Study Planner** | Database + Session | ✅ Working | Fully persistent |
| **Analytics** | Database Queries | ✅ Working | Fully persistent |

---

## Recommendations

### Current Setup is Good For:
- ✅ Fresh conversations per session (education best practice)
- ✅ Tracking quiz progress over time
- ✅ Building comprehensive analytics
- ✅ Identifying misconceptions
- ✅ Personalization through mastery scores

### If You Want to Add Persistent Tutor Memory:

**Recommendation: Local Storage First**
1. Save tutor history to browser localStorage
2. Load on session start
3. Add "Resume Conversation" button
4. No server storage needed
5. Can later upgrade to database if needed

**Implementation Time:** ~30 minutes

---

## Summary

- **AI Tutor**: Session-based (starts fresh each time)
- **Quiz**: Fully persistent (all attempts saved)
- **Mistake Journal**: Fully persistent (AI-detected misconceptions saved)
- **Analytics**: Based on persistent database data
- **Study Planner**: Persistent schedules with session tracking

This hybrid approach balances performance, user experience, and data requirements.
