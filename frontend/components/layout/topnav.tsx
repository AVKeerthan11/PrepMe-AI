"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { usePathname, useRouter } from "next/navigation"
import {
  LogOut,
  LayoutDashboard,
  Sparkles,
  PenTool,
  CalendarDays,
  LineChart,
  User,
  Activity,
  ClipboardCheck
} from "lucide-react"
import { useAuth } from "@/lib/auth"

const nav = [
  { name: "Dashboard", href: "/home",     icon: LayoutDashboard },
  { name: "AI Tutor",  href: "/tutor",      icon: Sparkles },
  { name: "Quiz",      href: "/quiz",       icon: PenTool },
  { name: "Planner",   href: "/planner",    icon: CalendarDays },
  { name: "Analytics", href: "/analytics",  icon: LineChart },
  { name: "Exam",      href: "/exam",       icon: ClipboardCheck },
]

const BriefcaseNavItem = ({
  name, href, icon: Icon
}: {
  name: string
  href: string
  icon: React.ElementType
}) => {
  const pathname = usePathname()
  const router = useRouter()
  const active = pathname === href
  const [phase, setPhase] = useState<"idle"|"shake"|"open">("idle")
  const [hovered, setHovered] = useState(false)

  const handleClick = () => {
    if (phase !== "idle") return
    setPhase("shake")
    setTimeout(() => setPhase("open"), 300)
    setTimeout(() => {
      router.push(href)
      setTimeout(() => setPhase("idle"), 400)
    }, 700)
  }

  const accentColor = "#4A6FA5"
  const borderColor = "#1c1f3a"

  return (
    <motion.div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={phase === "shake" ? {
        y: [0, -8, 2, -2, 0],
        rotate: [0, -6, 4, -2, 0],
        scale: [1, 1.05, 0.95, 1.02, 1],
        transition: { duration: 0.45, ease: "backOut", times: [0, 0.3, 0.6, 0.8, 1] }
      } : {}}
      style={{
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start", /* Lift them up */
        paddingTop: "4px", /* Add some space from the top */
        paddingLeft: "6px",
        paddingRight: "6px",
        height: "100%",
        userSelect: "none",
        position: "relative",
      }}
    >
      {/* HANDLE */}
      <motion.div
        animate={{ y: phase === "open" ? -4 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        style={{
          width: "28px",
          height: "10px",
          borderTop: `2.5px solid ${borderColor}`,
          borderLeft: `2.5px solid ${borderColor}`,
          borderRight: `2.5px solid ${borderColor}`,
          borderBottom: "none",
          borderRadius: "6px 6px 0 0",
          marginBottom: "-2px",
          position: "relative",
          zIndex: 3,
          background: active ? accentColor : "#e4d5b7",
          boxShadow: "inset 0 3px 0 rgba(255,255,255,0.2)",
        }}
      />

      {/* BRIEFCASE BODY */}
      <div style={{
        position: "relative",
        width: "100px",
        borderRadius: "6px",
        border: `2.5px solid ${borderColor}`,
        transition: "box-shadow 0.2s, transform 0.2s",
        transform: hovered && !active && phase === "idle" ? "translateY(-2px)" : "translateY(0)",
        boxShadow: active
          ? "0 0 0 2px #4A6FA5, 3px 4px 0 rgba(28,31,58,0.25)"
          : "3px 4px 0 rgba(28,31,58,0.25)",
        overflow: "hidden",
      }}>

        {/* TOP LID — slides UP on open */}
        <motion.div
          animate={{ y: phase === "open" ? "-100%" : "0%" }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          style={{
            height: "28px",
            background: active ? accentColor : "#fcfaf8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            borderBottom: `2px dashed ${active ? "rgba(255,255,255,0.4)" : "rgba(28,31,58,0.15)"}`,
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Icon & Text Container */}
          <div style={{
            position: "relative", zIndex: 10,
            display: "flex", alignItems: "center", gap: "4px",
            background: "transparent",
            padding: "0 4px",
          }}>
            <Icon style={{
              width: 12, height: 12,
              color: active ? "#ffffff" : "#1c1f3a",
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "9px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: active ? "#ffffff" : "#1c1f3a",
            }}>
              {name}
            </span>
          </div>
        </motion.div>

        {/* BOTTOM PANEL — slides DOWN on open */}
        <motion.div
          animate={{ y: phase === "open" ? "100%" : "0%" }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          style={{
            height: "14px",
            background: "#1c1f3a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            position: "relative",
          }}
        >
          <span style={{
            position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)",
            width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.15)"
          }} />
          <span style={{
            width: 4, height: 4, borderRadius: "50%",
            background: active ? "#FFD600" : "rgba(255,255,255,0.10)",
            boxShadow: active ? `0 0 6px #FFD600` : "none",
            transition: "all 0.2s"
          }} />
          <span style={{
            width: 14, height: 3, borderRadius: "2px",
            background: active ? "#00E5FF" : "rgba(255,255,255,0.10)",
            boxShadow: active ? "0 0 6px #00E5FF" : "none",
            transition: "all 0.2s"
          }} />
          <span style={{
            width: 4, height: 4, borderRadius: "50%",
            background: active ? "#FF0055" : "rgba(255,255,255,0.10)",
            boxShadow: active ? `0 0 6px #FF0055` : "none",
            transition: "all 0.2s"
          }} />
          <span style={{
            position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
            width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.15)"
          }} />
        </motion.div>

      </div>
    </motion.div>
  )
}

export function TopNav() {
  const router = useRouter()
  const { profile, logout } = useAuth()

  const handleLogout = () => { logout(); router.push("/login") }

  const daysLeft = profile?.days_to_exam ?? 30

  return (
    <>
      {/* Pink Top Banner */}
      <div className="bg-[#4A6FA5] text-white font-mono text-[11px] font-bold text-center py-2 px-4 border-b border-[rgba(28,31,58,0.15)] flex items-center justify-center relative z-50">
        <span>PrepMeAI-4 is now live: Real-time learning with emotional intelligence.{" "}
          <a href="#" className="underline hover:text-[#ffe0e6] transition-colors">Learn more.</a>
        </span>
        <button className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 border border-[rgba(28,31,58,0.40)] hover:bg-[rgba(28,31,58,0.15)] transition-colors flex items-center justify-center w-5 h-5">
          <span className="text-[10px] leading-none" style={{ marginTop: "-1px" }}>✕</span>
        </button>
      </div>

      {/* Navbar */}
      <div className="px-4 py-3 sticky top-0 z-40 bg-transparent pointer-events-none">
        <header
          className="bg-[#FFD600] flex items-stretch mx-auto pointer-events-auto transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden"
          style={{
            height: "68px",
            border: "3px solid #1c1f3a",
            borderTop: "none",
            boxShadow: "0 8px 0 rgba(28,31,58,0.22)",
            maxWidth: "1600px",
            borderRadius: "0 0 6px 6px",
            margin: "0 12px",
            backgroundImage: "repeating-linear-gradient(to right, #1c1f3a 0, #1c1f3a 2px, transparent 2px, transparent 10px), repeating-linear-gradient(to right, #1c1f3a 0, #1c1f3a 2px, transparent 2px, transparent 50px)",
            backgroundSize: "10px 8px, 50px 14px",
            backgroundPosition: "bottom left, bottom left",
            backgroundRepeat: "repeat-x, repeat-x"
          }}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 px-6 border-r border-[rgba(28,31,58,0.10)] flex-shrink-0 hover:bg-[rgba(28,31,58,0.05)] transition-colors relative overflow-hidden group">
            <div className="absolute inset-0 bg-[#4A6FA5] translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
            <span className="relative z-10 text-[#1c1f3a] font-serif font-black text-2xl tracking-tight group-hover:text-[#1c1f3a] transition-colors duration-300 flex items-center">
              <span className="font-mono text-lg mr-2">■</span>
              PrepMeAI
            </span>
          </Link>

          {/* Briefcase Nav Items */}
          <nav className="flex items-start h-full gap-2 px-4 pt-1">
            {nav.map(({ name, href, icon }) => (
              <BriefcaseNavItem key={href} name={name} href={href} icon={icon} />
            ))}
          </nav>

          <div className="flex-1 border-r border-[rgba(28,31,58,0.10)]" />

          {/* Right cluster */}
          <div className="flex items-stretch flex-shrink-0">
            <div className="flex items-center px-6 border-r border-[rgba(28,31,58,0.12)] gap-2 hover:bg-[rgba(28,31,58,0.05)] transition-colors cursor-default">
              <Activity className="w-3.5 h-3.5 text-[#2a7d4f]" />
              <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[rgba(28,31,58,0.55)]">Exam</span>
              <span className="font-mono text-sm font-black text-[#4A6FA5]">{daysLeft}d</span>
            </div>
            <Link href="/profile" className="flex items-center justify-center px-8 border-r border-[rgba(28,31,58,0.12)] font-mono text-[11px] font-black uppercase tracking-widest hover:bg-[rgba(28,31,58,0.05)] transition-all text-[rgba(28,31,58,0.55)] hover:text-[#1c1f3a] group relative overflow-hidden">
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-[#1c1f3a] translate-y-full group-hover:translate-y-0 transition-transform duration-200 ease-out" />
              <span className="flex items-center group-hover:-translate-y-0.5 transition-transform duration-200">
                <User className="w-3.5 h-3.5 mr-2" />
                Profile
              </span>
            </Link>
            <button onClick={handleLogout}
              className="flex items-center justify-center px-8 bg-[#1c1f3a] font-mono text-[11px] font-black uppercase tracking-widest text-white hover:bg-[#3d5f8f] transition-colors"
              style={{ boxShadow: "inset 0 1px 0 rgba(28,31,58,0.15)" }}>
              <span className="flex items-center group-hover:-translate-y-0.5 transition-transform duration-200">
                <LogOut className="w-3.5 h-3.5 mr-2" />
                Logout
              </span>
            </button>
          </div>
        </header>
      </div>
    </>
  )
}
