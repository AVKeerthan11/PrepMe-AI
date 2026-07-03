import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PROTECTED_PREFIXES = [
  "/home",
  "/quiz",
  "/tutor",
  "/planner",
  "/analytics",
  "/dashboard",
  "/profile",
]

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) return true
    return false
  } catch {
    return false
  }
}

function getTokenFromRequest(request: NextRequest): string | null {
  const raw =
    request.cookies.get("prepme_token")?.value ||
    request.cookies.get("token")?.value
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

function isAuthEntryPath(pathname: string): boolean {
  return pathname.startsWith("/auth") || pathname === "/login"
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = getTokenFromRequest(request)
  const authenticated = !!token && !isTokenExpired(token)

  if (
    (isProtectedPath(pathname) || pathname.startsWith("/onboarding")) &&
    !authenticated
  ) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.search = ""
    return NextResponse.redirect(loginUrl)
  }

  if (authenticated && isAuthEntryPath(pathname)) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = "/home"
    homeUrl.search = ""
    return NextResponse.redirect(homeUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/home/:path*",
    "/quiz/:path*",
    "/tutor/:path*",
    "/planner/:path*",
    "/analytics/:path*",
    "/dashboard/:path*",
    "/profile/:path*",
    "/auth/login",
    "/auth/register",
    "/auth/:path*",
    "/onboarding",
    "/login",
  ],
}
