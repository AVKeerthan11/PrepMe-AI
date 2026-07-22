"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { AppSubject } from "@/lib/subjects"
import { isApiSubject, normalizeSubject, toApiSubject } from "@/lib/subjects"
import { buildPlaceholderProfile, getMockResponse } from "@/lib/subject-mocks"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const AUTH_CHANGED_EVENT = "prepme-auth-changed"

export interface Profile {
  id: string
  name: string
  email: string
  subject: AppSubject
  exam_date: string | null
  days_to_exam: number
  daily_hours: number
  avatar?: string
  mastery: Record<string, { score: number; sessions_done: number; last_tested: string | null }>
}

interface AuthCtx {
  token: string | null
  profile: Profile | null
  loading: boolean
  /** Increments on every subject switch — use as useEffect dependency to re-fetch page data */
  subjectVersion: number
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string, subject: string) => Promise<void>
  logout: () => void
  refreshProfile: () => Promise<void>
  setSubject: (subject: AppSubject) => Promise<void>
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [subjectVersion, setSubjectVersion] = useState(0)

  const authFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const t =
      token ||
      (typeof window !== "undefined"
        ? localStorage.getItem("prepme_token") || localStorage.getItem("token")
        : null)
    const requestInit: RequestInit = {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...(init.headers || {}),
      },
    }

    try {
      return await fetch(`${API}${path}`, requestInit)
    } catch {
      const fallback = getMockResponse(path, requestInit, profile?.subject ?? "science")
      if (fallback) return fallback
      throw new Error("Backend unavailable")
    }
  }, [token, profile?.subject])

  const fetchProfile = useCallback(async (t: string) => {
    try {
      const res = await fetch(`${API}/api/profile/`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.ok) {
        const data = await res.json()
        const active =
          typeof window !== "undefined"
            ? normalizeSubject(localStorage.getItem("active_subject"))
            : null
        const apiSubject = normalizeSubject(data?.subject)
        const nextSubject = active ?? apiSubject ?? "science"
        console.debug("[subject-switch] profile.subject <-", nextSubject)
        if (!data?.subject && active) {
          setProfile(buildPlaceholderProfile(data, nextSubject))
        } else {
          setProfile({ ...data, subject: nextSubject })
        }
      }
    } catch {
      // Backend offline or unreachable — avoid uncaught promise rejections
    }
  }, [])

  useEffect(() => {
    const syncSession = () => {
      const stored =
        localStorage.getItem("prepme_token") || localStorage.getItem("token")
      setToken(stored)
      setLoading(false)
      if (stored) {
        void fetchProfile(stored)
      } else {
        setProfile(null)
      }
    }

    syncSession()

    const handleAuthChange = () => {
      syncSession()
    }

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange)
    window.addEventListener("storage", handleAuthChange)

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange)
      window.removeEventListener("storage", handleAuthChange)
    }
  }, [fetchProfile])

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || "Login failed")
    }
    const { access_token } = await res.json()
    localStorage.setItem("token", access_token)
    localStorage.setItem("prepme_token", access_token)
    setToken(access_token)
    await fetchProfile(access_token)
  }

  const signup = async (name: string, email: string, password: string, subject: string) => {
    const res = await fetch(`${API}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, subject }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || "Signup failed")
    }
    const { access_token } = await res.json()
    localStorage.setItem("token", access_token)
    localStorage.setItem("prepme_token", access_token)
    setToken(access_token)
    await fetchProfile(access_token)
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("prepme_token")
    localStorage.removeItem("prepme_user")
    document.cookie = "prepme_token=; path=/; max-age=0"
    document.cookie = "token=; path=/; max-age=0"
    setToken(null)
    setProfile(null)
    setSubjectVersion(0)
  }

  const refreshProfile = useCallback(async () => {
    const t =
      token ||
      (typeof window !== "undefined"
        ? localStorage.getItem("prepme_token") || localStorage.getItem("token")
        : null)
    if (t) await fetchProfile(t)
  }, [token, fetchProfile])

  const setSubject = useCallback(async (subject: AppSubject) => {
    const nextSubject = normalizeSubject(subject) ?? "science"
    if (profile?.subject === nextSubject) return
    console.debug("[subject-switch] setSubject clicked ->", subject, "normalized ->", nextSubject, "current ->", profile?.subject)
    if (typeof window !== "undefined") {
      localStorage.setItem("active_subject", nextSubject)
    }
    if (!isApiSubject(nextSubject)) return
    const apiSubject = toApiSubject(nextSubject)
    const res = await fetch(`${API}/api/profile/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token || localStorage.getItem("prepme_token") || localStorage.getItem("token")
          ? {
              Authorization: `Bearer ${
                token ||
                localStorage.getItem("prepme_token") ||
                localStorage.getItem("token")
              }`,
            }
          : {}),
      },
      body: JSON.stringify({ subject: apiSubject }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || "Failed to switch subject")
    }
    await refreshProfile()
    console.debug("[subject-switch] setSubject completed ->", nextSubject)
    setSubjectVersion((v) => v + 1)
  }, [profile, token, refreshProfile])

  return (
    <Ctx.Provider value={{
      token, profile, loading, subjectVersion,
      login, signup, logout, refreshProfile, setSubject, authFetch,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
