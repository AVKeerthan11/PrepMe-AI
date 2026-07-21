"use client"

import { useState, useEffect } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { useAuth } from "@/lib/auth"

export default function ProfilePage() {
  const { profile, authFetch, refreshProfile } = useAuth()
  const [name, setName]           = useState("")
  const [examDate, setExamDate]   = useState("")
  const [dailyHours, setDailyHours] = useState(3)
  const [subject, setSubject]     = useState("science")
  const [saved, setSaved]         = useState(false)
  const [busy, setBusy]           = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name); setExamDate(profile.exam_date ?? "")
      setDailyHours(profile.daily_hours); setSubject(profile.subject)
    }
  }, [profile])

  const save = async () => {
    setBusy(true)
    await authFetch("/api/profile/", { method: "PATCH", body: JSON.stringify({ name, exam_date: examDate || null, daily_hours: dailyHours, subject }) })
    await refreshProfile()
    setSaved(true); setTimeout(() => setSaved(false), 2000); setBusy(false)
  }

  const topics = Object.entries(profile?.mastery ?? {}).sort((a, b) => a[1].score - b[1].score)
  const inputCls = "w-full bg-[#F5F0E8] border border-[#C0BAB0] text-[#1A1A1A] px-3 py-2.5 text-sm font-mono outline-none focus:border-[#4A6FA5] transition-colors"

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <p className="section-label pink mb-2">Settings</p>
          <h1 className="font-serif font-black text-3xl text-[#1A1A1A]">Profile</h1>
        </div>

        <div className="brut-card p-5 space-y-4">
          <p className="section-label green">Account</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="section-label mb-1.5 block text-[10px]">Name</label>
              <input className={inputCls} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="section-label mb-1.5 block text-[10px]">Subject</label>
              <select value={subject} onChange={e => setSubject(e.target.value)}
                className={inputCls + " cursor-pointer"}>
                <option value="science">NCERT Science – Class 8</option>
                <option value="maths">NCERT Maths – Class 8</option>
                <option value="social">NCERT Social Studies – Class 8</option>
                <option value="english">NCERT English – Class 8</option>
              </select>
            </div>
            <div>
              <label className="section-label mb-1.5 block text-[10px]">Exam Date</label>
              <input type="date" className={inputCls} value={examDate} onChange={e => setExamDate(e.target.value)} />
            </div>
            <div>
              <label className="section-label mb-1.5 block text-[10px]">Daily Hours</label>
              <input type="number" min={0.5} max={12} step={0.5} className={inputCls}
                value={dailyHours} onChange={e => setDailyHours(parseFloat(e.target.value))} />
            </div>
          </div>
          <button onClick={save} disabled={busy}
            className="brut-btn brut-btn-pink px-5 py-2.5 text-xs">
            {saved ? "✓ Saved" : busy ? "Saving…" : "Save Changes →"}
          </button>
        </div>

        <div className="brut-card p-5">
          <p className="section-label amber mb-4">Mastery Overview</p>
          <div className="space-y-3">
            {topics.map(([topic, info]) => {
              const score = info.score
              const color = score < 0.5 ? "#4A6FA5" : score < 0.7 ? "#c47c2b" : "#2a7d4f"
              return (
                <div key={topic} className="flex items-center gap-3">
                  <span className="text-xs text-[#999] w-52 truncate flex-shrink-0">{topic}</span>
                  <div className="flex-1 h-1.5 bg-[#E8E3D9] overflow-hidden border border-[#C0BAB0]">
                    <div className="h-full" style={{ width: `${score * 100}%`, backgroundColor: color }} />
                  </div>
                  <span className="font-mono text-xs w-9 text-right flex-shrink-0" style={{ color }}>
                    {(score * 100).toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-[#999] w-16 text-right flex-shrink-0 font-mono">
                    {info.sessions_done}s
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
