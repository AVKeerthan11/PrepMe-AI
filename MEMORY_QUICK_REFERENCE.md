# Memory & Persistence - Quick Reference

## TL;DR

| Feature | Persisted? | Where | How Long |
|---------|-----------|-------|----------|
| **AI Tutor Conversations** | ❌ No | Browser Session | Until page refresh |
| **Quiz Attempts** | ✅ Yes | Database | Forever |
| **Quiz Mistakes** | ✅ Yes | Database | Forever |
| **Mastery Scores** | ✅ Yes | Database | Forever |
| **Study Plans** | ✅ Yes | Database | Forever |
| **Analytics Data** | ✅ Yes | Database | Forever |

---

## AI Tutor: Session-Only Memory

```
User asks question
    ↓
Last 10 messages sent to backend as context
    ↓
Backend uses context for better responses
    ↓
Response displayed in chat
    ↓
History stored in React state
    ↓
PAGE REFRESH → All history lost ❌
```

**Example:**
```
User 1: "What is photosynthesis?"
AI: "Photosynthesis is..."
User 2: "Give an example"
AI: (remembers User 1's question, provides contextualized answer)
User refreshes page
→ "What is photosynthesis?" question is GONE ❌
```

---

## Quiz: Fully Persistent Memory

```
User answers question
    ↓
Answer submitted to backend
    ↓
Backend evaluates correctness
    ↓
AI detects misconception (if wrong)
    ↓
Data saved to database:
  - Question text ✅
  - Student answer ✅
  - Correct answer ✅
  - Misconception ✅
  - Time taken ✅
  - Score ✅
    ↓
Analytics updated:
  - Mastery score ✅
  - Mistake journal ✅
  - Exam prediction ✅
    ↓
PAGE REFRESH → All quiz data still there ✅
```

**Example:**
```
Session 1:
- Answer 5 quiz questions
- Save all to database

Session 2 (next day):
- All previous answers still there
- Mastery scores updated
- Can review past mistakes
- Analytics show progress
```

---

## Data Stored Per Feature

### 🤖 AI Tutor (Session Memory)
```
In Browser RAM (Lost on refresh):
├── Last 10 messages
├── Current topic
├── User input
└── Display state
```

### 📝 Quiz (Persistent)
```
In Database (Saved Forever):
├── Question text
├── Student answer
├── Correct answer
├── Is correct
├── Time taken (seconds)
├── Bloom level (question type)
├── Timestamp
├── Misconception (AI-detected)
└── Confidence (sure/unsure/guessing)

Used For:
├── Exam prediction ✅
├── Mistake journal review ✅
├── Mastery score calculation ✅
├── Analytics dashboard ✅
└── Progress tracking ✅
```

### 📚 Study Planner (Persistent)
```
In Database:
├── Study schedule (all future sessions)
├── Topic for each session
├── Session type (study/practice/revision)
├── Micro-goals (with completion status)
├── Priority score
└── Session status (pending/done)
```

### 📊 Analytics (Database-Driven)
```
Calculated From:
├── Quiz attempts (all attempts stored)
├── Mastery scores (updated per quiz)
├── Study sessions (marked complete)
├── Time spent (tracked per session)
└── Misconceptions (detected per wrong answer)

Displays:
├── Readiness score ✅
├── Topic performance ✅
├── Exam prediction ✅
├── Priority queue ✅
└── Progress over time ✅
```

---

## Key Differences

### ❌ NOT Saved (Session Only)
- Tutor chat messages
- UI state (panels open/closed)
- Scroll position
- Focus state

### ✅ ALWAYS Saved (Database)
- Quiz answers
- Misconceptions
- Mastery scores
- Study sessions
- User profile
- Exam date settings

---

## Consequences

### For AI Tutor
- ✅ Fresh start each session (educationally good)
- ✅ No carrying forward bad habits
- ✅ Faster performance (no DB lookup)
- ❌ Can't resume conversation later
- ❌ No review of what was discussed

### For Quiz
- ✅ All attempts tracked
- ✅ Progress visible over time
- ✅ Can identify weak areas
- ✅ Analytics work across sessions
- ✅ Misconceptions documented
- ❌ Database stores everything (privacy consideration)

---

## How It Works: Step by Step

