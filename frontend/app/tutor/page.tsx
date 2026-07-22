"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { useAuth } from "@/lib/auth"
import { Send, Copy, Check } from "lucide-react"
import SpeakerButton from "@/components/audio/SpeakerButton"
import AudioRecorder from "@/components/audio/AudioRecorder"
import { normalizeSubject } from "@/lib/subjects"

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
  "Rational Numbers","Linear Equations","Understanding Quadrilaterals","Practical Geometry",
  "Data Handling","Squares & Square Roots","Cubes & Cube Roots","Comparing Quantities",
  "Algebraic Expressions","Mensuration","Exponents & Powers","Direct & Inverse Proportions",
  "Factorisation","Introduction to Graphs","Playing with Numbers",
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
  "The Wit that Won Hearts","A Concrete Example","Wisdom Paves the Way",
  "A Tale of Valour: Major Somnath Sharma and the Battle of Badgam",
  "Somebody's Mother","Verghese Kurien: I Too Had A Dream","The Case of the Fifth Word",
  "The Magic Brush of Dreams","Spectacular Wonders","The Cherry Tree",
  "Harvest Hymn","Waiting for the Rain","Feathered Friend","Magnifying Glass",
  "Bibha Chowdhuri: The Beam of Light that Lit the Path for Women in Indian Science",
]

// Chapter index maps
const SCIENCE_CHAPTER: Record<string, number> = Object.fromEntries(SCIENCE_TOPICS.map((t, i) => [t, i + 1]))
const MATHS_CHAPTER: Record<string, number> = Object.fromEntries(MATHS_TOPICS.map((t, i) => [t, i + 1]))
const SOCIAL_CHAPTER: Record<string, number> = Object.fromEntries(SOCIAL_TOPICS.map((t, i) => [t, i + 1]))
const ENGLISH_CHAPTER: Record<string, number> = Object.fromEntries(ENGLISH_TOPICS.map((t, i) => [t, i + 1]))

// Prebuilt starter questions per topic
const SCIENCE_PREBUILT: Record<string, string[]> = {
  "Exploring the Investigative World of Science": [
    "What is the scientific method?",
    "What is the difference between observation and inference?",
    "Give an example of a controlled experiment",
  ],
  "The Invisible Living World: Beyond Our Naked Eye": [
    "What are microorganisms?",
    "How do bacteria differ from viruses?",
    "What is a pathogen?",
  ],
  "Health: The Ultimate Treasure": [
    "What is the difference between communicable and non-communicable disease?",
    "What are the components of a balanced diet?",
    "How does the immune system work?",
  ],
  "Electricity: Magnetic and Heating Effects": [
    "What is an electric circuit?",
    "How does a magnet interact with current?",
    "What is the heating effect of electricity?",
  ],
  "Exploring Forces": [
    "What is the difference between contact and non-contact forces?",
    "What is friction and when does it act?",
    "How do balanced and unbalanced forces differ?",
  ],
  "Pressure, Winds, Storms, and Cyclones": [
    "What is atmospheric pressure?",
    "How are cyclones formed?",
    "Why does wind move from high to low pressure?",
  ],
  "Particulate Nature of Matter": [
    "What is matter made of?",
    "What are the properties of particles of matter?",
    "How does diffusion work?",
  ],
  "Nature of Matter: Elements, Compounds, and Mixtures": [
    "What is the difference between an element and a compound?",
    "How are mixtures different from compounds?",
    "Give examples of homogeneous mixtures",
  ],
  "The Amazing World of Solutes, Solvents, and Solutions": [
    "What is a solution?",
    "What factors affect solubility?",
    "What is the difference between a saturated and unsaturated solution?",
  ],
  "Light: Mirrors and Lenses": [
    "What is the law of reflection?",
    "How does a concave mirror form an image?",
    "What is the difference between a convex and concave lens?",
  ],
  "Keeping Time with the Skies": [
    "How do we measure time using the sun?",
    "What causes day and night?",
    "What is the difference between a solar and lunar calendar?",
  ],
}

