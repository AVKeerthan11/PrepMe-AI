"use client"

import { useEffect, useState } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { PencilBar } from "@/components/ui/pencil-bar"

interface TopicPerf {
  topic: string; score: number; tag: string; sessions_done: number
  quiz_attempts: number; quiz_accuracy: number | null
}
interface Analytics {
  readiness: number; days_to_exam: number; sessions_done: number; avg_mastery: number
  topic_performance: TopicPerf[]
  priority_queue: { topic: string; score: number; reason: string }[]
}

interface TopicBreakdownItem {
  topic: string
  score: number
  accuracy: number
  mastery: number
  confidence_calibration: number
}

interface ExamPrediction {
  predicted_score: number
  confidence_level: "High" | "Medium" | "Low"
  topic_breakdown: TopicBreakdownItem[]
}

function Tag({ tag }: { tag: string }) {
  const s: Record<string, string> = {
    Weak:     "text-[#4A6FA5] border border-[#4A6FA5]/30",
    Building: "text-[#c47c2b] border border-[#c47c2b]/30",
    Good:     "text-[#2a7d4f] border border-[#2a7d4f]/30",
  }
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wider rounded-none ${s[tag] ?? ""}`}>{tag}</span>
}

function Gauge({ value }: { value: number }) {
  const r = 54, circ = 2 * Math.PI * r, dash = (value / 100) * circ
  const color = value >= 70 ? "#2a7d4f" : value >= 40 ? "#c47c2b" : "#c0392b"
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="drop-shadow-[2px_4px_0_rgba(28,31,58,0.1)] -rotate-3">
      {/* Messy outer rings */}
      <circle cx="70" cy="70" r={r + 4} fill="none" stroke="#1c1f3a" strokeWidth="1" strokeDasharray="4 2" opacity="0.3" />
      <circle cx="70" cy="70" r={r - 4} fill="none" stroke="#1c1f3a" strokeWidth="1" opacity="0.1" />
      
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(28,31,58,0.06)" strokeWidth="12" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="butt"
        transform="rotate(-90 70 70)" style={{ filter: `drop-shadow(0 0 2px ${color}40)` }} />
      
      {/* Center text like a rubber stamp */}
      <text x="70" y="68" textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 28, fontWeight: 900, fill: color, fontFamily: 'Georgia, serif' }}>{value.toFixed(0)}</text>
      <text x="70" y="88" textAnchor="middle" style={{ fontSize: 10, fill: "#1c1f3a", fontFamily: 'monospace', fontWeight: 'bold' }}>/100</text>
    </svg>
  )
}

export default function AnalyticsPage() {
  const { profile, authFetch, subjectVersion } = useAuth()
  const [data, setData] = useState<Analytics | null>(null)
  const [prediction, setPrediction] = useState<ExamPrediction | null>(null)
  const [predictionLoading, setPredictionLoading] = useState(true)
  const [predictionError, setPredictionError] = useState(false)
  
  // Read subject directly from profile, not from local state
  const selectedSubject = profile?.subject ?? "science"

  const toApiSubject = (s: string) => {
    if (s === "Social Studies" || s === "social") return "social"
    if (s === "Mathematics" || s === "mathematics" || s === "maths") return "mathematics"
    if (s === "English" || s === "english") return "english"
    return "science"
  }

  useEffect(() => {
    setData(null)
    setPrediction(null)
    setPredictionLoading(true)
    setPredictionError(false)

    authFetch(`/api/analytics/?subject=${toApiSubject(selectedSubject)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))

    authFetch(`/api/quiz/exam-prediction`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to fetch prediction")
        return r.json()
      })
      .then(d => {
        if (!d || !d.topic_breakdown || d.topic_breakdown.length === 0) {
          setPredictionError(true)
        } else {
          setPrediction(d)
        }
        setPredictionLoading(false)
      })
      .catch(err => {
        console.error("Failed to load exam prediction:", err)
        setPredictionError(true)
        setPredictionLoading(false)
      })
  }, [authFetch, selectedSubject, subjectVersion])

  const stats = data ? [
    { label: "Readiness",     value: `${data.readiness.toFixed(0)}`, unit: "/100", stripe: "bg-[#ec4899] border-2 border-[#1c1f3a] text-[#1c1f3a]" },
    { label: "Days to Exam",  value: `${data.days_to_exam}`,         unit: "days", stripe: "bg-[#facc15] border-2 border-[#1c1f3a] text-[#1c1f3a]" },
    { label: "Sessions Done", value: `${data.sessions_done}`,        unit: "",     stripe: "bg-[#4ade80] border-2 border-[#1c1f3a] text-[#1c1f3a]" },
    { label: "Avg Mastery",   value: `${(data.avg_mastery * 100).toFixed(0)}%`, unit: "", stripe: "bg-[#fdfcf9] border-2 border-[#1c1f3a] text-[#1c1f3a]" },
  ] : []

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          
          <h1 className="font-serif font-black text-3xl text-[#1c1f3a]">Analytics</h1>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-4 pl-4">
          {stats.map((s, i) => {
            // Give each tag a slight random rotation
            const rot = i % 2 === 0 ? "rotate-[-2deg]" : "rotate-[3deg]"
            return (
              <div key={s.label} className={cn("manila-tag group/stat", rot, s.stripe)} style={{ animationDelay: `${0.1 * i}s`, marginTop: i % 2 !== 0 ? '12px' : '0' }}>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-80 mb-2 border-b-2 border-dashed border-[#1c1f3a]/30 pb-1 font-black">{s.label}</p>
                <p className="font-mono text-4xl font-black drop-shadow-[2px_2px_0_rgba(255,255,255,0.8)]">
                  {s.value}<span className="text-xs font-mono font-bold opacity-80 ml-1">{s.unit}</span>
                </p>
              </div>
            )
          })}
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="space-y-5">
            {/* Readiness Gauge Card */}
            <div className="cardboard-panel bg-[#fdfcf9] p-6 flex flex-col items-center">
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#1c1f3a] mb-4 self-start border-b-2 border-dashed border-[#1c1f3a]/30 pb-1 w-full">Readiness Score</p>
              {data ? <Gauge value={data.readiness} /> : <p className="text-[#1c1f3a] text-sm font-mono animate-pulse">Loading…</p>}
              <p className="text-[10px] text-[#1c1f3a] opacity-70 font-mono mt-4 text-center font-bold">60% mastery · 20% adherence · 20% time</p>
            </div>

            {/* Exam Prediction Score Card */}
            <div className="report-card p-8 flex flex-col relative overflow-hidden group/pred">
              <div className="report-card-header border-[#1c1f3a] border-b-4">
                <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#1c1f3a] mb-2">Official Transcript</p>
                <h2 className="font-mono text-3xl font-black text-[#1c1f3a] tracking-tight">EXAM PREDICTION</h2>
              </div>
              
              {predictionLoading ? (
                <p className="text-[#1c1f3a] text-sm font-mono py-8 text-center animate-pulse italic">Calculating prediction...</p>
              ) : predictionError || !prediction ? (
                <div className="border-2 border-dashed border-[#1c1f3a] p-8 text-center mt-4">
                  <p className="text-xs text-[#1c1f3a] font-mono font-bold uppercase">Not enough quiz data yet</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Score and Badge Display */}
                  <div className="flex flex-col items-center justify-center py-6 border-4 border-[#1c1f3a] bg-transparent rounded-none transition-transform duration-300 group-hover/pred:scale-[1.02] relative">
                    {/* The stamped grade */}
                    <div className="text-center transform rotate-[-2deg]">
                      <span className="font-mono font-black text-7xl text-[#1c1f3a]">{Math.round(prediction.predicted_score)}</span>
                    </div>
                    
                    {/* Confidence Badge */}
                    <div className="absolute -bottom-3 bg-[#fdfcf9] px-2">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-1 uppercase tracking-widest border-2 border-[#1c1f3a] font-mono",
                        prediction.confidence_level === "High" ? "text-[#2a7d4f]" :
                        prediction.confidence_level === "Medium" ? "text-[#c47c2b]" : "text-[#1c1f3a]"
                      )}>
                        {prediction.confidence_level} Confidence
                      </span>
                    </div>
                  </div>

                  {/* Topic Breakdown Table */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1c1f3a] font-mono border-b-2 border-dashed border-[#1c1f3a] pb-1">Topic Breakdown</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-mono text-[10px] text-[#1c1f3a] border-collapse">
                        <thead>
                          <tr className="border-b-2 border-[#1c1f3a]">
                            <th className="pb-2 font-bold uppercase text-[#1c1f3a]">Topic</th>
                            <th className="pb-2 font-bold uppercase text-right px-2 text-[#1c1f3a]">Mastery</th>
                            <th className="pb-2 font-bold uppercase text-right px-2 text-[#1c1f3a]">Accuracy</th>
                            <th className="pb-2 font-bold uppercase text-right text-[#1c1f3a]">Prediction</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgba(28,31,58,0.2)]">
                          {prediction.topic_breakdown.map((row) => (
                            <tr key={row.topic} className="hover:bg-[rgba(28,31,58,0.04)] transition-colors group/row cursor-default">
                              <td className="py-2.5 pr-2 font-medium truncate max-w-[120px] transition-colors group-hover/row:text-[#c0392b] text-[#1c1f3a]">{row.topic}</td>
                              <td className="py-2.5 text-right px-2 text-[#1c1f3a]/70">{(row.mastery * 100).toFixed(0)}%</td>
                              <td className="py-2.5 text-right px-2 text-[#1c1f3a]/70">{(row.accuracy * 100).toFixed(0)}%</td>
                              <td className="py-2.5 text-right font-black text-[#1c1f3a] group-hover/row:scale-110 origin-right transition-transform">{(row.score * 100).toFixed(0)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Thin Mastery Bars for each topic */}
                    <div className="space-y-3 pt-4 border-t-2 border-[#1c1f3a]">
                      {prediction.topic_breakdown.map((row) => (
                        <div key={`bar-${row.topic}`} className="space-y-1.5 group/bar">
                          <div className="flex justify-between text-[9px] font-mono font-bold text-[#1c1f3a]">
                            <span className="truncate max-w-[150px] group-hover/bar:text-[#c0392b] transition-colors">{row.topic}</span>
                            <span className="font-black text-[#1c1f3a] transition-all group-hover/bar:scale-110 origin-right">{(row.score * 100).toFixed(0)}% predicted</span>
                          </div>
                          <PencilBar value={row.score} color={row.score < 0.5 ? "#1c1f3a" : row.score < 0.7 ? "#c47c2b" : "#2a7d4f"} height={12} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Topic Performance Card */}
          <div className="composition-book">
            <div className="composition-page">
              <h2 className="font-serif text-3xl font-black text-[#1c1f3a] mb-6">Gradebook</h2>
              {data ? (
                <div className="space-y-6">
                  {data.topic_performance.map(t => (
                    <div key={t.topic} className="space-y-2 group/perf hover:translate-x-1 transition-transform duration-300">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-[#1c1f3a] font-serif font-bold group-hover/perf:text-[#c0392b] truncate flex-1 transition-colors">{t.topic}</span>
                        <div className="group-hover/perf:scale-105 transition-transform"><Tag tag={t.tag} /></div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <PencilBar value={t.score} color={t.score < 0.5 ? "#1c1f3a" : t.score < 0.7 ? "#c47c2b" : "#2a7d4f"} height={12} />
                        </div>
                        <span className="font-mono text-[10px] text-[#1c1f3a] font-bold w-24 text-right flex-shrink-0 group-hover/perf:text-[#c0392b] transition-colors">
                          {t.quiz_attempts}q · {t.quiz_accuracy != null ? `${(t.quiz_accuracy * 100).toFixed(0)}%` : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[#1c1f3a] text-sm font-mono animate-pulse italic">Loading grades...</p>}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
