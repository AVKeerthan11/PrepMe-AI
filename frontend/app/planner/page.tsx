"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { Calendar, Play, RefreshCw, AlertTriangle, Flame, Clock, CheckCircle2 } from "lucide-react"

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
  subject?: string; subject_key?: string; chapter?: string; hour_start?: number | null; status?: string
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

const VIEW_SUBJECTS = [
  { id: "all", label: "All" },
  { id: "science", label: "Science" },
  { id: "maths", label: "Mathematics" },
  { id: "social", label: "Social Studies" },
  { id: "english", label: "English" },
] as const

const SUBJECT_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  science: { bg: "rgba(74,111,165,0.12)", text: "#4A6FA5", border: "rgba(74,111,165,0.25)" },
  maths: { bg: "rgba(29,53,87,0.10)", text: "#1d3557", border: "rgba(29,53,87,0.25)" },
  social: { bg: "rgba(224,123,57,0.12)", text: "#e07b39", border: "rgba(224,123,57,0.25)" },
  english: { bg: "rgba(94,43,151,0.12)", text: "#5e2b97", border: "rgba(94,43,151,0.25)" },
  all: { bg: "rgba(28,31,58,0.08)", text: "#1c1f3a", border: "rgba(28,31,58,0.18)" },
}

const CHAPTERS_BY_SUBJECT: Record<string, string[]> = {
  science: [
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
  ],
  maths: [
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
  ],
  social: [
    "Natural Resources and Their Conservation",
    "Reshaping India's Political Map",
    "The Rise of the Marathas",
    "The Colonial Era in India",
    "Universal Franchise and India's Electoral System",
    "The Parliamentary System: Legislature and Executive",
    "Factors of Production",
  ],
  english: [
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
  ],
}

const TIME_PREFS = [
  { id: "morning", label: "Morning (6am-9am)", hours: [6, 7, 8] },
  { id: "afternoon", label: "Afternoon (12pm-3pm)", hours: [12, 13, 14] },
  { id: "evening", label: "Evening (5pm-8pm)", hours: [17, 18, 19] },
  { id: "night", label: "Night (8pm-11pm)", hours: [20, 21, 22] },
] as const

const MASTERED_THRESHOLD = 0.6

function getSubjectKey(session: PlanSession): string {
  if (session.subject_key) return session.subject_key
  const raw = (session.subject || "").toLowerCase()
  if (raw.includes("math")) return "maths"
  if (raw.includes("social")) return "social"
  if (raw.includes("english")) return "english"
  if (raw.includes("science")) return "science"
  return "science"
}

function getSubjectLabel(subjectKey: string): string {
  return VIEW_SUBJECTS.find((item) => item.id === subjectKey)?.label ?? "Science"
}

function getSessionChapter(session: PlanSession): string {
  return session.chapter || session.topic
}

function getDisplayStatus(session: PlanSession): "pending" | "done" | "missed" {
  if (session.status === "done" || session.completed) return "done"
  if ((session.status || "pending") === "pending" && session.date < isoDate(new Date())) return "missed"
  return "pending"
}