const MATHS_PREBUILT: Record<string, string[]> = {
  "Rational Numbers": [
    "What is a rational number?",
    "How do you add two rational numbers?",
    "What is the difference between rational and irrational numbers?",
  ],
  "Linear Equations": [
    "What is a linear equation?",
    "How do you solve an equation with variables on both sides?",
    "Give a real-life example of a linear equation",
  ],
  "Understanding Quadrilaterals": [
    "What are the properties of a parallelogram?",
    "How is a rhombus different from a square?",
    "What is the angle sum of a quadrilateral?",
  ],
  "Practical Geometry": [
    "How do you construct a quadrilateral with given sides?",
    "What is the minimum data needed to construct a unique quadrilateral?",
    "How do you construct a rhombus?",
  ],
  "Data Handling": [
    "What is the difference between a bar graph and histogram?",
    "How do you find the mean of grouped data?",
    "What is probability?",
  ],
  "Squares & Square Roots": [
    "What is a perfect square?",
    "How do you find the square root by division method?",
    "What are Pythagorean triplets?",
  ],
  "Cubes & Cube Roots": [
    "What is a perfect cube?",
    "How do you find the cube root of a number?",
    "Is 216 a perfect cube? How?",
  ],
  "Comparing Quantities": [
    "What is the difference between simple and compound interest?",
    "How do you calculate percentage increase?",
    "What is discount and how is it calculated?",
  ],
  "Algebraic Expressions": [
    "What is the difference between an expression and an identity?",
    "What are the standard algebraic identities?",
    "How do you multiply two binomials?",
  ],
  "Mensuration": [
    "How do you find the area of a trapezium?",
    "What is the surface area of a cylinder?",
    "How is volume different from surface area?",
  ],
  "Exponents & Powers": [
    "What are the laws of exponents?",
    "What is a negative exponent?",
    "How do you express large numbers in standard form?",
  ],
  "Direct & Inverse Proportions": [
    "What is direct proportion?",
    "How is inverse proportion different from direct?",
    "Give a real-life example of inverse proportion",
  ],
  "Factorisation": [
    "What is factorisation?",
    "How do you factorise a quadratic expression?",
    "What is the factor theorem?",
  ],
  "Introduction to Graphs": [
    "What is a coordinate plane?",
    "How do you plot a point on a graph?",
    "What does the slope of a line represent?",
  ],
}

const SOCIAL_PREBUILT: Record<string, string[]> = {
  "Natural Resources and Their Conservation": [
    "What are natural resources?",
    "Why is conservation of natural resources important?",
    "What is the difference between renewable and non-renewable resources?",
  ],
  "Reshaping India's Political Map": [
    "How was India's political map reshaped after independence?",
    "What was the States Reorganisation Act?",
    "How were states formed on linguistic basis?",
  ],
  "The Rise of the Marathas": [
    "Who was Shivaji and what was his contribution?",
    "What was the Maratha Confederacy?",
    "How did the Marathas expand their empire?",
  ],
  "The Colonial Era in India": [
    "How did the British establish colonial rule in India?",
    "What were the effects of colonial rule on Indian economy?",
    "What was the Doctrine of Lapse?",
  ],
  "Universal Franchise and India's Electoral System": [
    "What is universal adult franchise?",
    "How does the election process work in India?",
    "What is the role of the Election Commission of India?",
  ],
  "The Parliamentary System: Legislature and Executive": [
    "What are the functions of Parliament?",
    "What is the difference between Lok Sabha and Rajya Sabha?",
    "How is the Prime Minister appointed?",
  ],
  "Factors of Production": [
    "What are the four factors of production?",
    "What is the role of capital in production?",
    "How does entrepreneurship differ from other factors of production?",
  ],
}

const ENGLISH_PREBUILT: Record<string, string[]> = {
  "The Wit that Won Hearts": [
    "Who is the main character in this story?",
    "What is the central theme of this chapter?",
    "What lesson does this story teach us?",
  ],
  "A Concrete Example": [
    "What does the title 'A Concrete Example' suggest?",
    "What is the author trying to convey?",
    "Describe the main character's situation.",
  ],
  "Wisdom Paves the Way": [
    "What kind of wisdom is depicted in this story?",
    "How does the protagonist solve the problem?",
    "What is the moral of this story?",
  ],
  "Somebody's Mother": [
    "Who is 'Somebody's Mother' in this poem?",
    "What act of kindness is described in the poem?",
    "What values does this poem highlight?",
  ],
  "Verghese Kurien: I Too Had A Dream": [
    "Who was Verghese Kurien?",
    "What was Operation Flood?",
    "How did Kurien transform India's dairy industry?",
  ],
  "The Cherry Tree": [
    "What does the cherry tree symbolize in this poem?",
    "Who planted the tree and why?",
    "How does the poem show the passage of time?",
  ],
  "Harvest Hymn": [
    "What is the central theme of this poem?",
    "How does the poet describe the harvest season?",
    "What emotions does this poem evoke?",
  ],
}

