"use client"

import { usePathname } from "next/navigation"
import { AuthGuard } from "@/components/auth/auth-guard"
import { TopNav } from "@/components/layout/topnav"
import { SubjectSwitcher } from "@/components/layout/subject-switcher"

export function AppShell({ children }: { children: React.ReactNode }) {
  usePathname()

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col relative">
        <TopNav />
        <SubjectSwitcher />
        <main className="flex-1 w-full relative z-10">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8 md:py-12">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  )
}