function formatHour(hourStart?: number | null): string {
  if (hourStart === undefined || hourStart === null) return ""
  const period = hourStart >= 12 ? "PM" : "AM"
  const hour = ((hourStart + 11) % 12) + 1
  return `${hour}${period}`
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
function SessionChip({
  s,
  onClick,
  onComplete,
  onDelete,
  confirmDeleteId,
  setConfirmDeleteId,
}: {
  s: PlanSession
  onClick: () => void
  onComplete: (session: PlanSession) => Promise<void>
  onDelete: (session: PlanSession) => Promise<void>
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
}) {
  const c = CHIP[s.session_type] ?? CHIP.study
  const displayStatus = getDisplayStatus(s)
  const subjectKey = getSubjectKey(s)
  const badge = SUBJECT_BADGES[subjectKey] ?? SUBJECT_BADGES.science
  // CHANGE 2: Bright green styling for done status
  const statusStyles =
    displayStatus === "done"
      ? { borderColor: "#00c853", bgColor: "rgba(0, 200, 83, 0.12)", label: "Done", color: "#00c853" }
      : displayStatus === "missed"
        ? { borderColor: "#c0392b", bgColor: "transparent", label: "Rescheduled", color: "#c0392b" }
        : { borderColor: "rgba(28,31,58,0.35)", bgColor: "transparent", label: "Pending", color: "rgba(28,31,58,0.55)" }

  return (
    <div onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick()
      }}
      className={cn(
        "sticky-note relative w-full text-left p-2 text-[10px] font-bold font-mono uppercase tracking-wider mb-3",
        c.bg, c.border, c.rotate,
        s.completed ? "opacity-60 grayscale-[0.3]" : ""
      )}
      style={{ 
        borderColor: statusStyles.borderColor,
        borderWidth: displayStatus === "done" ? "3px" : undefined,
        backgroundColor: statusStyles.bgColor 
      }}>
      <div className="flex items-center gap-1.5 mb-1 border-b border-[#1c1f3a]/20 pb-1">
        <span className={cn("w-2 h-2 flex-shrink-0 border border-[#1c1f3a] rounded-full", c.dot)} />
        <span className="text-[#1c1f3a]">{c.label}</span>
        <span
          className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest border"
          style={{ borderColor: badge.border, backgroundColor: badge.bg, color: badge.text }}
        >
          {getSubjectLabel(subjectKey)}
        </span>
        {/* ADDITION 1: Session type badge */}
        
      </div>
      <p className="truncate text-[#1c1f3a] normal-case font-serif font-bold text-sm leading-tight mt-1" style={{ whiteSpace: "normal", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {getSessionChapter(s).split(":")[0].trim()}
      </p>
      <div className="flex justify-between items-center mt-2 pt-1 border-t border-[#1c1f3a]/20">
        <span className="text-[#1c1f3a]/70 font-mono font-bold text-[9px]"><Clock className="w-2.5 h-2.5 inline mr-1 -mt-0.5"/>{s.duration_minutes}m{formatHour(s.hour_start) ? ` • ${formatHour(s.hour_start)}` : ""}</span>
        <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: statusStyles.color }}>
          {statusStyles.label}
        </span>
      </div>
      {displayStatus === "pending" && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            void onComplete(s)
          }}
          className="mt-2 w-full border border-[#1c1f3a] bg-[#fdfcf9] px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#1c1f3a] hover:bg-[#1c1f3a] hover:text-[#fdfcf9] transition-colors"
        >
          Mark Complete
        </button>
      )}
      {s.completed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-full h-1 bg-[#1c1f3a] transform -rotate-12 absolute" />
          <div className="w-full h-1 bg-[#1c1f3a] transform rotate-12 absolute" />
        </div>
      )}
      {displayStatus === "missed" && (
        <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest bg-[#fff2f2] text-[#c0392b] border border-[#c0392b]">
          Rescheduled
        </span>
      )}
      {displayStatus === "done" && (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-widest bg-[#eef9f1] border border-[#00c853]" style={{ color: "#00c853", fontWeight: "bold" }}>
          <CheckCircle2 className="w-2.5 h-2.5" /> Done
        </span>
      )}
      {/* CHANGE 3: Delete button with inline confirmation */}
      {confirmDeleteId !== s.id && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setConfirmDeleteId(s.id)
          }}
          className="absolute top-2 left-2 w-4 h-4 flex items-center justify-center text-[#c0392b] hover:bg-[#c0392b] hover:text-white border border-[#c0392b] text-xs font-bold transition-colors"
          title="Delete session"
        >
          ×
        </button>
      )}
      {confirmDeleteId === s.id && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#c0392b" }}>Delete this session?</span>
          <button
            onClick={async (event) => {
              event.stopPropagation()
              await onDelete(s)
              setConfirmDeleteId(null)
            }}
            style={{ background: "#c0392b", color: "#fff", border: "none", padding: "3px 10px", fontFamily: "monospace", fontSize: 11, cursor: "pointer", fontWeight: "bold" }}
          >
            Yes, Delete
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation()
              setConfirmDeleteId(null)
            }}
            style={{ background: "transparent", color: "#666", border: "1px solid #ccc", padding: "3px 10px", fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
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
  const [selectedSubject, setSelectedSubject] = useState<string>("all")
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
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [planSubject, setPlanSubject] = useState("science")
  const [planSessionType, setPlanSessionType] = useState("study")
  const [planChapter, setPlanChapter] = useState("")
  const [planDuration, setPlanDuration] = useState(45)
  const [preferredSlots, setPreferredSlots] = useState<string[]>(["evening"])
  const [planDays, setPlanDays] = useState(3)
  const [planError, setPlanError] = useState("")
  const [planning, setPlanning] = useState(false)
  const [completionNotification, setCompletionNotification] = useState<string>("")
  const lastCompletionCheckRef = useRef("")
  
  // CHANGE 1: Subject dropdown checklist states
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false)
  const [checkedSubjects, setCheckedSubjects] = useState<string[]>(["All", "Science", "Mathematics", "Social Studies", "English"])
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // CHANGE 3: Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  
  // ADDITION 2: Session type filter state
  const [activeTypeFilter, setActiveTypeFilter] = useState("all")

  const toApiSubject = (s: string) => {
    if (s === "all") return "all"
    if (s === "Social Studies" || s === "social") return "social"
    if (s === "Mathematics" || s === "mathematics" || s === "maths") return "mathematics"
    if (s === "English" || s === "english") return "english"
    return "science"
  }

  // CHANGE 1: Click-outside handler for dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSubjectDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const currentChapterList = CHAPTERS_BY_SUBJECT[planSubject] ?? CHAPTERS_BY_SUBJECT.science

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

  useEffect(() => {
    if (!planModalOpen) return
    setPlanChapter((prev) => prev && currentChapterList.includes(prev) ? prev : currentChapterList[0] ?? "")
  }, [currentChapterList, planModalOpen])

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
    if (!plan?.sessions?.length) return
    const today = isoDate(new Date())
    const pendingToday = plan.sessions.filter((session) => {
      const status = getDisplayStatus(session)
      return status === "pending" && session.date === today
    })
    if (!pendingToday.length) return

    const checkKey = pendingToday
      .map((session) => `${getSubjectKey(session)}:${getSessionChapter(session)}:${session.date}`)
      .sort()
      .join("|")
    if (lastCompletionCheckRef.current === checkKey) return
    lastCompletionCheckRef.current = checkKey

    let cancelled = false
    const run = async () => {
      let completedAny = false
      for (const session of pendingToday) {
        const res = await authFetch(
          `/api/planner/check-completion?subject=${encodeURIComponent(getSubjectKey(session))}&chapter=${encodeURIComponent(getSessionChapter(session))}&date=${today}`
        )
        if (!res.ok) continue
        const data = await res.json().catch(() => ({}))
        if (data.completed) {
          completedAny = true
          
          // Handle next chapter auto-generation
          if (data.new_sessions && data.new_sessions.length > 0) {
            setPlan((current) => current ? {
              ...current,
              sessions: [...current.sessions, ...data.new_sessions],
            } : current)
            
            if (data.next_chapter) {
              setCompletionNotification(`✓ ${getSessionChapter(session)} completed! ${data.next_chapter} has been added to your plan.`)
              setTimeout(() => setCompletionNotification(""), 5000)
            }
          }
        }
      }
      if (!cancelled && completedAny) {
        await fetchPlan()
      }
    }
    void run()

    return () => {
      cancelled = true
    }
  }, [authFetch, fetchPlan, plan])

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

  const handleMarkComplete = async (session: PlanSession) => {
    const res = await authFetch(`/api/planner/sessions/${session.id}/complete`, {
      method: "PATCH",
    })
    if (res.ok) {
      setPlan((current) => current ? {
        ...current,
        sessions: current.sessions.map((item) => item.id === session.id ? { ...item, status: "done", completed: true } : item),
      } : current)
      await refreshProfile()
    }
  }

  const handleDelete = async (session: PlanSession) => {
    // CHANGE 3: No browser confirm needed - inline confirmation handles it
    const res = await authFetch(`/api/planner/sessions/${session.id}`, {
      method: "DELETE",
    })
    if (res.ok) {
      setPlan((current) => current ? {
        ...current,
        sessions: current.sessions.filter((item) => item.id !== session.id),
      } : current)
    }
  }

  const handleGeneratePlan = async () => {
    setPlanning(true)
    setPlanError("")
    try {
      const selectedHours = preferredSlots.flatMap((slot) => {
        const entry = TIME_PREFS.find((item) => item.id === slot)
        return entry ? entry.hours : []
      })
      const res = await authFetch("/api/planner/generate-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: planSubject,
          chapter: planChapter,
          session_type: planSessionType,
          duration_minutes: planDuration,
          preferred_hours: selectedHours.length > 0 ? selectedHours : [18],
          days: planDays,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Failed to generate study plan")
      }
      
      // Append new sessions to existing ones
      setPlan((current) => current ? {
        ...current,
        sessions: [...current.sessions, ...(data.sessions || [])],
      } : {
        sessions: data.sessions || [],
        exam_countdown: false,
        days_remaining: 30,
      })
      
      setPlanModalOpen(false)
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Failed to generate study plan")
    } finally {
      setPlanning(false)
    }
  }

  const handleRescheduleMissed = async () => {
    const res = await authFetch("/api/planner/reschedule-missed", { method: "POST" })
    if (res.ok) {
      await fetchPlan()
    }
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

  // Filter sessions by type
  const filtered = (plan?.sessions ?? []).filter((session) =>
    filter === "all" || session.session_type === filter
  )
  
  // CHANGE 1: Filter by checked subjects
  const visibleSessions = checkedSubjects.includes("All")
    ? filtered
    : filtered.filter(s => 
        checkedSubjects.some(cs => 
          (s.subject && s.subject.toLowerCase().includes(cs.toLowerCase())) ||
          (getSubjectLabel(getSubjectKey(s)).toLowerCase().includes(cs.toLowerCase()))
        )
      )
  
  // ADDITION 2: Further filter by session type
  const finalSessions = activeTypeFilter === "all"
    ? visibleSessions
    : visibleSessions.filter(s => 
        (s.session_type ?? "study").toLowerCase() === activeTypeFilter
      )

  // Sessions by date
  const byDate: Record<string, PlanSession[]> = {}
  finalSessions.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  })

  // Stats for this week
  const weekSessions = finalSessions.filter(s => {
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
  const missedSessions = (plan?.sessions ?? []).filter((session) => getDisplayStatus(session) === "missed")

  return (
    <AppShell>
      <div className="space-y-5">

        {/* CHANGE 1: Subject dropdown checklist */}
        <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
          <button
            onClick={() => setSubjectDropdownOpen(v => !v)}
            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider font-mono border transition-colors bg-[#4A6FA5] text-white border-[#4A6FA5]"
          >
            {checkedSubjects.includes("All") ? "All Subjects ▾" : `${checkedSubjects.length} Subject(s) ▾`}
          </button>
          {subjectDropdownOpen && (
            <div style={{
              position: "absolute", top: "110%", left: 0,
              background: "#fff", border: "2px solid #1c1f3a",
              boxShadow: "4px 4px 0 #1c1f3a", zIndex: 50,
              minWidth: 200, padding: "8px 0"
            }}>
              {["All", "Science", "Mathematics", "Social Studies", "English"].map(subj => (
                <label key={subj} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 16px", cursor: "pointer",
                  fontFamily: "monospace", fontSize: 12,
                  fontWeight: subj === "All" ? "bold" : "normal",
                  borderBottom: subj === "All" ? "1px solid rgba(28,31,58,0.15)" : "none"
                }}>
                  <input
                    type="checkbox"
                    checked={checkedSubjects.includes(subj)}
                    onChange={() => {
                      if (subj === "All") {
                        setCheckedSubjects(checkedSubjects.includes("All")
                          ? []
                          : ["All", "Science", "Mathematics", "Social Studies", "English"])
                      } else {
                        const next = checkedSubjects.includes(subj)
                          ? checkedSubjects.filter(s => s !== subj && s !== "All")
                          : [...checkedSubjects.filter(s => s !== "All"), subj]
                        setCheckedSubjects(next)
                      }
                    }}
                  />
                  {subj}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ADDITION 2: Session type filter tabs */}
        

        {/* Exam countdown banner */}
        {plan?.exam_countdown && (
  <div className="flex items-center gap-3.5 px-5 py-3.5 bg-[#FFFBF0] border-2 border-[#1C1F3A] shadow-[4px_4px_0px_#C47C2B] rounded-none">
    <div className="p-1.5 bg-[#C47C2B]/10 border border-[#C47C2B] flex items-center justify-center flex-shrink-0">
      <Flame className="w-5 h-5 text-[#C47C2B] animate-pulse" />
    </div>
    
    <div className="flex-1 font-mono text-xs leading-relaxed text-[#1C1F3A]">
      <span className="font-extrabold uppercase tracking-wider text-[#C47C2B] bg-[#C47C2B]/15 px-2 py-0.5 border border-[#C47C2B]/30 mr-2 inline-block">
        EXAM IN {plan.days_remaining} DAYS
      </span>
      <span className="font-bold text-[#1C1F3A]">
        — Revision mode active. Only revision and mock sessions scheduled.
      </span>
    </div>
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

        {/* Completion notification */}
        {completionNotification && (
          <div className="border-2 border-[#2a7d4f] bg-[#eef9f1] px-5 py-3 flex items-center gap-3 animate-slide-up">
            <CheckCircle2 className="w-6 h-6 text-[#2a7d4f]" />
            <p className="font-mono text-xs font-bold text-[#2a7d4f] uppercase tracking-wider">
              {completionNotification}
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between animate-slide-right">
          <div>
            
            <h1 className="font-serif font-black text-[2.2rem] text-[#1c1f3a] leading-none animate-[slide-right_0.5s_ease-out_0.2s_both]">Study Planner</h1>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {missedSessions.length > 0 && (
              <button onClick={handleRescheduleMissed}
                className="brut-btn brut-btn-outline px-4 py-2 text-xs flex items-center gap-1.5 font-bold">
                <RefreshCw className="w-3.5 h-3.5" /> Reschedule Missed
              </button>
            )}
            <button 
  onClick={() => {
    const defaultSubject = selectedSubject === "all" ? "science" : selectedSubject
    setPlanSubject(defaultSubject)
    setPlanChapter(CHAPTERS_BY_SUBJECT[defaultSubject]?.[0] ?? "")
    setPlanDays(3)
    setPreferredSlots(["evening"])
    setPlanError("")
    setPlanModalOpen(true)
  }}
  className="inline-flex items-center gap-2 px-4 py-2 bg-[#F8FAFF] hover:bg-white text-[#1C1F3A] hover:text-[#4A6FA5] font-mono text-xs font-bold uppercase tracking-wider border-2 border-[#1C1F3A] shadow-[2px_2px_0px_#1C1F3A] hover:shadow-[4px_4px_0px_#4A6FA5] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all duration-150 rounded-none cursor-pointer"
>
  <Calendar className="w-4 h-4 text-[#4A6FA5]" />
  <span>Plan a Chapter</span>
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
        <div className="flex flex-wrap items-center gap-2">
  {["all", "study", "practice", "revision", "mock", "break"].map((f) => {
    const isActive = filter === f
    return (
      <button
        key={f}
        onClick={() => setFilter(f)}
        className={cn(
          "px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer rounded-none border-2",
          isActive
            ? "bg-[#4A6FA5] text-white border-[#1C1F3A] shadow-[2px_2px_0px_#1C1F3A] -translate-y-0.5"
            : "bg-[#F8FAFF] text-[#1C1F3A]/60 border-[#1C1F3A]/20 hover:border-[#1C1F3A] hover:text-[#1C1F3A] hover:bg-white"
        )}
      >
        {f}
      </button>
    )
  })}
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
        <div className="flex items-center justify-between p-2.5 bg-[#F8FAFF] border-2 border-[#1C1F3A] shadow-[3px_3px_0px_#1C1F3A] rounded-none">
  {/* Previous Week Button */}
  <button 
    onClick={() => setWeekStart(d => addDays(d, -7))}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#1C1F3A] text-[#1C1F3A] hover:text-white font-mono text-xs font-bold uppercase tracking-wider border-2 border-[#1C1F3A] shadow-[2px_2px_0px_#1C1F3A] active:translate-y-0.5 active:shadow-none transition-all duration-150 rounded-none cursor-pointer"
  >
    ← Prev Week
  </button>

  {/* Date Range Badge */}
  <div className="px-3.5 py-1.5 bg-white border-2 border-[#1C1F3A] font-mono text-xs font-bold text-[#1C1F3A] uppercase tracking-wider shadow-[2px_2px_0px_#4A6FA5]">
    <span className="text-[#4A6FA5]">📅</span>{" "}
    {weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
    <span className="text-[#4A6FA5] mx-1.5">–</span>
    {addDays(weekStart, 6).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </div>

  {/* Next Week Button */}
  <button 
    onClick={() => setWeekStart(d => addDays(d, 7))}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#1C1F3A] text-[#1C1F3A] hover:text-white font-mono text-xs font-bold uppercase tracking-wider border-2 border-[#1C1F3A] shadow-[2px_2px_0px_#1C1F3A] active:translate-y-0.5 active:shadow-none transition-all duration-150 rounded-none cursor-pointer"
  >
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
        ) : (plan?.sessions ?? []).length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="index-card w-full max-w-md text-center p-10">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-[rgba(28,31,58,0.3)]" />
              <p className="font-serif font-black text-2xl text-[#1c1f3a] mb-2">No study sessions planned yet</p>
              <p className="font-mono text-xs text-[rgba(28,31,58,0.6)] mb-6 uppercase tracking-wider">Click &quot;Plan a Chapter&quot; to create your first session.</p>
              <button
                onClick={() => {
                  const defaultSubject = selectedSubject === "all" ? "science" : selectedSubject
                  setPlanSubject(defaultSubject)
                  setPlanChapter(CHAPTERS_BY_SUBJECT[defaultSubject]?.[0] ?? "")
                  setPlanDays(3)
                  setPreferredSlots(["evening"])
                  setPlanError("")
                  setPlanModalOpen(true)
                }}
                className="brut-btn brut-btn-pink px-6 py-3 text-sm font-bold inline-flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" /> Plan a Chapter
              </button>
            </div>
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
                        <SessionChip key={s.id} s={s} onClick={() => setSelected(s)} onComplete={handleMarkComplete} onDelete={handleDelete} confirmDeleteId={confirmDeleteId} setConfirmDeleteId={setConfirmDeleteId} />
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

      {/* Plan a Chapter modal */}
      {planModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPlanModalOpen(false)}>
          <div className="w-[500px] max-w-full index-card animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -top-10 left-4 bg-[#fdfcf9] border-t border-l border-r border-[#1c1f3a] px-6 py-2 rounded-t-lg z-[-1]">
              <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[#1c1f3a]">Plan Chapter</span>
            </div>

            <div className="p-8 space-y-5">
              <div className="border-b-2 border-dashed border-[#1c1f3a] pb-4 relative">
                <button onClick={() => setPlanModalOpen(false)} className="absolute top-0 right-0 text-[#1c1f3a] font-mono text-xl font-black hover:text-[#c0392b]">&times;</button>
                <p className="font-serif font-black text-2xl text-[#1c1f3a] leading-tight">Generate Study Plan</p>
              </div>

              {planError && (
                <div className="border border-[#c0392b] bg-[#fff2f2] px-3 py-2">
                  <p className="font-mono text-xs text-[#c0392b] font-bold">{planError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-2 block">Subject</label>
                  <select
                    value={planSubject}
                    onChange={(e) => setPlanSubject(e.target.value)}
                    className="w-full border-2 border-[#1c1f3a] px-3 py-2 font-mono text-xs bg-[#fdfcf9] text-[#1c1f3a] focus:outline-none focus:bg-[rgba(28,31,58,0.05)]"
                  >
                    <option value="science">Science</option>
                    <option value="maths">Mathematics</option>
                    <option value="social">Social Studies</option>
                    <option value="english">English</option>
                  </select>
                </div>

                <div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-2 block">Chapter</label>
                  <select
                    value={planChapter}
                    onChange={(e) => setPlanChapter(e.target.value)}
                    className="w-full border-2 border-[#1c1f3a] px-3 py-2 font-mono text-xs bg-[#fdfcf9] text-[#1c1f3a] focus:outline-none focus:bg-[rgba(28,31,58,0.05)]"
                  >
                    {currentChapterList.map((ch) => (
                      <option key={ch} value={ch}>{ch}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-2 block">Type of Plan</label>
                  <div className="grid grid-cols-4 gap-2">
                    {["study", "practice", "revision", "mock"].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setPlanSessionType(type)}
                        className={cn(
                          "px-3 py-2 text-[10px] font-bold uppercase tracking-wider font-mono border-2 transition-colors",
                          planSessionType === type
                            ? "bg-[#1c1f3a] text-white border-[#1c1f3a]"
                            : "border-[rgba(28,31,58,0.3)] text-[#1c1f3a] hover:border-[#1c1f3a]"
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] mb-2 block">Time Preference</label>
                  <div className="space-y-2">
                    {TIME_PREFS.map((pref) => (
                      <label key={pref.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferredSlots.includes(pref.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPreferredSlots((prev) => [...prev, pref.id])
                            } else {
                              setPreferredSlots((prev) => prev.filter((slot) => slot !== pref.id))
                            }
                          }}
                          className="w-4 h-4 border-2 border-[#1c1f3a]"
                        />
                        <span className="font-mono text-xs text-[#1c1f3a] font-bold">{pref.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a]">Days</label>
                    <span className="font-mono text-sm font-black text-[#1c1f3a]">{planDays}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="7"
                    value={planDays}
                    onChange={(e) => setPlanDays(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="pt-6 border-t-2 border-dashed border-[#1c1f3a] flex gap-3">
                <button
                  onClick={() => setPlanModalOpen(false)}
                  className="flex-1 font-mono font-black text-xs text-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-3 uppercase tracking-widest hover:bg-[rgba(28,31,58,0.05)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGeneratePlan}
                  disabled={planning}
                  className="flex-1 font-mono font-black text-xs text-[#fdfcf9] bg-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-3 uppercase tracking-widest hover:bg-[#c0392b] hover:border-[#c0392b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {planning ? "Generating..." : "Generate Plan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