interface HistoryItem { role: "user" | "assistant"; content: string }
interface Msg {
  role: "user" | "assistant"
  content: string
  citations?: string[]
  suggested_questions?: string[]
}
interface Prerequisites {
  mastery_gap?: string[]
  prerequisites?: string[]
  ready?: boolean
}

// ── Render **bold** terms as yellow highlight chips ────────────────────────────
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <span className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          const term = p.slice(2, -2)
          return (
            <span key={i}
              className="inline-block px-1 py-0 font-bold text-[#1A1A1A]"
              style={{ background: "#FFD600", borderRadius: 0 }}>
              {term}
            </span>
          )
        }
        return <span key={i}>{p}</span>
      })}
    </span>
  )
}

// ── Typing indicator ───────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-[#1A1A1A] px-4 py-3 text-xs font-mono"
        style={{ boxShadow: "3px 3px 0 #1A1A1A" }}>
        <span className="inline-flex gap-1 items-center text-[#888]">
          Thinking
          <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
        </span>
      </div>
    </div>
  )
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text.replace(/\*\*/g, ""))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy}
      className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider border border-[#C0BAB0] text-[#999] hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors">
      {copied ? <><Check className="h-2.5 w-2.5" /> Copied!</> : <><Copy className="h-2.5 w-2.5" /> Copy</>}
    </button>
  )
}

// ── Chip button (suggestions + quick actions) ──────────────────────────────────
function Chip({ label, onClick, pink }: { label: string; onClick: () => void; pink?: boolean }) {
  return (
    <button onClick={onClick}
      className="px-2.5 py-1 text-[10px] font-mono font-bold border border-[#1A1A1A] text-[#1A1A1A] bg-white transition-all hover:bg-[#4A6FA5] hover:text-white hover:border-[#4A6FA5] cursor-pointer"
      style={{ boxShadow: "2px 2px 0 #1A1A1A" }}>
      {label}
    </button>
  )
}

