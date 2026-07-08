"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { Calendar, Play, RefreshCw, AlertTriangle, Flame, Clock } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
interface PlanSessionGoal {
  text: string;
  done: boolean;
}
interface PlanSession {
  id: string; topic: string; date: string
  duration_minutes: number; session_type: string
  micro_goals: PlanSessionGoal[]; completed: boolean
  priority_score: number; mastery_at_schedule_time: number
}
interface PlanResponse {
  sessions: PlanSession[]; exam_countdown: boolean; days_remaining: number
}
interface StudyNow {
  topic: string; session_type: string; duration_minutes: number
  mastery: number; micro_goals: any[]; exam_countdown: boolean
}

// ── Chip colors ────────────────────────────────────────────────────────────────
const CHIP: Record<string, { bg: string; border: string; label: string; dot: string; rotate: string }> = {
  study:    { bg: "bg-[#facc15]", border: "border-[#1c1f3a]", label: "STUDY",    dot: "bg-[#1c1f3a]", rotate: "rotate-[-1deg]" },
  practice: { bg: "bg-[#ec4899]", border: "border-[#1c1f3a]", label: "PRACTICE", dot: "bg-[#1c1f3a]", rotate: "rotate-[2deg]" },
  revision: { bg: "bg-[#f97316]", border: "border-[#1c1f3a]", label: "REVISION", dot: "bg-[#1c1f3a]", rotate: "rotate-[-3deg]" },
  mock:     { bg: "bg-[#4ade80]", border: "border-[#1c1f3a]", label: "MOCK",     dot: "bg-[#1c1f3a]", rotate: "rotate-[1deg]" },
  break:    { bg: "bg-[#e5e7eb]", border: "border-[#1c1f3a]", label: "BREAK",    dot: "bg-[#1c1f3a]", rotate: "rotate-[0deg]" },
}

