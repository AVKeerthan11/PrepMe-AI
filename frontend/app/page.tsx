"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

const NAVY = "#0f1b3d"
const GOLD = "#f5a623"

function BrainIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4c-1.5 0-2.8.8-3.5 2C7.2 5.5 5.5 6.5 5 8.2 4.2 8.5 3.5 9.3 3.5 10.5c0 .8.4 1.5 1 1.9-.3.5-.5 1.1-.5 1.8 0 1.8 1.5 3.2 3.3 3.2.3 1.2 1.3 2.1 2.6 2.1.5 0 1-.1 1.4-.4.6 1.2 1.9 2 3.2 2 2.2 0 4-1.8 4-4v-.3c1.4-.4 2.5-1.7 2.5-3.2 0-1.1-.6-2.1-1.5-2.6.3-.5.5-1.1.5-1.7 0-1.9-1.6-3.5-3.5-3.5-.8 0-1.5.3-2 .7C14.5 4.8 13.3 4 12 4z"
        fill={GOLD}
        stroke={NAVY}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StarRating() {
  return (
    <div className="landing-stars" aria-label="5 out of 5 stars">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={GOLD} aria-hidden>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

function SocialIcon({ type }: { type: "instagram" | "twitter" | "youtube" }) {
  const paths: Record<string, string> = {
    instagram:
      "M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm5 5a4 4 0 100 8 4 4 0 000-8zm6.5-.9a1.1 1.1 0 11-2.2 0 1.1 1.1 0 012.2 0z",
    twitter: "M22 5.8a8.4 8.4 0 01-2.4.7 4.2 4.2 0 001.8-2.3 8.3 8.3 0 01-2.7 1 4.1 4.1 0 00-7 3.7 11.6 11.6 0 01-8.4-4.3 4.1 4.1 0 001.3 5.5 4 4 0 01-1.9-.5v.1a4.1 4.1 0 003.3 4 4 4 0 01-1.9.1 4.1 4.1 0 003.8 2.8A8.3 8.3 0 012 18.1 14.3 14.3 0 008 20c9.4 0 14.5-7.8 14.5-14.5v-.7A10.2 10.2 0 0022 5.8z",
    youtube:
      "M21.6 7.2a2.8 2.8 0 00-2-2C17.8 4.5 12 4.5 12 4.5s-5.8 0-7.6.7a2.8 2.8 0 00-2 2A29.4 29.4 0 004.5 12a29.4 29.4 0 00.9 4.8 2.8 2.8 0 002 2c1.8.7 7.6.7 7.6.7s5.8 0 7.6-.7a2.8 2.8 0 002-2 29.4 29.4 0 00.9-4.8 29.4 29.4 0 00-.9-4.8zM10 15.5v-7l6 3.5-6 3.5z",
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={paths[type]} />
    </svg>
  )
}

function CourseIcon({ subject }: { subject: "science" | "maths" | "social" | "english" }) {
  const common = { width: 40, height: 40, viewBox: "0 0 24 24", fill: "none", stroke: GOLD, strokeWidth: 1.8 }
  if (subject === "science") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <ellipse cx="12" cy="12" rx="10" ry="4" />
        <ellipse cx="12" cy="12" rx="4" ry="10" />
      </svg>
    )
  }
  if (subject === "maths") {
    return (
      <svg {...common} aria-hidden>
        <path d="M4 20L20 4M8 4h12v12M4 8h12v12" strokeLinecap="round" />
      </svg>
    )
  }
  if (subject === "social") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
      </svg>
    )
  }
  return (
    <svg {...common} aria-hidden>
      <path d="M5 4h14v16H5z" />
      <path d="M8 8h8M8 12h6M8 16h4" strokeLinecap="round" />
    </svg>
  )
}

function useFadeInOnScroll() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const nodes = el.querySelectorAll(".landing-fade")
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("landing-fade-visible")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])
  return ref
}

