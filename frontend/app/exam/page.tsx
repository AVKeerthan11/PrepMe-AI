"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { AppShell } from "@/components/layout/app-shell"
import { motion } from "framer-motion"

// ── Types ──────────────────────────────────────────────────────────────────
type Phase = "setup" | "loading" | "active" | "results"

type Question = {
  section: string
  type: string
  marks: number
  question_text: string
  assertion?: string
  reason?: string
  passage?: string
  passage_type?: string
  sub_questions?: any[]
  extracts?: any[]
  questions?: any[]
  options?: string[]
  correct?: string
  correct_answer: string
  hint: string
  explanation: string
  bloom_level: string
  source_pages: string
}

type Section = {
  name: string
  type: string
  instructions: string
  questions_count: number
  marks_per_question: number
  section_marks: number
  questions: Question[]
}

type ExamPaper = {
  subject: string
  class_level: number
  topic_filter: string | null
  total_marks: number
  sections: Section[]
}

type Answer = {
  value: string
  marked_for_review: boolean
}

// ── CBSE Patterns (for preview table) ─────────────────────────────────────
const CBSE_PATTERNS: Record<string, any[]> = {
  Science: [
    { name: "Section A", type: "MCQ (includes 4 A-R)", questions: 20, marks: 20 },
    { name: "Section B", type: "VSA", questions: 6, marks: 12 },
    { name: "Section C", type: "SA", questions: 7, marks: 21 },
    { name: "Section D", type: "LA", questions: 3, marks: 15 },
    { name: "Section E", type: "Case Study", questions: 3, marks: 12 },
  ],
  Mathematics: [
    { name: "Section A", type: "MCQ (includes 2 A-R)", questions: 20, marks: 20 },
    { name: "Section B", type: "VSA", questions: 5, marks: 10 },
    { name: "Section C", type: "SA", questions: 6, marks: 18 },
    { name: "Section D", type: "LA", questions: 4, marks: 20 },
    { name: "Section E", type: "Case Study", questions: 3, marks: 12 },
  ],
  "Social Studies": [
    { name: "Section A", type: "MCQ", questions: 20, marks: 20 },
    { name: "Section B", type: "VSA", questions: 4, marks: 8 },
    { name: "Section C", type: "SA", questions: 5, marks: 15 },
    { name: "Section D", type: "LA", questions: 4, marks: 20 },
    { name: "Section E", type: "Case Study", questions: 3, marks: 12 },
    { name: "Section F", type: "Map", questions: 1, marks: 5 },
  ],
  English: [
    { name: "Section A", type: "Reading", questions: 2, marks: 20 },
    { name: "Section B", type: "Writing + Grammar", questions: 3, marks: 20 },
    { name: "Section C", type: "Literature", questions: 3, marks: 40 },
  ],
}

const CBSE_GRADES = [
  { min: 91, max: 100, grade: "A1" },
  { min: 81, max: 90,  grade: "A2" },
  { min: 71, max: 80,  grade: "B1" },
  { min: 61, max: 70,  grade: "B2" },
  { min: 51, max: 60,  grade: "C1" },
  { min: 41, max: 50,  grade: "C2" },
  { min: 33, max: 40,  grade: "D" },
  { min: 0,  max: 32,  grade: "E" },
]

