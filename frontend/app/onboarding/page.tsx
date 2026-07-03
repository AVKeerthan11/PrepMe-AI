"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { clearAuthSessionKeepProfile, type PrepMeUser } from "@/lib/auth.ts"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const BOARDS = ["CBSE", "ICSE", "STATE BOARD"] as const
type Board = (typeof BOARDS)[number]

const CLASSES = [4, 5, 6, 7, 8, 9, 10, 11, 12]

const SUBJECT_OPTIONS = [
  "Science",
  "Mathematics",
  "Social Studies",
  "English",
  "Hindi",
  "Sanskrit",
  "Computer Science",
] as const

const HOBBIES = [
  "READING",
  "SPORTS",
  "MUSIC",
  "ART",
  "GAMING",
  "CODING",
  "SCIENCE",
  "TRAVEL",
] as const

const SUBJECT_CARDS = [
  { id: "Science", emoji: "🔬", chapters: "15 CHAPTERS" },
  { id: "Mathematics", emoji: "📐", chapters: "14 CHAPTERS" },
  { id: "Social Studies", emoji: "🌍", chapters: "20 CHAPTERS" },
  { id: "English", emoji: "📖", chapters: "12 CHAPTERS" },
] as const

const inputCls =
  "w-full bg-[#F5F0E8] border border-[#C0BAB0] text-[#1A1A1A] px-3 py-2.5 text-sm font-mono outline-none focus:border-[#4A6FA5] transition-colors placeholder:text-[#BBB]"

function mapSubjectToApi(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes("math")) return "maths"
  return "science"
}

function StepBoxes({ step }: { step: number }) {
  return (
    <div className="flex gap-2 mb-5">
      {[1, 2, 3].map((n) => {
        const completed = n < step
        const active = n === step
        return (
          <div
            key={n}
            className={`w-8 h-8 flex items-center justify-center text-xs font-mono font-bold border-2 border-[#1A1A1A] ${
              completed
                ? "bg-[#2a7d4f] text-white"
                : active
                  ? "bg-[#1c1f3a] text-white"
                  : "bg-[#FFFFFF] text-[#999]"
            }`}
          >
            {n}
          </div>
        )
      })}
    </div>
  )
}

