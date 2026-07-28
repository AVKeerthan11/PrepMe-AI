"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  LayoutDashboard, Bot, FileQuestion, Calendar, BarChart3, User, LogOut, ClipboardCheck, BookOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { SubjectModal } from "@/components/ui/subject-modal"
import type { AppSubject } from "@/lib/subjects"

const nav = [
  { name: "Dashboard",     href: "/",         icon: LayoutDashboard },
  { name: "AI Tutor",      href: "/tutor",     icon: Bot },
  { name: "Quiz",          href: "/quiz",      icon: FileQuestion },
  { name: "Study Planner", href: "/planner",   icon: Calendar },
  { name: "Analytics",     href: "/analytics", icon: BarChart3 },
  { name: "Exam",          href: "/exam",      icon: ClipboardCheck },
  { name: "Profile",       href: "/profile",   icon: User },
]

export function Sidebar() {
  const pathname    = usePathname()
  const router      = useRouter()
  const { profile, setSubject, logout } = useAuth()
  const [subjectModalOpen, setSubjectModalOpen] = useState(false)

  useEffect(() => {
    router.prefetch("/")
    router.prefetch("/tutor")
    router.prefetch("/quiz")
    router.prefetch("/planner")
    router.prefetch("/analytics")
    router.prefetch("/exam")
    router.prefetch("/profile")
  }, [router])

  const handleLogout = () => { logout(); router.push("/") }

  const switchSubject = async (subject: AppSubject) => {
    await setSubject(subject)
    setSubjectModalOpen(false)
  }

  const daysLeft     = profile?.days_to_exam ?? 30
  const initials     = profile?.name?.slice(0, 2).toUpperCase() ?? "ST"
  const activeSubject = (profile?.subject ?? "science") as AppSubject

  return (
    <aside className="flex h-screen w-56 flex-col bg-[#0A0A0A] border-r border-[#2A2A2A] flex-shrink-0 sticky top-0">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#2A2A2A]">
        <div className="flex items-center gap-2">
          <span className="text-[#4A6FA5] font-mono font-black text-xs">■</span>
          <span className="font-serif font-black text-[#1c1f3a] text-lg tracking-tight">PrepMeAI</span>
        </div>
        <p className="text-[#555] text-[10px] font-mono uppercase tracking-widest mt-0.5">Study Companion</p>
      </div>

      {/* Profile block */}
      <div className="px-4 py-3 border-b border-[#2A2A2A]">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 bg-[#4A6FA5] flex items-center justify-center text-xs font-black text-white flex-shrink-0"
            style={{ boxShadow: "2px 2px 0 #fff" }}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#1c1f3a] truncate">{profile?.name ?? "Student"}</p>
            <p className="text-[10px] text-[#555] uppercase tracking-wider capitalize">{activeSubject}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ name, href, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-100",
                active
                  ? "bg-[#4A6FA5] text-white font-bold"
                  : "text-[#888] hover:text-[#1c1f3a] hover:bg-[#1A1A1A]"
              )}>
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              {name}
            </Link>
          )
        })}

        {/* Subject switcher */}
        <div className="pt-3 mt-2 border-t border-[#2A2A2A]">
          <p className="section-label px-3 mb-2">Subject</p>
          <div className="px-1">
            <button
              onClick={() => setSubjectModalOpen(true)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2.5",
                "border-2 border-[#2A2A2A] bg-[#1A1A1A] text-[#888]",
                "hover:border-[#4A6FA5] hover:text-[#1c1f3a] transition-all duration-100",
                "font-mono text-[10px] font-bold uppercase tracking-wider"
              )}
              style={{ boxShadow: "2px 2px 0 #2A2A2A" }}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-3 w-3 flex-shrink-0" />
                <span>Subjects</span>
              </div>
              <span className="text-[#555] capitalize">{activeSubject}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Subject selection modal */}
      <SubjectModal
        open={subjectModalOpen}
        current={activeSubject}
        onSelect={switchSubject}
        onClose={() => setSubjectModalOpen(false)}
      />

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-[#2A2A2A] space-y-3">
        <div className="border border-[#2A2A2A] px-3 py-2.5 bg-[#111]">
          <p className="section-label amber text-[10px]">Exam countdown</p>
          <p className="font-mono text-xl font-black text-[#c47c2b] mt-0.5">{daysLeft} <span className="text-xs font-normal text-[#555]">days</span></p>
        </div>
        <button onClick={handleLogout}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#555] hover:text-[#1c1f3a] hover:bg-[#1A1A1A] transition-colors uppercase tracking-wider font-bold">
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
