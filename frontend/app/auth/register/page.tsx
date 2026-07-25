"use client"

import { useState, FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { saveSession, type PrepMeUser } from "@/lib/auth"
import {
  AuthSplitLayout,
  AuthToast,
  useAuthToast,
  Spinner,
  API,
  SUBJECTS,
  HOBBIES,
  mapSubjectToApi,
} from "../shared"

const BOARDS = ["CBSE", "ICSE", "State Board"] as const
const CLASSES = [4, 5, 6, 7, 8, 9, 10, 11, 12]

type Board = (typeof BOARDS)[number]

function passwordStrength(pw: string): "Weak" | "Good" | "Strong" | "" {
  if (!pw) return ""
  if (pw.length < 6) return "Weak"
  const hasLower = /[a-z]/.test(pw)
  const hasUpper = /[A-Z]/.test(pw)
  const hasNum = /\d/.test(pw)
  const hasSpecial = /[^A-Za-z0-9]/.test(pw)
  const score = [hasLower, hasUpper, hasNum, hasSpecial, pw.length >= 12].filter(Boolean).length
  if (score >= 4 && pw.length >= 10) return "Strong"
  if (pw.length >= 8 && score >= 2) return "Good"
  return "Weak"
}

export default function RegisterPage() {
  const router = useRouter()
  const { message: toastMsg, show: showToast } = useAuthToast()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [board, setBoard] = useState<Board | null>(null)
  const [studentClass, setStudentClass] = useState<number | null>(null)

  const [school, setSchool] = useState("")
  const [age, setAge] = useState("")
  const [favouriteSubject, setFavouriteSubject] = useState("")
  const [hobbies, setHobbies] = useState<string[]>([])
  const [examDate, setExamDate] = useState("")

  const strength = passwordStrength(password)

  const toggleHobby = (h: string) => {
    setHobbies((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    )
  }

  const handleBoardSelect = (b: Board) => {
    if (b === "State Board") {
      showToast("More states coming soon — you can still register with State Board")
    }
    setBoard(b)
  }

  const goStep2 = () => {
    setError("")
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    setStep(2)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const payload = {
      name: fullName,
      email,
      password,
      board,
      class: studentClass,
      school: school || undefined,
      age: age ? Number(age) : undefined,
      favourite_subject: favouriteSubject,
      hobbies,
      exam_date: examDate || undefined,
      subject: mapSubjectToApi(favouriteSubject || "Science"),
      onboarding_complete: false,
    }

    try {
      let res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.status === 404) {
        res = await fetch(`${API}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fullName,
            email,
            password,
            subject: payload.subject,
          }),
        })
      }

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Registration failed. Please try again."
        )
      }

      const token = data.access_token as string
      const user: PrepMeUser = {
        ...(data.user && typeof data.user === "object" ? data.user : {}),
        name: fullName,
        email,
        board: board ?? undefined,
        class: studentClass ?? undefined,
        onboarding_complete: false,
      }

      saveSession(token, user)
      router.replace("/onboarding")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthSplitLayout
      promoTitle="Join 50,000+ students preparing smarter"
      promoBullets={[
        "Personalised for CBSE, ICSE, and State boards",
        "Classes 4 through 12 — one platform for every year",
        "NCERT-grounded AI that adapts to how you learn",
      ]}
    >
      <AuthToast message={toastMsg} />
      <div className="auth-card-wrap">
        <div className="auth-card auth-card-wide">
          <div className="auth-progress">
            <span>Step {step} of 3</span>
            <div className="auth-progress-bar">
              <div
                className="auth-progress-fill"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          {step === 1 && (
            <>
              <h2>Create your account</h2>
              <div className="auth-form">
                <label className="auth-label">
                  Full Name
                  <input
                    type="text"
                    className="auth-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </label>
                <label className="auth-label">
                  Email
                  <input
                    type="email"
                    className="auth-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </label>
                <label className="auth-label">
                  Password
                  <div className="auth-password-wrap">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="auth-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  {strength && (
                    <span
                      className={`auth-strength auth-strength-${strength.toLowerCase()}`}
                    >
                      {strength}
                    </span>
                  )}
                </label>
                <label className="auth-label">
                  Confirm Password
                  <input
                    type="password"
                    className="auth-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </label>
                {error && <p className="auth-error">{error}</p>}
                <button type="button" className="auth-btn-gold" onClick={goStep2}>
                  Next →
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2>Which board and class are you in?</h2>
              <p className="auth-hint">Select your board</p>
              <div className="auth-board-grid">
                {BOARDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    className={`auth-select-card${board === b ? " auth-select-card-active" : ""}${b === "State Board" ? " auth-select-card-muted" : ""}`}
                    onClick={() => handleBoardSelect(b)}
                    title={b === "State Board" ? "More states coming soon" : undefined}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <p className="auth-hint">Select your class</p>
              <div className="auth-class-grid">
                {CLASSES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`auth-class-card${studentClass === c ? " auth-select-card-active" : ""}`}
                    onClick={() => setStudentClass(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="auth-step-actions">
                <button type="button" className="auth-btn-outline" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  type="button"
                  className="auth-btn-gold"
                  disabled={!board || studentClass === null}
                  onClick={() => setStep(3)}
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2>Tell us a little about yourself</h2>
              <p className="auth-hint">Helps us personalise your experience (optional fields marked)</p>
              <form onSubmit={handleSubmit} className="auth-form">
                <label className="auth-label">
                  Name of school <span className="auth-optional">(optional)</span>
                  <input
                    type="text"
                    className="auth-input"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                  />
                </label>
                <label className="auth-label">
                  Age <span className="auth-optional">(optional)</span>
                  <input
                    type="number"
                    className="auth-input"
                    min={8}
                    max={20}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                  />
                </label>
                <label className="auth-label">
                  Favourite subject so far
                  <select
                    className="auth-input auth-select"
                    value={favouriteSubject}
                    onChange={(e) => setFavouriteSubject(e.target.value)}
                    required
                  >
                    <option value="">Choose a subject</option>
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="auth-fieldset">
                  <legend>Hobbies / Interests</legend>
                  <div className="auth-chips">
                    {HOBBIES.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className={`auth-chip${hobbies.includes(h) ? " auth-chip-active" : ""}`}
                        onClick={() => toggleHobby(h)}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="auth-label">
                  When is your next big exam? <span className="auth-optional">(optional)</span>
                  <input
                    type="date"
                    className="auth-input"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                  />
                </label>
                {error && <p className="auth-error">{error}</p>}
                <div className="auth-step-actions">
                  <button type="button" className="auth-btn-outline" onClick={() => setStep(2)}>
                    Back
                  </button>
                  <button type="submit" className="auth-btn-gold" disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner /> Creating account…
                      </>
                    ) : (
                      "Create Account"
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="auth-switch">
            Already have an account?{" "}
            <Link href="/auth/login">Login here →</Link>
          </p>
        </div>
      </div>
    </AuthSplitLayout>
  )
}