### Quiz Example
```
1. Student answers: "Mitochondria" (wrong)
   ↓
2. Backend calculates: score = 0.0
   ↓
3. AI detects: "Confused mitochondria with chloroplast"
   ↓
4. Saves to quiz_attempts table:
   {
     user_id: "abc123",
     topic: "Invisible Living World",
     question: "Which organelle performs photosynthesis?",
     student_answer: "Mitochondria",
     correct_answer: "Chloroplast",
     is_correct: false,
     misconception: "Confused mitochondria with chloroplast",
     attempted_at: "2024-01-15 10:30:00",
     time_taken_seconds: 45,
     score: 0.0
   }
   ↓
5. Mastery score updated: 0.65 → 0.58
   ↓
6. Mistake saved to quiz_mistakes table
   ↓
7. Student can later:
   - View mistake journal
   - See misconception identified by AI
   - Practice this topic again
   - Track improvement
```

### Tutor Example
```
1. Student: "What is photosynthesis?"
   ↓
2. Backend retrieves: last 10 messages from React state
   (if this is message 11, message 1 is dropped)
   ↓
3. Generates response with context
   ↓
4. Displays response
   ↓
5. Student: "How does it help plants?"
   ↓
6. Backend knows context (photosynthesis was discussed)
   ↓
7. Provides follow-up answer
   ↓
8. Student refreshes page
   ↓
9. All history lost
   ✗ "What is photosynthesis?" is gone
   ✗ Has to ask again
```

---

## If You Want Persistent Tutor Memory

### Quick Fix: Browser Local Storage
```typescript
// Save to localStorage
const saveConversation = () => {
  localStorage.setItem(`tutor_${topic}`, JSON.stringify(history))
}

// Load on page load
useEffect(() => {
  const saved = localStorage.getItem(`tutor_${topic}`)
  if (saved) setHistory(JSON.parse(saved))
}, [])
```

**Pros:** Easy, no server needed, survives refresh  
**Cons:** Only on this browser, lost if localStorage cleared

### Production Fix: Redis Cache
```python
# Store in Redis with 1-hour TTL
redis.set(f"tutor:{user_id}:{topic}", 
          json.dumps(history), 
          ex=3600)
```

**Pros:** Survives browser restart, works across devices  
**Cons:** Extra infrastructure, cleanup needed

### Full Solution: Database
```python
class TutorConversation(Base):
    __tablename__ = "tutor_conversations"
    user_id: UUID
    topic: str
    messages: JSON
    created_at: datetime
```

**Pros:** Complete persistence, full review capability  
**Cons:** More database load, slight latency increase

---

## Storage Size Estimates

### Current Database Size
For a typical student after 1 month:
- **Quiz Attempts**: ~100 entries × 500 bytes = 50 KB
- **Mistakes**: ~30 entries × 1 KB = 30 KB
- **Mastery Scores**: 42 topics × 200 bytes = 8 KB
- **Study Sessions**: ~30 entries × 300 bytes = 9 KB
- **Total per student**: ~100 KB

### With Persistent Tutor (Estimate)
- **Conversations**: ~50 conversations × 50 KB = 2.5 MB per student
- **Would significantly increase storage**

---

## Best Practices

### For AI Tutor
✅ Keep session-based (current approach is good)
✅ Users expect fresh conversations
✅ Simpler, faster implementation
⚠️ If adding persistence, consider local storage first

### For Quiz
✅ Keep fully persistent (current approach is good)
✅ Essential for progress tracking
✅ Enables analytics and personalization
✅ Privacy: Store securely, users should be aware

### For Analytics
✅ Aggregate at query time, not storage time
✅ Only keep active period data in hot storage
✅ Archive old data if needed for compliance

---

## FAQ

**Q: Why is tutor memory not saved?**  
A: Educational best practice. Fresh conversations prevent carryover of misconceptions. Also faster and simpler.

**Q: Can I add tutor memory?**  
A: Yes! Use browser localStorage for quick fix, or database for full solution.

**Q: How long is quiz data kept?**  
A: Forever. Students can review all past attempts.

**Q: What about privacy?**  
A: Quiz data is encrypted at rest, transmitted over HTTPS, and only accessible to the student.

**Q: Can students delete quiz history?**  
A: Not currently. Could add this feature if needed.

**Q: How many quiz attempts can be stored?**  
A: Effectively unlimited. Database can handle millions of rows.

---

## Summary

```
🤖 AI Tutor:    Session memory (lost on refresh)
📝 Quiz:        Database (persistent forever)
📚 Planner:     Database (persistent forever)
📊 Analytics:   Database queries (persistent forever)
```

Current implementation is **optimal** for the use case. ✅
