import codecs

path = r"D:\PrepMeModel-main\frontend\app\planner\page.tsx"
with codecs.open(path, "r", "utf-8") as f:
    content = f.read()

components_code = \"\"\"
const SUBJECT_CHAPTERS: Record<string, string[]> = {
  Science: [
    "Exploring the Investigative World of Science",
    "The Invisible Living World: Beyond Our Naked Eye",
    "Health: The Ultimate Treasure",
    "Electricity: Magnetic and Heating Effects",
    "Exploring Forces",
    "Pressure, Winds, Storms, and Cyclones",
    "Particulate Nature of Matter",
    "Nature of Matter: Elements, Compounds, and Mixtures",
    "The Amazing World of Solutes, Solvents, and Solutions",
    "Light: Mirrors and Lenses",
    "Keeping Time with the Skies",
  ],
  Mathematics: [
    "Rational Numbers",
    "Linear Equations in One Variable",
    "Understanding Quadrilaterals",
    "Practical Geometry",
    "Data Handling",
    "Squares and Square Roots",
    "Cubes and Cube Roots",
    "Comparing Quantities",
    "Algebraic Expressions and Identities",
    "Mensuration",
    "Exponents and Powers",
    "Direct and Inverse Proportions",
    "Factorisation",
    "Introduction to Graphs",
  ],
  Social: [
    "Natural Resources and Their Conservation",
    "Reshaping India's Political Map",
    "The Rise of the Marathas",
    "The Colonial Era in India",
    "Universal Franchise and India's Electoral System",
    "The Parliamentary System: Legislature and Executive",
    "Factors of Production",
  ],
  English: [
    "The Wit that Won Hearts",
    "A Concrete Example",
    "Wisdom Paves the Way",
    "A Tale of Valour: Major Somnath Sharma and the Battle of Badgam",
    "Somebody's Mother",
    "Verghese Kurien: I Too Had A Dream",
    "The Case of the Fifth Word",
    "The Magic Brush of Dreams",
    "Spectacular Wonders",
    "The Cherry Tree",
    "Harvest Hymn",
    "Waiting for the Rain",
    "Feathered Friend",
    "Magnifying Glass",
    "Bibha Chowdhuri: The Beam of Light that Lit the Path for Women in Indian Science",
  ],
};

