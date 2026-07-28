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
  displayNameToId,
} from "@/lib/subjects"

interface Analytics {
  readiness: number
  days_to_exam: number
  sessions_done: number
  avg_mastery: number
  topic_performance: { topic: string; score: number; tag: string }[]
  priority_queue: { topic: string; score: number; reason: string }[]
}

const AVATAR_DIALOGS: Record<string, string[]> = {
  "1": [
    "Hey! I was just adjusting my glasses and looking over our notes. Ready to swoop in and tackle a couple of chapters together today?",
    "Night or day, my eyes are wide open and ready to go! Pick a subject, and let's make today count.",
    "Guess who's excited to learn today? (Spoiler: it's both of us!) Let's crack open some questions and get those easy marks."
  ],
  "2": [
    "Hey human! Landed right on time. Put on your thinking helmet and let's go explore some new topics today!",
    "Meow-doy! Floating around without you was getting boring. Come on, let's zoom through these practice questions!",
    "3... 2... 1... Houston, we have a student! So awesome to see you. Ready to make today's study session out of this world?"
  ],
  "3": [
    "Hey! Was just sharpening my tail and thinking of some cool tricks to beat today's quiz. Let's do this!",
    "You're back! Perfect timing—I've got my sights locked onto our daily goal. Let me show you how to solve these smart and fast!",
    "Sly minds think alike! Let's stay super focused today, outsmart those tricky questions, and grab a high score."
  ],
  "4": [
    "Hiiii! *Gives huge bear hug* I missed you! Grab your notebook—we're gonna bring the big energy and crush today's goals!",
    "Look who just logged in! You're stronger than any tough problem in this book. Let's roar through these sessions today!",
    "Boom! Step one complete: you showed up! Now step two: let's have some fun and collect some awesome scores together!"
  ],
  "5": [
    "Hey buddy! Just finished fixing up our study dashboard with my wrench. Take a seat, relax, and let's work on a chapter together!",
    "No need to rush! Even the biggest, coolest machines are built one small screw at a time. Let's build up your score today!",
    "Munching on some bamboo and getting ready for you! Got any mistakes from yesterday? Bring 'em here, let's fix 'em up!"
  ],
  "6": [
    "Whoa! You logged in so fast you almost made me change colors! What are we blending into today? Science or Maths?",
    "Hey hey! I was just practicing blending in with the background, but I saw you and had to say hi! Ready to adapt and conquer today?",
    "New topic ahead? No problem at all! We can change our style and handle anything this paper throws at us. Let's go!"
  ],
  "7": [
    "Hop, hop, hop! You're here! I've been twitching my ears waiting for you. Let's bounce right into today's revision!",
    "Beep-boop! My speed sensors say you're on a roll lately! Keep those feet moving and let's race through today's practice set!",
    "Hey there! No time to lose—our goals are right around the corner! Let me run alongside you for today's study session!"
  ],
  "8": [
    "Yay, you're here! Take a deep breath, stretch a bit, and let's flutter through today's topics together.",
    "Hi bright mind! Did you know every little practice question you try makes your wings a little stronger? Let's fly high today!",
    "So happy to see you! Learning takes time, but you're doing amazing. Let's spread our wings and enjoy today's session!"
  ]
}

function getRandomDialog(avatarId: string): string {
  const dialogs = AVATAR_DIALOGS[avatarId] || AVATAR_DIALOGS["1"]
  return dialogs[Math.floor(Math.random() * dialogs.length)]
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
  const [masterySummary, setMasterySummary] = useState<Record<string, { percent: number; covered: number; total: number }>>({})
  const subject = profile?.subject ?? "science"
  const fullText = `Welcome back,\n${profile?.name ?? "Student"}`
  const [displayed, setDisplayed] = useState("")
  const [doneTyping, setDoneTyping] = useState(false)
  const enrolledSubjects = getEnrolledSubjects()
  const [avatarDialog, setAvatarDialog] = useState("")

  useEffect(() => {
    if (profile?.avatar) {
      const avatarId = profile.avatar.replace("avatar-", "")
      setAvatarDialog(getRandomDialog(avatarId))
    }
  }, [profile?.avatar])

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
      
      const sumRes = await authFetch(`/api/profile/mastery-summary`)
      if (sumRes.ok) setMasterySummary(await sumRes.json())
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
          <div className="w-full flex flex-col md:flex-row items-center justify-start gap-6 md:gap-8 animate-[slide-right_0.5s_ease-out_0.2s_both]">
            
            {/* Avatar & Speech Bubble Grouping */}
            {/* Avatar & Speech Bubble Grouping */}
            {profile?.avatar && (
              <div className="flex flex-col sm:flex-row items-center gap-4 flex-shrink-0">
                {/* Avatar Image (Bigger with Natural Drop-Shadow) */}
                <div className="relative flex-shrink-0 animate-[float_3s_ease-in-out_infinite]">
                  <img 
                    src={`/greetings/greeting-${profile.avatar.replace('avatar-', '')}.png`}
                    alt="Greeting Avatar"
                    className="w-56 h-56 md:w-72 md:h-72 object-contain filter drop-shadow-[0_10px_15px_rgba(28,31,58,0.25)] select-none"
                  />
                </div>

                {/* Speech Bubble Positioned cleanly to the Right */}
                {avatarDialog && (
                  <div className="relative w-60 sm:w-64 md:w-72 flex-shrink-0 animate-[slide-right_0.6s_ease-out_0.8s_both]">
                    <div className="relative bg-white border-2 border-[#1c1f3a] rounded-xl p-4 shadow-[4px_4px_0px_rgba(28,31,58,0.2)]">
                      {/* Left-pointing tail connecting to the Avatar */}
                      <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 bg-white border-l-2 border-b-2 border-[#1c1f3a] transform rotate-45 z-10" />
                      <p className="font-mono text-xs md:text-sm text-[#1c1f3a] leading-relaxed relative z-20">
                        {avatarDialog}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Welcome Back Card (Pushed right so it doesn't obstruct anything) */}
            <div className="torn-scrap md:ml-4 flex-shrink-0">
              <div className="scrap-pin" />
              <h1 className="font-serif font-black text-4xl sm:text-5xl md:text-6xl text-[#1c1f3a] leading-[1.1] tracking-tighter drop-shadow-[2px_2px_0px_rgba(74,111,165,0.3)]">
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
                {top3.map((item) => (
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
            {["Science", "Mathematics", "Social Studies", "English"].map((sub) => {
              const meta = SUBJECT_PROGRESS_META[sub] ?? {
                label: sub.toUpperCase(),
                chapters: 10,
                color: "#4A6FA5",
              }
              const subId = displayNameToId(sub) ?? sub.toLowerCase()
              const summaryData = masterySummary[subId]
              const { percent, covered, total } = summaryData 
                ? summaryData 
                : getProgressForSubject(sub, profile)
              return (
                <SubjectProgressBar
                  key={sub}
                  label={meta.label}
                  percent={percent || 0}
                  covered={covered || 0}
                  total={total || meta.chapters}
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