export default function TutorPage() {
  const { profile, authFetch } = useAuth()
  const router = useRouter()
  const subject = profile?.subject ?? "science"
  const normalizedSubject = normalizeSubject(subject) ?? "science"
  const [topic, setTopic] = useState("— General —")
  const [messages, setMessages] = useState<Msg[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [panelsVisible, setPanelsVisible] = useState(true)
  const [prerequisites, setPrerequisites] = useState<Prerequisites | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const topics = normalizedSubject === "maths" ? MATHS_TOPICS
    : normalizedSubject === "social" ? SOCIAL_TOPICS
    : normalizedSubject === "english" ? ENGLISH_TOPICS
    : SCIENCE_TOPICS
  const mastery = topic !== "— General —" ? (profile?.mastery?.[topic]?.score ?? 0.5) : 0.5
  const masteryPct = mastery * 100
  const chapterMap = normalizedSubject === "maths" ? MATHS_CHAPTER
    : normalizedSubject === "social" ? SOCIAL_CHAPTER
    : normalizedSubject === "english" ? ENGLISH_CHAPTER
    : SCIENCE_CHAPTER
  const chapterNum = topic !== "— General —" ? chapterMap[topic] : null
  const prebuiltMap = normalizedSubject === "maths" ? MATHS_PREBUILT
    : normalizedSubject === "social" ? SOCIAL_PREBUILT
    : normalizedSubject === "english" ? ENGLISH_PREBUILT
    : SCIENCE_PREBUILT
  const prebuiltQuestions = topic !== "— General —" ? (prebuiltMap[topic] ?? []) : []
  const prerequisiteGaps = prerequisites === null
    ? null
    : prerequisites.mastery_gap ?? prerequisites.prerequisites ?? []

  // Reset on topic/subject change
  useEffect(() => {
    setMessages([])
    setHistory([])
    setInput("")
    setPanelsVisible(true)
    setPrerequisites(null)
  }, [topic, subject])

  // Fetch prerequisites when topic changes (non-general)
  useEffect(() => {
    if (topic === "— General —") return
    authFetch(`/api/quiz/prerequisites?topic=${encodeURIComponent(topic)}&subject=${subject}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPrerequisites(data) })
      .catch(() => {})
  }, [topic, subject, authFetch])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, busy])

  const send = useCallback(async (question?: string) => {
    const q = (question ?? input).trim()
    if (!q || busy) return
    setInput("")

    const userMsg: Msg = { role: "user", content: q }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setBusy(true)

    const historyToSend = [...history, { role: "user" as const, content: q }].slice(-10)

    try {
      const res = await authFetch("/api/tutor/ask", {
        method: "POST",
        body: JSON.stringify({
          question: q,
          mastery_score: mastery,
          subject,
          topic: topic !== "— General —" ? topic : undefined,
          conversation_history: history.slice(-10),
        }),
      })
      const data = await res.json()
      const answer = data.answer || data.response || "No response received."
      const aiMsg: Msg = {
        role: "assistant",
        content: answer,
        citations: data.citations,
        suggested_questions: data.suggested_questions ?? [],
      }
      setMessages([...newMsgs, aiMsg])
      setHistory([
        ...history,
        { role: "user", content: q },
        { role: "assistant", content: answer },
      ])
      // Hide panels after first full exchange
      setPanelsVisible(false)
    } catch {
      setMessages([...newMsgs, { role: "assistant", content: "⚠️ Failed to get response. Check backend." }])
    } finally {
      setBusy(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, busy, messages, history, mastery, subject, topic, authFetch])

  const handleTopicChange = (t: string) => { setTopic(t) }

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-7rem)]">

        {/* Header */}
        <div className="mb-3">
          
          <h1 className="font-serif font-black text-[2rem] text-[#1A1A1A] leading-none">Ask anything.</h1>
          <p className="text-[#999] text-xs font-mono mt-1">
            {normalizedSubject === "maths" ? "NCERT Class 8 Maths" 
              : normalizedSubject === "social" ? "NCERT Class 8 Social Science"
              : normalizedSubject === "english" ? "NCERT Class 8 English"
              : "NCERT Class 8 Science"} · Adapts to your mastery
          </p>
        </div>

        {/* Topic selector */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <select value={topic} onChange={e => handleTopicChange(e.target.value)}
            className="bg-white border border-[#1A1A1A] text-[#1A1A1A] px-3 py-2 text-xs font-mono outline-none focus:border-[#4A6FA5] transition-colors"
            style={{ boxShadow: "2px 2px 0 #1A1A1A" }}>
            <option value="— General —">— General —</option>
            {topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {topic !== "— General —" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#999] font-mono">Mastery:</span>
              <div className="w-20 h-1.5 bg-[#E8E3D9] border border-[#C0BAB0] overflow-hidden">
                <div className="h-full transition-all" style={{
                  width: `${masteryPct}%`,
                  backgroundColor: masteryPct < 40 ? "#4A6FA5" : masteryPct < 70 ? "#c47c2b" : "#2a7d4f"
                }} />
              </div>
              <span className="font-mono text-[10px] font-bold" style={{
                color: masteryPct < 40 ? "#4A6FA5" : masteryPct < 70 ? "#c47c2b" : "#2a7d4f"
              }}>{masteryPct.toFixed(0)}%</span>
            </div>
          )}
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setHistory([]) }}
              className="text-[9px] font-mono text-[#999] hover:text-[#4A6FA5] uppercase tracking-wider transition-colors ml-auto">
              Clear chat
            </button>
          )}
        </div>

        {/* Three-column layout: panels + chat */}
        <div className="flex flex-1 gap-3 min-h-0">

          {/* LEFT PANEL */}
          <div
            className="flex flex-col gap-3 overflow-hidden transition-all duration-500 ease-in-out"
            style={{
              width: panelsVisible && topic !== "— General —" ? 240 : 0,
              opacity: panelsVisible && topic !== "— General —" ? 1 : 0,
              flexShrink: 0,
            }}
          >
            <div className="manila-folder p-4 space-y-4 h-full overflow-y-auto">

              {/* Chapter info */}
              <div>
                <p className="text-[9px] font-mono text-[#999] uppercase tracking-wider mb-1">Chapter</p>
                <p className="font-bold text-[#1A1A1A] text-xs leading-snug"
                  style={{ fontFamily: "Georgia, serif" }}>
                  {chapterNum != null ? `Chapter ${chapterNum}` : ""}<br />
                  <span className="font-normal">{topic}</span>
                </p>
              </div>

              {/* Subject badge */}
              <div>
                <span className="inline-block px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider border border-[#1A1A1A]"
                  style={{
                    background: subject === "science" ? "#4A6FA5" : "#4D79FF",
                    color: "#fff",
                    boxShadow: "2px 2px 0 #1A1A1A",
                  }}>
                  {normalizedSubject === "science" ? "Science" 
                    : normalizedSubject === "maths" ? "Maths"
                    : normalizedSubject === "social" ? "Social Sc."
                    : normalizedSubject === "english" ? "English"
                    : "Science"}
                </span>
              </div>

              {/* Mastery bar */}
              <div>
                <p className="text-[9px] font-mono text-[#999] uppercase tracking-wider mb-1">Your Mastery</p>
                <div className="w-full h-2 bg-[#E8E3D9] border border-[#C0BAB0] overflow-hidden mb-1">
                  <div className="h-full transition-all duration-500" style={{
                    width: `${masteryPct}%`,
                    backgroundColor: masteryPct < 40 ? "#4A6FA5" : masteryPct < 70 ? "#c47c2b" : "#2a7d4f",
                  }} />
                </div>
                <span className="font-mono text-[10px] font-bold" style={{
                  color: masteryPct < 40 ? "#4A6FA5" : masteryPct < 70 ? "#c47c2b" : "#2a7d4f"
                }}>{masteryPct.toFixed(0)}%</span>
              </div>

              {/* Prerequisites */}
              <div>
                <p className="text-[9px] font-mono text-[#999] uppercase tracking-wider mb-1.5">Prerequisites</p>
                {prerequisiteGaps === null ? (
                  <p className="text-[10px] font-mono text-[#C0BAB0]">Loading…</p>
                ) : prerequisiteGaps.length === 0 ? (
                  <p className="text-[10px] font-mono font-bold" style={{ color: "#2a7d4f" }}>✓ Prerequisites clear</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {prerequisiteGaps.map((gap, i) => (
                      <span key={i}
                        className="inline-block px-1.5 py-0.5 text-[9px] font-mono font-bold border border-[#c47c2b] text-[#c47c2b] bg-white"
                        style={{ boxShadow: "1px 1px 0 #c47c2b" }}>
                        ⚠ {gap}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CHAT AREA */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            <div className="flex-1 overflow-y-auto graph-paper p-6 space-y-6 mb-3 rounded-sm border-2 border-[#1c1f3a]"
              style={{ boxShadow: "4px 4px 0 #1c1f3a" }}>

              {messages.length === 0 && (
                <div className="text-center mt-10">
                  <p className="section-label green justify-center mb-3">Try asking</p>
                  {normalizedSubject === "maths" ? (
                    <>
                      <p className="text-[#999] text-xs font-mono mb-1.5 cursor-pointer hover:text-[#4A6FA5] transition-colors"
                        onClick={() => send("How do I factorise quadratic expressions?")}>
                        "How do I factorise quadratic expressions?"
                      </p>
                      <p className="text-[#999] text-xs font-mono cursor-pointer hover:text-[#4A6FA5] transition-colors"
                        onClick={() => send("What is the area of a trapezium?")}>
                        "What is the area of a trapezium?"
                      </p>
                    </>
                  ) : normalizedSubject === "social" ? (
                    <>
                      <p className="text-[#999] text-xs font-mono mb-1.5 cursor-pointer hover:text-[#4A6FA5] transition-colors"
                        onClick={() => send("What was the impact of colonial rule on India?")}>
                        "What was the impact of colonial rule on India?"
                      </p>
                      <p className="text-[#999] text-xs font-mono cursor-pointer hover:text-[#4A6FA5] transition-colors"
                        onClick={() => send("How does India's parliamentary system work?")}>
                        "How does India's parliamentary system work?"
                      </p>
                    </>
                  ) : normalizedSubject === "english" ? (
                    <>
                      <p className="text-[#999] text-xs font-mono mb-1.5 cursor-pointer hover:text-[#4A6FA5] transition-colors"
                        onClick={() => send("What is the central theme of The Cherry Tree?")}>
                        "What is the central theme of The Cherry Tree?"
                      </p>
                      <p className="text-[#999] text-xs font-mono cursor-pointer hover:text-[#4A6FA5] transition-colors"
                        onClick={() => send("Describe Verghese Kurien's contribution to India.")}>
                        "Describe Verghese Kurien's contribution to India."
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[#999] text-xs font-mono mb-1.5 cursor-pointer hover:text-[#4A6FA5] transition-colors"
                        onClick={() => send("How do mirrors form images?")}>
                        "How do mirrors form images?"
                      </p>
                      <p className="text-[#999] text-xs font-mono cursor-pointer hover:text-[#4A6FA5] transition-colors"
                        onClick={() => send("What causes winds and storms?")}>
                        "What causes winds and storms?"
                      </p>
                    </>
                  )}
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[85%] space-y-3">
                    {m.role === "user" ? (
                      <div className="sticky-note p-4 text-sm font-serif" style={{ '--r': i % 2 === 0 ? '-1.5deg' : '2deg' } as React.CSSProperties}>
                        <p className="whitespace-pre-wrap leading-relaxed text-[#1c1f3a]">{m.content}</p>
                      </div>
                    ) : (
                      <div className="ai-flashcard text-sm">
                        <div className="ai-flashcard-flap" />
                        <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
                          <CopyBtn text={m.content} />
                          <SpeakerButton text={m.content} />
                        </div>
                        <div className="pr-8 relative z-10 text-[#1c1f3a] font-serif leading-relaxed">
                          <RichText text={m.content} />
                        </div>
                        {m.citations && m.citations.length > 0 && (
                          <p className="text-[9px] mt-3 opacity-60 font-mono border-t border-[rgba(28,31,58,0.1)] pt-2 relative z-10">
                            ■ {m.citations.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                    {m.role === "assistant" && (
                      <div className="space-y-2">
                        <div className="flex gap-2 flex-wrap">
                          <Chip label="Give me an example" onClick={() => send(`Give me a concrete example of what you just explained`)} />
                          <Chip label="Quiz me on this" onClick={() => router.push(`/quiz?topic=${encodeURIComponent(topic !== "— General —" ? topic : "")}&subject=${subject}`)} />
                        </div>
                        {m.suggested_questions && m.suggested_questions.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[9px] font-mono text-[#999] uppercase tracking-wider">Follow-up questions:</p>
                            <div className="flex gap-2 flex-wrap">
                              {m.suggested_questions.map((q, qi) => (
                                <Chip key={qi} label={q} onClick={() => { setInput(q); setTimeout(() => send(q), 50) }} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {busy && <TypingDots />}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex flex-col gap-3 mt-2 sm:flex-row sm:items-end sm:gap-3">
              <div className="label-tape flex-1 min-w-0 flex flex-col gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="Type a message..."
                    className="w-full resize-none bg-transparent text-[#1c1f3a] px-4 py-3 text-sm font-mono outline-none min-h-[46px] max-h-32 placeholder:text-[rgba(28,31,58,0.4)]"
                    rows={1}
                  />
                  <div className="min-w-0">
                    <AudioRecorder onTranscribed={(t) => setInput(t)} />
                  </div>
                </div>
              <button onClick={() => send()} disabled={busy || !input.trim()}
                className="brut-btn brut-btn-pink px-5 h-[46px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center">
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div
            className="flex flex-col overflow-hidden transition-all duration-500 ease-in-out"
            style={{
              width: panelsVisible && topic !== "— General —" && prebuiltQuestions.length > 0 ? 240 : 0,
              opacity: panelsVisible && topic !== "— General —" && prebuiltQuestions.length > 0 ? 1 : 0,
              flexShrink: 0,
            }}
          >
            <div className="p-2 space-y-3 h-full overflow-y-auto pt-6">
              <p className="text-[9px] font-mono font-bold uppercase tracking-wider pl-2"
                style={{ color: "#c47c2b" }}>■ Starter Questions</p>
              <div className="flex flex-col gap-3 pt-1">
                {prebuiltQuestions.map((q, i) => (
                  <button key={i} onClick={() => { setInput(q); setTimeout(() => send(q), 50) }}
                    className="tear-off-ticket text-left text-xs font-serif leading-snug text-[#1c1f3a]">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  )
}