function PlanChapterModal({ onClose, onSuccess, profile, authFetch }: { onClose: () => void, onSuccess: () => void, profile: any, authFetch: any }) {
  const [subject, setSubject] = useState("Science");
  const [chapter, setChapter] = useState(SUBJECT_CHAPTERS["Science"][0]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [days, setDays] = useState(3);
  const [generating, setGenerating] = useState(false);

  const chapters = SUBJECT_CHAPTERS[subject] || [];
  const chapIdx = chapters.indexOf(chapter);
  const prereqs = chapIdx > 0 ? chapters.slice(0, chapIdx) : [];

  const TIME_MAP: Record<string, number> = { Morning: 6, Afternoon: 12, Evening: 17, Night: 20 };

  const handleGenerate = async () => {
    if (timeSlots.length === 0) return alert("Select at least one preferred time.");
    setGenerating(true);
    try {
      const res = await authFetch("/api/planner/generate-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject, chapter, days,
          preferred_hours: timeSlots.map(t => TIME_MAP[t])
        })
      });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        alert("Failed to generate plan.");
      }
    } catch (e) {
      alert("Error generating plan.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-[480px] max-w-full index-card animate-slide-up relative p-8" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-[#1c1f3a] font-mono text-xl font-black hover:text-[#c0392b]">&times;</button>
        <p className="font-serif font-black text-2xl text-[#1c1f3a] mb-6">Plan a Chapter</p>
        
        <div className="space-y-4">
          <div>
            <label className="font-mono text-xs font-bold uppercase tracking-wider text-[#1c1f3a] block mb-1">Subject</label>
            <select className="w-full border-2 border-[#1c1f3a] bg-transparent p-2 font-serif text-[#1c1f3a]"
              value={subject} onChange={e => { setSubject(e.target.value); setChapter(SUBJECT_CHAPTERS[e.target.value][0]); }}>
              {Object.keys(SUBJECT_CHAPTERS).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          <div>
            <label className="font-mono text-xs font-bold uppercase tracking-wider text-[#1c1f3a] block mb-1">Chapter</label>
            <select className="w-full border-2 border-[#1c1f3a] bg-transparent p-2 font-serif text-[#1c1f3a]"
              value={chapter} onChange={e => setChapter(e.target.value)}>
              {chapters.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="font-mono text-xs font-bold uppercase tracking-wider text-[#1c1f3a] block mb-1">Prerequisites</label>
            {prereqs.length === 0 ? <p className="font-mono text-[10px] text-[rgba(28,31,58,0.6)]">None</p> : (
              <div className="flex flex-wrap gap-2">
                {prereqs.map(p => {
                  const mastery = profile?.mastery?.[p]?.score || 0;
                  const isMastered = mastery >= 0.7;
                  return (
                    <span key={p} className={\	ext-[10px] font-mono px-2 py-1 uppercase tracking-wider border border-[#1c1f3a] \ text-[#1c1f3a]\}>
                      {p}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="font-mono text-xs font-bold uppercase tracking-wider text-[#1c1f3a] block mb-2">Preferred Time</label>
            <div className="grid grid-cols-2 gap-2">
              {["Morning", "Afternoon", "Evening", "Night"].map(t => (
                <label key={t} className="flex items-center gap-2 font-mono text-xs cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 border-2 border-[#1c1f3a] accent-[#c0392b]"
                    checked={timeSlots.includes(t)}
                    onChange={e => {
                      if (e.target.checked) setTimeSlots([...timeSlots, t]);
                      else setTimeSlots(timeSlots.filter(x => x !== t));
                    }}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="font-mono text-xs font-bold uppercase tracking-wider text-[#1c1f3a] block mb-1">Number of Days: {days}</label>
            <input type="range" min="1" max="7" value={days} onChange={e => setDays(Number(e.target.value))} className="w-full accent-[#c0392b]" />
          </div>

          <button onClick={handleGenerate} disabled={generating}
            className="w-full font-mono font-black text-sm text-[#fdfcf9] bg-[#1c1f3a] border-2 border-[#1c1f3a] px-4 py-4 uppercase tracking-widest hover:bg-[#c0392b] transition-colors shadow-[4px_4px_0_rgba(28,31,58,0.15)] mt-6">
            {generating ? "GENERATING..." : "GENERATE STUDY PLAN"}
          </button>
        </div>
      </div>
    </div>
  );
}

\"\"\"
content = content.replace(\"// ── Main Planner Page\", components_code + \"\\n// ── Main Planner Page\")

state_code = \"\"\"  const [regenerating, setRegen]  = useState(false)
  const [planModalOpen, setPlanModalOpen] = useState(false)\"\"\"
content = content.replace(\"  const [regenerating, setRegen]  = useState(false)\", state_code)

btn_code = \"\"\"            <button onClick={handleStudyNow}
              className="brut-btn brut-btn-pink px-4 py-2 text-xs flex items-center gap-1.5 font-bold">
              <Play className="w-3 h-3 fill-current" /> Study Now
            </button>
            <button onClick={() => setPlanModalOpen(true)}
              className="brut-btn brut-btn-outline px-4 py-2 text-xs flex items-center gap-1.5 font-bold">
              Plan a Chapter
            </button>\"\"\"
content = content.replace(\"\"\"            <button onClick={handleStudyNow}
              className="brut-btn brut-btn-pink px-4 py-2 text-xs flex items-center gap-1.5 font-bold">
              <Play className="w-3 h-3 fill-current" /> Study Now
            </button>\"\"\", btn_code)

modal_render = \"\"\"      {/* Study Now modal */}
      {studyNow && (
        <StudyNowModal data={studyNow} onClose={() => setStudyNow(null)} />
      )}

      {/* Plan Chapter modal */}
      {planModalOpen && (
        <PlanChapterModal 
          onClose={() => setPlanModalOpen(false)} 
          onSuccess={fetchPlan}
          profile={profile}
          authFetch={authFetch}
        />
      )}
    </AppShell>\"\"\"
content = content.replace(\"\"\"      {/* Study Now modal */}
      {studyNow && (
        <StudyNowModal data={studyNow} onClose={() => setStudyNow(null)} />
      )}
    </AppShell>\"\"\", modal_render)

with codecs.open(path, "w", "utf-8") as f:
    f.write(content)
print("Done")