// ── Week helpers ───────────────────────────────────────────────────────────────
function getMonday(d: Date): Date {
  const day = d.getDay(), diff = (day === 0 ? -6 : 1 - day)
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0,0,0,0)
  return m
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── Session chip ───────────────────────────────────────────────────────────────
function SessionChip({ s, onClick }: { s: PlanSession; onClick: () => void }) {
  const c = CHIP[s.session_type] ?? CHIP.study
  return (
    <button onClick={onClick}
      className={cn(
        "sticky-note w-full text-left p-2 text-[10px] font-bold font-mono uppercase tracking-wider mb-3",
        c.bg, c.border, c.rotate,
        s.completed ? "opacity-60 grayscale-[0.3]" : ""
      )}>
      <div className="flex items-center gap-1.5 mb-1 border-b border-[#1c1f3a]/20 pb-1">
        <span className={cn("w-2 h-2 flex-shrink-0 border border-[#1c1f3a] rounded-full", c.dot)} />
        <span className="text-[#1c1f3a]">{c.label}</span>
      </div>
      <p className="truncate text-[#1c1f3a] normal-case font-serif font-bold text-sm leading-tight mt-1" style={{ whiteSpace: "normal", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {s.topic.split(":")[0].trim()}
      </p>
      <div className="flex justify-between items-center mt-2 pt-1 border-t border-[#1c1f3a]/20">
        <span className="text-[#1c1f3a]/70 font-mono font-bold text-[9px]"><Clock className="w-2.5 h-2.5 inline mr-1 -mt-0.5"/>{s.duration_minutes}m</span>
      </div>
      {s.completed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-full h-1 bg-[#1c1f3a] transform -rotate-12 absolute" />
          <div className="w-full h-1 bg-[#1c1f3a] transform rotate-12 absolute" />
        </div>
      )}
    </button>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────────
function DetailPanel({ session, onClose, onComplete, onToggleGoal }: {
  session: PlanSession; onClose: () => void
  onComplete: (id: string, topic: string) => Promise<void>
  onToggleGoal: (sessionId: string, goalIndex: number, done: boolean) => Promise<void>
}) {
  const router = useRouter()
  const [completing, setCompleting] = useState(false)
  const c = CHIP[session.session_type] ?? CHIP.study

  const goals = Array.isArray(session.micro_goals) ? session.micro_goals.map((g: any) => {
    if (typeof g === 'string') {
      return { text: g, done: false };
    }
    return { text: g.text || "", done: !!g.done };
  }) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-[420px] max-w-full index-card animate-slide-up"
        onClick={e => e.stopPropagation()}>
        {/* Header Tab */}
        <div className="absolute -top-10 left-4 bg-[#fdfcf9] border-t border-l border-r border-[#1c1f3a] px-6 py-2 rounded-t-lg z-[-1] flex items-center gap-2">
          <span className={cn("w-3 h-3 border border-[#1c1f3a]", c.bg)} />
          <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#1c1f3a]">{c.label}</span>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex justify-between items-start border-b-2 border-dashed border-[#1c1f3a] pb-4">
            <div>
              <p className="font-serif font-black text-2xl text-[#1c1f3a] leading-tight">{session.topic}</p>
              <p className="font-mono text-xs text-[rgba(28,31,58,0.6)] mt-2 uppercase tracking-wider font-bold">
                {new Date(session.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
                &nbsp;·&nbsp;{session.duration_minutes}min
              </p>
            </div>
            <button onClick={onClose} className="text-[#1c1f3a] font-mono text-xl font-black hover:text-[#c0392b]">&times;</button>
          </div>

          {/* Mastery bar */}
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-2">Mastery at scheduling</p>
            <div className="h-3 w-full border-2 border-[#1c1f3a] bg-transparent overflow-hidden">
              <div className="h-full bg-repeating-stripes" style={{
                width: `${session.mastery_at_schedule_time * 100}%`,
                backgroundColor: session.mastery_at_schedule_time < 0.5 ? "#1c1f3a" : session.mastery_at_schedule_time < 0.7 ? "#c47c2b" : "#2a7d4f"
              }} />
            </div>
            <p className="font-mono text-[10px] text-[rgba(28,31,58,0.6)] font-bold mt-1 text-right">
              {(session.mastery_at_schedule_time * 100).toFixed(0)}%
            </p>
          </div>

          {/* Micro-goals */}
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-4">Task Checklist</p>
            <div className="space-y-4">
              {goals.length === 0 ? (
                <p className="text-xs text-[rgba(28,31,58,0.6)] font-mono italic">No tasks listed.</p>
              ) : (
                goals.map((g, i) => (
                  <label key={i} className="flex items-start gap-4 cursor-pointer select-none group/goal relative">
                    <div className="relative mt-1">
                      <input
                        type="checkbox"
                        checked={g.done}
                        onChange={(e) => onToggleGoal(session.id, i, e.target.checked)}
                        className="opacity-0 absolute inset-0 cursor-pointer"
                      />
                      <div className="w-5 h-5 border-2 border-[#1c1f3a] bg-transparent flex items-center justify-center transition-colors group-hover/goal:bg-[rgba(28,31,58,0.05)]">
                        {g.done && <span className="text-[#c0392b] red-pen text-xl absolute -top-2 -left-1">X</span>}
                      </div>
                    </div>
                    <span className={cn(
                      "text-sm text-[#1c1f3a] font-serif transition-all font-bold",
                      g.done && "opacity-50 line-through decoration-2 decoration-[#c0392b]"
                    )}>
                      {g.text}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-6 border-t-2 border-dashed border-[#1c1f3a] flex gap-3 flex-wrap">
            <button
              onClick={() => router.push(`/quiz?topic=${encodeURIComponent(session.topic)}`)}
              className="flex-1 font-mono font-black text-xs text-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-3 uppercase tracking-widest hover:bg-[#1c1f3a] hover:text-[#fdfcf9] transition-colors rounded-none shadow-[2px_2px_0_rgba(28,31,58,0.15)]">
              Quiz &rarr;
            </button>
            <button
              onClick={() => router.push(`/tutor?topic=${encodeURIComponent(session.topic)}`)}
              className="flex-1 font-mono font-black text-xs text-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-3 uppercase tracking-widest hover:bg-[rgba(28,31,58,0.05)] transition-colors rounded-none shadow-[2px_2px_0_rgba(28,31,58,0.15)]">
              Tutor &rarr;
            </button>
            {!session.completed && (
              <button
                disabled={completing}
                onClick={async () => {
                  setCompleting(true)
                  await onComplete(session.id, session.topic)
                  setCompleting(false)
                  onClose()
                }}
                className="w-full font-mono font-black text-sm text-[#fdfcf9] bg-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-4 uppercase tracking-widest hover:bg-[#c0392b] hover:border-[#c0392b] transition-colors rounded-none shadow-[4px_4px_0_rgba(28,31,58,0.15)] mt-2">
                {completing ? "Saving..." : "STAMP COMPLETED"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Study Now modal ────────────────────────────────────────────────────────────
function StudyNowModal({ data, onClose }: { data: StudyNow; onClose: () => void }) {
  const router = useRouter()
  const c = CHIP[data.session_type] ?? CHIP.study
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-[420px] max-w-full index-card animate-slide-up relative"
        onClick={e => e.stopPropagation()}>
        
        {/* Header Tab */}
        <div className="absolute -top-10 left-4 bg-[#fdfcf9] border-t border-l border-r border-[#1c1f3a] px-6 py-2 rounded-t-lg z-[-1] flex items-center gap-2">
          <span className={cn("w-3 h-3 border border-[#1c1f3a]", c.bg)} />
          <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#1c1f3a]">{c.label}</span>
        </div>

        <div className="p-8 space-y-6">
          <div className="border-b-2 border-dashed border-[#1c1f3a] pb-4 relative">
            <button onClick={onClose} className="absolute top-0 right-0 text-[#1c1f3a] font-mono text-xl font-black hover:text-[#c0392b]">&times;</button>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#c0392b] mb-1">Up Next</p>
            <p className="font-serif font-black text-2xl text-[#1c1f3a] leading-tight pr-6">{data.topic}</p>
            <p className="font-mono text-xs text-[rgba(28,31,58,0.6)] mt-2 uppercase tracking-wider font-bold">
              Duration: {data.duration_minutes}min
            </p>
          </div>
          
          <div className="pt-2 flex gap-3 flex-wrap">
            <button onClick={() => router.push(`/quiz?topic=${encodeURIComponent(data.topic)}`)}
              className="flex-1 font-mono font-black text-xs text-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-3 uppercase tracking-widest hover:bg-[#1c1f3a] hover:text-[#fdfcf9] transition-colors rounded-none shadow-[2px_2px_0_rgba(28,31,58,0.15)]">
              Start Quiz &rarr;
            </button>
            <button onClick={() => { onClose(); router.push("/planner") }}
              className="flex-1 font-mono font-black text-xs text-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-3 uppercase tracking-widest hover:bg-[rgba(28,31,58,0.05)] transition-colors rounded-none shadow-[2px_2px_0_rgba(28,31,58,0.15)]">
              Open Planner
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Planner Page ──────────────────────────────────────────────────────────
export default function PlannerPage() {
  const { profile, authFetch, refreshProfile, subjectVersion } = useAuth()
  const [selectedSubject, setSelectedSubject] = useState(profile?.subject ?? "science")
  const [plan, setPlan]           = useState<PlanResponse | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState("")
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()))
  const [filter, setFilter]       = useState("all")
  const [selected, setSelected]   = useState<PlanSession | null>(null)
  const [studyNow, setStudyNow]   = useState<StudyNow | null>(null)
  const [regenerating, setRegen]  = useState(false)
  const [burnoutWarnings, setBurnoutWarnings] = useState<any[]>([])
  const [dismissedWarnings, setDismissedWarnings] = useState<string[]>([])

  const toApiSubject = (s: string) => {
    if (s === "Social Studies" || s === "social") return "social"
    if (s === "Mathematics" || s === "mathematics" || s === "maths") return "mathematics"
    if (s === "English" || s === "english") return "english"
    return "science"
  }

  useEffect(() => {
    setSelectedSubject(profile?.subject ?? "science")
  }, [profile?.subject])

  const apiSubject = toApiSubject(selectedSubject)

  const fetchPlan = useCallback(async () => {
    setLoading(true); setError("")
    setPlan(null)
    try {
      const res = await authFetch(`/api/planner/?subject=${apiSubject}`)
      if (!res.ok) throw new Error("Failed to load plan")
      setPlan(await res.json())
    } catch {
      setError("Unable to load plan. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [authFetch, apiSubject])

  const fetchBurnoutCheck = useCallback(async () => {
    try {
      const res = await authFetch("/api/planner/burnout-check")
      if (res.ok) {
        const data = await res.json()
        if (data.has_warning) {
          setBurnoutWarnings(data.warnings)
        } else {
          setBurnoutWarnings([])
        }
      }
    } catch (err) {
      console.error("Failed to fetch burnout check:", err)
    }
  }, [authFetch])

  useEffect(() => {
    fetchPlan()
    fetchBurnoutCheck()
  }, [fetchPlan, fetchBurnoutCheck, selectedSubject, subjectVersion])

  useEffect(() => {
    const handleFocus = () => {
      refreshProfile()
      fetchPlan()
      fetchBurnoutCheck()
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [fetchPlan, fetchBurnoutCheck, refreshProfile])

  const handleToggleGoal = async (sessionId: string, goalIndex: number, done: boolean) => {
    try {
      const res = await authFetch(`/api/planner/session/${sessionId}/goals`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ goal_index: goalIndex, done })
      })
      if (res.ok) {
        const updatedSession = await res.json()
        setPlan(p => p ? {
          ...p,
          sessions: p.sessions.map(s => s.id === sessionId ? {
            ...s,
            micro_goals: updatedSession.micro_goals
          } : s)
        } : p)
        if (selected && selected.id === sessionId) {
          setSelected(prev => prev ? {
            ...prev,
            micro_goals: updatedSession.micro_goals
          } : null)
        }
      }
    } catch (err) {
      console.error("Failed to toggle goal:", err)
    }
  }

  const handleComplete = async (id: string, topic: string) => {
    await authFetch("/api/planner/complete-session", {
      method: "POST",
      body: JSON.stringify({ session_id: id, topic, subject: apiSubject }),
    })
    // Optimistically mark done, then re-fetch so session_type reflects updated mastery
    setPlan(p => p ? {
      ...p,
      sessions: p.sessions.map(s => s.id === id ? { ...s, completed: true } : s)
    } : p)
    await refreshProfile()
    fetchPlan()
  }

  const handleStudyNow = async () => {
    const res = await authFetch("/api/planner/study-now")
    if (res.ok) setStudyNow(await res.json())
  }

  const handleRegenerate = async () => {
    setRegen(true)
    const res = await authFetch("/api/planner/regenerate", { method: "POST" })
    if (res.ok) setPlan(await res.json())
    setRegen(false)
  }

  // Build week days
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Filter sessions
  const filtered = (plan?.sessions ?? []).filter(s =>
    filter === "all" || s.session_type === filter
  )

  // Sessions by date
  const byDate: Record<string, PlanSession[]> = {}
  filtered.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  })

  // Stats for this week
  const weekSessions = filtered.filter(s => {
    const d = s.date
    return d >= isoDate(weekStart) && d <= isoDate(addDays(weekStart, 6))
  })
  const completedToday = filtered.filter(s => s.date === isoDate(new Date()) && s.completed).length
  const hoursPlanned   = weekSessions.reduce((a, s) => a + s.duration_minutes, 0) / 60
  const weakest = (() => {
    const mastery = profile?.mastery
    if (!mastery || Object.keys(mastery).length === 0) return "—"
    let minTopic = "—"
    let minScore = 2
    for (const [topic, info] of Object.entries(mastery)) {
      if (info.score < minScore) {
        minScore = info.score
        minTopic = topic
      }
    }
    return minTopic
  })()

  // Burnout detection
  const burnoutDays = weekDays.filter(d => {
    const mins = (byDate[isoDate(d)] ?? []).reduce((a, s) => a + s.duration_minutes, 0)
    return mins >= 240
  }).length
  const burnoutWarning = burnoutDays >= 5

  return (
    <AppShell>
      <div className="space-y-5">

        <div className="flex gap-1.5 flex-wrap">
          {(["Science", "Mathematics", "Social Studies", "English"] as const).map((label) => (
            <button
              key={label}
              onClick={() => setSelectedSubject(label)}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider font-mono border transition-colors",
                toApiSubject(selectedSubject) === toApiSubject(label)
                  ? "bg-[#4A6FA5] text-white border-[#4A6FA5]"
                  : "border-[rgba(28,31,58,0.10)] text-[rgba(28,31,58,0.40)] hover:border-[rgba(28,31,58,0.30)] hover:text-[#1c1f3a]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Exam countdown banner */}
        {plan?.exam_countdown && (
          <div className="border-2 border-[#4A6FA5] bg-[#4A6FA5]/5 px-5 py-3 flex items-center gap-3">
            <Flame className="w-6 h-6 text-[#4A6FA5]" />
            <p className="font-mono text-xs font-bold text-[#4A6FA5] uppercase tracking-wider">
              EXAM IN {plan.days_remaining} DAYS — Revision mode active. Only revision and mock sessions scheduled.
            </p>
          </div>
        )}

        {/* Burnout warning */}
        {burnoutWarning && (
          <div className="urgent-memo px-5 py-4 pl-10 animate-slide-up">
            <p className="font-serif text-lg font-black text-[#c0392b] mb-1 leading-none">URGENT MEMO:</p>
            <p className="font-mono text-sm text-[#1c1f3a] font-bold">
              Heavy study week detected. A break day has been added automatically. Avoid fatigue.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between animate-slide-right">
          <div>
            <p className="section-label pink mb-1.5 animate-[slide-right_0.5s_ease-out_0.1s_both] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Schedule
            </p>
            <h1 className="font-serif font-black text-[2.2rem] text-[#1c1f3a] leading-none animate-[slide-right_0.5s_ease-out_0.2s_both]">Study Planner</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={handleStudyNow}
              className="brut-btn brut-btn-pink px-4 py-2 text-xs flex items-center gap-1.5 font-bold">
              <Play className="w-3 h-3 fill-current" /> Study Now
            </button>
            <button onClick={handleRegenerate} disabled={regenerating}
              className="brut-btn brut-btn-outline px-4 py-2 text-xs flex items-center gap-1.5 font-bold">
              <RefreshCw className={cn("w-3.5 h-3.5", regenerating && "animate-spin")} /> {regenerating ? "Rebuilding…" : "Regenerate"}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "This week", value: weekSessions.length, unit: "sessions", small: false },
            { label: "Completed today", value: completedToday, unit: "", small: false },
            { label: "Hours planned", value: hoursPlanned.toFixed(1), unit: "hrs", small: false },
            { label: "Weakest topic", value: weakest ?? "—", unit: "", small: true },
          ].map((s, i) => (
            <div key={s.label} className="library-card px-4 py-3 pb-8 relative" style={{ animationDelay: `${0.1 * i}s` }}>
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-[radial-gradient(circle_at_30%_30%,#e5e7eb,#9ca3af)] rounded-full shadow-[1px_2px_2px_rgba(0,0,0,0.3)] z-10" />
              <p className="font-mono text-[9px] text-[#1c1f3a]/60 uppercase tracking-widest mb-2 mt-2 border-b border-[#1c1f3a]/20 pb-1 font-bold">{s.label}</p>
              {s.small ? (
                <p className="font-serif text-sm font-black text-[#c0392b] leading-snug break-words uppercase">{s.value}</p>
              ) : (
                <p className="font-serif text-2xl font-black text-[#1c1f3a] leading-none">
                  {s.value}<span className="font-mono text-xs font-normal text-[rgba(28,31,58,0.6)] ml-1">{s.unit}</span>
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5">
          {["all","study","practice","revision","mock","break"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider font-mono border transition-colors",
                filter === f
                  ? "bg-[#4A6FA5] text-white border-[#4A6FA5]"
                  : "border-[rgba(28,31,58,0.10)] text-[rgba(28,31,58,0.40)] hover:border-[rgba(28,31,58,0.30)] hover:text-[#1c1f3a]"
              )}>
              {f}
            </button>
          ))}
        </div>

        {/* Burnout Check Warning Cards */}
        {burnoutWarnings
          .filter(w => !dismissedWarnings.includes(w.type))
          .map(w => {
            let bg = "#fcfaf8"
            if (w.type === "overstudy") bg = "#e8f0fe"
            else if (w.type === "monotony") bg = "#fff4d4"
            else if (w.type === "fatigue") bg = "#ffe8d6"

            return (
              <div
                key={w.type}
                className="border border-[rgba(28,31,58,0.14)] p-4 flex justify-between items-start transition-all"
                style={{ backgroundColor: bg, borderRadius: 0, color: "#1A1A1A" }}
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#1A1A1A]" />
                  <p className="font-mono text-xs font-bold uppercase tracking-wide leading-normal text-[#1A1A1A]">
                    {w.message}
                  </p>
                </div>
                <button
                  onClick={() => setDismissedWarnings(prev => [...prev, w.type])}
                  className="font-mono text-sm font-bold ml-4 hover:opacity-75 focus:outline-none"
                  style={{ color: "#1A1A1A" }}
                >
                  ✕
                </button>
              </div>
            )
          })}

        {/* Week navigation */}
        <div className="flex items-center justify-between">
          <button onClick={() => setWeekStart(d => addDays(d, -7))}
            className="font-mono text-xs text-[rgba(28,31,58,0.40)] hover:text-[#1c1f3a] uppercase tracking-wider">
            ← Prev Week
          </button>
          <p className="font-mono text-xs text-[rgba(28,31,58,0.40)] uppercase tracking-wider">
            {weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            &nbsp;–&nbsp;
            {addDays(weekStart, 6).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
          <button onClick={() => setWeekStart(d => addDays(d, 7))}
            className="font-mono text-xs text-[rgba(28,31,58,0.40)] hover:text-[#1c1f3a] uppercase tracking-wider">
            Next Week →
          </button>
        </div>

        {/* Calendar grid */}
        {loading ? (
          <p className="font-mono text-xs text-[#666680]">Loading plan...</p>
        ) : error ? (
          <div className="urgent-memo px-4 py-3 pl-10">
            <p className="font-serif text-lg font-black text-[#c0392b]">{error}</p>
            <button onClick={fetchPlan} className="font-mono text-[10px] text-[#1c1f3a] font-bold underline mt-1">Retry</button>
          </div>
        ) : (
          <div className="desk-planner" style={{ animationDelay: "0.4s" }}>
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b-2 border-[#1c1f3a] bg-[#1c1f3a] text-[#fdfcf9]">
              {weekDays.map((d, index) => {
                const isToday = isoDate(d) === isoDate(new Date())
                return (
                  <div key={isoDate(d)}
                    className={cn(
                      "px-2 py-3 border-r-2 border-[#1c1f3a] last:border-r-0 text-center relative",
                      isToday ? "bg-[#c0392b]" : "",
                      index === 0 ? "pl-8" : "" // Extra padding for left spine
                    )}>
                    <p className="font-mono text-[10px] text-[rgba(253,252,249,0.7)] uppercase tracking-wider font-bold">
                      {d.toLocaleDateString("en-IN", { weekday: "short" })}
                    </p>
                    <p className={cn("font-serif text-2xl font-black mt-1", isToday ? "text-[#fdfcf9]" : "text-[#fdfcf9]")}>
                      {d.getDate()}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Session chips */}
            <div className="grid grid-cols-7 min-h-[300px]">
              {weekDays.map((d, index) => {
                const key = isoDate(d)
                const daySessions = byDate[key] ?? []
                return (
                  <div key={key}
                    className={cn(
                      "border-r-2 border-[#1c1f3a] last:border-r-0 p-2 min-h-[300px] align-top relative",
                      index === 0 ? "pl-8" : "" // Extra padding after spine
                    )}
                    style={{ backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, rgba(28,31,58,0.1) 31px, rgba(28,31,58,0.1) 32px)', backgroundPositionY: '12px' }}>
                    {daySessions.length === 0 ? (
                      <p className="font-mono text-[10px] text-[rgba(28,31,58,0.30)] text-center mt-6 italic font-bold">Free day</p>
                    ) : (
                      daySessions.map(s => (
                        <SessionChip key={s.id} s={s} onClick={() => setSelected(s)} />
                      ))
                    )}
                  </div>
                )
              })}
            </div>

            {/* Empty week message */}
            {weekSessions.length === 0 && !loading && (
              <div className="col-span-7 py-6 text-center border-t border-[rgba(28,31,58,0.10)]">
                <p className="font-mono text-xs text-[#666680]">No sessions scheduled this week</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          session={selected}
          onClose={() => setSelected(null)}
          onComplete={handleComplete}
          onToggleGoal={handleToggleGoal}
        />
      )}

      {/* Study Now modal */}
      {studyNow && (
        <StudyNowModal data={studyNow} onClose={() => setStudyNow(null)} />
      )}
    </AppShell>
  )
}
