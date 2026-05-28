# SAGE — Supabase Migration Workflow

> Systematic plan to migrate from `localStorage` (mockDb.js) to Supabase PostgreSQL.  
> Status: **Not Started**

---

## Current State

All data operations go through `src/lib/mockDb.js` which uses `localStorage`. There are **26 mockDb functions** called across **26 page files**. An additional 15 pages use hardcoded inline data with no database connection at all.

---

## Migration Architecture

```
                    CURRENT                              TARGET
               ┌──────────────┐                    ┌──────────────────┐
  Pages ──────▶│  mockDb.js   │──▶ localStorage    │  supabaseDb.js   │──▶ Supabase
               │  (26 funcs)  │                    │  (same API shape)│    PostgreSQL
               └──────────────┘                    └──────────────────┘
```

**Strategy: Drop-in replacement.** Create `supabaseDb.js` that exports the exact same function signatures as `mockDb.js`. This lets us migrate page-by-page without breaking anything — just swap the import from `mockDb` to `supabaseDb`.

---

## Step 1: Supabase Project Setup

- [ ] Create Supabase project for SAGE
- [ ] Generate SQL migrations for all 19 tables from the ERD in `capstone-system-design-v2.md`
- [ ] Create `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- [ ] Install `@supabase/supabase-js`
- [ ] Create `src/lib/supabase.js` — shared Supabase client

```js
// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

---

## Step 2: Function Mapping — mockDb → Supabase

| mockDb Function | Supabase Equivalent | Table(s) |
|---|---|---|
| `getUsers()` | `supabase.from('users').select('*')` | `users` |
| `saveUser(user)` | `supabase.from('users').upsert(user)` | `users` |
| `deleteUser(id)` | `supabase.from('users').delete().eq('user_id', id)` | `users` |
| `getClassrooms()` | `supabase.from('class_records').select('*, users!faculty_id(*), subjects(*), sections(*)')` | `class_records` + joins |
| `saveClassroom(cr)` | `supabase.from('class_records').upsert(cr)` | `class_records` |
| `reassignFaculty()` | Transaction: update `class_records` + insert `class_faculty_log` | `class_records`, `class_faculty_log` |
| `archiveClassroom()` | `supabase.from('class_records').update({ status: 'archived' })` | `class_records` |
| `getEvalTemplates()` | `supabase.from('evaluation_forms').select('*, evaluation_criteria(*)')` | `evaluation_forms`, `evaluation_criteria` |
| `saveEvalTemplate()` | Transaction: upsert form + upsert criteria | `evaluation_forms`, `evaluation_criteria` |
| `deleteEvalTemplate()` | Cascade delete form + criteria | `evaluation_forms` |
| `getEvalWindows()` | `supabase.from('evaluation_windows').select('*, users(*), evaluation_forms(*)')` | `evaluation_windows` + joins |
| `saveEvalWindow()` | `supabase.from('evaluation_windows').upsert()` | `evaluation_windows` |
| `deleteEvalWindow()` | `supabase.from('evaluation_windows').delete()` | `evaluation_windows` |
| `getPostedGrades()` | `supabase.from('posted_grades').select('*, users(*), class_records(*)')` | `posted_grades` + joins |
| `overrideGrade()` | `supabase.from('posted_grades').update({ ... })` | `posted_grades` |
| `getSubjects()` | `supabase.from('subjects').select('*')` | `subjects` |
| `saveSubject()` | `supabase.from('subjects').upsert()` | `subjects` |
| `deleteSubject()` | `supabase.from('subjects').delete()` | `subjects` |
| `getSections()` | `supabase.from('sections').select('*')` | `sections` |
| `saveSection()` | `supabase.from('sections').upsert()` | `sections` |
| `deleteSection()` | `supabase.from('sections').delete()` | `sections` |
| `getLogs()` | `supabase.from('activity_logs').select('*').order('created_at', { ascending: false })` | New `activity_logs` table |
| `addLog()` | `supabase.from('activity_logs').insert()` | `activity_logs` |

---

## Step 3: Page Migration Batches

### Batch A — Admin CRUD Pages (highest data coupling)

| Page | mockDb Functions Used | Complexity |
|---|---|---|
| `admin/Dashboard.jsx` | `getUsers`, `getClassrooms`, `getEvalWindows`, `getLogs` | Medium — 4 queries |
| `admin/UserList.jsx` | `getUsers`, `deleteUser` | Low |
| `admin/UserForm.jsx` | `getUsers`, `saveUser` | Low |
| `admin/SubjectList.jsx` | `getSubjects`, `deleteSubject` | Low |
| `admin/SubjectForm.jsx` | `getSubjects`, `saveSubject` | Low |
| `admin/SectionList.jsx` | `getSections`, `deleteSection` | Low |
| `admin/SectionForm.jsx` | `getSections`, `saveSection` | Low |
| `admin/ClassManagementList.jsx` | `getClassrooms`, `getUsers`, `reassignFaculty`, `archiveClassroom` | High |
| `admin/ClassManagementForm.jsx` | `getSubjects`, `getSections`, `getUsers`, `saveClassroom` | High |
| `admin/EvalFormBuilder.jsx` | `getEvalTemplates`, `saveEvalTemplate` | Medium |
| `admin/EvalFormsList.jsx` | `getEvalTemplates`, `deleteEvalTemplate` | Low |
| `admin/EvalWindowList.jsx` | `getEvalWindows`, `deleteEvalWindow` | Low |
| `admin/EvalWindowForm.jsx` | `getEvalTemplates`, `getUsers`, `getSections`, `saveEvalWindow` | High |
| `admin/GradeOverride.jsx` | `getPostedGrades`, `overrideGrade` | Medium |
| `admin/AuditLog.jsx` | `getLogs` | Low |

