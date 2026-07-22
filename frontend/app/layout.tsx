import type { Metadata } from "next"
import Link from "next/link"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/lib/auth"
import { SubjectThemeProvider } from "@/context/ThemeContext"
import SubjectBackground from "@/components/SubjectBackground"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: "PrepMeAI – Smart Study Companion",
  description: "AI-powered personalized study platform for NCERT Class 8",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="prefetch" href="/home" />
        <link rel="prefetch" href="/tutor" />
        <link rel="prefetch" href="/quiz" />
        <link rel="prefetch" href="/planner" />
        <link rel="prefetch" href="/analytics" />
        <link rel="prefetch" href="/exam" />
        <link rel="prefetch" href="/profile" />
      </head>
      <body className="min-h-screen font-sans antialiased" style={{ backgroundColor: '#E8E3D9' }}>
        <SubjectThemeProvider>
          <SubjectBackground />
          <AuthProvider>{children}</AuthProvider>
        </SubjectThemeProvider>
      </body>
    </html>
  )
}
