# SAGE — Component Consistency Audit

> Full audit of all 38 page files + 5 layout components against the Design System spec.  
> Audit Date: 2026-05-28  
> Status: **Findings Documented — Fixes Pending**

---

## Audit Summary

| Severity | Count | Description |
|---|---|---|
| 🔴 Critical | 2 | Missing loading/error states, hardcoded data pages |
| 🟡 Moderate | 4 | Sidebar gaps, KPI card inconsistency, welcome banner inconsistency, icon mismatches |
| 🟢 Minor | 2 | Dead CSS boilerplate, orphaned duplicate file |

---

## Finding 1: Missing Loading/Error States 🔴

**Design System Requirement:** *"Every component that fetches data must implement all three states: Loading, Error, Empty."*

### Current Coverage

| State | Pages That Have It | Pages Missing It |
|---|---|---|
| **Loading skeleton** | `SubjectList.jsx`, `SectionList.jsx` (2 of 38) | All other 36 pages |
| **Error state** | None (0 of 38) | All 38 pages |
| **Empty state** | Most list pages have basic empty text | Need proper styled empty component |

### Affected Files (Loading state missing)

**Admin (13 of 15 missing):**
- `admin/Dashboard.jsx`
- `admin/UserList.jsx`
- `admin/UserForm.jsx`
- `admin/ClassManagementList.jsx`
- `admin/ClassManagementForm.jsx`
- `admin/EvalFormBuilder.jsx`
- `admin/EvalFormsList.jsx`
- `admin/EvalWindowList.jsx`
- `admin/EvalWindowForm.jsx`
- `admin/GradeOverride.jsx`
- `admin/AuditLog.jsx`
- `admin/SubjectForm.jsx`
- `admin/SectionForm.jsx`

**Dean (all 7 missing):**
- `dean/Dashboard.jsx`
- `dean/GradePostingStatus.jsx`
- `dean/GradeDistribution.jsx`
- `dean/EvalResultsOverview.jsx`
- `dean/EvalResultsFaculty.jsx`
- `dean/AtRiskStudents.jsx`
- `dean/SummaryReports.jsx`

**Faculty (all 9 missing):**
- All 9 faculty pages

**Student (all 7 missing):**
- All 7 student pages

### Recommended Fix
Create three reusable shared components:
```
src/components/shared/
├── LoadingState.jsx    # Skeleton loader with role-appropriate layout
├── ErrorState.jsx      # Error card with retry button
└── EmptyState.jsx      # Empty state with icon + description
```

---

## Finding 2: Hardcoded Data — No Database Connection 🔴

Pages with **100% inline hardcoded data** (not even using mockDb):

| Page | Hardcoded Data |
|---|---|
| `faculty/Dashboard.jsx` | `assignedClasses` (4 items), `urgentTasks` (2 items), `activities` (3 items), `todaysSchedule` (2 items) |
| `faculty/ClassRecordsList.jsx` | Class records array |
| `faculty/ScoreInput.jsx` | Entire student score table |
| `faculty/GradeComponentsSetup.jsx` | Component weight data |
| `faculty/GradeComputationPreview.jsx` | All grade computation chains |
| `faculty/PostedGradesView.jsx` | All posted grade data |
| `faculty/EvalResultsMy.jsx` | Evaluation rating data + comments |
| `faculty/Notifications.jsx` | Notification items |
| `student/Dashboard.jsx` | `enrolledSubjects` (4 items), `recentGrades` |
| `student/MyGradesList.jsx` | Subject grade list |
| `student/MyGradesDetail.jsx` | Grade detail breakdown per period |
| `student/EvalList.jsx` | Evaluation windows list |
| `student/EvalForm.jsx` | Evaluation criteria (7 categories) |
| `student/AIRecommendation.jsx` | AI verdict, suggestions, GWA trend |
| `student/Notifications.jsx` | Notification items |

**Impact:** 15 of 38 pages (39%) are pure UI mockups with zero data connectivity.

---

## Finding 3: Sidebar Navigation Gaps 🟡

Current sidebar links in `src/components/layout/Sidebar.jsx` vs. actual routes in `App.jsx`:

### Faculty Sidebar — Missing Links

| Screen | Route Exists? | In Sidebar? | Status |
|---|---|---|---|
| Grade Computation Preview | ✅ `/faculty/gradecomputationpreview` | ❌ Not in sidebar | Hidden page |
| Posted Grades View | ✅ `/faculty/postedgradesview` | ❌ Not in sidebar | Hidden page |
| Grade Components Setup | ✅ `/faculty/gradecomponentssetup` | ❌ Not in sidebar | Hidden page |
| Notifications | ✅ `/faculty/notifications` | ❌ Not in sidebar | Hidden page |

### Student Sidebar — Missing Links

| Screen | Route Exists? | In Sidebar? | Status |
|---|---|---|---|
| AI Recommendation | ✅ `/student/airecommendation` | ❌ Not in sidebar | Hidden page |
| Notifications | ✅ `/student/notifications` | ❌ Not in sidebar | Hidden page |

