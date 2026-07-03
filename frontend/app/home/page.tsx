"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { useAuth } from "@/lib/auth"
import {
  ArrowRight,
  Target,
  CalendarDays,
  CheckCircle2,
  BarChart3,
  BookOpen,
  Compass,
  Play,
} from "lucide-react"
import Link from "next/link"
import { PencilBar } from "@/components/ui/pencil-bar"
import {
  getEnrolledSubjects,
  getProgressForSubject,
  SUBJECT_PROGRESS_META,
} from "@/lib/subjects"

interface Analytics {
  readiness: number
  days_to_exam: number
  sessions_done: number
  avg_mastery: number
  topic_performance: { topic: string; score: number; tag: string }[]
  priority_queue: { topic: string; score: number; reason: string }[]
}

function MasteryBar({ score }: { score: number }) {
  return (
    <div className="flex flex-col gap-1.5 group/bar cursor-default flex-1 mr-4">
      <div className="flex items-center justify-between mb-0.5">
        <span className="font-mono text-[8px] text-[rgba(28,31,58,0.40)] group-hover/bar:text-[rgba(28,31,58,0.55)] transition-colors uppercase tracking-widest">
          Proficiency
        </span>
        <span
          className="font-mono text-[10px] font-black tabular-nums transition-all duration-300 group-hover/bar:scale-110"
          style={{ color: "#4A6FA5" }}
        >
          {(score * 100).toFixed(0)}%
        </span>
      </div>
      <PencilBar value={score} color="#4A6FA5" height={10} />
    </div>
  )
}

function Tag({ tag }: { tag: string }) {
  const styles: Record<string, string> = {
    Weak: "text-[#4A6FA5] border border-[rgba(74,111,165,0.40)] bg-[rgba(74,111,165,0.10)]",
    Building:
      "text-[#c47c2b] border border-[rgba(196,124,43,0.40)] bg-[rgba(196,124,43,0.10)]",
    Good: "text-[#2a7d4f] border border-[rgba(42,125,79,0.40)] bg-[rgba(42,125,79,0.10)]",
  }
  return (
    <span
      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 uppercase tracking-widest ${styles[tag] ?? ""}`}
    >
      {tag}
    </span>
  )
}

function SubjectProgressBar({
  label,
  percent,
  covered,
  total,
  color,
}: {
  label: string
  percent: number
  covered: number
  total: number
  color: string
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a]">
          {label}
        </span>
        <span
          className="font-mono text-[10px] font-black tabular-nums"
          style={{ color }}
        >
          {percent}%
        </span>
      </div>
      <div className="h-[6px] w-full border border-[#1c1f3a] bg-[#f2ede5]">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${percent}%`, background: color }}
        />
      </div>
      <p className="font-mono text-[8px] text-[rgba(28,31,58,0.45)] uppercase tracking-wider mt-1">
        {covered} / {total} TOPICS COVERED
      </p>
    </div>
  )
}

