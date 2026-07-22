# Planner Frontend Fixes - Line-by-Line Summary

## File: frontend/app/planner/page.tsx

### CHANGE 1 — Subject Filter Dropdown Checklist

**Lines 449-456**: Added new state variables
```typescript
// CHANGE 1: Subject dropdown checklist states
const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false)
const [checkedSubjects, setCheckedSubjects] = useState<string[]>(["All", "Science", "Mathematics", "Social Studies", "English"])
const dropdownRef = useRef<HTMLDivElement>(null)

// CHANGE 3: Delete confirmation state  
const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
```

**Lines 465-477**: Added click-outside handler useEffect
```typescript
// CHANGE 1: Click-outside handler for dropdown
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setSubjectDropdownOpen(false)
    }
  }
  document.addEventListener("mousedown", handler)
  return () => document.removeEventListener("mousedown", handler)
}, [])
```

**Lines 742-791**: Replaced subject filter buttons with dropdown checklist
- Old: Simple "All Subjects" button
- New: Dropdown with checkboxes for All, Science, Mathematics, Social Studies, English
- Clicking "All" toggles all subjects
- Unchecking individual subjects removes "All"
- Shows "All Subjects ▾" or "X Subject(s) ▾" based on selection

**Lines 717-735**: Updated session filtering logic
```typescript
// Filter sessions by type
const filtered = (plan?.sessions ?? []).filter((session) =>
  filter === "all" || session.session_type === filter
)

// CHANGE 1: Filter by checked subjects
const visibleSessions = checkedSubjects.includes("All")
  ? filtered
  : filtered.filter(s => 
      checkedSubjects.some(cs => 
        (s.subject && s.subject.toLowerCase().includes(cs.toLowerCase())) ||
        (getSubjectLabel(getSubjectKey(s)).toLowerCase().includes(cs.toLowerCase()))
      )
    )
```

Changed all references from `filtered` to `visibleSessions` for rendering.

---

### CHANGE 2 — Mark Complete Bright Green Highlight

**Lines 181-186**: Updated statusStyles in SessionChip
```typescript
// CHANGE 2: Bright green styling for done status
const statusStyles =
  displayStatus === "done"
    ? { borderColor: "#00c853", bgColor: "rgba(0, 200, 83, 0.12)", label: "Done", color: "#00c853" }
    : displayStatus === "missed"
      ? { borderColor: "#c0392b", bgColor: "transparent", label: "Rescheduled", color: "#c0392b" }
      : { borderColor: "rgba(28,31,58,0.35)", bgColor: "transparent", label: "Pending", color: "rgba(28,31,58,0.55)" }
```

**Lines 195-201**: Updated SessionChip container styling
```typescript
style={{ 
  borderColor: statusStyles.borderColor,
  borderWidth: displayStatus === "done" ? "3px" : undefined,
  backgroundColor: statusStyles.bgColor 
}}
```

**Lines 246-250**: Updated done badge styling
```typescript
{displayStatus === "done" && (
  <span className="..." style={{ color: "#00c853", fontWeight: "bold" }}>
    <CheckCircle2 className="w-2.5 h-2.5" /> Done
  </span>
)}
```

**Lines 666-669**: Confirmed handleMarkComplete updates local state immediately
- Sets `status: "done"` and `completed: true` on the session object
- No page reload needed - visual update is instant

---

### CHANGE 3 — Delete Confirmation Inline UI

**Lines 167-176**: Updated SessionChip function signature to accept new props
```typescript
function SessionChip({
  s,
  onClick,
  onComplete,
  onDelete,
  confirmDeleteId,
  setConfirmDeleteId,
}: {
  s: PlanSession
  onClick: () => void
  onComplete: (session: PlanSession) => Promise<void>
  onDelete: (session: PlanSession) => Promise<void>
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
})
```

**Lines 251-279**: Replaced delete button with conditional confirmation UI
```typescript
{/* CHANGE 3: Delete button with inline confirmation */}
{confirmDeleteId !== s.id && (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation()
      setConfirmDeleteId(s.id)
    }}
    className="..."
  >
    ×
  </button>
)}
{confirmDeleteId === s.id && (
  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#c0392b" }}>
      Delete this session?
    </span>
    <button onClick={async (event) => {
      event.stopPropagation()
      await onDelete(s)
      setConfirmDeleteId(null)
    }} style={{ background: "#c0392b", color: "#fff", ... }}>
      Yes, Delete
    </button>
    <button onClick={(event) => {
      event.stopPropagation()
      setConfirmDeleteId(null)
    }} style={{ background: "transparent", color: "#666", ... }}>
      Cancel
    </button>
  </div>
)}
```

**Lines 674-683**: Updated handleDelete to remove browser confirm
```typescript
const handleDelete = async (session: PlanSession) => {
  // CHANGE 3: No browser confirm needed - inline confirmation handles it
  const res = await authFetch(`/api/planner/sessions/${session.id}`, {
    method: "DELETE",
  })
  if (res.ok) {
    setPlan((current) => current ? {
      ...current,
      sessions: current.sessions.filter((item) => item.id !== session.id),
    } : current)
  }
}
```

**Line 1075**: Updated SessionChip usage to pass new props
```typescript
<SessionChip 
  key={s.id} 
  s={s} 
  onClick={() => setSelected(s)} 
  onComplete={handleMarkComplete} 
  onDelete={handleDelete} 
  confirmDeleteId={confirmDeleteId} 
  setConfirmDeleteId={setConfirmDeleteId} 
/>
```

---

## Summary of All Line Changes

### State additions (after line 447):
- Line 449-456: Added `subjectDropdownOpen`, `checkedSubjects`, `dropdownRef`, `confirmDeleteId` states

### New useEffect (after line 464):
- Lines 465-477: Click-outside handler for dropdown

### Subject filter UI replacement:
- Lines 742-791: Replaced simple button with dropdown checklist

### Session filtering update:
- Lines 717-735: Added subject filtering logic with `visibleSessions`

### SessionChip bright green styling:
- Lines 181-186: Updated `statusStyles` with bright green colors
- Lines 195-201: Applied border and background colors
- Lines 246-250: Updated done badge with bright green

### SessionChip delete confirmation:
- Lines 167-176: Updated function signature
- Lines 251-279: Added conditional confirmation UI
- Line 1075: Updated SessionChip usage with new props

### handleDelete update:
- Lines 674-683: Removed browser confirm dialog

---

## Testing Checklist

✅ **CHANGE 1 - Subject Dropdown:**
- [ ] Dropdown opens/closes on button click
- [ ] Dropdown closes when clicking outside
- [ ] "All" checkbox toggles all subjects
- [ ] Unchecking individual subjects unchecks "All"
- [ ] Sessions filter correctly by checked subjects
- [ ] Button text shows "All Subjects ▾" or "X Subject(s) ▾"

✅ **CHANGE 2 - Bright Green:**
- [ ] Completed sessions show bright green border (#00c853)
- [ ] Completed sessions have light green background (rgba(0, 200, 83, 0.12))
- [ ] Done badge is bright green (#00c853) with font size 11px
- [ ] Mark Complete updates immediately without page reload

✅ **CHANGE 3 - Delete Confirmation:**
- [ ] × button shows when confirmDeleteId !== session.id
- [ ] Clicking × shows inline confirmation with text and buttons
- [ ] "Yes, Delete" button deletes and closes confirmation
- [ ] "Cancel" button closes confirmation without deleting
- [ ] No browser confirm dialog appears
- [ ] Delete updates immediately without page reload