export default function LandingPage() {
  const [headerScrolled, setHeaderScrolled] = useState(false)
  const rootRef = useFadeInOnScroll()

  useEffect(() => {
    document.body.classList.add("landing-active")
    return () => document.body.classList.remove("landing-active")
  }, [])

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 80)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const courses = [
    {
      key: "science" as const,
      name: "Science",
      chapters: ["Physics", "Chemistry", "Biology"],
    },
    {
      key: "maths" as const,
      name: "Mathematics",
      chapters: ["Algebra", "Geometry", "Mensuration"],
    },
    {
      key: "social" as const,
      name: "Social Studies",
      chapters: ["History", "Geography", "Civics"],
    },
    {
      key: "english" as const,
      name: "English",
      chapters: ["Grammar", "Literature", "Writing"],
    },
  ]

  const steps = [
    {
      n: 1,
      title: "Create Your Profile",
      desc: "Choose your class, board, and subjects. PrepMe tailors every quiz and plan to your syllabus.",
    },
    {
      n: 2,
      title: "Take Adaptive Quizzes",
      desc: "AI adjusts question difficulty in real time based on how you answer — no one-size-fits-all drills.",
    },
    {
      n: 3,
      title: "Track Your Progress",
      desc: "Use your study planner and mastery dashboard to focus on weak chapters before exams.",
    },
  ]

  const testimonials = [
    {
      quote: "PrepMe.AI helped me score 94% in Science!",
      name: "Priya",
      detail: "Class 10, Delhi",
    },
    {
      quote: "The adaptive quizzes are exactly what I needed.",
      name: "Arjun",
      detail: "Class 8, Chennai",
    },
    {
      quote: "My weak chapters improved in 2 weeks.",
      name: "Sneha",
      detail: "Class 9, Mumbai",
    },
  ]

  const tocLinks = [
    { href: "#home", label: "Home" },
    { href: "#courses", label: "Courses" },
    { href: "#about", label: "About" },
    { href: "#how-it-works", label: "How It Works" },
    { href: "#testimonials", label: "Testimonials" },
    { href: "#cta", label: "Get Started" },
  ]

  return (
    <div className="landing-page" ref={rootRef}>
      <header
        className={`landing-header${headerScrolled ? " landing-header-scrolled" : ""}`}
      >
        <div className="landing-header-inner">
          <Link href="/" className="landing-logo">
            <BrainIcon />
            <span>PrepMe.AI</span>
          </Link>

          <nav className="landing-nav" aria-label="Main">
            <a href="#home">Home</a>
            <a href="#courses">Courses</a>
            <a href="#about">About</a>
            <a href="#how-it-works">How It Works</a>
          </nav>

          <div className="landing-header-actions">
            <Link href="/login" className="landing-btn landing-btn-outline">
              Login
            </Link>
            <Link href="/login" className="landing-btn landing-btn-gold">
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section id="home" className="landing-hero landing-section">
          <div className="landing-container landing-hero-grid">
            <div className="landing-hero-copy landing-fade">
              <h1>
                India&apos;s Smartest AI Study Companion for Classes 4–12
              </h1>
              <p className="landing-hero-sub">
                Personalised quizzes, adaptive study plans, and an AI tutor — all
                grounded in your actual NCERT textbook.
              </p>
              <div className="landing-hero-actions">
                <Link href="/login" className="landing-btn landing-btn-gold landing-btn-lg">
                  Start Learning Free
                </Link>
                <a href="#how-it-works" className="landing-btn landing-btn-outline landing-btn-lg">
                  Watch Demo
                </a>
              </div>
              <ul className="landing-trust">
                <li>CBSE, ICSE &amp; State Boards</li>
                <li>Classes 4 to 12</li>
                <li>AI-Powered, Not Generic</li>
              </ul>
            </div>

            <div className="landing-hero-card-wrap landing-fade">
              <div className="landing-quiz-mockup" aria-hidden>
                <div className="landing-quiz-mockup-header">
                  <span>Question 3 of 5</span>
                  <span className="landing-quiz-difficulty">
                    Medium Difficulty
                    <span className="landing-quiz-stars">
                      <span /><span /><span />
                    </span>
                  </span>
                </div>
                <p className="landing-quiz-question">
                  Which organelle is responsible for photosynthesis in plant cells?
                </p>
                <ul className="landing-quiz-options">
                  <li>Mitochondria</li>
                  <li className="landing-quiz-option-selected">Chloroplast</li>
                  <li>Ribosome</li>
                  <li>Nucleus</li>
                </ul>
                <div className="landing-quiz-score">
                  <span>Your Score</span>
                  <strong>78%</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-stats-bar landing-fade" aria-label="Platform statistics">
          <div className="landing-container landing-stats-grid">
            <div>
              <strong>50,000+</strong>
              <span>Students</span>
            </div>
            <div>
              <strong>4</strong>
              <span>Subjects</span>
            </div>
            <div>
              <strong>4–12</strong>
              <span>Classes</span>
            </div>
            <div>
              <strong>98%</strong>
              <span>Accuracy (RAG-grounded)</span>
            </div>
          </div>
        </section>

        <section id="courses" className="landing-section landing-courses">
          <div className="landing-container">
            <h2 className="landing-section-title landing-fade">Subjects We Cover</h2>
            <div className="landing-courses-grid">
              {courses.map((c) => (
                <article key={c.key} className="landing-course-card landing-fade">
                  <CourseIcon subject={c.key} />
                  <h3>{c.name}</h3>
                  <ul>
                    {c.chapters.map((ch) => (
                      <li key={ch}>{ch}</li>
                    ))}
                  </ul>
                  <Link href="/login" className="landing-course-link">
                    Explore →
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="landing-section landing-about">
          <div className="landing-container landing-fade">
            <p className="landing-about-text">
              PrepMe.AI is built for Indian students in Classes 4–12. Every quiz,
              explanation, and study plan is grounded in NCERT — so you learn what
              actually appears on your board exams, not generic internet trivia.
            </p>
          </div>
        </section>

        <section id="how-it-works" className="landing-section landing-steps-section">
          <div className="landing-container">
            <h2 className="landing-section-title landing-fade">How It Works</h2>
            <div className="landing-steps">
              {steps.map((s) => (
                <div key={s.n} className="landing-step landing-fade">
                  <div className="landing-step-num">{s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="testimonials" className="landing-section landing-testimonials">
          <div className="landing-container">
            <h2 className="landing-section-title landing-fade">
              Trusted by Students Across India
            </h2>
            <div className="landing-testimonials-grid">
              {testimonials.map((t) => (
                <blockquote key={t.name} className="landing-testimonial landing-fade">
                  <p>&ldquo;{t.quote}&rdquo;</p>
                  <footer>
                    <StarRating />
                    <cite>
                      {t.name} — {t.detail}
                    </cite>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <section id="cta" className="landing-cta landing-fade">
          <div className="landing-container landing-cta-inner">
            <h2>Ready to Start Preparing Smarter?</h2>
            <p>Join thousands of students acing their exams with AI.</p>
            <Link href="/login" className="landing-btn landing-btn-navy landing-btn-lg">
              Get Started Free →
            </Link>
          </div>
        </section>
      </main>

      <nav className="landing-toc" aria-label="Page contents">
        <div className="landing-container landing-toc-inner">
          {tocLinks.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>
      </nav>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-grid">
          <div>
            <div className="landing-footer-logo">
              <BrainIcon size={24} />
              <span>PrepMe.AI</span>
            </div>
            <p className="landing-footer-tagline">
              Your AI study companion for board exams.
            </p>
            <p className="landing-footer-made">Made for Indian Students</p>
          </div>

          <div>
            <h4>Quick Links</h4>
            <ul>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/quiz">Quiz</Link></li>
              <li><Link href="/tutor">Tutor</Link></li>
              <li><Link href="/planner">Planner</Link></li>
              <li><Link href="/analytics">Analytics</Link></li>
            </ul>
          </div>

          <div>
            <h4>Subjects</h4>
            <ul>
              <li><a href="#courses">Science</a></li>
              <li><a href="#courses">Maths</a></li>
              <li><a href="#courses">Social Studies</a></li>
              <li><a href="#courses">English</a></li>
            </ul>
          </div>

          <div>
            <h4>Contact</h4>
            <a href="mailto:support@prepme.ai" className="landing-footer-email">
              support@prepme.ai
            </a>
            <div className="landing-social">
              <a href="#" aria-label="Instagram"><SocialIcon type="instagram" /></a>
              <a href="#" aria-label="Twitter"><SocialIcon type="twitter" /></a>
              <a href="#" aria-label="YouTube"><SocialIcon type="youtube" /></a>
            </div>
          </div>
        </div>

        <div className="landing-footer-bottom">
          <div className="landing-container">
            © 2024 PrepMe.AI | Privacy Policy | Terms of Use
          </div>
        </div>
      </footer>
    </div>
  )
}
