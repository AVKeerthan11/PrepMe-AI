"use client"

import { useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { AuthGuard } from "@/components/auth/auth-guard"
import { TopNav } from "@/components/layout/topnav"
import { SubjectModal, SUBJECT_COLORS } from "@/components/ui/subject-modal"
import { useAuth } from "@/lib/auth"
import type { AppSubject } from "@/lib/subjects"

const SUBJECT_LABEL: Record<AppSubject, string> = {
  science: "Science",
  maths:   "Mathematics",
  social:  "Social Studies",
  english: "English",
}

function SubjectBar() {
  const { profile, setSubject } = useAuth()
  const [open, setOpen] = useState(false)
  const activeSubject = (profile?.subject ?? "science") as AppSubject
  const btnRef = useRef<HTMLButtonElement>(null)

  const switchSubject = async (subject: AppSubject) => {
    await setSubject(subject)
    setOpen(false)
  }

  const { color, bg } = SUBJECT_COLORS[activeSubject]

  return (
    <>
      <div className="relative z-30 px-6">
        <button
          ref={btnRef}
          onClick={() => setOpen(true)}
          className={cn(
            "group flex items-center gap-2.5 px-5 py-2",
            "border-2 border-t-0 border-[#1c1f3a] text-[#1c1f3a]",
            "font-mono text-[12px] font-black uppercase tracking-wider",
            "transition-all duration-200",
            "hover:-translate-y-0.5 active:translate-y-0"
          )}
          style={{
            backgroundColor: bg,
            borderRadius: "0 0 8px 8px",
            boxShadow: `0 5px 0 rgba(28,31,58,0.22), 0 8px 16px ${color}55`,
            animation: "subjectPulse 2.8s ease-in-out infinite",
          }}
        >
          <BookOpen className="h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:rotate-12" />
          <span>Subject</span>
          <span className="opacity-40 mx-0.5">·</span>
          <span className="font-bold">{SUBJECT_LABEL[activeSubject]}</span>
          {/* small chevron hint */}
          <svg className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes subjectPulse {
          0%, 100% { box-shadow: 0 5px 0 rgba(28,31,58,0.22), 0 8px 16px ${color}55; }
          50%       { box-shadow: 0 5px 0 rgba(28,31,58,0.22), 0 8px 24px ${color}99; }
        }
      `}</style>

      <SubjectModal
        open={open}
        current={activeSubject}
        onSelect={switchSubject}
        onClose={() => setOpen(false)}
        anchorRef={btnRef as React.RefObject<HTMLElement>}
      />
    </>
  )
}

export function AppShell({ children, inProgress = false }: { children: React.ReactNode; inProgress?: boolean }) {
  usePathname()

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col relative">
        <TopNav inProgress={inProgress} />
        {!inProgress && <SubjectBar />}
        <main className="flex-1 w-full relative z-10">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8 md:py-12">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  )
}
