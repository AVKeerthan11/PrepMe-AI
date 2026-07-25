"use client"

import { useState, useEffect } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { useAuth } from "@/lib/auth"

// 1. Avatar definition list moved to component module level
const AVATARS = [
  { id: "avatar-1", name: "Hedwig" },
  { id: "avatar-2", name: "Tom" },
  { id: "avatar-3", name: "Kurama" },
  { id: "avatar-4", name: "Freddy" },
  { id: "avatar-5", name: "Po" },
  { id: "avatar-6", name: "Rango" },
  { id: "avatar-7", name: "Judy" },
  { id: "avatar-8", name: "Butterfree" },
]

export default function ProfilePage() {
  const { profile, authFetch, refreshProfile } = useAuth()
  const [name, setName]           = useState("")
  const [examDate, setExamDate]   = useState("")
  const [dailyHours, setDailyHours] = useState(3)
  const [subject, setSubject]     = useState("science")
  const [selectedAvatar, setSelectedAvatar] = useState("avatar-1")
  const [saved, setSaved]         = useState(false)
  const [busy, setBusy]           = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setExamDate(profile.exam_date ?? "")
      setDailyHours(profile.daily_hours)
      setSubject(profile.subject)
      setSelectedAvatar(profile.avatar ?? "avatar-1")
    }
  }, [profile])

  const save = async () => {
    setBusy(true)
    await authFetch("/api/profile/", {
      method: "PATCH",
      body: JSON.stringify({
        name,
        exam_date: examDate || null,
        daily_hours: dailyHours,
        subject,
        avatar: selectedAvatar,
      }),
    })
    await refreshProfile()
    
    // Trigger planner regeneration so schedule reflects any exam_date or subject change
    authFetch("/api/planner/regenerate", { method: "POST" }).catch(() => {})
    
    // Update localStorage to reflect new name
    const userStr = localStorage.getItem("prepme_user")
    if (userStr) {
      const user = JSON.parse(userStr)
      user.name = name
      localStorage.setItem("prepme_user", JSON.stringify(user))
    }
    
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setBusy(false)
  }

  const selectAvatar = async (avatarName: string) => {
    setSelectedAvatar(avatarName)
    try {
      await authFetch("/api/profile/", {
        method: "PATCH",
        body: JSON.stringify({ avatar: avatarName }),
      })
      const userStr = localStorage.getItem("prepme_user")
      if (userStr) {
        const user = JSON.parse(userStr)
        user.avatar = avatarName
        localStorage.setItem("prepme_user", JSON.stringify(user))
      }
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSelectedAvatar(profile?.avatar ?? "avatar-1")
    }
  }

  const topics = Object.entries(profile?.mastery ?? {}).sort(
    (a, b) => a[1].score - b[1].score
  )
  const inputCls =
    "w-full bg-[#F5F0E8] border border-[#C0BAB0] text-[#1A1A1A] px-3 py-2.5 text-sm font-mono outline-none focus:border-[#4A6FA5] transition-colors"

  return (
    <AppShell>
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="section-label pink mb-2">Settings</p>
          <h1 className="font-serif font-black text-4xl text-[#1c1f3a]">
            Profile
          </h1>
        </div>

        {/* Avatar Selection Section */}
        <div
          className="brut-card p-8 space-y-6"
          style={{
            background: "linear-gradient(135deg, #e8f0ff 0%, #fff5f8 100%)",
          }}
        >
          <div className="flex items-center justify-between border-b-4 border-[#1c1f3a] pb-4">
            <div>
              <h2 className="font-serif font-black text-2xl text-[#1c1f3a] mb-1">
                Choose Your Avatar
              </h2>
              <p className="text-sm font-mono text-[#4A6FA5]">
                Pick an avatar that represents you
              </p>
            </div>
            {saved && (
              <div className="bg-[#2a7d4f] text-white px-4 py-2 rounded-lg font-mono text-sm font-bold shadow-lg animate-pulse">
                ✓ Saved Successfully
              </div>
            )}
          </div>

          {/* Avatar Grid */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-[#f8faff] to-[#fef9fb] border-4 border-[#1c1f3a] p-8 shadow-[8px_8px_0_rgba(28,31,58,0.15)] rounded-xl">
              <div className="grid grid-cols-4 gap-8">
                {AVATARS.map((avatar, index) => {
                  const isSelected = selectedAvatar === avatar.id
                  const imgNumber = index + 1

                  return (
                    <button
                      key={avatar.id}
                      onClick={() => selectAvatar(avatar.id)}
                      className="relative group flex flex-col items-center transition-all duration-200"
                    >
                      <div
                        className={`relative transition-all duration-300 ${
                          isSelected
                            ? "transform scale-110"
                            : "hover:transform hover:scale-105 opacity-70 hover:opacity-100"
                        }`}
                      >
                        {/* Glow Backdrop */}
                        <div
                          className={`absolute inset-0 rounded-full transition-all duration-300 ${
                            isSelected
                              ? "bg-gradient-to-br from-[#4A6FA5] to-[#6B8DC7] blur-xl opacity-50"
                              : "bg-gray-300 blur-md opacity-0 group-hover:opacity-30"
                          }`}
                          style={{ transform: "scale(1.1)" }}
                        />

                        {/* Avatar Image */}
                        <img
                          src={`/avatars/avatar-${imgNumber}.png`}
                          alt={avatar.name}
                          className="relative w-24 h-24 rounded-full object-cover"
                          style={{
                            border: isSelected
                              ? "5px solid #4A6FA5"
                              : "4px solid #d1d5db",
                            boxShadow: isSelected
                              ? "0 8px 20px rgba(74,111,165,0.5)"
                              : "0 4px 12px rgba(0,0,0,0.1)",
                          }}
                        />

                        {/* Selection Checkmark */}
                        {isSelected && (
                          <div className="absolute -top-2 -right-2 w-8 h-8 bg-[#4A6FA5] rounded-full flex items-center justify-center border-4 border-white shadow-lg animate-bounce">
                            <span className="text-white text-sm font-bold">
                              ✓
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Unique Name Display */}
                      <span
                        className={`mt-3 text-xs font-mono font-bold uppercase tracking-wider transition-colors text-center ${
                          isSelected
                            ? "text-[#4A6FA5]"
                            : "text-[#666] group-hover:text-[#1c1f3a]"
                        }`}
                      >
                        {avatar.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Footer Instructions */}
            <div className="flex items-center justify-center gap-2 text-center">
              <div className="w-2 h-2 rounded-full bg-[#4A6FA5] animate-pulse" />
              <p className="text-sm font-mono text-[#1c1f3a] font-medium">
                Click an avatar to select it. Your choice is saved automatically.
              </p>
              <div className="w-2 h-2 rounded-full bg-[#4A6FA5] animate-pulse" />
            </div>
          </div>
        </div>

        {/* Account Settings Section */}
        <div
          className="brut-card p-6 space-y-5"
          style={{
            background: "linear-gradient(135deg, #f0fff4 0%, #fdfcf9 100%)",
          }}
        >
          <div className="border-b-4 border-[#2a7d4f] pb-3">
            <h2 className="font-serif font-black text-2xl text-[#1c1f3a] mb-1">
              Account Settings
            </h2>
            <p className="text-sm font-mono text-[#2a7d4f]">
              Manage your profile information
            </p>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block mb-2 text-sm font-mono font-bold text-[#1c1f3a] uppercase tracking-wider">
                Name
              </label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
            <div>
              <label className="block mb-2 text-sm font-mono font-bold text-[#1c1f3a] uppercase tracking-wider">
                Subject
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={inputCls + " cursor-pointer"}
              >
                <option value="science">NCERT Science – Class 8</option>
                <option value="maths">NCERT Maths – Class 8</option>
              </select>
            </div>
            <div>
              <label className="block mb-2 text-sm font-mono font-bold text-[#1c1f3a] uppercase tracking-wider">
                Exam Date
              </label>
              <input
                type="date"
                className={inputCls}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-2 text-sm font-mono font-bold text-[#1c1f3a] uppercase tracking-wider">
                Daily Hours
              </label>
              <input
                type="number"
                min={0.5}
                max={12}
                step={0.5}
                className={inputCls}
                value={dailyHours}
                onChange={(e) => setDailyHours(parseFloat(e.target.value))}
              />
            </div>
          </div>
          <button
            onClick={save}
            disabled={busy}
            className="brut-btn brut-btn-pink px-6 py-3 text-sm font-bold w-full hover:shadow-xl transition-all"
          >
            {saved ? "✓ Changes Saved" : busy ? "Saving…" : "Save Changes →"}
          </button>
        </div>

        {/* Mastery Overview Section */}
        <div
          className="brut-card p-6"
          style={{
            background: "linear-gradient(135deg, #fffbf0 0%, #fdfcf9 100%)",
          }}
        >
          <div className="border-b-4 border-[#c47c2b] pb-3 mb-5">
            <h2 className="font-serif font-black text-2xl text-[#1c1f3a] mb-1">
              Mastery Overview
            </h2>
            <p className="text-sm font-mono text-[#c47c2b]">
              Track your progress across topics
            </p>
          </div>
          <div className="space-y-4">
            {topics.map(([topic, info]) => {
              const score = info.score
              const color =
                score < 0.5 ? "#4A6FA5" : score < 0.7 ? "#c47c2b" : "#2a7d4f"
              return (
                <div
                  key={topic}
                  className="flex items-center gap-4 bg-white p-3 rounded-lg border-2 border-[#e5e7eb] hover:border-[#1c1f3a] transition-all"
                >
                  <span className="text-sm font-mono font-medium text-[#1c1f3a] w-56 truncate flex-shrink-0">
                    {topic}
                  </span>
                  <div className="flex-1 h-3 bg-[#E8E3D9] overflow-hidden border-2 border-[#C0BAB0] rounded-full shadow-inner">
                    <div
                      className="h-full transition-all duration-500 rounded-full"
                      style={{
                        width: `${score * 100}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span
                    className="font-mono text-sm font-bold w-12 text-right flex-shrink-0"
                    style={{ color }}
                  >
                    {(score * 100).toFixed(0)}%
                  </span>
                  <span className="text-xs text-[#666] w-16 text-right flex-shrink-0 font-mono font-medium">
                    {info.sessions_done} sessions
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