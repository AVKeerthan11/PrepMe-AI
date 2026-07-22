"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { PencilBar } from "@/components/ui/pencil-bar"
import SpeakerButton from "@/components/audio/SpeakerButton"
import AudioRecorder from "@/components/audio/AudioRecorder"
import { normalizeSubject } from "@/lib/subjects"

// ── Topic lists ────────────────────────────────────────────────────────────────
const SCIENCE_TOPICS = [
  "Exploring the Investigative World of Science",
  "The Invisible Living World: Beyond Our Naked Eye",
  "Health: The Ultimate Treasure",
  "Electricity: Magnetic and Heating Effects",
  "Exploring Forces",
  "Pressure, Winds, Storms, and Cyclones",
  "Particulate Nature of Matter",
  "Nature of Matter: Elements, Compounds, and Mixtures",
  "The Amazing World of Solutes, Solvents, and Solutions",
  "Light: Mirrors and Lenses",
  "Keeping Time with the Skies",
]
const MATHS_TOPICS = [
  "Rational Numbers",
  "Linear Equations in One Variable",
  "Understanding Quadrilaterals",
  "Practical Geometry",
  "Data Handling",
  "Squares and Square Roots",
  "Cubes and Cube Roots",
  "Comparing Quantities",
  "Algebraic Expressions and Identities",
  "Mensuration",
  "Exponents and Powers",
  "Direct and Inverse Proportions",
  "Factorisation",
  "Introduction to Graphs",
]
const SOCIAL_TOPICS = [
  "Natural Resources and Their Conservation",
  "Reshaping India's Political Map",
  "The Rise of the Marathas",
  "The Colonial Era in India",
  "Universal Franchise and India's Electoral System",
  "The Parliamentary System: Legislature and Executive",
  "Factors of Production",
]
const ENGLISH_TOPICS = [
  "The Wit that Won Hearts",
  "A Concrete Example",
  "Wisdom Paves the Way",
  "A Tale of Valour: Major Somnath Sharma and the Battle of Badgam",
  "Somebody's Mother",
  "Verghese Kurien: I Too Had A Dream",
  "The Case of the Fifth Word",
  "The Magic Brush of Dreams",
  "Spectacular Wonders",
  "The Cherry Tree",
  "Harvest Hymn",
  "Waiting for the Rain",
  "Feathered Friend",
  "Magnifying Glass",
  "Bibha Chowdhuri: The Beam of Light that Lit the Path for Women in Indian Science",
]

// ── Types ──────────────────────────────────────────────────────────────────────
type QType      = "mcq" | "truefalse" | "fillblank" | "short" | "mixed" | "teach_back"
type Mode       = "practice" | "exam"
type Confidence = "sure" | "unsure" | "guessing"
type Phase      = "setup" | "question" | "feedback" | "results" | "journal"

interface QuizQuestion {
  type: string; question: string
  options?: string[]; correct?: string | boolean
  answer?: string; reference_answer?: string
  explanation?: string; topic: string; difficulty: number
  concept?: string
}
interface Assessment {
  overall_score: number; score_percentage: number; correctness: string
  feedback_for_student: string; key_points_covered: string[]
  key_points_missed: string[]; model_answer: string; misconception?: string
  accuracy?: number; completeness?: number; clarity?: number; teach_back?: boolean
}
interface AttemptRecord {
  question: QuizQuestion; studentAnswer: string
  assessment: Assessment; xpEarned: number; confidence: Confidence
}
interface Mistake {
  id: string; topic: string; question: string
  student_answer: string; correct_answer: string
  misconception?: string; confidence: string; created_at: string
}

// ── XP / Streak helpers ────────────────────────────────────────────────────────
const getXP  = () => parseInt(localStorage.getItem("quiz_xp") || "0")
const addXP  = (n: number) => localStorage.setItem("quiz_xp", String(getXP() + n))
function getStreak() {
  const last = localStorage.getItem("quiz_streak_date"), today = new Date().toDateString()
  if (last === today) return parseInt(localStorage.getItem("quiz_streak") || "0")
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  if (last === yesterday) return parseInt(localStorage.getItem("quiz_streak") || "0")
  return 0
}
function bumpStreak() {
  const today = new Date().toDateString(), last = localStorage.getItem("quiz_streak_date")
  if (last === today) return
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const cur = last === yesterday ? parseInt(localStorage.getItem("quiz_streak") || "0") : 0
  localStorage.setItem("quiz_streak", String(cur + 1))
  localStorage.setItem("quiz_streak_date", today)
}

// ── Difficulty helpers ─────────────────────────────────────────────────────────
const diffLabel = (d: number) => d <= 0.35 ? "Easy" : d <= 0.65 ? "Medium" : "Hard"
const diffTier  = (d: number): 0 | 1 | 2 => d <= 0.35 ? 0 : d <= 0.65 ? 1 : 2

function adaptDifficulty(cur: number, correct: boolean, conf: Confidence): number {
  let delta = 0
  if (correct  && conf === "sure")     delta = +0.08
  else if (correct  && conf === "unsure")  delta = +0.03
  else if (!correct && conf === "guessing") delta = -0.03
  else if (!correct && conf === "sure")    delta = -0.10
  return Math.min(1.0, Math.max(0.1, parseFloat((cur + delta).toFixed(2))))
}

// ── Difficulty Meter ───────────────────────────────────────────────────────────
function DifficultyMeter({ value, prevValue }: { value: number; prevValue: number }) {
  const tier = diffTier(value)
  const prevTier = diffTier(prevValue)
  const changed = tier !== prevTier
  const up = tier > prevTier
  const labels = ["Easy", "Medium", "Hard"]
  const colors = ["bg-[#2a7d4f]", "bg-[#c47c2b]", "bg-[#4A6FA5]"]
  const textColors = ["text-[#2a7d4f]", "text-[#c47c2b]", "text-[#4A6FA5]"]

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <div key={i} className={cn(
            "h-1.5 w-7 transition-all duration-500 rounded-none",
            i === tier ? colors[i] : "bg-[#2A2A2A]"
          )} />
        ))}
      </div>
      <span className={cn("text-[10px] font-bold font-mono uppercase tracking-wider transition-all duration-300", textColors[tier])}>
        {changed && <span className="mr-0.5">{up ? "▲" : "▼"}</span>}
        {labels[tier]}
      </span>
    </div>
  )
}

// ── Toast notification ─────────────────────────────────────────────────────────
function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className={cn(
      "fixed top-4 right-4 z-50 bg-[#4A6FA5] text-white text-xs font-bold font-mono uppercase tracking-wider px-4 py-3 border border-[#4A6FA5] rounded-none",
      "transition-all duration-300",
      visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
    )}>
      {message}
    </div>
  )
}

// ── Floating XP badge ──────────────────────────────────────────────────────────
function XPFloat({ amount, visible }: { amount: number; visible: boolean }) {
  return (
    <div className={cn(
      "absolute bottom-14 left-1/2 -translate-x-1/2 font-mono font-black text-lg text-[#2a7d4f]",
      "pointer-events-none transition-all duration-700",
      visible ? "opacity-100 -translate-y-8" : "opacity-0 translate-y-0"
    )}>
      +{amount} XP
    </div>
  )
}

// ── Animated XP counter ────────────────────────────────────────────────────────
function XPCounter({ target }: { target: number }) {
  const [display, setDisplay] = useState(target)
  const prev = useRef(target)
  useEffect(() => {
    if (target === prev.current) return
    const start = prev.current, diff = target - start, steps = 20
    let i = 0
    const id = setInterval(() => {
      i++
      setDisplay(Math.round(start + (diff * i) / steps))
      if (i >= steps) { clearInterval(id); prev.current = target }
    }, 30)
    return () => clearInterval(id)
  }, [target])
  return <span className="font-mono font-black text-[#2a7d4f]">⚡ {display} XP</span>
}

// ── In-quiz streak dots ────────────────────────────────────────────────────────
function StreakDots({ attempts }: { attempts: AttemptRecord[] }) {
  const last4 = attempts.slice(-4)
  const consec = (() => {
    let n = 0
    for (let i = attempts.length - 1; i >= 0; i--) {
      if (attempts[i].assessment.correctness === "correct") n++; else break
    }
    return n
  })()
  const lastTwo = attempts.slice(-2)
  const twoWrong = lastTwo.length === 2 && lastTwo.every(a => a.assessment.correctness !== "correct")
  const lastWrongSure = attempts.length > 0 &&
    attempts[attempts.length-1].assessment.correctness !== "correct" &&
    attempts[attempts.length-1].confidence === "sure"

  let msg = ""
  if (consec >= 3) msg = "You're on a roll! 🔥"
  else if (twoWrong) msg = "Take a breath, read carefully 🧘"
  else if (lastWrongSure) msg = "Careful — review this concept"

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {last4.map((a, i) => (
          <div key={i} className={cn(
            "w-2 h-2 transition-all rounded-none",
            a.assessment.correctness === "correct" ? "bg-[#2a7d4f]" : "bg-[#4A6FA5]"
          )} />
        ))}
      </div>
      {msg && <span className="text-[10px] text-[#8888A0] font-mono italic">{msg}</span>}
    </div>
  )
}

