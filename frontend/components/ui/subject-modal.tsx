"use client"

/**
 * SubjectModal — reusable modal for subject selection.
 * When `anchorRef` is provided, the dropdown opens anchored below that element.
 * Otherwise it centres as a fullscreen overlay.
 */

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import type { AppSubject } from "@/lib/subjects"

interface SubjectCard {
  id: AppSubject
  label: string
  chapters: string
  color: string
  bg: string
  textColor: string
  imagePath: string
}

const SUBJECT_CARDS: SubjectCard[] = [
  {
    id: "science",
    label: "Science",
    chapters: "11 Chapters",
    color: "#E6B800",
    bg: "#FFF9E6",
    textColor: "#ffdf86ff",
    imagePath: "/subjects/science.png",
  },
  {
    id: "maths",
    label: "Mathematics",
    chapters: "14 Chapters",
    color: "#93b4e6ff",
    bg: "#F0F4F8",
    textColor: "#051e37ff",
    imagePath: "/subjects/maths.png",
  },
  {
    id: "social",
    label: "Social Studies",
    chapters: "7 Chapters",
    color: "#f39e9eff",
    bg: "#FDF2F2",
    textColor: "#B91C1C",
    imagePath: "/subjects/social.png",
  },
  {
    id: "english",
    label: "English",
    chapters: "15 Chapters",
    color: "#c5aefbff",
    bg: "#F5F3FF",
    textColor: "#6B21A8",
    imagePath: "/subjects/english.png",
  },
]

export const SUBJECT_COLORS: Record<AppSubject, { color: string; bg: string }> = {
  science:  { color: "#E6B800", bg: "#FFF9E6" },
  maths:    { color: "#4A6FA5", bg: "#F0F4F8" },
  social:   { color: "#E05252", bg: "#FDF2F2" },
  english:  { color: "#8B5CF6", bg: "#F5F3FF" },
}

interface SubjectModalProps {
  open: boolean
  current?: AppSubject | null
  onSelect: (subject: AppSubject) => void
  onClose: () => void
  /** When provided, the panel drops down anchored to this element instead of centering. */
  anchorRef?: React.RefObject<HTMLElement>
}

export function SubjectModal({ open, current, onSelect, onClose, anchorRef }: SubjectModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Esc to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  // Calculate anchor position when opening
  useEffect(() => {
    if (!open || !anchorRef?.current) { setPos(null); return }
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 8, left: rect.left })
  }, [open, anchorRef])

  if (!open) return null

  // Anchored dropdown
  if (anchorRef) {
    return (
      <div
        className="fixed inset-0 z-50"
        style={{ background: "transparent" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          className="absolute w-[340px] bg-[#FDFCF9] border-2 border-[#1A1A1A]"
          style={{
            top: pos?.top ?? 80,
            left: pos?.left ?? 24,
            boxShadow: "6px 6px 0 #1A1A1A",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ModalContents current={current} onSelect={onSelect} onClose={onClose} />
        </div>
      </div>
    )
  }

  // Centered overlay (used by sidebar)
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(10,10,10,0.65)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className="relative w-full max-w-md bg-[#FDFCF9] border-2 border-[#1A1A1A]"
        style={{ boxShadow: "8px 8px 0 #1A1A1A" }}
      >
        <ModalContents current={current} onSelect={onSelect} onClose={onClose} />
      </div>
    </div>
  )
}

function ModalContents({
  current,
  onSelect,
  onClose,
}: {
  current?: AppSubject | null
  onSelect: (subject: AppSubject) => void
  onClose: () => void
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b-2 border-[#1A1A1A] bg-[#F2EDE5]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#888]">Select</p>
          <h2 className="font-serif font-black text-lg text-[#1A1A1A] leading-tight">Your Subject</h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center border-2 border-[#1A1A1A] bg-[#FDFCF9] font-mono font-black text-sm hover:bg-[#1A1A1A] hover:text-white transition-colors"
        >
          ×
        </button>
      </div>

      {/* Cards grid — scrollable on small screens */}
      <div className="max-h-[65vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-3 p-5">
          {SUBJECT_CARDS.map((card) => {
            const isActive = current === card.id
            return (
              <button
                key={card.id}
                onClick={() => { onSelect(card.id); onClose() }}
                className={cn(
                  "relative flex flex-col items-center text-center border-2 transition-all duration-150 overflow-hidden",
                  isActive ? "border-[#1A1A1A]" : "border-[#D0CAC0] hover:border-[#1A1A1A]"
                )}
                style={{
                  backgroundColor: card.bg,
                  boxShadow: isActive ? `4px 4px 0 ${card.color}` : "2px 2px 0 #C0BAB0",
                }}
              >
                {isActive && (
                  <span className="absolute top-1.5 right-2 text-[10px] font-mono font-black" style={{ color: card.color }}>
                    ✓
                  </span>
                )}
                <div
                  className="w-full h-24 flex items-center justify-center overflow-hidden border-b-2"
                  style={{ borderColor: card.color, backgroundColor: card.bg }}
                >
                  <Image
                    src={card.imagePath}
                    alt={card.label}
                    width={96}
                    height={96}
                    className="object-contain w-20 h-20"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement
                      target.style.display = "none"
                      const placeholder = target.nextSibling as HTMLElement | null
                      if (placeholder) placeholder.style.display = "flex"
                    }}
                  />
                  <div
                    className="hidden w-16 h-16 items-center justify-center text-3xl font-black"
                    style={{ backgroundColor: card.color + "22", color: card.color }}
                  >
                    {card.label[0]}
                  </div>
                </div>
                <div className="px-3 py-2.5">
                  <p className="font-mono text-[11px] font-black uppercase tracking-wider" style={{ color: card.textColor }}>
                    {card.label}
                  </p>
                  <p className="font-mono text-[9px] text-[#AAA] mt-0.5 uppercase tracking-wide">
                    {card.chapters}
                  </p>
                </div>
                <div className="w-full h-1" style={{ backgroundColor: card.color }} />
              </button>
            )
          })}
        </div>
      </div>

      <p className="px-5 pb-4 text-[9px] font-mono text-[#AAA] text-center uppercase tracking-widest">
        All subjects · NCERT Class 8
      </p>
    </>
  )
}