export default function ExamPage() {
  const router = useRouter()
  const { profile, authFetch } = useAuth()

  const [phase, setPhase] = useState<Phase>("setup")
  const [subject, setSubject] = useState("Science")
  const [classLevel, setClassLevel] = useState(8)
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [useTopicFilter, setUseTopicFilter] = useState(false)

  const [paper, setPaper] = useState<ExamPaper | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [timeLeft, setTimeLeft] = useState(3 * 60 * 60) // 3 hours
  const [currentSection, setCurrentSection] = useState(0)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState("")

  // Timer countdown
  useEffect(() => {
    if (phase !== "active") return
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleSubmit()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  const handleStartExam = async () => {
    setError("")
    setPhase("loading")
    try {
      const res = await authFetch("/api/exam/generate", {
        method: "POST",
        body: JSON.stringify({
          subject,
          class_level: classLevel,
          topic_filter: useTopicFilter ? topicFilter : null,
        }),
      })
      if (!res.ok) throw new Error("Failed to generate exam")
      const data = await res.json()
      setPaper(data)
      setPhase("active")
    } catch (e: any) {
      setError(e.message)
      setPhase("setup")
    }
  }

  const handleAnswerChange = (qIndex: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qIndex]: { value, marked_for_review: prev[qIndex]?.marked_for_review || false },
    }))
  }

  const toggleReview = (qIndex: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qIndex]: {
        value: prev[qIndex]?.value || "",
        marked_for_review: !prev[qIndex]?.marked_for_review,
      },
    }))
  }

  const handleSubmit = () => {
    if (!paper) return
    let score = 0
    const sectionResults: any[] = []

    paper.sections.forEach((sec) => {
      let attempted = 0
      let correct = 0
      let marksObtained = 0

      sec.questions.forEach((q, idx) => {
        const qKey = `${sec.name}-${idx}`
        const ans = answers[qKey]?.value || ""
        if (ans.trim()) attempted++

        // MCQ/AR grading
        if (q.type === "mcq" || q.type === "assertion_reason") {
          if (ans.toUpperCase() === (q.correct || "").toUpperCase()) {
            correct++
            marksObtained += q.marks
          }
        }
        // Subjective - assume full marks if answered (demo grading)
        else if (ans.trim()) {
          marksObtained += q.marks
          correct++
        }
      })

      sectionResults.push({
        name: sec.name,
        attempted,
        correct,
        marksObtained,
        maxMarks: sec.section_marks,
      })
      score += marksObtained
    })

    const percentage = Math.round((score / 80) * 100)
    const gradeObj = CBSE_GRADES.find((g) => percentage >= g.min && percentage <= g.max)

    setResults({
      score,
      percentage,
      grade: gradeObj?.grade || "E",
      sections: sectionResults,
    })
    setPhase("results")
  }

  const totalQuestions = paper ? paper.sections.reduce((sum, s) => sum + s.questions.length, 0) : 0
  const answeredCount = Object.keys(answers).filter((k) => answers[k].value.trim()).length
  const canSubmit = answeredCount >= totalQuestions * 0.5

  // ── PHASE 1: Setup Screen ─────────────────────────────────────────────────
  if (phase === "setup") {
    const pattern = CBSE_PATTERNS[subject] || []
    const totalQ = pattern.reduce((sum, s) => sum + s.questions, 0)

    return (
      <AppShell>
      <div className="min-h-screen p-8 animate-slide-up">
        <div className="max-w-4xl mx-auto space-y-10">
          
          {/* Header Title */}
          <div className="text-center">
            <h1 className="font-serif font-black text-4xl md:text-5xl text-[#1c1f3a] mb-2 drop-shadow-[2px_2px_0px_rgba(74,111,165,0.3)]">
              EXAMINATION REGISTRATION
            </h1>
            <p className="font-mono text-sm font-bold uppercase tracking-widest text-[#c47c2b]">
              Official Board Simulation
            </p>
          </div>

          {/* Registration Form - Manila Cardboard Panel */}
          <div className="cardboard-panel max-w-2xl mx-auto p-8 relative">
            <p className="text-center text-xs font-mono mb-8 text-[#1c1f3a] opacity-70 border-b-2 border-dashed border-[rgba(28,31,58,0.15)] pb-4">
              WARNING: This simulates a real CBSE exam paper. Once authorized, a strict 3-hour timer commences. Do not begin until ready.
            </p>

            {error && (
              <div className="mb-6 p-3 bg-red-100 border-2 border-dashed border-red-400 text-red-800 font-mono text-sm font-bold text-center">
                ERROR: {error}
              </div>
            )}

            <div className="space-y-8">
              {/* Subject selector */}
              <div className="flex flex-col">
                <label className="font-serif font-black uppercase text-sm mb-1 text-[#1c1f3a]">Candidate Subject Choice:</label>
                <select
                  className="bg-transparent border-b-2 border-dashed border-[#1c1f3a] font-mono text-xl font-bold text-[#4A6FA5] p-2 focus:outline-none focus:border-solid transition-all cursor-pointer"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value="Science">SCIENCE</option>
                  <option value="Mathematics">MATHEMATICS</option>
                  <option value="Social Studies">SOCIAL STUDIES</option>
                  <option value="English">ENGLISH</option>
                </select>
              </div>

              {/* Class selector */}
              <div className="flex flex-col">
                <label className="font-serif font-black uppercase text-sm mb-1 text-[#1c1f3a]">Standard / Grade Level:</label>
                <select
                  className="bg-transparent border-b-2 border-dashed border-[#1c1f3a] font-mono text-xl font-bold text-[#4A6FA5] p-2 focus:outline-none focus:border-solid transition-all cursor-pointer"
                  value={classLevel}
                  onChange={(e) => setClassLevel(Number(e.target.value))}
                >
                  <option value={8}>CLASS VIII</option>
                  <option value={9}>CLASS IX</option>
                  <option value={10}>CLASS X</option>
                </select>
              </div>

              {/* Topic filter toggle */}
              <div className="flex flex-col bg-[rgba(255,255,255,0.4)] p-4 border-2 border-[rgba(28,31,58,0.1)] border-dashed">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useTopicFilter}
                    onChange={(e) => setUseTopicFilter(e.target.checked)}
                    className="w-5 h-5 accent-[#c47c2b]"
                  />
                  <span className="font-serif font-bold text-[#1c1f3a]">Restrict to Specific Topic Syllabus (Optional)</span>
                </label>
                {useTopicFilter && (
                  <input
                    type="text"
                    className="mt-4 bg-transparent border-b-2 border-dashed border-[#1c1f3a] font-mono text-lg font-bold text-[#1c1f3a] p-2 focus:outline-none focus:border-solid w-full"
                    placeholder="e.g. Force and Pressure"
                    value={topicFilter || ""}
                    onChange={(e) => setTopicFilter(e.target.value)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Exam structure preview - Clipboard */}
          <div className="clipboard-board max-w-3xl mx-auto">
            <div className="clipboard-clip" />
            <div className="clipboard-paper border-l-[4px] border-[#c0392b]">
              <h2 className="font-serif font-black text-2xl mb-4 text-[#1c1f3a] uppercase tracking-tighter border-b-2 border-[#1c1f3a] pb-2">
                Appendix A: Examination Blueprint
              </h2>
              <table className="w-full border-collapse font-mono text-sm text-[#1c1f3a]">
                <thead>
                  <tr className="border-b-2 border-[#1c1f3a]">
                    <th className="text-left py-3 px-2">SECTION</th>
                    <th className="text-left py-3 px-2">ITEM TYPE</th>
                    <th className="text-center py-3 px-2">QTY</th>
                    <th className="text-center py-3 px-2">MARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {pattern.map((s, i) => (
                    <tr key={i} className="border-b border-dashed border-[rgba(28,31,58,0.2)] hover:bg-[rgba(28,31,58,0.02)]">
                      <td className="py-3 px-2 font-bold">{s.name}</td>
                      <td className="py-3 px-2">{s.type}</td>
                      <td className="py-3 px-2 text-center">{s.questions}</td>
                      <td className="py-3 px-2 text-center font-bold">{s.marks}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#1c1f3a] bg-[rgba(28,31,58,0.05)] font-black text-lg">
                    <td className="py-3 px-2">TOTAL</td>
                    <td className="py-3 px-2">—</td>
                    <td className="py-3 px-2 text-center">{totalQ}</td>
                    <td className="py-3 px-2 text-center">80</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-6 justify-center pt-4">
            <button
              className="brut-btn px-8 py-4 bg-[#fdfcf9] text-[#1c1f3a] font-mono font-black uppercase tracking-widest hover:-translate-y-1 transition-transform"
              onClick={() => router.push("/dashboard")}
            >
              Cancel
            </button>
            <button 
              className="brut-btn px-8 py-4 bg-[#c0392b] text-white font-mono font-black uppercase tracking-widest hover:-translate-y-1 transition-transform border-[3px] border-[#1c1f3a]"
              onClick={handleStartExam}
              style={{ boxShadow: "4px 6px 0px #1c1f3a" }}
            >
              Begin Examination →
            </button>
          </div>
        </div>
      </div>
      </AppShell>
    )
  }

  // ── PHASE 2: Loading ──────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <AppShell>
      <div className="min-h-screen flex items-center justify-center p-8 bg-[rgba(28,31,58,0.02)]">
        <div className="cardboard-panel max-w-lg w-full text-center pt-4 pb-12 px-12 relative flex flex-col items-center">
          
          {/* Printer slit */}
          <div className="absolute top-0 left-12 right-12 h-6 bg-[#1c1f3a] rounded-b-lg border-b-[4px] border-[rgba(0,0,0,0.3)] z-20" style={{ boxShadow: "inset 0 4px 10px rgba(0,0,0,0.8)" }} />
          
          {/* Printing paper sliding out */}
          <motion.div 
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="exam-paper relative z-10 w-full pt-12 pb-8 px-8 mb-8" 
            style={{ marginTop: "-10px", boxShadow: "0 12px 24px rgba(28,31,58,0.15)" }}
          >
            <div className="font-mono text-[10px] font-black text-[#c0392b] mb-6 uppercase tracking-widest animate-pulse border-b-2 border-dashed border-[#c0392b] pb-2">
              [ PRINTING SECURE DOCUMENT ]
            </div>
            
            {/* Fake text lines animating */}
            <div className="space-y-4 text-left">
              <motion.div animate={{ width: ["0%", "100%"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="h-2 bg-[#1c1f3a] opacity-30" />
              <motion.div animate={{ width: ["0%", "85%"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: 0.2 }} className="h-2 bg-[#1c1f3a] opacity-30" />
              <motion.div animate={{ width: ["0%", "60%"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: 0.4 }} className="h-2 bg-[#1c1f3a] opacity-30" />
            </div>
          </motion.div>
          
          <h2 className="font-serif font-black text-2xl text-[#1c1f3a] uppercase tracking-tight">Authoring Examination</h2>
          <p className="font-mono text-sm text-[#c47c2b] font-bold mt-2">Allocating Questions (30–60s)...</p>
          
          {/* Mechanical gears/loading dots */}
          <div className="flex gap-3 justify-center mt-6">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 rounded-sm border-2 border-[#1c1f3a]"
                style={{ background: i % 2 === 0 ? "#FFD600" : "#00E5FF" }}
              />
            ))}
          </div>
        </div>
      </div>
      </AppShell>
    )
  }

  // ── PHASE 3: Active Exam ──────────────────────────────────────────────────
  if (phase === "active" && paper) {
    const allQuestions: { section: string; q: Question; idx: number }[] = []
    paper.sections.forEach((sec) => {
      sec.questions.forEach((q, idx) => {
        allQuestions.push({ section: sec.name, q, idx })
      })
    })

    return (
      <AppShell>
      <div className="min-h-screen bg-gray-50">
        {/* Top bar - Proctor's Clock */}
        <div className="sticky top-0 z-50 bg-[#1c1f3a] border-b-[4px] border-[#c0392b] p-4 flex justify-between items-center shadow-lg" style={{ boxShadow: "0 4px 12px rgba(28,31,58,0.3)" }}>
          <div className="font-serif font-black text-xl text-white tracking-widest uppercase">
            BOARD EXAM <span className="text-[#c47c2b]">|</span> {paper.subject} <span className="text-[#c47c2b]">|</span> CLASS {paper.class_level}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 bg-black px-4 py-2 rounded-sm border-2 border-[#4A6FA5] shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <div
                className={`text-2xl font-mono font-black tracking-widest ${
                  timeLeft < 15 * 60 ? "text-red-500" : "text-[#00E5FF]"
                }`}
                style={{ textShadow: timeLeft < 15 * 60 ? "0 0 8px rgba(239,68,68,0.8)" : "0 0 8px rgba(0,229,255,0.6)" }}
              >
                {formatTime(timeLeft)}
              </div>
            </div>
            <div className="flex items-center gap-4 border-l-2 border-dashed border-[rgba(255,255,255,0.2)] pl-6">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-mono uppercase text-[#8888A0] font-bold">Progress</span>
                <span className="text-sm font-bold text-white">
                  {answeredCount} / {totalQuestions} <span className="text-[#8888A0]">ANS</span>
                </span>
              </div>
              <button
                className={`brut-btn px-6 py-2 uppercase font-black tracking-widest text-sm ${!canSubmit ? "bg-[#3A3A4E] text-[#8888A0] border-[#1c1f3a] cursor-not-allowed" : "bg-[#c0392b] text-white border-white hover:-translate-y-1"}`}
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{ boxShadow: canSubmit ? "3px 4px 0px white" : "none" }}
              >
                Submit Paper
              </button>
            </div>
          </div>
        </div>

        <div className="flex max-w-[1600px] mx-auto p-6 gap-8">
          {/* Left sidebar - OMR Sheet style */}
          <div className="w-72 flex-shrink-0">
            <div className="cardboard-panel p-6 sticky top-28 h-[calc(100vh-140px)] overflow-y-auto" style={{ borderLeft: "8px solid #4A6FA5" }}>
              <div className="border-b-2 border-dashed border-[#1c1f3a] pb-2 mb-6">
                <h3 className="font-serif font-black text-xl text-[#1c1f3a] uppercase tracking-tighter">OMR Index</h3>
                <p className="font-mono text-[10px] font-bold text-[#c47c2b]">NAVIGATE SECTIONS</p>
              </div>

              <div className="space-y-2 mb-8">
                {paper.sections.map((sec, i) => (
                  <button
                    key={i}
                    className={`w-full text-left px-4 py-3 font-mono font-bold text-sm uppercase transition-all ${
                      currentSection === i 
                        ? "bg-[#1c1f3a] text-white border-2 border-[#1c1f3a] translate-x-2" 
                        : "bg-transparent text-[#1c1f3a] border-2 border-dashed border-[rgba(28,31,58,0.2)] hover:bg-[rgba(28,31,58,0.05)]"
                    }`}
                    onClick={() => setCurrentSection(i)}
                  >
                    {sec.name}
                  </button>
                ))}
              </div>

              <h3 className="font-serif font-black text-sm text-[#1c1f3a] uppercase tracking-tighter mb-4">Question Tracker</h3>
              <div className="grid grid-cols-5 gap-3">
              {allQuestions.map((item, gIdx) => {
                const qKey = `${item.section}-${item.idx}`
                const ans = answers[qKey]
                const status = ans?.marked_for_review
                  ? "bg-yellow-300"
                  : ans?.value.trim()
                  ? "bg-green-300"
                  : "bg-white"
                return (
                  <button
                    key={gIdx}
                    title={item.section}
                    className={`w-10 h-10 rounded-full border-2 font-mono text-sm font-black transition-transform hover:scale-110 ${
                      ans?.marked_for_review
                        ? "border-[#c47c2b] bg-[#c47c2b] text-white"
                        : ans?.value.trim()
                        ? "border-[#1c1f3a] bg-[#1c1f3a] text-white"
                        : "border-[rgba(28,31,58,0.2)] bg-transparent text-[#1c1f3a]"
                    }`}
                    onClick={() => {
                      const secIdx = paper.sections.findIndex((s) => s.name === item.section)
                      setCurrentSection(secIdx)
                    }}
                  >
                    {gIdx + 1}
                  </button>
                )
              })}
            </div>
            </div>
            
            <div className="mt-8 pt-4 border-t-2 border-dashed border-[rgba(28,31,58,0.2)] font-mono text-[10px] font-bold text-[#1c1f3a] space-y-2">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-[#1c1f3a] bg-[#1c1f3a]" /> ANSWERED</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-[#c47c2b] bg-[#c47c2b]" /> REVIEW</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-[rgba(28,31,58,0.2)] bg-transparent" /> PENDING</div>
            </div>
          </div>

          {/* Main content - The Exam Booklet */}
          <div className="flex-1 max-w-4xl">
            {paper.sections.map((sec, secIdx) => {
              if (secIdx !== currentSection) return null
              return (
                <div key={secIdx} className="exam-paper p-10 md:p-14 mb-8 relative">
                  {/* Booklet binding marks */}
                  <div className="absolute top-4 left-6 w-4 h-8 border-l-4 border-r-4 border-gray-400 rounded-sm opacity-50" />
                  <div className="absolute top-4 right-6 w-4 h-8 border-l-4 border-r-4 border-gray-400 rounded-sm opacity-50" />
                  
                  <div className="text-center border-b-4 border-double border-[#1c1f3a] pb-6 mb-8 mt-4">
                    <h2 className="font-serif font-black text-3xl uppercase tracking-tighter text-[#1c1f3a] mb-2">
                      {sec.name}
                    </h2>
                    <p className="font-mono text-sm font-bold text-[#c0392b] italic">{sec.instructions}</p>
                  </div>

                  {sec.questions.map((q, qIdx) => {
                    const qKey = `${sec.name}-${qIdx}`
                    const ans = answers[qKey]

                    return (
                      <div key={qIdx} className="mb-10 pb-8 border-b-2 border-dashed border-[rgba(28,31,58,0.15)]">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <div className="flex items-start gap-3">
                              <span className="font-serif font-black text-xl text-[#1c1f3a] bg-[rgba(28,31,58,0.05)] px-2 py-1 border-2 border-[#1c1f3a]">
                                Q{qIdx + 1}
                              </span>
                              <div className="flex-1 mt-1 font-serif text-lg leading-relaxed text-[#1c1f3a]">
                                {q.type === "assertion_reason" ? (
                                  <div className="space-y-3">
                                    <p><strong>Assertion (A):</strong> {q.assertion}</p>
                                    <p><strong>Reason (R):</strong> {q.reason}</p>
                                  </div>
                                ) : q.type === "case_study" ? (
                                  <div>
                                    <blockquote className="p-6 bg-[#fdfcf9] border-l-4 border-[#c0392b] italic mb-6 font-mono text-sm leading-relaxed shadow-sm">
                                      {q.passage}
                                    </blockquote>
                                    {q.sub_questions?.map((sub: any, subIdx: number) => (
                                      <p key={subIdx} className="mb-3">
                                        <strong className="font-mono bg-[rgba(28,31,58,0.05)] px-1 mr-2">
                                          ({String.fromCharCode(97 + subIdx)}) [{sub.marks}m]
                                        </strong>
                                        {sub.question}
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  <span>{q.question_text}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end ml-6">
                            <span className="font-mono text-sm font-black text-[#c0392b] border-2 border-[#c0392b] px-2 py-1 rounded-sm transform rotate-3">
                              [{q.marks} MARKS]
                            </span>
                          </div>
                        </div>

                        {/* MCQ / AR options */}
                        {(q.type === "mcq" || q.type === "assertion_reason") && q.options && (
                          <div className="ml-12 mt-4 space-y-3 font-serif text-lg">
                            {q.options.map((opt, oIdx) => (
                              <label key={oIdx} className="flex items-center gap-4 cursor-pointer group">
                                <div className={`w-6 h-6 flex items-center justify-center rounded-full border-2 transition-colors ${
                                  ans?.value === String.fromCharCode(65 + oIdx)
                                    ? "border-[#1c1f3a] bg-[#1c1f3a] text-white"
                                    : "border-[rgba(28,31,58,0.3)] group-hover:border-[#1c1f3a]"
                                }`}>
                                  <span className="font-mono text-xs font-bold">{String.fromCharCode(65 + oIdx)}</span>
                                </div>
                                <span className={ans?.value === String.fromCharCode(65 + oIdx) ? "font-bold text-[#1c1f3a]" : "text-[#1c1f3a] opacity-80"}>
                                  {opt}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}

                        {/* Short/long answer text area */}
                        {q.type !== "mcq" && q.type !== "assertion_reason" && q.type !== "case_study" && (
                          <div className="ml-12 mt-6">
                            <div className="font-mono text-xs font-bold text-[#4A6FA5] mb-2 uppercase tracking-widest">Provide Written Answer Below:</div>
                            <textarea
                              className="notebook-ruled w-full p-4 bg-transparent resize-y focus:outline-none focus:ring-2 focus:ring-[#4A6FA5]/20 font-serif text-lg leading-[32px] text-[#1c1f3a]"
                              rows={q.marks >= 5 ? 8 : q.marks >= 3 ? 5 : 3}
                              placeholder="Begin writing here..."
                              value={ans?.value || ""}
                              onChange={(e) => handleAnswerChange(qKey, e.target.value)}
                            />
                          </div>
                        )}

                        {/* Case study sub-answer */}
                        {q.type === "case_study" && (
                          <div className="ml-12 mt-6">
                            <div className="font-mono text-xs font-bold text-[#4A6FA5] mb-2 uppercase tracking-widest">Provide Written Answers (label a,b,c):</div>
                            <textarea
                              className="notebook-ruled w-full p-4 bg-transparent resize-y focus:outline-none focus:ring-2 focus:ring-[#4A6FA5]/20 font-serif text-lg leading-[32px] text-[#1c1f3a]"
                              rows={5}
                              placeholder="Begin writing here..."
                              value={ans?.value || ""}
                              onChange={(e) => handleAnswerChange(qKey, e.target.value)}
                            />
                          </div>
                        )}

                        {/* Mark for review */}
                        <div className="mt-6 ml-12 flex gap-4">
                          <label className="flex items-center gap-3 cursor-pointer group">
                            <div className={`w-5 h-5 flex items-center justify-center border-2 transition-colors ${
                              ans?.marked_for_review ? "border-[#c47c2b] bg-[#c47c2b]" : "border-[rgba(28,31,58,0.3)] group-hover:border-[#c47c2b]"
                            }`}>
                              {ans?.marked_for_review && <span className="text-white text-sm font-bold">✓</span>}
                            </div>
                            <span className="font-mono text-sm font-black uppercase tracking-widest text-[#c47c2b]">
                              FLAG FOR REVIEW
                            </span>
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      </AppShell>
    )
  }

  // ── PHASE 4: Results ──────────────────────────────────────────────────────
  if (phase === "results" && results) {
    return (
      <AppShell>
      <div className="min-h-screen p-8 animate-slide-up">
        <div className="max-w-4xl mx-auto">
          <div className="cardboard-panel p-12 relative overflow-hidden">
            {/* Background watermark */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
              <div className="font-serif font-black text-9xl transform -rotate-45 whitespace-nowrap">
                PREPME AI EXAMINATIONS
              </div>
            </div>

            <div className="text-center border-b-[4px] border-double border-[#1c1f3a] pb-6 mb-8 relative z-10">
              <h1 className="font-serif font-black text-4xl text-[#1c1f3a] uppercase tracking-widest mb-2">
                OFFICIAL TRANSCRIPT
              </h1>
              <p className="font-mono text-sm font-bold text-[#4A6FA5] uppercase tracking-[0.2em]">
                {paper?.subject} • Class {paper?.class_level} • Candidate Report
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-8 mb-12 relative z-10">
              <div className="flex-1 bg-[rgba(255,255,255,0.6)] p-6 border-2 border-dashed border-[#1c1f3a]">
                <h3 className="font-mono text-xs font-black text-[#c47c2b] uppercase tracking-widest mb-4">Total Score</h3>
                <div className="font-serif font-black text-6xl text-[#1c1f3a] mb-2">
                  {results.score} <span className="text-3xl text-[#8888A0]">/ 80</span>
                </div>
                <div className="font-mono text-lg font-bold text-[#4A6FA5]">
                  PERCENTAGE: {results.percentage}%
                </div>
              </div>

              {/* Rubber Stamp Grade */}
              <div className="flex-1 flex items-center justify-center p-6 border-2 border-[#1c1f3a] relative overflow-hidden bg-white">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiAvPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjY2NjIiAvPgo8L3N2Zz4=')] opacity-50" />
                <div className={`transform -rotate-12 border-8 px-8 py-4 ${
                  ['A1', 'A2', 'B1'].includes(results.grade) ? "border-[#2a7d4f] text-[#2a7d4f]" :
                  ['E', 'D'].includes(results.grade) ? "border-[#c0392b] text-[#c0392b]" :
                  "border-[#c47c2b] text-[#c47c2b]"
                }`} style={{ boxShadow: "0 0 0 4px #fdfcf9 inset" }}>
                  <div className="font-mono text-sm font-black tracking-widest text-center mb-1">
                    FINAL GRADE
                  </div>
                  <div className="font-serif font-black text-7xl text-center leading-none">
                    {results.grade}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10">
              <h2 className="font-serif font-black text-xl mb-4 text-[#1c1f3a] uppercase tracking-tighter border-b-2 border-[#1c1f3a] pb-2">
                Section-wise Breakdown
              </h2>
              <table className="w-full border-collapse font-mono text-sm text-[#1c1f3a] bg-[rgba(255,255,255,0.4)]">
                <thead>
                  <tr className="border-b-2 border-[#1c1f3a]">
                    <th className="text-left py-3 px-4">SECTION</th>
                    <th className="text-center py-3 px-4">ATTEMPTED</th>
                    <th className="text-center py-3 px-4">CORRECT</th>
                    <th className="text-center py-3 px-4">MARKS</th>
                    <th className="text-center py-3 px-4">MAX</th>
                  </tr>
                </thead>
                <tbody>
                  {results.sections.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-dashed border-[rgba(28,31,58,0.2)] hover:bg-[rgba(28,31,58,0.05)]">
                      <td className="py-3 px-4 font-bold">{s.name}</td>
                      <td className="py-3 px-4 text-center">{s.attempted}</td>
                      <td className="py-3 px-4 text-center">{s.correct}</td>
                      <td className="py-3 px-4 text-center font-bold text-[#4A6FA5]">{s.marksObtained}</td>
                      <td className="py-3 px-4 text-center text-[#8888A0]">{s.maxMarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Signatures */}
            <div className="mt-12 pt-8 border-t-[4px] border-double border-[#1c1f3a] flex justify-between px-8 relative z-10">
              <div className="text-center">
                <div className="font-serif italic text-2xl text-[#1c1f3a] opacity-80 mb-2">PrepMe AI System</div>
                <div className="w-48 border-t border-[#1c1f3a] font-mono text-[10px] uppercase tracking-widest pt-1">Authorized Signature</div>
              </div>
              <div className="text-center">
                <div className="font-serif italic text-2xl text-[#1c1f3a] opacity-80 mb-2">{new Date().toLocaleDateString()}</div>
                <div className="w-48 border-t border-[#1c1f3a] font-mono text-[10px] uppercase tracking-widest pt-1">Date of Examination</div>
              </div>
            </div>

            <div className="flex gap-6 justify-center mt-12 relative z-10">
              <button
                className="brut-btn px-6 py-4 bg-[#fdfcf9] text-[#1c1f3a] font-mono font-black uppercase tracking-widest hover:-translate-y-1 transition-transform border-[2px] border-[#1c1f3a]"
                onClick={() => {
                  const text = `CBSE Mock Exam Results\nSubject: ${paper?.subject}\nClass: ${paper?.class_level}\n\nScore: ${results.score}/80\nPercentage: ${results.percentage}%\nGrade: ${results.grade}\n\nSection Breakdown:\n${results.sections
                    .map((s: any) => `${s.name}: ${s.marksObtained}/${s.maxMarks}`)
                    .join("\n")}`
                  const blob = new Blob([text], { type: "text/plain" })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = `exam-result-${Date.now()}.txt`
                  a.click()
                }}
              >
                🖨️ Print Record
              </button>
              <button
                className="brut-btn px-6 py-4 bg-[#c0392b] text-white font-mono font-black uppercase tracking-widest hover:-translate-y-1 transition-transform border-[3px] border-[#1c1f3a]"
                style={{ boxShadow: "4px 6px 0px #1c1f3a" }}
                onClick={() => router.push("/dashboard")}
              >
                Return to Dashboard →
              </button>
            </div>
          </div>
        </div>
      </div>
      </AppShell>
    )
  }

  return null
}