function StudyNowButton({ topic }: { topic: string }) {
  const { authFetch } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const go = async () => {
    setLoading(true)
    try {
      const res = await authFetch("/api/planner/study-now")
      if (res.ok) {
        const data = await res.json()
        router.push(`/quiz?topic=${encodeURIComponent(data.topic)}`)
      } else {
        router.push(`/quiz?topic=${encodeURIComponent(topic)}`)
      }
    } catch {
      router.push(`/quiz?topic=${encodeURIComponent(topic)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={go}
      disabled={loading}
      className="brut-btn group/btn inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold overflow-hidden relative"
    >
      {loading ? (
        "…"
      ) : (
        <>
          <Play className="w-4 h-4 fill-current group-hover/btn:scale-125 transition-transform duration-300" />{" "}
          Study Now
        </>
      )}
    </button>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const { profile, authFetch, refreshProfile, subjectVersion } = useAuth()
  const [data, setData] = useState<Analytics | null>(null)
  const subject = profile?.subject ?? "science"
  const fullText = `Welcome back,\n${profile?.name ?? "Student"}`
  const [displayed, setDisplayed] = useState("")
  const [doneTyping, setDoneTyping] = useState(false)
  const enrolledSubjects = getEnrolledSubjects()

  useEffect(() => {
    const token =
      localStorage.getItem("prepme_token") || localStorage.getItem("token")
    if (!token) {
      router.replace("/login")
      return
    }
    try {
      const user = JSON.parse(localStorage.getItem("prepme_user") || "{}")
      if (user.onboarding_complete !== true) {
        router.replace("/onboarding")
      }
    } catch {
      router.replace("/onboarding")
    }
  }, [router])

  useEffect(() => {
    setDisplayed("")
    setDoneTyping(false)
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(fullText.slice(0, i))
      if (i >= fullText.length) {
        clearInterval(interval)
        setDoneTyping(true)
      }
    }, 80)
    return () => clearInterval(interval)
  }, [fullText])

  const fetchAnalytics = useCallback(async () => {
    try {
      const subjectParam = profile?.subject ?? "science"
      const res = await authFetch(`/api/analytics/?subject=${subjectParam}`)
      if (res.ok) setData(await res.json())
    } catch {
      /* backend offline */
    }
  }, [authFetch, profile?.subject])

  useEffect(() => {
    setData(null)
    fetchAnalytics()
  }, [fetchAnalytics, subject, subjectVersion])

  useEffect(() => {
    const handleFocus = () => {
      refreshProfile()
      fetchAnalytics()
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [refreshProfile, fetchAnalytics])

  const stats = [
    {
      label: "Readiness",
      value: data ? `${data.readiness.toFixed(0)}` : "—",
      unit: "/ 100",
      chalk: "blue" as const,
      icon: Target,
    },
    {
      label: "Days to Exam",
      value: data ? `${data.days_to_exam}` : profile?.days_to_exam ?? "—",
      unit: "days",
      chalk: "green" as const,
      icon: CalendarDays,
    },
    {
      label: "Sessions Done",
      value: data ? `${data.sessions_done}` : "—",
      unit: "",
      chalk: "yellow" as const,
      icon: CheckCircle2,
    },
    {
      label: "Avg Mastery",
      value: data ? `${(data.avg_mastery * 100).toFixed(0)}%` : "—",
      unit: "",
      chalk: "red" as const,
      icon: BarChart3,
    },
  ]

  const top3 = data?.priority_queue.slice(0, 3) ?? []
  const topics = data?.topic_performance.slice(0, 6) ?? []

  return (
    <AppShell>
      <div className="space-y-7">
        <div className="border-b border-[rgba(28,31,58,0.08)] pb-8 mb-4 animate-slide-right w-full">
          <div className="w-full flex flex-col items-center justify-center animate-[slide-right_0.5s_ease-out_0.2s_both]">
            <p
              className="section-label mb-2 text-xs self-start"
              style={{
                background: "rgba(74,111,165,0.12)",
                color: "#4A6FA5",
                border: "1px solid rgba(74,111,165,0.25)",
              }}
            >
              Dashboard
            </p>
            <div className="torn-scrap">
              <div className="scrap-pin" />
              <h1 className="font-serif font-black text-5xl md:text-6xl text-[#1c1f3a] leading-[1.1] tracking-tighter drop-shadow-[2px_2px_0px_rgba(74,111,165,0.3)]">
                {displayed.split("\n").map((line, i) => (
                  <span key={i}>
                    {line}
                    {i === 0 && <br />}
                  </span>
                ))}
                {!doneTyping && (
                  <span
                    style={{
                      display: "inline-block",
                      width: "3px",
                      height: "0.85em",
                      background: "#4A6FA5",
                      marginLeft: "2px",
                      verticalAlign: "middle",
                      animation: "cursor-blink 0.7s steps(1) infinite",
                    }}
                  />
                )}
              </h1>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className="chalkboard min-h-[130px] justify-between"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <p className="chalk-text text-[10px] uppercase tracking-widest opacity-80">
                {s.label}
              </p>
              <div className="flex items-baseline gap-1 mt-4">
                <span className={`chalk-text ${s.chalk} text-3xl font-black leading-none`}>
                  {s.value}
                </span>
                {s.unit && (
                  <span className="chalk-text text-xs opacity-70">{s.unit}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border-2 border-[#1c1f3a] bg-[#fcfaf8] p-5" style={{ boxShadow: "4px 4px 0 rgba(28,31,58,0.15)" }}>
            <div className="retro-titlebar mb-4">
              <span className="section-label green flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                Topic Performance
              </span>
              <div className="retro-titlebar-dots">
                <span style={{ background: "#2a7d4f" }} />
                <span style={{ background: "#c47c2b" }} />
                <span style={{ background: "#4A6FA5" }} />
              </div>
            </div>
            {topics.length > 0 ? (
              <ul className="space-y-4">
                {topics.map((t) => (
                  <li
                    key={t.topic}
                    className="flex items-center gap-3 border-b border-[rgba(28,31,58,0.06)] pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-[#1c1f3a] truncate">
                        {t.topic}
                      </p>
                      <Tag tag={t.tag} />
                    </div>
                    <MasteryBar score={t.score} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-mono text-xs text-[rgba(28,31,58,0.45)]">Loading…</p>
            )}
          </div>

          <div className="border-2 border-[#1c1f3a] bg-[#fcfaf8] p-5" style={{ boxShadow: "4px 4px 0 rgba(28,31,58,0.15)" }}>
            <div className="retro-titlebar mb-4">
              <span className="section-label amber flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Priority Study Path
              </span>
              <div className="retro-titlebar-dots">
                <span style={{ background: "#c47c2b" }} />
                <span style={{ background: "#2a7d4f" }} />
                <span style={{ background: "#4A6FA5" }} />
              </div>
            </div>
            {top3.length > 0 ? (
              <ol className="space-y-3 list-decimal list-inside">
                {top3.map((item, idx) => (
                  <li key={item.topic} className="font-mono text-[10px] text-[#1c1f3a]">
                    <span className="font-bold uppercase tracking-wide">{item.topic}</span>
                    <span className="block text-[9px] text-[rgba(28,31,58,0.45)] mt-0.5 ml-4">
                      {item.reason}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-mono text-xs text-[rgba(28,31,58,0.45)]">Loading…</p>
            )}
          </div>
        </div>

        {top3[0] && (
          <div
            className="neo-card neo-card-pink relative overflow-visible animate-float"
            style={{ animationDelay: "0.5s" }}
          >
            <div
              className="retro-titlebar"
              style={{
                background: "#FFF0F3",
                borderBottomColor: "rgba(74,111,165,0.2)",
              }}
            >
              <span className="section-label pink flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                What to study next
              </span>
              <div className="retro-titlebar-dots">
                <span style={{ background: "#4A6FA5" }} />
                <span style={{ background: "#c47c2b" }} />
                <span style={{ background: "#2a7d4f" }} />
              </div>
            </div>
            <div className="p-5">
              <p className="font-serif font-black text-xl text-[#1c1f3a] leading-tight mb-4">
                {top3[0].topic}
              </p>
              <div className="flex gap-2 flex-wrap">
                <Link
                  href="/tutor"
                  className="brut-btn brut-btn-pink inline-flex items-center gap-2 px-5 py-2.5 text-xs"
                >
                  Start with AI Tutor <ArrowRight className="h-3 w-3" />
                </Link>
                <StudyNowButton topic={top3[0].topic} />
              </div>
            </div>
          </div>
        )}

        <section className="border-2 border-[#1c1f3a] bg-[#fcfaf8] p-5" style={{ boxShadow: "4px 4px 0 rgba(28,31,58,0.15)" }}>
          <h2 className="font-mono text-[10px] font-black uppercase tracking-widest text-[#1c1f3a] mb-4">
            YOUR PROGRESS
          </h2>
          <div className="space-y-4">
            {enrolledSubjects.map((sub) => {
              const meta = SUBJECT_PROGRESS_META[sub] ?? {
                label: sub.toUpperCase(),
                chapters: 10,
                color: "#4A6FA5",
              }
              const { percent, covered, total } = getProgressForSubject(sub, profile)
              return (
                <SubjectProgressBar
                  key={sub}
                  label={meta.label}
                  percent={percent}
                  covered={covered}
                  total={total}
                  color={meta.color}
                />
              )
            })}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
