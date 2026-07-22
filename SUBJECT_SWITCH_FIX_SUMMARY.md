# Subject Switching Fix Summary

## Problem
Subject tabs were not switching subjects across pages properly.

## Root Cause
The analytics page was using local state (`useState`) to track the selected subject instead of reading directly from `profile?.subject`. This caused the analytics page to not respond to subject switches.

## Architecture Overview
The subject switching mechanism works as follows:

1. **SubjectSwitcher** component (frontend/components/layout/subject-switcher.tsx)
   - Renders subject tabs (Science, Mathematics, Social Studies, English)
   - Calls `setSubject(subjectId)` from auth context when tab clicked

2. **Auth Context** (frontend/lib/auth.tsx, lines 176-209)
   - `setSubject()` function:
     - Updates `localStorage.setItem("active_subject", subject)`
     - Calls PATCH `/api/profile/` to update backend
     - Calls `refreshProfile()` to sync profile data
     - Increments `subjectVersion` counter
   
3. **Pages** - All pages should:
   - Read subject from `profile?.subject` (NOT from localStorage or local state)
   - Include `subjectVersion` in useEffect dependencies
   - Refetch data when `subjectVersion` changes

## Files Changed

### frontend/app/analytics/page.tsx

**Line 38** - REMOVED:
```typescript
const [selectedSubject, setSelectedSubject] = useState(profile?.subject ?? "science")
```

**Line 38** - ADDED:
```typescript
// Read subject directly from profile, not from local state
const selectedSubject = profile?.subject ?? "science"
```

**Lines 48-51** - REMOVED:
```typescript
useEffect(() => {
  setSelectedSubject(profile?.subject ?? "science")
}, [profile?.subject])
```

This useEffect was trying to sync local state with profile, but it's better to just read from profile directly.

## Verification

All pages now correctly respond to subject switching:

- ✅ **dashboard/page.tsx** (home) - Line 103: `const subject = profile?.subject ?? "science"`
- ✅ **quiz/page.tsx** - Line 1117: `const subject = profile?.subject ?? "science"` + uses `subjectVersion`
- ✅ **tutor/page.tsx** - Line 515: `const subject = profile?.subject ?? "science"` + uses `subjectVersion`
- ✅ **planner/page.tsx** - Uses `subjectVersion` in fetchPlan (line 496). Has separate `selectedSubject` state for view filtering (showing all subjects vs one subject)
- ✅ **analytics/page.tsx** - NOW FIXED: Reads from `profile?.subject` + uses `subjectVersion`

## Testing

1. Click on different subject tabs (Science, Mathematics, Social Studies, English)
2. Navigate to each page and verify:
   - Dashboard shows correct subject data
   - Quiz shows correct subject topics
   - Tutor shows correct subject content
   - Planner shows sessions for the correct subject  
   - Analytics shows correct subject analytics

## Notes

- The `subjectVersion` counter pattern is elegant - it allows pages to refetch data whenever the subject changes without needing complex event systems
- Planner's `selectedSubject` state is intentional - it's for filtering the view (show all subjects or filter to one), not for tracking the active subject
- All API calls use proper subject normalization via `toApiSubject()` helper functions
