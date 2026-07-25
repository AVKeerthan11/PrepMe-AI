export type AppSubject = "science" | "maths" | "social" | "english"

export type ApiSubject = "science" | "maths" | "social_studies" | "english"

export const SUBJECT_TABS: { id: AppSubject; label: string; accent: string }[] = [
  { id: "science", label: "SCIENCE", accent: "#4A6FA5" },
  { id: "maths", label: "MATHS", accent: "#4A6FA5" },
  { id: "social", label: "SOCIAL STUDIES", accent: "#e07b39" },
  { id: "english", label: "ENGLISH", accent: "#5e2b97" },
]

export const SUBJECT_PROGRESS_META: Record<
  string,
  { label: string; chapters: number; color: string }
> = {
  Science: { label: "SCIENCE", chapters: 15, color: "#2d6a4f" },
  Mathematics: { label: "MATHEMATICS", chapters: 14, color: "#1d3557" },
  science: { label: "SCIENCE", chapters: 15, color: "#2d6a4f" },
  maths: { label: "MATHEMATICS", chapters: 14, color: "#1d3557" },
  social: { label: "SOCIAL STUDIES", chapters: 20, color: "#e07b39" },
  social_studies: { label: "SOCIAL STUDIES", chapters: 20, color: "#e07b39" },
  english: { label: "ENGLISH", chapters: 12, color: "#5e2b97" },
  "Social Studies": { label: "SOCIAL STUDIES", chapters: 20, color: "#e07b39" },
  English: { label: "ENGLISH", chapters: 12, color: "#5e2b97" },
}

const DISPLAY_TO_ID: Record<string, AppSubject> = {
  Science: "science",
  Mathematics: "maths",
  Maths: "maths",
  "Social Studies": "social",
  Social: "social",
  English: "english",
}

export function normalizeSubject(subject: string | null | undefined): AppSubject | null {
  if (!subject) return null
  if (subject === "science" || subject === "maths" || subject === "social" || subject === "english") {
    return subject
  }
  if (subject === "social_studies") return "social"
  return DISPLAY_TO_ID[subject] ?? null
}

export function toApiSubject(subject: AppSubject): ApiSubject {
  return subject === "social" ? "social_studies" : subject
}

export function displayNameToId(name: string): AppSubject | null {
  return normalizeSubject(name)
}

export function getProgressForSubject(
  displayName: string,
  profile: { subject?: string; mastery?: Record<string, { score: number }> } | null
): { percent: number; covered: number; total: number } {
  const meta = SUBJECT_PROGRESS_META[displayName] ?? {
    label: displayName.toUpperCase(),
    chapters: 10,
    color: "#4A6FA5",
  }
  const id = displayNameToId(displayName)

  if (id && isPlaceholderSubject(id)) {
    const pct = id === "social" ? 12 : 8
    const covered = Math.round((pct / 100) * meta.chapters)
    return { percent: pct, covered, total: meta.chapters }
  }

  if (normalizeSubject(profile?.subject) === id && profile?.mastery) {
    const scores = Object.values(profile.mastery).map((m) => m.score)
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      const percent = Math.round(avg * 100)
      const covered = scores.filter((s) => s >= 0.6).length
      return { percent, covered, total: scores.length }
    }
  }

  try {
    const raw = JSON.parse(localStorage.getItem("prepme_mastery") || "{}")
    const val = raw[displayName]
    if (typeof val === "number") {
      const percent = val <= 1 ? Math.round(val * 100) : Math.round(val)
      return {
        percent,
        covered: Math.round((percent / 100) * meta.chapters),
        total: meta.chapters,
      }
    }
  } catch {
    /* ignore */
  }

  return { percent: 0, covered: 0, total: meta.chapters }
}

export function isApiSubject(subject: string): subject is AppSubject {
  return subject === "science" || subject === "maths" || subject === "social" || subject === "english"
}

export function isPlaceholderSubject(subject: string): boolean {
  return false  // All subjects are now fully supported
}

export function getEnrolledSubjects(): string[] {
  if (typeof window === "undefined") {
    return ["Science", "Mathematics", "Social Studies", "English"]
  }
  try {
    const user = JSON.parse(localStorage.getItem("prepme_user") || "{}")
    if (Array.isArray(user.subjects) && user.subjects.length > 0) {
      return user.subjects
    }
  } catch {
    /* ignore */
  }
  return ["Science", "Mathematics", "Social Studies", "English"]
}