// ── Result Banner ─────────────────────────────────────────────────────────────
function ResultBanner({ correctness, confidence, xpEarned, diffDelta }: {
  correctness: string; confidence: Confidence; xpEarned: number; diffDelta: number
}) {
  const correct = correctness === "correct"
  const partial = correctness === "partially_correct"

  let bg = "", icon = "", title = "", sub = ""
  if (correct && confidence === "sure") {
    bg = "bg-[#2a7d4f] text-[#0A0A0A]"; icon = "💪"; title = "Solid Knowledge!"
    sub = diffDelta > 0 ? "Difficulty increasing — keep it up!" : ""
  } else if (correct && confidence === "unsure") {
    bg = "bg-[#2a7d4f]/80 text-[#0A0A0A]"; icon = "✨"; title = "Nice!"
    sub = "Build more confidence on this topic."
  } else if (correct && confidence === "guessing") {
    bg = "bg-[#2a7d4f]/60 text-[#0A0A0A]"; icon = "🎯"; title = "Lucky guess!"
    sub = "Make sure you understand why this is correct."
  } else if (!correct && !partial && confidence === "sure") {
    bg = "bg-[#4A6FA5] text-white"; icon = "⚠️"; title = "Misconception Alert!"
    sub = "You were sure but incorrect — this is important to fix."
  } else if (!correct && !partial && confidence === "guessing") {
    bg = "bg-[#c47c2b] text-[#0A0A0A]"; icon = "📖"; title = "Need more study here."
    sub = "Review this topic before your next session."
  } else if (partial) {
    bg = "bg-[#c47c2b]/80 text-[#0A0A0A]"; icon = "⚡"; title = "Partial credit!"
    sub = "Close — refine your understanding."
  } else {
    bg = "bg-[#4A6FA5]/80 text-white"; icon = "❌"; title = "Incorrect"
    sub = "Review the explanation below."
  }

  return (
    <div className={cn("p-4 border-l-4 border-white/30 transition-all duration-500 animate-in slide-in-from-top-2 rounded-none", bg)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-black text-base uppercase tracking-wide">{icon} {title}</p>
          {sub && <p className="text-xs opacity-80 mt-0.5 font-mono">{sub}</p>}
        </div>
        {xpEarned > 0 && (
          <div className="text-center border border-black/20 px-3 py-1.5 rounded-none">
            <p className="font-mono text-xl font-black">{xpEarned}</p>
            <p className="text-[10px] opacity-70 uppercase tracking-wider font-bold">XP</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Misconception slide-in ─────────────────────────────────────────────────────
function MisconceptionBox({ text, visible, onJournal }: {
  text: string; visible: boolean; onJournal: () => void
}) {
  return (
    <div className={cn(
      "border-l-4 border-[#c47c2b] bg-[#c47c2b]/5 p-4 space-y-2 rounded-none",
      "transition-all duration-500",
      visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none h-0 overflow-hidden p-0"
    )}>
      <p className="section-label amber">What went wrong:</p>
      <p className="text-sm text-[#1c1f3a] font-mono leading-relaxed">{text}</p>
      <button onClick={onJournal} className="text-[10px] text-[#c47c2b] font-bold uppercase tracking-wider hover:underline rounded-none">
        ■ Saved to Mistake Journal →
      </button>
    </div>
  )
}

// ── Setup Screen ───────────────────────────────────────────────────────────────
function SetupScreen({ subject, onStart, onJournal, initialTopic, enhancedMode, setEnhancedMode, blockedTopic, setBlockedTopic }: {
  subject: string
  onStart: (cfg: { topic: string; qType: QType; mode: Mode; count: number; difficulty: number }) => void
  onJournal: () => void
  initialTopic?: string
  enhancedMode: boolean
  setEnhancedMode: (v: boolean) => void
  blockedTopic: {reason: string, weakPrereqs: string[]} | null
  setBlockedTopic: (v: {reason: string, weakPrereqs: string[]} | null) => void
}) {
  const normalizedSubject = normalizeSubject(subject) ?? "science"
  const topics = normalizedSubject === "maths" ? MATHS_TOPICS 
    : normalizedSubject === "social" ? SOCIAL_TOPICS
    : subject === "english" ? ENGLISH_TOPICS
    : SCIENCE_TOPICS
  const [topic, setTopic]       = useState(initialTopic && topics.includes(initialTopic) ? initialTopic : topics[0])
  const [qType, setQType]       = useState<QType>("mixed")
  const [mode, setMode]         = useState<Mode>("practice")
  const [count, setCount]       = useState(5)
  const [difficulty, setDifficulty] = useState(0.5)
  useEffect(() => {
    const list = normalizedSubject === "maths" ? MATHS_TOPICS
      : normalizedSubject === "social" ? SOCIAL_TOPICS
      : subject === "english" ? ENGLISH_TOPICS
      : SCIENCE_TOPICS
    setTopic(initialTopic && list.includes(initialTopic) ? initialTopic : list[0])
  }, [subject, initialTopic, normalizedSubject])

  const selectCls = "w-full bg-[#F5F0E8] border border-[#C0BAB0] text-[#1c1f3a] px-3 py-2.5 text-xs font-mono outline-none focus:border-[#4A6FA5] transition-colors rounded-none"

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div>
          
          <h1 className="font-serif font-black text-4xl text-[#1c1f3a]">Registration Form</h1>
        </div>
        <button 
  onClick={onJournal} 
  className="inline-flex items-center gap-2.5 px-4 py-2 bg-[#F8FAFF] hover:bg-white text-[#1C1F3A] hover:text-[#C47C2B] font-mono text-xs font-bold uppercase tracking-wider border-2 border-[#1C1F3A] shadow-[2px_2px_0px_#1C1F3A] hover:shadow-[4px_4px_0px_#C47C2B] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all duration-150 rounded-none cursor-pointer"
>
  <span className="text-[#C47C2B] text-sm leading-none">■</span>
  <span>Mistake Journal</span>
</button>
      </div>

      <div className="clipboard-board">
        <div className="clipboard-clip" />
        <div className="clipboard-paper border-l-[4px] border-[#1c1f3a] space-y-8">
          
          {/* Mode */}
          <div>
            <div className="border-b-2 border-dashed border-[rgba(28,31,58,0.15)] pb-2 mb-4">
              <span className="section-label flex items-center gap-2" style={{ background: "rgba(28,31,58,0.05)", color: "#1c1f3a" }}>Section A: Mode</span>
            </div>
            <div className="flex gap-4">
              {(["practice","exam"] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={cn("flex-1 py-4 text-xs font-black uppercase tracking-wider transition-colors rounded-none border-2",
                    mode === m ? "border-[#1c1f3a] bg-[#1c1f3a] text-white shadow-[4px_4px_0_rgba(28,31,58,0.15)]" : "bg-transparent text-[#1c1f3a] border-[rgba(28,31,58,0.2)] hover:border-[#1c1f3a]")}>
                  {m === "practice" ? "🎯 Practice" : "⏱ Exam"}
                </button>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div>
            <div className="border-b-2 border-dashed border-[rgba(28,31,58,0.15)] pb-2 mb-4">
              <span className="section-label flex items-center gap-2" style={{ background: "rgba(28,31,58,0.05)", color: "#1c1f3a" }}>Section B: Configuration</span>
            </div>
            
            <div className="space-y-6">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-2">01. Topic Selection</p>
                <Select value={topic} onValueChange={setTopic}>
                  <SelectTrigger className="w-full bg-transparent border-2 border-[rgba(28,31,58,0.2)] text-[#1c1f3a] font-mono text-xs hover:border-[#1c1f3a] transition-colors focus:ring-0 py-4 h-auto rounded-none shadow-[2px_2px_0_rgba(28,31,58,0.05)]">
                    <SelectValue placeholder="Select a topic" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#fcfaf8] border-2 border-[#1c1f3a] text-[#1c1f3a] font-mono rounded-none shadow-[4px_4px_0_rgba(28,31,58,0.15)] max-h-64">
                    {topics.map(t => (
                      <SelectItem key={t} value={t} className="focus:bg-[rgba(28,31,58,0.05)] focus:text-[#1c1f3a] cursor-pointer text-xs transition-colors py-3 rounded-none">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-2">02. Question Format</p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(["mixed","mcq","truefalse","fillblank","short","teach_back"] as QType[]).map(t => (
                    <button key={t} onClick={() => setQType(t)}
                      className={cn("py-3 text-[10px] font-black uppercase tracking-wider transition-colors rounded-none border-2",
                        qType === t ? "border-[#1c1f3a] bg-[#1c1f3a] text-white" : "bg-transparent text-[#1c1f3a] border-[rgba(28,31,58,0.2)] hover:border-[#1c1f3a]")}>
                      {t === "mixed" ? "Mix" : t === "mcq" ? "MCQ" : t === "truefalse" ? "T/F" : t === "fillblank" ? "Fill" : t === "short" ? "Short" : "Teach"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-2">03. Quantity</p>
                <div className="flex gap-2">
                  {[5,10,15].map(n => (
                    <button key={n} onClick={() => setCount(n)}
                      className={cn("flex-1 py-3 text-xs font-black transition-colors rounded-none border-2",
                        count === n ? "border-[#1c1f3a] bg-[#1c1f3a] text-white" : "bg-transparent text-[#1c1f3a] border-[rgba(28,31,58,0.2)] hover:border-[#1c1f3a]")}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a]">04. Difficulty Target</p>
                  <DifficultyMeter value={difficulty} prevValue={difficulty} />
                </div>
                <div className="px-1 py-2">
                  <Slider
                    min={0.1} max={1} step={0.1}
                    value={[difficulty]}
                    onValueChange={(val) => setDifficulty(val[0])}
                    fillColor={difficulty < 0.4 ? "#39ff14" : difficulty < 0.8 ? "#ffeb3b" : "#ff0000"}
                  />
                </div>
              </div>
              
              {/* Enhanced Mode Toggle */}
              <div className="mt-4 p-3 border border-[rgba(28,31,58,0.2)] bg-[rgba(74,111,165,0.05)]">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enhancedMode}
                    onChange={(e) => {
                      console.log("[quiz] Enhanced mode checkbox clicked, new value:", e.target.checked)
                      setEnhancedMode(e.target.checked)
                    }}
                    className="w-4 h-4"
                  />
                  <div>
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#1c1f3a]">
                      Enhanced Mode {enhancedMode ? "✓" : ""}
                    </span>
                    <p className="text-[10px] text-[#666] mt-0.5">
                      Non-repeating questions + prerequisite check
                    </p>
                  </div>
                </label>
              </div>
              
              {/* Blocked Topic Warning */}
              {blockedTopic && (
                <div className="mt-4 p-4 bg-yellow-100 border-2 border-yellow-600">
                  <p className="font-bold text-sm mb-2">⚠️ Prerequisites needed</p>
                  <p className="text-sm mb-3">{blockedTopic.reason}</p>
                  <button
                    onClick={() => {
                      // Switch to first weak prerequisite
                      if (blockedTopic.weakPrereqs.length > 0) {
                        const topics = normalizedSubject === "maths" ? MATHS_TOPICS
                          : normalizedSubject === "social" ? SOCIAL_TOPICS
                          : subject === "english" ? ENGLISH_TOPICS
                          : SCIENCE_TOPICS
                        const firstPrereq = blockedTopic.weakPrereqs[0]
                        if (topics.includes(firstPrereq)) {
                          setTopic(firstPrereq)
                          setBlockedTopic(null)
                        }
                      }
                    }}
                    className="px-4 py-2 bg-yellow-600 text-white font-bold text-xs uppercase"
                  >
                    Got it, quiz me on prerequisites first
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="pt-6 border-t-2 border-dashed border-[rgba(28,31,58,0.15)] flex justify-end">
            <button onClick={() => onStart({ topic, qType, mode, count, difficulty })}
              className="font-mono font-black text-2xl text-[#c0392b] border-4 border-[#c0392b] px-6 py-2 uppercase tracking-widest hover:bg-[#c0392b] hover:text-[#fdfcf9] transition-colors rounded-none transform rotate-[-2deg] shadow-[4px_4px_0_rgba(192,57,43,0.2)] hover:rotate-0">
              Begin Exam
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Circle Timer ───────────────────────────────────────────────────────────────
function CircleTimer({ seconds, total }: { seconds: number; total: number }) {
  const r = 22, circ = 2 * Math.PI * r, frac = seconds / total
  const color = seconds <= 5 ? "#DC2626" : seconds <= 10 ? "#D97706" : "#5B6CF8"
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#E8ECF4" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${frac * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute font-mono text-sm font-bold" style={{ color }}>{seconds}</span>
    </div>
  )
}

// ── Question Card ──────────────────────────────────────────────────────────────
function QuestionCard({ q, chapterTopic, idx, total, mode, curDiff, prevDiff, attempts, onSubmit, busy, elapsedSeconds }: {
  q: QuizQuestion; chapterTopic: string; idx: number; total: number; mode: Mode
  curDiff: number; prevDiff: number; attempts: AttemptRecord[]
  onSubmit: (answer: string, confidence: Confidence) => void; busy: boolean; elapsedSeconds: number
}) {
  const [selected, setSelected]     = useState<string>("")
  const [confidence, setConfidence] = useState<Confidence | null>(null)
  const [timeLeft, setTimeLeft]     = useState(30)
  const [showXP, setShowXP]         = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setSelected(""); setConfidence(null); setTimeLeft(30); setShowXP(false)
    if (mode === "exam") {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current!); onSubmit("", "guessing"); return 0 }
          return t - 1
        })
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [q.question])

  const submit = () => {
    if (q.type !== "teach_back" && !confidence) return
    if (timerRef.current) clearInterval(timerRef.current)
    onSubmit(selected, confidence ?? "guessing")
  }

  const canSubmit = selected.trim() !== "" && (q.type === "teach_back" || confidence !== null) && !busy
  const progress  = (idx / total) * 100

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const remaining = secs % 60
    return `${mins}:${String(remaining).padStart(2, "0")}`
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs font-black text-[#1c1f3a] bg-[rgba(28,31,58,0.05)] px-3 py-1 border border-[#1c1f3a]">QUESTION {idx + 1} / {total}</span>
          <span className="font-mono text-[10px] px-2 py-1 bg-transparent text-[#1c1f3a] font-bold uppercase tracking-wider border border-[rgba(28,31,58,0.2)]">{q.type}</span>
          <DifficultyMeter value={curDiff} prevValue={prevDiff} />
        </div>
        <div className="flex items-center gap-4">
          {mode === "exam" && <CircleTimer seconds={timeLeft} total={30} />}
        </div>
      </div>

      <PencilBar value={progress / 100} color="#1c1f3a" height={10} />
      {attempts.length > 0 && <StreakDots attempts={attempts} />}

      <div className="exam-paper group/qcard">
        {/* Top-right live timer */}
        <div className="absolute top-6 right-6 font-mono text-xs font-bold text-[#c0392b] bg-transparent px-3 py-1 border-2 border-[#c0392b] rounded-full transform rotate-3">
          {formatTime(elapsedSeconds)}
        </div>

        {chapterTopic && (
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[rgba(28,31,58,0.5)] mb-4">
            SUBJECT: {chapterTopic}
          </p>
        )}
        
        <div className="flex items-start justify-between pr-16 mb-8">
          <p className="text-lg text-[#1c1f3a] font-bold leading-relaxed">{idx + 1}. {q.question}</p>
          <div className="ml-4">
            <SpeakerButton text={q.question} />
          </div>
        </div>

        {q.type === "mcq" && q.options && (
          <div className="space-y-2 mt-4">
            {q.options.map((opt, i) => {
              const letter = ["A","B","C","D"][i]
              const isSelected = selected === letter
              return (
                <button key={i} onClick={() => setSelected(letter)}
                  className={cn("scantron-opt w-full text-left", isSelected && "selected")}>
                  <div className="scantron-bubble">{letter}</div>
                  <span className="font-mono text-sm">{opt.replace(/^[A-D]\)\s*/,"")}</span>
                </button>
              )
            })}
          </div>
        )}

        {q.type === "truefalse" && (
          <div className="flex gap-4 mt-4">
            {["true","false"].map(v => {
              const isSelected = selected === v
              return (
                <button key={v} onClick={() => setSelected(v)}
                  className={cn("scantron-opt flex-1 justify-center", isSelected && "selected")}>
                  <div className="scantron-bubble">{v === "true" ? "T" : "F"}</div>
                  <span className="font-mono text-sm font-bold uppercase">{v}</span>
                </button>
              )
            })}
          </div>
        )}

        {q.type === "fillblank" && (
          <div className="mt-4">
            <input value={selected} onChange={e => setSelected(e.target.value)}
              placeholder="Write your answer on the line..."
              className="w-full bg-transparent border-0 border-b-2 border-dashed border-[#1c1f3a] text-[#1c1f3a] px-4 py-3 text-sm font-mono outline-none focus:border-solid transition-all" />
            <div className="mt-2">
              <AudioRecorder onTranscribed={(t) => setSelected(t)} />
            </div>
          </div>
        )}

        {q.type === "short" && (
          <div className="mt-4">
            <textarea value={selected} onChange={e => setSelected(e.target.value)}
              placeholder="Write your answer..." rows={4}
              className="w-full bg-[rgba(28,31,58,0.02)] border border-[rgba(28,31,58,0.15)] text-[#1c1f3a] px-4 py-3 text-sm font-mono outline-none focus:border-[#1c1f3a] transition-all resize-none" />
            <div className="mt-2">
              <AudioRecorder onTranscribed={(t) => setSelected(t)} />
            </div>
          </div>
        )}

          {q.type === "teach_back" && (
            <div className="mt-4">
              <textarea
                value={selected}
                onChange={e => setSelected(e.target.value)}
                placeholder="Explain in your own words — aim for 3+ sentences"
                style={{ minHeight: "140px", backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, rgba(74,111,165,0.2) 27px, rgba(74,111,165,0.2) 28px)", lineHeight: "28px" }}
                className="w-full bg-[#fdfcf9] border border-[rgba(28,31,58,0.15)] text-[#1c1f3a] px-4 py-1 text-sm font-mono outline-none focus:border-[#1c1f3a] transition-all resize-none"
              />
              <div className="mt-2">
                <AudioRecorder onTranscribed={(t) => setSelected(t)} />
              </div>
            </div>
          )}

        {q.type !== "teach_back" && (
          <div className="border-t-2 border-dashed border-[rgba(28,31,58,0.15)] pt-6 mt-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-4">Confidence Level</p>
            <div className="flex gap-3">
              {([["sure","😎 Sure"],["unsure","🤔 Unsure"],["guessing","🎲 Guessing"]] as [Confidence,string][]).map(([val,label]) => (
                <button key={val} onClick={() => setConfidence(val)}
                  className={cn("flex-1 py-3 text-[10px] font-black uppercase tracking-wider transition-all rounded-none border-2",
                    confidence === val
                      ? "border-[#1c1f3a] bg-[#1c1f3a] text-white shadow-[2px_2px_0_rgba(28,31,58,0.15)]"
                      : "bg-transparent text-[#1c1f3a] border-[rgba(28,31,58,0.2)] hover:border-[#1c1f3a]")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative mt-8 text-right">
          <button onClick={submit} disabled={!canSubmit}
            className="font-mono font-black text-lg text-[#1c1f3a] border-2 border-[#1c1f3a] px-8 py-3 uppercase tracking-widest hover:bg-[#1c1f3a] hover:text-[#fdfcf9] transition-colors rounded-none shadow-[4px_4px_0_rgba(28,31,58,0.15)] disabled:opacity-30 disabled:shadow-none disabled:hover:bg-transparent disabled:hover:text-[#1c1f3a] disabled:cursor-not-allowed">
            {busy ? "Checking..." : (q.type !== "teach_back" && !confidence) ? "Select Confidence" : "Submit Answer"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Feedback Card ──────────────────────────────────────────────────────────────
function FeedbackCard({ q, assessment, studentAnswer, xpEarned, confidence, onNext, isLast, onJournal }: {
  q: QuizQuestion; assessment: Assessment; studentAnswer: string
  xpEarned: number; confidence: Confidence; onNext: () => void; isLast: boolean; onJournal: () => void
}) {
  const correct = assessment.correctness === "correct"
  const partial = assessment.correctness === "partially_correct"
  const showMisconception = !correct && !partial && !!assessment.misconception
  const [showXP, setShowXP] = useState(false)
  useEffect(() => {
    if (xpEarned > 0) { setShowXP(true); setTimeout(() => setShowXP(false), 900) }
  }, [])

  if (q.type === "teach_back" || assessment.teach_back) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
        <div className="exam-paper space-y-6">
          <div className="border-b-4 border-double border-[#1c1f3a] pb-4 mb-6">
            <h2 className="font-serif font-black text-2xl text-[#1c1f3a] uppercase tracking-widest text-center">Teach-Back Evaluation</h2>
          </div>

          <div className="grid grid-cols-3 gap-4 font-mono text-sm border-b-2 border-dashed border-[rgba(28,31,58,0.15)] pb-6">
            <div className="text-center">
              <p className="font-bold text-[#1c1f3a] mb-2">Accuracy</p>
              <span className="font-black text-2xl text-[#c0392b] red-pen"><span className="red-circle">{assessment.accuracy ?? 0}</span>/10</span>
            </div>
            <div className="text-center">
              <p className="font-bold text-[#1c1f3a] mb-2">Completeness</p>
              <span className="font-black text-2xl text-[#c0392b] red-pen"><span className="red-circle">{assessment.completeness ?? 0}</span>/10</span>
            </div>
            <div className="text-center">
              <p className="font-bold text-[#1c1f3a] mb-2">Clarity</p>
              <span className="font-black text-2xl text-[#c0392b] red-pen"><span className="red-circle">{assessment.clarity ?? 0}</span>/10</span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-4">
            <p className="font-mono text-[10px] text-[#1c1f3a] uppercase tracking-widest font-bold mb-2">Final Grade</p>
            <div className="relative">
              <span className="font-serif font-black text-6xl text-[#c0392b] red-pen transform -rotate-6 block">{assessment.score_percentage}%</span>
            </div>
          </div>

          <div className="pt-6 border-t-2 border-dashed border-[rgba(28,31,58,0.15)]">
            <p className="font-mono text-[10px] text-[#c0392b] uppercase tracking-widest font-bold mb-4 flex items-center gap-2">
              <span className="text-lg">✎</span> Teacher's Notes
            </p>
            <p className="text-lg text-[#c0392b] red-pen leading-relaxed">{assessment.feedback_for_student}</p>
          </div>

          {assessment.key_points_missed && assessment.key_points_missed.length > 0 && (
            <div className="pt-6 mt-6 border-t-2 border-dashed border-[rgba(28,31,58,0.15)]">
              <p className="font-mono text-[10px] text-[#c0392b] uppercase tracking-widest font-bold mb-4">Missed Points:</p>
              <ul className="list-none space-y-2">
                {assessment.key_points_missed.map((pt, i) => (
                  <li key={i} className="text-[#c0392b] red-pen text-lg flex items-start gap-2">
                    <span>-</span> <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="text-right">
          <button onClick={onNext} className="font-mono font-black text-lg text-[#1c1f3a] border-2 border-[#1c1f3a] px-8 py-3 uppercase tracking-widest hover:bg-[#1c1f3a] hover:text-[#fdfcf9] transition-colors rounded-none shadow-[4px_4px_0_rgba(28,31,58,0.15)]">
            {isLast ? "See Final Grade" : "Next Question"}
          </button>
        </div>
      </div>
    )
  }

  // For MCQ and True/False questions - show answer comparison
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
      <div className="relative">
        <XPFloat amount={xpEarned} visible={showXP} />
        
        {/* Show answer comparison for MCQ/TrueFalse */}
        {(q.type === "mcq" || q.type === "truefalse") && q.options && (
          <div className="space-y-2">
            {q.options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const isCorrect = (q.type === "mcq" 
                ? letter === String(q.correct).toUpperCase()
                : opt.toLowerCase() === String(q.correct).toLowerCase());
              const isStudent = letter === studentAnswer?.toUpperCase() || opt === studentAnswer;
              
              return (
                <div 
                  key={i} 
                  className={cn(
                    "px-4 py-2.5 border text-xs font-mono transition-all rounded-none",
                    isCorrect 
                      ? "border-[#2a7d4f] bg-[#2a7d4f]/10 text-[#2a7d4f] font-bold"
                      : isStudent && !isCorrect 
                      ? "border-[#4A6FA5] bg-[#4A6FA5]/10 text-[#4A6FA5]"
                      : "border-[rgba(28,31,58,0.15)] text-[#8888A0]"
                  )}
                >
                  <span className="font-black mr-2">{letter})</span>
                  {opt.replace(/^[A-D]\)\s*/, "")}
                  {isCorrect && " ✓"}
                  {isStudent && !isCorrect && " ✗"}
                </div>
              );
            })}
          </div>
        )}

        {/* Show student answer for other question types */}
        {(q.type === "fillblank" || q.type === "short") && (
          <div className="mt-4 p-4 border-2 border-dashed border-[rgba(28,31,58,0.15)]">
            <p className="font-mono text-[10px] text-[#1c1f3a] uppercase tracking-widest font-bold mb-2">Your Answer:</p>
            <p className="text-lg text-[#1c1f3a] font-mono">{studentAnswer || "(no answer)"}</p>
          </div>
        )}
      </div>

      <ResultBanner 
        correctness={assessment.correctness}
        confidence={confidence}
        xpEarned={xpEarned}
        diffDelta={0}
      />

      <div className="exam-paper space-y-6">
        <div className="border-l-4 border-[#c0392b] pl-4">
          <p className="font-mono text-[10px] text-[#c0392b] uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
            <span className="text-lg">✎</span> Teacher's Feedback
          </p>
          <p className="text-lg text-[#c0392b] red-pen leading-relaxed">{assessment.feedback_for_student}</p>
        </div>

        {assessment.key_points_covered && assessment.key_points_covered.length > 0 && (
          <div className="pt-4">
            <p className="font-mono text-[10px] text-[#2a7d4f] uppercase tracking-widest font-bold mb-2">✓ Key Points Covered:</p>
            <ul className="list-disc pl-5 space-y-1">
              {assessment.key_points_covered.map((pt, i) => (
                <li key={i} className="text-sm text-[#1c1f3a] font-mono">{pt}</li>
              ))}
            </ul>
          </div>
        )}

        {assessment.key_points_missed && assessment.key_points_missed.length > 0 && (
          <div className="pt-4">
            <p className="font-mono text-[10px] text-[#4A6FA5] uppercase tracking-widest font-bold mb-2">⚠ Points to Review:</p>
            <ul className="list-disc pl-5 space-y-1">
              {assessment.key_points_missed.map((pt, i) => (
                <li key={i} className="text-sm text-[#1c1f3a] font-mono">{pt}</li>
              ))}
            </ul>
          </div>
        )}

        {(q.type === "short" || q.type === "fillblank") && assessment.model_answer && (
          <div className="pt-4 border-t-2 border-dashed border-[rgba(28,31,58,0.15)]">
            <p className="font-mono text-[10px] text-[#c0392b] uppercase tracking-widest font-bold mb-2">Model Answer</p>
            <p className="text-lg text-[#1c1f3a] leading-relaxed">{assessment.model_answer}</p>
          </div>
        )}

        {q.explanation && (
          <div className="pt-4 border-t-2 border-dashed border-[rgba(28,31,58,0.15)]">
            <p className="font-mono text-[10px] text-[#c0392b] uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
              <span className="text-lg">✎</span> Detailed Explanation
            </p>
            <div className="flex items-start gap-3">
              <p className="text-lg text-[#1c1f3a] leading-relaxed flex-1">{q.explanation}</p>
              <SpeakerButton text={q.explanation} />
            </div>
          </div>
        )}

        {showMisconception && assessment.misconception && (
          <MisconceptionBox 
            text={assessment.misconception}
            visible={showMisconception}
            onJournal={onJournal}
          />
        )}
      </div>

      <div className="text-right mt-8 pt-6 border-t-2 border-dashed border-[rgba(28,31,58,0.15)]">
        <button onClick={onNext} className="font-mono font-black text-lg text-[#1c1f3a] border-2 border-[#1c1f3a] px-8 py-3 uppercase tracking-widest hover:bg-[#1c1f3a] hover:text-[#fdfcf9] transition-colors rounded-none shadow-[4px_4px_0_rgba(28,31,58,0.15)]">
          {isLast ? "See Final Grade" : "Next Question"}
        </button>
      </div>
    </div>
  )
}

// ── Results Screen ─────────────────────────────────────────────────────────────
function ResultsScreen({ attempts, totalXP, topic, authFetch, onRetake }: {
  attempts: AttemptRecord[]; totalXP: number; topic: string
  authFetch: Function; onRetake: () => void
}) {
  const correct = attempts.filter(a => a.assessment.correctness === "correct").length
  const partial = attempts.filter(a => a.assessment.correctness === "partially_correct").length
  const total   = attempts.length
  const pct     = Math.round(((correct + partial * 0.5) / total) * 100)
  const color   = pct >= 70 ? "#2a7d4f" : pct >= 40 ? "#c47c2b" : "#4A6FA5"

  const sureCorrect   = attempts.filter(a => a.confidence === "sure"     && a.assessment.correctness === "correct").length
  const sureWrong     = attempts.filter(a => a.confidence === "sure"     && a.assessment.correctness !== "correct").length
  const unsureCorrect = attempts.filter(a => a.confidence === "unsure"   && a.assessment.correctness === "correct").length
  const guessWrong    = attempts.filter(a => a.confidence === "guessing" && a.assessment.correctness !== "correct").length

  const [insight, setInsight] = useState("")
  useEffect(() => {
    authFetch("/api/tutor/ask", {
      method: "POST",
      body: JSON.stringify({
        question: `Based on this quiz performance, give ONE sentence of personalized study advice. Topic: ${topic}. Sure+Correct: ${sureCorrect}, Sure+Wrong: ${sureWrong}, Unsure+Correct: ${unsureCorrect}, Guessing+Wrong: ${guessWrong}. Total: ${total}. Be specific.`,
        mastery_score: pct / 100, subject: "science", chat_history: [],
      }),
    }).then((r: Response) => r.ok ? r.json() : null)
      .then((d: any) => d?.answer && setInsight(d.answer.split(".")[0] + "."))
  }, [])

  const confCards = [
    { label: "Sure & Correct",  count: sureCorrect,   icon: "🏆", border: "border-[#2a7d4f]", text: "text-[#2a7d4f]" },
    { label: "Sure & Wrong",    count: sureWrong,     icon: "⚠️", border: "border-[#4A6FA5]", text: "text-[#4A6FA5]", danger: true },
    { label: "Unsure & Correct",count: unsureCorrect, icon: "💡", border: "border-[#c47c2b]", text: "text-[#c47c2b]" },
    { label: "Guessing & Wrong",count: guessWrong,    icon: "📖", border: "border-[#555]",    text: "text-[#8888A0]" },
  ]

  return (
    <div className="max-w-3xl mx-auto animate-slide-up">
      <div className="report-card">
        <div className="report-card-header">
          <p className="font-mono text-xs uppercase tracking-widest text-[#1c1f3a] mb-2 font-bold">Official Examination Record</p>
          <h1 className="font-serif font-black text-4xl text-[#1c1f3a]">Student Report Card</h1>
          <p className="font-mono text-sm text-[rgba(28,31,58,0.6)] mt-2 italic">Subject: {topic}</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 mb-8">
          <div className="flex-1 flex flex-col items-center justify-center border-4 border-[#1c1f3a] p-6 relative">
            <span className="absolute top-0 left-0 bg-[#1c1f3a] text-[#fdfcf9] font-mono text-[10px] uppercase tracking-widest px-2 py-1 font-bold">Final Grade</span>
            
            {pct >= 90 ? (
              <span className="font-serif font-black text-8xl text-[#2a7d4f] red-pen mt-4" style={{ color: '#2a7d4f' }}>A</span>
            ) : pct >= 80 ? (
              <span className="font-serif font-black text-8xl text-[#2a7d4f] red-pen mt-4" style={{ color: '#2a7d4f' }}>B</span>
            ) : pct >= 70 ? (
              <span className="font-serif font-black text-8xl text-[#c47c2b] red-pen mt-4" style={{ color: '#c47c2b' }}>C</span>
            ) : pct >= 60 ? (
              <span className="font-serif font-black text-8xl text-[#c47c2b] red-pen mt-4" style={{ color: '#c47c2b' }}>D</span>
            ) : (
              <span className="font-serif font-black text-8xl text-[#c0392b] red-pen mt-4">F</span>
            )}
            
            <p className="font-mono text-lg font-bold text-[#1c1f3a] mt-2 border-t-2 border-dashed border-[rgba(28,31,58,0.15)] pt-2 w-full text-center">Score: {pct}% ({correct}/{total})</p>
          </div>

          <div className="flex-1 space-y-4 font-mono">
            <div className="border-2 border-[rgba(28,31,58,0.15)] p-4 flex justify-between items-center">
              <span className="text-xs uppercase tracking-widest font-bold text-[#1c1f3a]">XP Earned</span>
              <span className="text-xl font-black text-[#1c1f3a]">+{totalXP}</span>
            </div>
            <div className="border-2 border-[rgba(28,31,58,0.15)] p-4 flex justify-between items-center">
              <span className="text-xs uppercase tracking-widest font-bold text-[#1c1f3a]">Day Streak</span>
              <span className="text-xl font-black text-[#1c1f3a]">{getStreak()}</span>
            </div>
            
            {insight && (
              <div className="border-2 border-[#1c1f3a] p-4 bg-[#1c1f3a] text-[#fdfcf9]">
                <p className="text-[10px] uppercase tracking-widest font-bold mb-2 text-[rgba(253,252,249,0.6)]">Teacher's Remark</p>
                <p className="text-sm italic">"{insight}"</p>
              </div>
            )}
          </div>
        </div>

        {/* Confidence 2x2 grid */}
        <div className="mb-8 border-t-4 border-double border-[#1c1f3a] pt-6">
          <p className="font-serif font-black text-xl text-[#1c1f3a] mb-4">Confidence Breakdown</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-2 border-[#1c1f3a]">
            {confCards.map((c, i) => (
              <div key={c.label} className={cn("p-4 border-[#1c1f3a]", 
                i !== 3 ? "border-r-2" : "",
                i < 2 ? "border-b-2 md:border-b-0" : ""
              )}>
                <p className="text-2xl mb-2">{c.icon}</p>
                <p className={cn("font-mono text-4xl font-black", c.text)}>{c.count}</p>
                <p className="text-[10px] text-[#1c1f3a] mt-2 uppercase tracking-widest font-bold">{c.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Breakdown */}
        <div className="border-t-4 border-double border-[#1c1f3a] pt-6">
          <p className="font-serif font-black text-xl text-[#1c1f3a] mb-4">Question Ledger</p>
          <div className="border-2 border-[rgba(28,31,58,0.15)]">
            {attempts.map((a, i) => {
              const c = a.assessment.correctness
              const isCorrect = c === "correct"
              const confEmoji = a.confidence === "sure" ? "😎" : a.confidence === "unsure" ? "🤔" : "🎲"
              return (
                <div key={i} className="flex items-start gap-4 p-4 border-b-2 border-dashed border-[rgba(28,31,58,0.15)] last:border-0 hover:bg-[rgba(28,31,58,0.02)] transition-colors">
              <span className="font-serif font-black text-2xl text-[#1c1f3a] opacity-30 w-8">{i+1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#1c1f3a] font-mono mb-2">{a.question.question}</p>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold font-mono">
                      <span className={isCorrect ? "text-[#2a7d4f]" : "text-[#c0392b]"}>
                        {isCorrect ? "PASSED" : "FAILED"}
                      </span>
                      <span className="text-[rgba(28,31,58,0.3)]">|</span>
                      <span className="text-[rgba(28,31,58,0.6)]">Conf: {a.confidence}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex gap-4 mt-8 pt-6 border-t-4 border-double border-[#1c1f3a]">
          <button onClick={onRetake} className="flex-1 font-mono font-black text-sm text-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-4 uppercase tracking-widest hover:bg-[rgba(28,31,58,0.05)] transition-colors rounded-none">
            Retake Exam
          </button>
          <Link href="/planner" className="flex-1">
            <button className="w-full font-mono font-black text-sm text-[#fdfcf9] bg-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-4 uppercase tracking-widest hover:bg-[#2a2d4a] transition-colors rounded-none shadow-[4px_4px_0_rgba(28,31,58,0.2)]">
              Return to Desk
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Mistake Journal ────────────────────────────────────────────────────────────
function JournalScreen({ authFetch, onBack, onRetry }: {
  authFetch: Function; onBack: () => void; onRetry: (topic: string) => void
}) {
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState("")

  useEffect(() => {
    const url = filter ? `/api/quiz/mistakes?topic=${encodeURIComponent(filter)}` : "/api/quiz/mistakes"
    authFetch(url).then((r: Response) => r.ok ? r.json() : []).then((d: Mistake[]) => {
      setMistakes(d); setLoading(false)
    })
  }, [filter])

  const topics = mistakes.map(m => m.topic).filter((v, i, self) => self.indexOf(v) === i)
  const grouped: Record<string, Mistake[]> = {}
  mistakes.forEach(m => { if (!grouped[m.topic]) grouped[m.topic] = []; grouped[m.topic].push(m) })

  return (
    <div className="max-w-4xl mx-auto animate-slide-up">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="font-mono text-sm text-[rgba(28,31,58,0.6)] font-bold uppercase tracking-widest hover:text-[#1c1f3a] transition-colors rounded-none border-b-2 border-transparent hover:border-[#1c1f3a] pb-1">&larr; Back to Registration</button>
      </div>

      <div className="composition-book">
        <div className="composition-page">
          <div className="border-b-4 border-double border-[#1c1f3a] pb-4 mb-8">
            <h1 className="font-serif font-black text-4xl text-[#1c1f3a] tracking-tight">Mistake Journal</h1>
            <p className="font-mono text-xs text-[rgba(28,31,58,0.6)] mt-2 italic">Student Notes & Corrections</p>
          </div>

          <div className="mb-8 flex gap-4">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="flex-1 bg-transparent border-0 border-b-2 border-dashed border-[#1c1f3a] text-[#1c1f3a] px-0 py-2 text-sm font-mono outline-none focus:border-solid transition-colors rounded-none font-bold">
              <option value="">All Topics (Full Book)</option>
              {topics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {loading ? <p className="text-[#1c1f3a] text-lg font-serif italic text-center py-12">Flipping pages...</p>
            : mistakes.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#2a7d4f] font-serif italic text-2xl mb-2">Blank Pages!</p>
                <p className="text-[#1c1f3a] font-mono text-sm opacity-60">No mistakes logged yet. Keep up the good work.</p>
              </div>
            )
            : Object.entries(grouped).map(([topic, items]) => (
              <div key={topic} className="mb-12 relative">
                <div className="flex items-center justify-between border-b-2 border-[#1c1f3a] pb-2 mb-6">
                  <h2 className="font-serif font-bold text-2xl text-[#1c1f3a] capitalize">{topic}</h2>
                  <button onClick={() => onRetry(topic)} className="font-mono text-[10px] text-[#fdfcf9] bg-[#1c1f3a] px-3 py-1 font-bold uppercase tracking-wider hover:bg-[#c0392b] transition-colors rounded-none">
                    Retest Topic &rarr;
                  </button>
                </div>
                
                <div className="space-y-8">
                  {items.map(m => (
                    <div key={m.id} className="relative group/mistake pl-4 border-l-2 border-[rgba(28,31,58,0.15)] hover:border-[#1c1f3a] transition-colors">
                      <p className="text-lg text-[#1c1f3a] font-bold leading-relaxed mb-4">{m.question}</p>
                      
                      <div className="space-y-3 font-mono text-sm">
                        <div className="flex gap-4">
                          <span className="w-24 text-[10px] uppercase tracking-widest text-[rgba(28,31,58,0.5)] font-bold pt-1">Your Answer:</span>
                          <span className="flex-1 text-[#1c1f3a] line-through decoration-[#c0392b] decoration-2">{m.student_answer}</span>
                        </div>
                        <div className="flex gap-4">
                          <span className="w-24 text-[10px] uppercase tracking-widest text-[rgba(28,31,58,0.5)] font-bold pt-1">Correction:</span>
                          <span className="flex-1 text-[#2a7d4f] font-bold">{m.correct_answer}</span>
                        </div>
                        {m.misconception && (
                          <div className="flex gap-4 mt-4 pt-4 border-t border-dashed border-[rgba(28,31,58,0.15)]">
                            <span className="w-24 text-[10px] uppercase tracking-widest text-[rgba(28,31,58,0.5)] font-bold pt-1">Note:</span>
                            <span className="flex-1 text-[#1c1f3a] italic">"{m.misconception}"</span>
                          </div>
                        )}
                      </div>
                      <span className="absolute -left-[9px] top-0 text-[10px] bg-[#fdfcf9] px-1 text-[rgba(28,31,58,0.3)] group-hover/mistake:text-[#1c1f3a] transition-colors">■</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Quiz Page ─────────────────────────────────────────────────────────────
function QuizPageInner() {
  const { profile, authFetch, refreshProfile, subjectVersion } = useAuth()
  const subject = profile?.subject ?? "science"
  const searchParams = useSearchParams()
  const urlTopic = searchParams.get("topic") ?? null

  console.log("QuizPageInner render:", { subject, subjectVersion, profileNull: !profile })

  const [phase, setPhase]           = useState<Phase>("setup")
  const [config, setConfig]         = useState<{ topic: string; qType: QType; mode: Mode; count: number; difficulty: number } | null>(null)
  const [questions, setQuestions]   = useState<QuizQuestion[]>([])
  const [qIdx, setQIdx]             = useState(0)
  
  // Enhanced mode state
  const [enhancedMode, setEnhancedMode] = useState(false)
  const [questionHistory, setQuestionHistory] = useState<Array<{text: string, embedding: number[]}>>([])
  const [blockedTopic, setBlockedTopic] = useState<{reason: string, weakPrereqs: string[]} | null>(null)
  const [attempts, setAttempts]     = useState<AttemptRecord[]>([])
  const [prevQs, setPrevQs]         = useState<string[]>([])
  const [curDiff, setCurDiff]       = useState(0.5)
  const [prevDiff, setPrevDiff]     = useState(0.5)
  const [currentAssessment, setCurrentAssessment] = useState<Assessment | null>(null)
  const [currentAnswer, setCurrentAnswer]         = useState("")
  const [currentConfidence, setCurrentConfidence] = useState<Confidence>("guessing")
  const [busy, setBusy]             = useState(false)
  const [totalXP, setTotalXP]       = useState(0)
  const [xp, setXp]                 = useState(0)
  const [streak, setStreak]         = useState(0)
  const [toast, setToast]           = useState("")
  const [toastVisible, setToastVisible] = useState(false)
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0)

  // Timer States
  const questionStartRef = useRef<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Prerequisites States
  const [prereqGap, setPrereqGap] = useState<string[]>([])
  const [showPrereqBanner, setShowPrereqBanner] = useState(false)

  useEffect(() => { setXp(getXP()); setStreak(getStreak()) }, [])

  // Keep track of subject and subjectVersion to only reset when they actually change
  const prevSubjectRef = useRef<string | null>(null)
  const prevSubjectVersionRef = useRef<number | null>(null)

  useEffect(() => {
    if (prevSubjectRef.current !== null && prevSubjectVersionRef.current !== null) {
      if (prevSubjectRef.current !== subject || prevSubjectVersionRef.current !== subjectVersion) {
        console.log("QuizPageInner reset useEffect triggered!", { subject, subjectVersion })
        setPhase("setup")
        setConfig(null)
        setQuestions([])
        setAttempts([])
        setQIdx(0)
        setCurrentAssessment(null)
        setPrereqGap([])
        setShowPrereqBanner(false)
      }
    }
    prevSubjectRef.current = subject
    prevSubjectVersionRef.current = subjectVersion
  }, [subject, subjectVersion])

  // Timer effect
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null
    const currentQ = questions[qIdx]
    if (phase === "question" && currentQ) {
      questionStartRef.current = Date.now()
      setElapsedSeconds(0)
      timerId = setInterval(() => {
        if (questionStartRef.current) {
          setElapsedSeconds(Math.floor((Date.now() - questionStartRef.current) / 1000))
        }
      }, 1000)
    } else {
      questionStartRef.current = null
      setElapsedSeconds(0)
    }
    return () => {
      if (timerId) clearInterval(timerId)
    }
  }, [phase, qIdx, questions])

  const showToast = (msg: string) => {
    setToast(msg); setToastVisible(true)
    setTimeout(() => setToastVisible(false), 3000)
  }

  const QTYPES: QType[] = ["mcq", "truefalse", "fillblank", "short"]

  const fetchQ = useCallback(async (
    cfg: typeof config, index: number, pqs: string[], difficulty: number
  ): Promise<QuizQuestion | null> => {
    if (!cfg) return null
    const qType = cfg.qType === "mixed" ? QTYPES[index % QTYPES.length] : cfg.qType
    console.log(`[quiz] Q${index + 1} difficulty=${difficulty} type=${qType}`)
    try {
      if (enhancedMode) {
        // Use enhanced endpoint
        console.log("[quiz] Enhanced mode ON - using enhanced endpoint")
        console.log("[quiz] Mastery scores:", profile?.mastery)
        const res = await authFetch("/api/quiz/generate-question-enhanced", {
          method: "POST",
          body: JSON.stringify({
            topic: cfg.topic,
            difficulty,
            question_history: questionHistory,
            mastery_scores: profile?.mastery || {},
            class_level: 8,
            subject,
            retry_context: null
          }),
        })
        console.log("[quiz] Enhanced endpoint response status:", res.status)
        if (!res.ok) return null
        const data = await res.json()
        console.log("[quiz] Enhanced endpoint response:", data)
        
        // Check if blocked
        if (data.blocked) {
          console.log("[quiz] BLOCKED - showing prerequisite warning")
          setBlockedTopic({
            reason: data.reason,
            weakPrereqs: data.weak_prerequisites || []
          })
          setPhase("setup")
          return null
        }
        
        // Add to history
        if (data.embedding) {
          setQuestionHistory(prev => [...prev, {
            text: data.question,
            embedding: data.embedding
          }])
          console.log("[quiz] Added question to history, total:", questionHistory.length + 1)
        }
        
        return { ...data, topic: cfg.topic }
      } else {
        // Use standard endpoint
        console.log("[quiz] Enhanced mode OFF - using standard endpoint")
        const res = await authFetch("/api/quiz/generate-question", {
          method: "POST",
          body: JSON.stringify({
            topic: cfg.topic, difficulty, question_type: qType,
            question_index: index, subject, previous_questions: pqs,
          }),
        })
        if (!res.ok) return null
        const data = await res.json()
        return { ...data, topic: cfg.topic }
      }
    } catch { return null }
  }, [authFetch, subject, enhancedMode, questionHistory, profile, setBlockedTopic, setPhase])

  const handleStart = async (cfg: { topic: string; qType: QType; mode: Mode; count: number; difficulty: number }) => {
    console.log("[quiz] handleStart - Enhanced Mode:", enhancedMode)
    console.log("[quiz] handleStart - Question History length:", questionHistory.length)
    setConfig(cfg); setAttempts([]); setQIdx(0); setTotalXP(0)
    setPrevQs([]); setCurDiff(cfg.difficulty); setPrevDiff(cfg.difficulty)
    setConsecutiveCorrect(0)
    setBusy(true); setPhase("question")

    // Fetch prerequisites gap
    try {
      const res = await authFetch(`/api/quiz/prerequisites?topic=${encodeURIComponent(cfg.topic)}&subject=${encodeURIComponent(subject)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.mastery_gap && data.mastery_gap.length > 0) {
          setPrereqGap(data.mastery_gap)
          setShowPrereqBanner(true)
        } else {
          setPrereqGap([])
          setShowPrereqBanner(false)
        }
      } else {
        setPrereqGap([])
        setShowPrereqBanner(false)
      }
    } catch (err) {
      console.error("Failed to fetch prerequisites:", err)
      setPrereqGap([])
      setShowPrereqBanner(false)
    }

    const q = await fetchQ(cfg, 0, [], cfg.difficulty)
    if (q) { setQuestions([q]); setPrevQs([q.question]) }
    setBusy(false)
  }

  const handleSubmit = async (answer: string, confidence: Confidence) => {
    const q = questions[qIdx]
    if (!q || !config) return
    setBusy(true); setCurrentConfidence(confidence)

    // Calculate time taken
    const time_taken_seconds = questionStartRef.current
      ? Math.max(0, Math.round((Date.now() - questionStartRef.current) / 1000))
      : 0

    let assessment: Assessment
    let isCorrect = false
    let xpEarned = 0

    if (q.type === "teach_back") {
      const res = await authFetch("/api/quiz/assess-teachback", {
        method: "POST",
        body: JSON.stringify({
          topic: config.topic,
          subject: subject,
          concept: q.concept || config.topic,
          student_answer: answer,
          mastery_score: profile?.mastery?.[config.topic]?.score ?? 0.5
        })
      })
      if (res.ok) {
        const data = await res.json()
        assessment = {
          overall_score: (data.score ?? 0) / 100,
          score_percentage: data.score ?? 0,
          correctness: (data.score ?? 0) >= 50 ? "correct" : "incorrect",
          feedback_for_student: data.feedback ?? "",
          key_points_covered: [],
          key_points_missed: data.missed_points ?? [],
          model_answer: "",
          misconception: "",
          accuracy: data.accuracy ?? 0,
          completeness: data.completeness ?? 0,
          clarity: data.clarity ?? 0,
          teach_back: true
        }
      } else {
        assessment = {
          overall_score: 0, score_percentage: 0, correctness: "incorrect",
          feedback_for_student: "Could not grade teach-back.", key_points_covered: [],
          key_points_missed: [], model_answer: "", misconception: "",
          accuracy: 0, completeness: 0, clarity: 0, teach_back: true
        }
      }
      isCorrect = assessment.correctness === "correct"
      xpEarned = isCorrect ? 10 : 0
    } else {
      let correctAnswer: string | undefined
      if (q.type === "mcq")            correctAnswer = String(q.correct)
      else if (q.type === "truefalse") correctAnswer = String(q.correct)
      else if (q.type === "fillblank") {
        const raw = q.answer ?? q.correct ?? q.reference_answer ?? ""
        correctAnswer = String(raw)
        console.log("[fillblank] correct:", correctAnswer, "| full q:", q)
      }

      const res = await authFetch("/api/quiz/assess", {
        method: "POST",
        body: JSON.stringify({
          question: q.question, question_type: q.type,
          answer: answer || "", correct_answer: correctAnswer,
          difficulty: curDiff, subject,
          topic: config?.topic,
          time_taken_seconds: time_taken_seconds,
        }),
      })
      assessment = res.ok ? await res.json() : {
        overall_score: 0, score_percentage: 0, correctness: "incorrect",
        feedback_for_student: "Could not grade.", key_points_covered: [],
        key_points_missed: [], model_answer: "", misconception: "",
      }
      isCorrect = assessment.correctness === "correct"
      xpEarned = isCorrect ? 10 : assessment.correctness === "partially_correct" ? 5 : 0
    }

    // Streak bonus
    const newConsec = isCorrect ? consecutiveCorrect + 1 : 0
    setConsecutiveCorrect(newConsec)
    if (newConsec === 3) {
      xpEarned += 5
      showToast("🔥 On Fire! +5 bonus XP")
    }

    addXP(xpEarned); if (xpEarned > 0) bumpStreak()
    setXp(getXP()); setStreak(getStreak()); setTotalXP(p => p + xpEarned)

    // Adaptive difficulty with toast
    const nextDiff = adaptDifficulty(curDiff, isCorrect, confidence)
    const oldTier = diffTier(curDiff), newTier = diffTier(nextDiff)
    setPrevDiff(curDiff); setCurDiff(nextDiff)
    console.log(`[quiz] difficulty: ${curDiff} → ${nextDiff} (correct=${isCorrect}, conf=${confidence})`)
    if (newTier > oldTier) showToast(`📈 Difficulty raised to ${diffLabel(nextDiff)} — you're doing great!`)
    else if (newTier < oldTier) showToast(`📉 Difficulty adjusted to ${diffLabel(nextDiff)} — let's rebuild confidence`)

    const record: AttemptRecord = { question: q, studentAnswer: answer, assessment, xpEarned, confidence }
    const newAttempts = [...attempts, record]
    setAttempts(newAttempts)
    setCurrentAssessment(assessment); setCurrentAnswer(answer)

    // Save mistake
    if (!isCorrect && q.type !== "teach_back") {
      let correctAnswer: string | undefined
      if (q.type === "mcq")            correctAnswer = String(q.correct)
      else if (q.type === "truefalse") correctAnswer = String(q.correct)
      else if (q.type === "fillblank") correctAnswer = String(q.answer ?? q.correct ?? q.reference_answer ?? "")

      authFetch("/api/quiz/mistakes", {
        method: "POST",
        body: JSON.stringify({
          subject, topic: config.topic, question: q.question,
          student_answer: answer || "(no answer)",
          correct_answer: correctAnswer ?? assessment.model_answer ?? "",
          misconception: assessment.misconception ?? "",
          confidence,
        }),
      }).then((r: Response) => r.json()).then((d: any) => console.log("[quiz] mistake saved:", d))
    }

    const activeSubject = subject
    const currentTopic = config.topic

    if (config.mode === "exam") {
      if (qIdx + 1 >= config.count) {
        // Last question — compute final score from all attempts
        const finalCorrect = newAttempts.filter(a => a.assessment.correctness === "correct").length
        const finalPartial = newAttempts.filter(a => a.assessment.correctness === "partially_correct").length
        const finalTotal = newAttempts.length
        const finalScore = Math.round(((finalCorrect + finalPartial * 0.5) / Math.max(finalTotal, 1)) * 100) / 100
        console.log(`[quiz] final mastery: topic=${currentTopic} score=${finalScore} (${finalCorrect}+${finalPartial*0.5}/${finalTotal})`)
        await authFetch("/api/profile/mastery", {
          method: "POST",
          body: JSON.stringify({ subject: activeSubject, topic: currentTopic, score: finalScore }),
        })
        setPhase("results")
        await refreshProfile()
      }
      else {
        const nextIdx = qIdx + 1; setQIdx(nextIdx)
        fetchQ(config, nextIdx, prevQs, nextDiff).then(nq => {
          if (nq) { setQuestions(p => [...p, nq]); setPrevQs(p => [...p, nq.question]) }
        })
        setPhase("question")
      }
    } else {
      setPhase("feedback")
    }
    setBusy(false)
  }

  const handleNext = async () => {
    if (!config) return
    const nextIdx = qIdx + 1
    if (nextIdx >= config.count) {
      // Last question in practice mode — compute final score from all attempts
      const finalCorrect = attempts.filter(a => a.assessment.correctness === "correct").length
      const finalPartial = attempts.filter(a => a.assessment.correctness === "partially_correct").length
      const finalTotal = attempts.length
      const finalScore = Math.round(((finalCorrect + finalPartial * 0.5) / Math.max(finalTotal, 1)) * 100) / 100
      console.log(`[quiz] final mastery: topic=${config.topic} score=${finalScore} (${finalCorrect}+${finalPartial*0.5}/${finalTotal})`)
      await authFetch("/api/profile/mastery", {
        method: "POST",
        body: JSON.stringify({ subject, topic: config.topic, score: finalScore }),
      })
      setPhase("results")
      await refreshProfile()
      return
    }
    setBusy(true); setQIdx(nextIdx)
    if (!questions[nextIdx]) {
      const nq = await fetchQ(config, nextIdx, prevQs, curDiff)
      if (nq) { setQuestions(p => [...p, nq]); setPrevQs(p => [...p, nq.question]) }
    }
    setCurrentAssessment(null); setPhase("question"); setBusy(false)
  }

  const handleRetake = () => {
    setPhase("setup"); setQuestions([]); setAttempts([])
    setQIdx(0); setPrevQs([]); setCurrentAssessment(null); setConsecutiveCorrect(0)
    setPrereqGap([])
    setShowPrereqBanner(false)
  }

  const currentQ = questions[qIdx]

  return (
    <AppShell>
      <Toast message={toast} visible={toastVisible} />

      {phase !== "setup" && phase !== "journal" && (
        <div className="flex items-center gap-4 mb-5 text-sm border-b border-[#C0BAB0] pb-4 rounded-none">
          <XPCounter target={xp} />
          <span className="font-mono font-black text-[#c47c2b]">🔥 {streak} day streak</span>
          {config && <span className="text-[#8888A0] text-xs font-mono uppercase tracking-wider">{config.mode} · {config.topic}</span>}
        </div>
      )}

      {phase === "setup" && (
        <SetupScreen 
          subject={subject} 
          onStart={handleStart} 
          onJournal={() => setPhase("journal")} 
          initialTopic={urlTopic ?? undefined}
          enhancedMode={enhancedMode}
          setEnhancedMode={setEnhancedMode}
          blockedTopic={blockedTopic}
          setBlockedTopic={setBlockedTopic}
        />
      )}

      {phase === "question" && config && (
        busy && !currentQ ? (
          <div className="flex items-center gap-3 text-[#8888A0] text-xs font-mono">
            <div className="w-3 h-3 border border-[#4A6FA5] border-t-transparent animate-spin" />
            Generating question…
          </div>
        ) : currentQ ? (
          <>
            {showPrereqBanner && prereqGap.length > 0 && (
              <div className="max-w-3xl mx-auto mb-4 bg-[#FFD600] border border-[#1A1A1A] rounded-none p-3 text-white relative pr-10 animate-in slide-in-from-top-2">
                <span className="font-mono text-xs font-bold">
                  ⚠ Review first: {prereqGap.join(", ")}
                </span>
                <button 
                  onClick={() => setShowPrereqBanner(false)}
                  className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center border border-[#1A1A1A] bg-[#FFD600] text-sm font-bold font-mono hover:bg-black/10 active:translate-x-0.5 active:translate-y-0.5 rounded-none"
                  style={{ boxShadow: "2px 2px 0 #1A1A1A" }}
                >
                  ×
                </button>
              </div>
            )}
            <QuestionCard
              q={currentQ} chapterTopic={config.topic} idx={qIdx} total={config.count}
              mode={config.mode} curDiff={curDiff} prevDiff={prevDiff}
              attempts={attempts} onSubmit={handleSubmit} busy={busy}
              elapsedSeconds={elapsedSeconds}
            />
          </>
        ) : null
      )}

      {phase === "feedback" && currentQ && currentAssessment && (
        <FeedbackCard
          q={currentQ} assessment={currentAssessment}
          studentAnswer={currentAnswer} xpEarned={attempts[attempts.length-1]?.xpEarned ?? 0}
          confidence={currentConfidence}
          onNext={handleNext} isLast={qIdx + 1 >= (config?.count ?? 5)}
          onJournal={() => setPhase("journal")}
        />
      )}

      {phase === "results" && config && (
        <ResultsScreen
          attempts={attempts} totalXP={totalXP}
          topic={config.topic} authFetch={authFetch}
          onRetake={handleRetake}
        />
      )}

      {phase === "journal" && (
        <JournalScreen
          authFetch={authFetch}
          onBack={() => setPhase("setup")}
          onRetry={(topic) => { setPhase("setup") }}
        />
      )}
    </AppShell>
  )
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#E8E3D9] flex items-center justify-center"><p className="font-mono text-xs text-[#666680]">Loading…</p></div>}>
      <QuizPageInner />
    </Suspense>
  )
}
