"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  saveSession,
  getUser,
  type PrepMeUser,
} from "@/lib/auth"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [defaultTab, setDefaultTab] = useState("signin")

  useEffect(() => {
    if (searchParams.get("registered") === "1") {
      setNotice("Account created! Sign in with your new credentials.")
      setDefaultTab("signin")
    }
  }, [searchParams])

  const [siEmail, setSiEmail] = useState("")
  const [siPass, setSiPass] = useState("")
  const [suName, setSuName] = useState("")
  const [suEmail, setSuEmail] = useState("")
  const [suPass, setSuPass] = useState("")

  const inputCls =
    "w-full bg-[#F5F0E8] border border-[#C0BAB0] text-[#1A1A1A] px-3 py-2.5 text-sm font-mono outline-none focus:border-[#4A6FA5] transition-colors placeholder:text-[#BBB]"

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: siEmail, password: siPass }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Invalid email or password."
        )
      }

      const token = data.access_token as string
      const stored = getUser()
      const user: PrepMeUser = {
        ...(stored && stored.email === siEmail ? stored : {}),
        email: siEmail,
        onboarding_complete:
          stored?.onboarding_complete === false ? false : stored?.onboarding_complete ?? true,
      }

      saveSession(token, user)

      if (user.onboarding_complete === false) {
        router.replace("/onboarding")
      } else {
        router.replace("/dashboard")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.")
    } finally {
      setBusy(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      const res = await fetch(`${API}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: suName,
          email: suEmail,
          password: suPass,
          subject: "science",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Sign up failed."
        )
      }

      const token = data.access_token as string
      const user: PrepMeUser = {
        name: suName,
        email: suEmail,
        onboarding_complete: false,
      }
      saveSession(token, user)
      router.replace("/onboarding")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-[#E8E3D9] flex items-center justify-center p-4"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
        backgroundSize: "200px 200px",
      }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 animate-slide-right">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[#4A6FA5] font-mono font-black">■</span>
            <span className="font-serif font-black text-[#1A1A1A] text-2xl">PrepMeAI</span>
          </div>
          <p className="text-[#AAA] text-xs font-mono uppercase tracking-widest">
            AI Study Companion
          </p>
        </div>

        <div
          className="border-2 border-[#1A1A1A] bg-[#FFFFFF]"
          style={{ boxShadow: "6px 6px 0 #1A1A1A" }}
        >
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#C0BAB0] bg-[#F2EDE5]">
            <span className="w-2.5 h-2.5 bg-[#4A6FA5] block" />
            <span className="w-2.5 h-2.5 bg-[#c47c2b] block" />
            <span className="w-2.5 h-2.5 bg-[#2a7d4f] block" />
            <span className="text-[#AAA] text-[10px] font-mono ml-2 uppercase tracking-wider">
              auth.exe
            </span>
          </div>

          <div className="p-5">
            <Tabs defaultValue={defaultTab} key={defaultTab}>
              <TabsList className="w-full mb-5 bg-[#F2EDE5] border border-[#C0BAB0] rounded-none p-0 h-auto">
                <TabsTrigger
                  value="signin"
                  className="flex-1 rounded-none py-2 text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#4A6FA5] data-[state=active]:text-white data-[state=inactive]:text-[#999]"
                >
                  Sign In
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="flex-1 rounded-none py-2 text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#4A6FA5] data-[state=active]:text-white data-[state=inactive]:text-[#999]"
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-3">
                  {notice && (
                    <p className="text-[#2a7d4f] text-xs font-mono">{notice}</p>
                  )}
                  <div>
                    <label className="section-label pink mb-1.5 block">Email</label>
                    <input
                      className={inputCls}
                      type="email"
                      value={siEmail}
                      onChange={(e) => setSiEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="section-label pink mb-1.5 block">Password</label>
                    <input
                      className={inputCls}
                      type="password"
                      value={siPass}
                      onChange={(e) => setSiPass(e.target.value)}
                      required
                      placeholder="••••••••"
                    />
                  </div>
                  {error && (
                    <p className="text-[#4A6FA5] text-xs font-mono">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="brut-btn brut-btn-pink w-full py-2.5 mt-1"
                  >
                    {busy ? "Signing in…" : "Sign In →"}
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <label className="section-label green mb-1.5 block">Name</label>
                    <input
                      className={inputCls}
                      value={suName}
                      onChange={(e) => setSuName(e.target.value)}
                      required
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="section-label green mb-1.5 block">Email</label>
                    <input
                      className={inputCls}
                      type="email"
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="section-label green mb-1.5 block">Password</label>
                    <input
                      className={inputCls}
                      type="password"
                      value={suPass}
                      onChange={(e) => setSuPass(e.target.value)}
                      required
                      placeholder="••••••••"
                      minLength={6}
                    />
                  </div>
                  {error && (
                    <p className="text-[#4A6FA5] text-xs font-mono">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="brut-btn brut-btn-green w-full py-2.5 mt-1"
                  >
                    {busy ? "Creating…" : "Create Account →"}
                  </button>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <p className="text-[#C0BAB0] text-[10px] font-mono text-center mt-4 uppercase tracking-widest">
          NCERT Classes 4–12 · Science & Maths
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#E8E3D9] flex items-center justify-center">
        <p className="font-mono text-[10px] text-[#AAA] uppercase tracking-widest">
          Loading…
        </p>
      </div>
    }>
      <LoginPageInner />
    </Suspense>
  )
}