function ProfileCard({
  step,
  children,
}: {
  step: number
  children: React.ReactNode
}) {
  return (
    <div
      className="border-2 border-[#1A1A1A] bg-[#FFFFFF] w-full max-w-[480px]"
      style={{ boxShadow: "6px 6px 0 #1A1A1A" }}
    >
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#C0BAB0] bg-[#F2EDE5]">
        <span className="w-2.5 h-2.5 bg-[#4A6FA5] block" />
        <span className="w-2.5 h-2.5 bg-[#c47c2b] block" />
        <span className="w-2.5 h-2.5 bg-[#2a7d4f] block" />
        <span className="text-[#AAA] text-[10px] font-mono ml-2 uppercase tracking-wider">
          PROFILE.EXE — STEP {step} OF 3
        </span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const [board, setBoard] = useState<Board | null>(null)
  const [stateBoardNote, setStateBoardNote] = useState(false)
  const [studentClass, setStudentClass] = useState<number | null>(null)

  const [school, setSchool] = useState("")
  const [age, setAge] = useState("")
  const [favouriteSubject, setFavouriteSubject] = useState("")
  const [hobbies, setHobbies] = useState<string[]>([])
  const [examDate, setExamDate] = useState("")

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    SUBJECT_CARDS.map((s) => s.id)
  )
  const [dailyHours, setDailyHours] = useState(2.5)

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("prepme_token") || localStorage.getItem("token") : null
    const userStr = typeof window !== "undefined" ? localStorage.getItem("prepme_user") : null
    
    if (!token) {
      router.replace("/login")
      return
    }
    
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        if (user.onboarding_complete === true) {
          router.replace("/home")
          return
        }
      } catch {
        // Continue with onboarding if parse fails
      }
    }
    
    setReady(true)
  }, [router])

  const handleBoard = (b: Board) => {
    if (b === "STATE BOARD") {
      setStateBoardNote(true)
      setBoard("CBSE")
      return
    }
    setStateBoardNote(false)
    setBoard(b)
  }

  const toggleHobby = (h: string) => {
    setHobbies((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    )
  }

  const toggleSubject = (id: string) => {
    setSelectedSubjects((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev
        return prev.filter((s) => s !== id)
      }
      return [...prev, id]
    })
  }

  const finish = async () => {
    setSubmitting(true)
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("prepme_token") || localStorage.getItem("token") : null
      const existingStr = typeof window !== "undefined" ? localStorage.getItem("prepme_user") : null
      const existing = existingStr ? JSON.parse(existingStr) : {}

      const profile: PrepMeUser = {
        id: existing?.id,
        name: existing?.name,
        email: existing?.email,
        class_level: studentClass,
        board: board ?? undefined,
        subjects: selectedSubjects,
        daily_hours: dailyHours,
        exam_date: examDate || null,
        age: age ? Number(age) : null,
        school: school || null,
        interests: hobbies,
        favourite_subject: favouriteSubject || undefined,
        onboarding_complete: true,
      }

      localStorage.setItem("prepme_user", JSON.stringify(profile))

      if (token) {
        const patchBody: Record<string, unknown> = {
          daily_hours: dailyHours,
        }
        if (examDate) patchBody.exam_date = examDate
        patchBody.subject = favouriteSubject
          ? mapSubjectToApi(favouriteSubject)
          : mapSubjectToApi(selectedSubjects[0] || "Science")

        try {
          const controller = new AbortController()
          const timeoutId = window.setTimeout(() => controller.abort(), 8000)
          await fetch(`${API}/api/profile/`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(patchBody),
            signal: controller.signal,
          })
          window.clearTimeout(timeoutId)
        } catch {
          /* proceed even if API fails */
        }
      }

      // Sign out so user must sign in again with new account
      clearAuthSessionKeepProfile()
      window.location.href = "/login?registered=1"
    } catch {
      setSubmitting(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#E8E3D9] flex items-center justify-center">
        <p className="font-mono text-[10px] text-[#AAA] uppercase tracking-widest">
          Loading…
        </p>
      </div>
    )
  }

  const step1Valid = board !== null && studentClass !== null

  return (
    <div
      className="min-h-screen bg-[#E8E3D9] flex items-center justify-center p-4"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
        backgroundSize: "200px 200px",
      }}
    >
      <div className="w-full flex flex-col items-center">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-[#4A6FA5] font-mono font-black">■</span>
            <span className="font-serif font-black text-[#1A1A1A] text-xl">
              PrepMeAI
            </span>
          </div>
          <p className="text-[#AAA] text-[10px] font-mono uppercase tracking-widest">
            Student profile setup
          </p>
        </div>

        <ProfileCard step={step}>
          <StepBoxes step={step} />

          {step === 1 && (
            <>
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-[#1A1A1A] mb-4">
                Select your board &amp; class
              </h2>

              <label className="section-label pink mb-2 block">Board</label>
              <div className="flex w-full mb-1 bg-[#F2EDE5] border border-[#C0BAB0]">
                {BOARDS.map((b) => {
                  const active =
                    b === "STATE BOARD" ? stateBoardNote : board === b
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => handleBoard(b)}
                      className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider font-mono border-r border-[#C0BAB0] last:border-r-0 transition-colors ${
                        active
                          ? "bg-[#4A6FA5] text-white"
                          : "text-[#999] hover:text-[#1A1A1A]"
                      }`}
                    >
                      {b}
                    </button>
                  )
                })}
              </div>
              {stateBoardNote && (
                <p className="text-[10px] font-mono text-[#666] mb-4 leading-snug">
                  State board support coming soon. Continuing with CBSE pattern.
                </p>
              )}
              {!stateBoardNote && <div className="mb-4" />}

              <label className="section-label green mb-2 block">Class</label>
              <div className="grid grid-cols-3 gap-2 mb-6">
                {CLASSES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setStudentClass(c)}
                    className={`py-3 text-sm font-mono font-bold border-2 border-[#1A1A1A] transition-colors ${
                      studentClass === c
                        ? "bg-[#1c1f3a] text-white"
                        : "bg-[#FFFFFF] text-[#1A1A1A] hover:bg-[#F2EDE5]"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!step1Valid}
                onClick={() => setStep(2)}
                className="brut-btn brut-btn-pink w-full py-2.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none disabled:hover:shadow-[4px_4px_0px_rgba(28,31,58,0.18)]"
                style={
                  step1Valid
                    ? { background: "#1c1f3a", borderColor: "#1c1f3a", color: "#fff" }
                    : undefined
                }
              >
                NEXT →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-[#1A1A1A] mb-4">
                About you
              </h2>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="section-label green mb-1.5 block">
                    School name{" "}
                    <span className="normal-case font-normal text-[#AAA]">
                      (optional)
                    </span>
                  </label>
                  <input
                    className={inputCls}
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    placeholder="Your school name"
                  />
                </div>

                <div>
                  <label className="section-label green mb-1.5 block">
                    Age{" "}
                    <span className="normal-case font-normal text-[#AAA]">
                      (optional)
                    </span>
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    min={8}
                    max={20}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Your age"
                  />
                </div>

                <div>
                  <label className="section-label pink mb-1.5 block">
                    Favourite subject
                  </label>
                  <select
                    className={`${inputCls} appearance-auto`}
                    value={favouriteSubject}
                    onChange={(e) => setFavouriteSubject(e.target.value)}
                  >
                    <option value="">Choose a subject</option>
                    {SUBJECT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="section-label amber mb-1.5 block">
                    Interests{" "}
                    <span className="normal-case font-normal text-[#AAA]">
                      (optional)
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {HOBBIES.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => toggleHobby(h)}
                        className={`px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-wide border border-[#1A1A1A] transition-colors ${
                          hobbies.includes(h)
                            ? "bg-[#1c1f3a] text-white"
                            : "bg-[#F5F0E8] text-[#1A1A1A] hover:bg-[#F2EDE5]"
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="section-label pink mb-1.5 block">
                    Next exam date{" "}
                    <span className="normal-case font-normal text-[#AAA]">
                      (optional)
                    </span>
                  </label>
                  <input
                    className={inputCls}
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="brut-btn w-full py-2.5"
                style={{
                  background: "#1c1f3a",
                  borderColor: "#1c1f3a",
                  color: "#fff",
                }}
              >
                NEXT →
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full mt-3 text-[10px] font-mono uppercase tracking-wider text-[#4A6FA5] hover:underline"
              >
                ← BACK
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#666] mb-3">
                Which subjects are you studying this year?
              </p>

              <div className="grid grid-cols-2 gap-2 mb-5">
                {SUBJECT_CARDS.map((s) => {
                  const selected = selectedSubjects.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSubject(s.id)}
                      className={`relative border-2 border-[#1A1A1A] p-3 text-center transition-colors ${
                        selected ? "bg-[#F2EDE5]" : "bg-[#FFFFFF] opacity-70"
                      }`}
                      style={
                        selected
                          ? { boxShadow: "3px 3px 0 #1c1f3a" }
                          : { boxShadow: "2px 2px 0 #C0BAB0" }
                      }
                    >
                      {selected && (
                        <span className="absolute top-1 right-1 text-[10px] font-mono font-bold text-[#2a7d4f]">
                          ✓
                        </span>
                      )}
                      <div className="text-2xl mb-1">{s.emoji}</div>
                      <div className="font-mono text-[10px] font-bold uppercase tracking-wide">
                        {s.id}
                      </div>
                      <div className="font-mono text-[8px] text-[#AAA] mt-1 uppercase">
                        {s.chapters}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="section-label green">Daily study hours</label>
                  <span className="font-mono text-xs font-bold tabular-nums text-[#1c1f3a]">
                    {dailyHours.toFixed(1)} HRS
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={6}
                  step={0.5}
                  value={dailyHours}
                  onChange={(e) => setDailyHours(parseFloat(e.target.value))}
                  className="onboarding-range w-full"
                />
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={finish}
                className="brut-btn w-full py-2.5 disabled:opacity-60"
                style={{
                  background: "#1c1f3a",
                  borderColor: "#1c1f3a",
                  color: "#fff",
                }}
              >
                {submitting ? "Saving…" : "LET'S GO →"}
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full mt-3 text-[10px] font-mono uppercase tracking-wider text-[#4A6FA5] hover:underline"
              >
                ← BACK
              </button>
            </>
          )}
        </ProfileCard>

        <p className="text-[#C0BAB0] text-[10px] font-mono text-center mt-4 uppercase tracking-widest">
          Classes 4–12 · CBSE · ICSE
        </p>
      </div>

      <style jsx>{`
        .onboarding-range {
          -webkit-appearance: none;
          appearance: none;
          height: 8px;
          background: #f2ede5;
          border: 2px solid #1a1a1a;
          outline: none;
        }
        .onboarding-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 20px;
          background: #1c1f3a;
          border: 2px solid #1a1a1a;
          cursor: pointer;
        }
        .onboarding-range::-moz-range-thumb {
          width: 16px;
          height: 20px;
          background: #1c1f3a;
          border: 2px solid #1a1a1a;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
