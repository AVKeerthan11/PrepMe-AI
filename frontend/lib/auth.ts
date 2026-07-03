const TOKEN_KEY = "prepme_token"
const USER_KEY = "prepme_user"
const LEGACY_TOKEN_KEY = "token"
const COOKIE_NAME = "prepme_token"

export interface PrepMeUser {
  id?: string
  name?: string
  email?: string
  onboarding_complete?: boolean
  board?: string
  class?: number
  subject?: string
  [key: string]: unknown
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) return true
    return false
  } catch {
    return false
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
}

export function getUser(): PrepMeUser | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PrepMeUser
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  const token = getToken()
  if (!token) return false
  return !isTokenExpired(token)
}

export function setAuthCookie(token: string): void {
  if (typeof document === "undefined") return
  const maxAge = 60 * 60 * 24 * 7
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function clearAuthCookie(): void {
  if (typeof document === "undefined") return
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`
}

export function saveSession(token: string, user: PrepMeUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem(LEGACY_TOKEN_KEY, token)
  setAuthCookie(token)
  if (typeof document !== "undefined") {
    const maxAge = 60 * 60 * 24 * 7
    document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`
  }
}

export function clearAuthSessionKeepProfile(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  clearAuthCookie()
  if (typeof document !== "undefined") {
    document.cookie = "token=; path=/; max-age=0"
  }
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  clearAuthCookie()
  if (typeof document !== "undefined") {
    document.cookie = "token=; path=/; max-age=0"
  }
  window.location.href = "/"
}

/** Used by middleware (cookie-only, no localStorage). */
export function isTokenExpiredServer(token: string): boolean {
  return isTokenExpired(token)
}

export * from "./auth.tsx"