### Recommended Fix
Update the `links` object in `Sidebar.jsx` to include all navigable pages per role.

---

## Finding 4: KPI Card Pattern Inconsistency 🟡

Four dashboards exist with four different KPI card layouts:

| Dashboard | Card Layout | Icon Position | Value Font | Stat Card Grid |
|---|---|---|---|---|
| **Admin** | Horizontal, icon right | Right side in colored bg | `text-3xl font-bold font-display` | `lg:grid-cols-4` |
| **Faculty** | Vertical, icon top-right | Top-right corner | `text-2xl font-extrabold font-mono` | `lg:grid-cols-5` |
| **Dean** | Horizontal, icon left | Left side in colored bg | `text-2xl font-bold font-display font-mono` | `xl:grid-cols-4` |
| **Student** | Vertical, icon right | Right side in colored bg | `text-3xl font-extrabold font-mono` | `lg:grid-cols-4` |

### Recommended Fix
Create a standardized `src/components/shared/KPICard.jsx` component and refactor all 4 dashboards to use it.

---

## Finding 5: Welcome Banner Inconsistency 🟡

| Dashboard | Has Welcome Banner? | Style |
|---|---|---|
| Admin | ❌ No | — |
| Faculty | ✅ Yes | Gradient `from-sage-900 via-sage-800 to-sage-900`, rounded-2xl |
| Dean | ❌ No | — |
| Student | ✅ Yes | Same gradient pattern as Faculty |

### Recommended Fix
Either add welcome banners to Admin + Dean for consistency, or extract into a shared `WelcomeBanner.jsx` component used by all roles.

---

## Finding 6: Sidebar Icon Mismatches 🟡

| Sidebar Item | Current Icon | Design System Spec Icon |
|---|---|---|
| Admin Dashboard | `LayoutDashboard` | `Settings` |
| Faculty Dashboard | `LayoutDashboard` | `BookOpen` |
| Dean Dashboard | `LayoutDashboard` | `Building2` |
| Student Dashboard | `LayoutDashboard` | `GraduationCap` |
| Faculty Score Input | `FileText` | `ClipboardList` |
| Dean At-Risk Students | `AlertCircle` | `AlertTriangle` |

Note: Using `LayoutDashboard` for all dashboards is a reasonable deviation since it communicates the purpose clearly. However, the design system explicitly maps different icons per role for brand differentiation.

---

## Finding 7: `App.css` Contains Vite Boilerplate 🟢

`src/App.css` (185 lines) contains the original Vite starter template CSS:
- `.hero`, `.counter`, `#center`, `#next-steps`, `#docs`, `#spacer`, `.ticks`

**None of these classes are used anywhere in the SAGE codebase.** All actual styling is done through `index.css` + Tailwind utility classes.

### Recommended Fix
Delete the entire contents of `App.css` or delete the file entirely. No visual impact.

---

## Finding 8: Orphaned Duplicate Sidebar File 🟢

Two sidebar files exist in the project:
- `src/components/Sidebar.jsx` (2,543 bytes) — **orphaned**, not imported anywhere
- `src/components/layout/Sidebar.jsx` (4,998 bytes) — **active**, used by `MainLayout.jsx`

### Recommended Fix
Delete `src/components/Sidebar.jsx` — it's dead code.

---

## Finding 9: Inconsistent `cn()` Utility Usage 🟢

Only **6 of 38 pages** import and use the `cn()` utility from `src/lib/utils.js` for conditional class merging. The remaining 32 pages use raw template literals:

```js
// ❌ Current pattern (most pages):
className={`base-class ${condition ? 'active' : 'inactive'}`}

// ✅ Design system pattern:
className={cn("base-class", condition && "active")}
```

Using `cn()` (which wraps `clsx` + `tailwind-merge`) prevents class conflicts. Currently only used in:
- `student/Notifications.jsx`
- `student/MyGradesList.jsx`
- `student/MyGradesDetail.jsx`
- `student/EvalList.jsx`
- `student/EvalForm.jsx`
- `faculty/Notifications.jsx`

---

## Fix Priority Order

| Priority | Finding | Effort | Impact |
|---|---|---|---|
| 1 | Create shared Loading/Error/Empty components | Medium | High — prevents crashes, looks professional |
| 2 | Add missing sidebar links | Low | High — users can't find pages |
| 3 | Standardize KPI cards | Medium | Medium — visual consistency |
| 4 | Delete dead `App.css` boilerplate | Trivial | Low — cleanup |
| 5 | Delete orphaned `Sidebar.jsx` | Trivial | Low — cleanup |
| 6 | Add welcome banners to Admin/Dean | Low | Medium — visual consistency |
| 7 | Fix sidebar icon mismatches | Low | Low — cosmetic |
| 8 | Migrate to `cn()` usage globally | Medium | Low — code quality |

---

*End of Component Consistency Audit — SAGE, DYCI Capstone Project*