### Batch B — Dean Pages (read-only queries)

| Page | mockDb Functions Used | Complexity |
|---|---|---|
| `dean/Dashboard.jsx` | `getUsers`, `getClassrooms`, `getPostedGrades`, `getEvalWindows` | Medium |
| `dean/GradePostingStatus.jsx` | `getClassrooms`, `getPostedGrades` | Low |
| `dean/GradeDistribution.jsx` | `getClassrooms`, `getPostedGrades` | Low |
| `dean/EvalResultsOverview.jsx` | `getUsers`, `getClassrooms` | Low |
| `dean/EvalResultsFaculty.jsx` | `getUsers`, `getClassrooms`, `getEvalWindows` | Medium |
| `dean/AtRiskStudents.jsx` | `getPostedGrades`, `getUsers` | Low |
| `dean/SummaryReports.jsx` | `getClassrooms`, `getPostedGrades`, `getUsers` | Medium |

### Batch C — Faculty Pages (mostly hardcoded — need NEW queries)

| Page | Current State | Complexity |
|---|---|---|
| `faculty/ClassRecordCreate.jsx` | Uses mockDb | Medium |
| `faculty/Dashboard.jsx` | 100% hardcoded | Needs new Supabase queries |
| `faculty/ClassRecordsList.jsx` | 100% hardcoded | Needs new Supabase queries |
| `faculty/ScoreInput.jsx` | 100% hardcoded | Needs new Supabase queries |
| `faculty/GradeComponentsSetup.jsx` | 100% hardcoded | Needs new Supabase queries |
| `faculty/GradeComputationPreview.jsx` | 100% hardcoded | Needs new Supabase queries |
| `faculty/PostedGradesView.jsx` | 100% hardcoded | Needs new Supabase queries |
| `faculty/EvalResultsMy.jsx` | 100% hardcoded | Needs new Supabase queries |
| `faculty/Notifications.jsx` | 100% hardcoded | Needs new Supabase queries |

### Batch D — Student Pages (all hardcoded — need NEW queries)

| Page | Current State | Complexity |
|---|---|---|
| `student/Dashboard.jsx` | 100% hardcoded | Needs new Supabase queries |
| `student/MyGradesList.jsx` | 100% hardcoded | Needs new Supabase queries |
| `student/MyGradesDetail.jsx` | 100% hardcoded | Needs new Supabase queries |
| `student/EvalList.jsx` | 100% hardcoded | Needs new Supabase queries |
| `student/EvalForm.jsx` | 100% hardcoded | Needs new Supabase queries |
| `student/AIRecommendation.jsx` | 100% hardcoded | Needs AI agent + Supabase |
| `student/Notifications.jsx` | 100% hardcoded | Needs new Supabase queries |

### Batch E — Public / Auth Pages

| Page | Complexity |
|---|---|
| `public/Login.jsx` | High — needs Supabase Auth |
| `public/ForgotPassword.jsx` | Medium — needs Supabase Auth |
| `public/ResetPassword.jsx` | Medium — needs Supabase Auth |

---

## Step 4: Seed Data

Convert all default arrays from `mockDb.js` into `supabase/seed.sql`:
- `defaultUsers` → `INSERT INTO users`
- `defaultClassrooms` → `INSERT INTO class_records`
- `defaultSubjects` → `INSERT INTO subjects`
- `defaultSections` → `INSERT INTO sections`
- `defaultEvalTemplates` → `INSERT INTO evaluation_forms` + `evaluation_criteria`
- `defaultEvalWindows` → `INSERT INTO evaluation_windows`
- `defaultPostedGrades` → `INSERT INTO posted_grades`
- `defaultLogs` → `INSERT INTO activity_logs`

---

## Step 5: Row Level Security (RLS) Policies

| Table | Policy | Rule |
|---|---|---|
| `users` | Admin full access | `role = 'admin'` |
| `posted_grades` | Students see own only | `student_id = auth.uid()` (FR22) |
| `evaluation_responses` | Anonymous write-only | No read access to link student identity (NFR01) |
| `component_scores` | Faculty write own classes | `faculty_id = auth.uid()` via `class_records` join |
| `ai_student_recommendations` | Students see own only | `student_id = auth.uid()` |
| `ai_faculty_predictions` | Faculty see own, Dean sees all | `faculty_id = auth.uid() OR role = 'dean'` |

---

## Progress Tracker

- [ ] Step 1: Supabase project setup
- [ ] Step 2: Create `supabaseDb.js` drop-in replacement
- [ ] Step 3A: Migrate Admin pages (15 files)
- [ ] Step 3B: Migrate Dean pages (7 files)
- [ ] Step 3C: Wire Faculty pages (9 files)
- [ ] Step 3D: Wire Student pages (7 files)
- [ ] Step 3E: Wire Auth pages (3 files)
- [ ] Step 4: Seed data
- [ ] Step 5: RLS policies
- [ ] Delete `mockDb.js` (final step)

---

*End of Supabase Migration Workflow — SAGE, DYCI Capstone Project*
