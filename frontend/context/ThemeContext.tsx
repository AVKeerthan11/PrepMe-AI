"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { normalizeSubject } from "@/lib/subjects"

type ThemeContextValue = {
  themeClass: string
  subject: string
}

const ThemeContext = createContext<ThemeContextValue>({
  themeClass: "theme-science",
  subject: "science",
})

// Maps profile.subject (API key) → theme class
const SUBJECT_TO_THEME: Record<string, string> = {
  // API keys
  science: "theme-science",
  maths: "theme-mathematics",
  social: "theme-social",
  social_studies: "theme-social",
  english: "theme-english",
  // Display names (active_subject in localStorage)
  Science: "theme-science",
  Mathematics: "theme-mathematics",
  "Social Studies": "theme-social",
  English: "theme-english",
}

// Background image per subject theme
const SUBJECT_BG: Record<string, string> = {
  "theme-science":     "url('/background.png')",
  "theme-mathematics": "url('/backgroundmath.png')",
  "theme-social":      "url('/backgroundsocial.png')",
  "theme-english":     "url('/backgroundenglish.png')",
}

const ALL_THEMES = Object.values(SUBJECT_TO_THEME).filter(
  (v, i, a) => a.indexOf(v) === i
)

function applyTheme(theme: string) {
  document.body.classList.remove(...ALL_THEMES)
  document.body.classList.add(theme)
  document.body.style.backgroundImage = SUBJECT_BG[theme] ?? "url('/prepme-bg4.png')"
}

function readSubject(): string {
  try {
    const user = JSON.parse(localStorage.getItem("prepme_user") || "{}")
    const subject = normalizeSubject(user.subject)
    if (subject) return subject
  } catch { /* ignore */ }
  return normalizeSubject(localStorage.getItem("active_subject")) || "science"
}

export function SubjectThemeProvider({ children }: { children: React.ReactNode }) {
  const [subject, setSubject] = useState("science")
  const [themeClass, setThemeClass] = useState("theme-science")

  useEffect(() => {
    const s = readSubject()
    const theme = SUBJECT_TO_THEME[s] ?? "theme-science"
    setSubject(s)
    setThemeClass(theme)
    applyTheme(theme)
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== "active_subject" && e.key !== "prepme_user") return
      const s = readSubject()
      const theme = SUBJECT_TO_THEME[s] ?? "theme-science"
      setSubject(s)
      setThemeClass(theme)
      applyTheme(theme)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  // Poll for subject changes within the same tab
  useEffect(() => {
    let last = readSubject()
    const id = setInterval(() => {
      const current = readSubject()
      if (current !== last) {
        last = current
        const theme = SUBJECT_TO_THEME[current] ?? "theme-science"
        setSubject(current)
        setThemeClass(theme)
        applyTheme(theme)
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

  return (
    <ThemeContext.Provider value={{ themeClass, subject }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useSubjectTheme() {
  return useContext(ThemeContext)
}