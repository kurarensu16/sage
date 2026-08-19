# SAGE — College Office Portal: Discard Analysis
> **Document Type**: Internal Decision Memo  
> **Audience**: SAGE Capstone Team  
> **Date**: August 11, 2026  
> **Status**: For Team Discussion

---

## 1. Summary Recommendation

> **Recommendation: Remove the College Office Portal from SAGE's scope.**

This document presents evidence-based reasoning — drawn entirely from SAGE's own internal documentation — for why the College Office Portal (Portal 4, `/office/*`) should be formally dropped from the system. The portal has no unique functionality, no dedicated database backing, and its primary feature dependency was explicitly cut during a prior team decision.

---

## 2. Documentation Trail — What Our Own Docs Say

### 2.1 COR Upload: The Portal's Core Purpose Was Officially Cut

The College Office Portal's most distinct function — verifying student **Certificate of Registration (COR)** records — was formally evaluated and rejected by the team. This decision is recorded in `docs/reports/SAGE_Master_Documentation.md`:

> **FINAL DECISION: CUT**
>
> *"COR validation is directly dependent on the self-enrollment flow. Since join codes were cut, there is no trigger point for COR upload in SAGE. Furthermore, the existing DYCI enrollment system already validates student registration before students appear in any class list. Adding COR handling to SAGE would be redundant and would introduce unnecessary file storage infrastructure and data privacy obligations."*

**Implication**: The College Office Portal was designed around COR verification. That feature is gone. The portal never received an updated purpose to replace it.

---

### 2.2 The Portal Does Not Appear in the Primary System Design Document

The master capstone design document `docs/design/capstone-system-design-v2.md` defines **41 screens across 4 portals**:

| Role | Screen Count |
|---|---|
| Shared / Public | 3 (S01–S03) |
| Admin | 15 (S04–S18) |
| Dean | 7 (S19–S25) |
| Faculty | 9 (S26–S34) |
| Student | 7 (S35–S41) |
| **TOTAL** | **41** |

The College Office Portal has **zero screens** in this document. It was never designed at the screen level. This means the System Scope document (`SAGE_SYSTEM_SCOPE.md`) listed a portal that the design document never actually scoped into screens.

---

### 2.3 The Defense Transcript Never Mentioned It

The Capstone 1 panel rulings (`docs/reports/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md`) cover:

- Evaluation Fairness Clause
- Clearance Gating
- FDA Advisory Policy
- Grade Resubmission Workflow
- Dean-Controlled Evaluation Release

The College Office Portal and COR verification were **never raised** by the panel. There is no panelist ruling requiring this role to exist.

---

### 2.5 Clearance Is Not a Table — It's a Computed Status

The System Scope lists `clearance_records` as **Table 19** of the 22-table schema. However:

- This table **does not exist** in any Supabase migration file under `supabase/migrations/`
- It does not exist in `src/lib/mockDb.js`
- Clearance in the actual system is a **derived UI state** computed live in `src/pages/student/MyGradesList.jsx`:

```js
// If student has pending evaluation_windows with no matching evaluation_responses → UNSIGNED
// If all windows are submitted → SIGNED & CLEARED
```

There is no clearance record to audit — only evaluation completion counts.

---

## 3. Functional Redundancy — Feature-by-Feature Overlap

Every feature the College Office Portal proposes already exists in another portal:

| College Office Feature | Equivalent Already In SAGE | Overlap Level |
|---|---|---|
| Department Dashboard | Dean Dashboard (`/dean/dashboard`) | 🔴 Full |
| CSV Roster Import | Admin (`/admin/userimport`) | 🔴 Full |
| Section Enrollment View | Admin (`/admin/sections`) | 🔴 Full |
| Clearance Compliance Audit | Derived from `evaluation_responses` — readable by Admin/Dean | 🟡 Partial |
| COR Verification | **Officially cut from SAGE** — handled by DYCI enrollment system | ❌ Cut |

The College Office role is, in effect, a **read-only subset of Admin + Dean access** with no unique data, no unique write operations, and no unique database backing.

---

## 4. Implementation Difficulty Assessment

> **If we decided to build it anyway — how hard would it be?**

### 4.1 What Would Need to Be Built

| Task | Effort | Notes |
|---|---|---|
| Create `college_office` role in `AuthContext.jsx` | Low | Add one more role string and route guard |
| Create `src/pages/college_office/` directory + 3 pages | Medium | ~3 new JSX files |
| Build Department Dashboard | Low | Read-only queries over `sections`, `enrollments` |
| Build CSV Roster Import | **High** | Would duplicate Admin's `UserImport.jsx` logic — not trivial to abstract |
| Build Clearance Compliance Audit | Medium | Query `evaluation_windows` vs `evaluation_responses` per section |
| Add `college_office` routes to `App.jsx` | Low | Route additions only |
| Create demo user in `seedAdmin.js` | Low | One new user insert |
| **Total Estimated Effort** | **~3–5 days** | Depending on design polish required |

### 4.2 The Database Is Not the Hard Part

Since Supabase is already connected and the relevant tables (`evaluation_windows`, `evaluation_responses`, `enrollments`, `sections`) already exist, **the data layer is not a blocker**. The queries needed are simple SELECTs.

The hard parts are:

**1. CSV Roster Import duplication**  
The Admin version (`UserImport.jsx`) already handles field mapping, validation, error display, and bulk inserts. Rebuilding this for a College Office role (scoped to department-only) adds complexity without adding new value. To do it properly, you'd need to extract a shared component — that's a refactor, not a new feature.

**2. Role-level data isolation**  
A `college_office` role should only see their own department's data, not the entire institution. With RLS currently disabled across all 22 tables (`supabase/migrations/20260531081149_disable_rls_for_now.sql`), this scoping would have to be done at the application level — meaning every query needs a `department_id` filter, and that filtering must be reliable. This is extra work that introduces new failure points.

**3. Defense justification gap**  
If a panelist asks *"what can the College Office do that the Dean or Admin cannot?"* — the honest answer is: **nothing new**. That is a difficult position to defend.

### 4.3 Verdict on Implementation

| Scenario | Recommendation |
|---|---|
| Tight on time before Capstone 2 defense | ❌ Don't build it — cost exceeds value |
| Have spare sprint capacity | ⚠️ Only build if you abstract a shared CSV component first |
| Want a 5-role system on paper | ❌ Won't help — panelists probe functionality, not role count |
| Want to demonstrate strong RBAC design | ✅ Better to argue it as "out of scope — handled by registrar" |

---

## 5. Recommended Action

### Option A — Full Discard ✅ (Recommended)

Remove the College Office Portal from scope completely:

1. Update `docs/SAGE_SYSTEM_SCOPE.md` — remove §3.4 (Portal 4), change portal count from **5 → 4**
2. Update `docs/design/capstone-system-design-v2.md` §2.5 — remove College Office role definition
3. Remove `clearance_records` from the listed 22 tables (it was never created in migrations)
4. Add a **Scope Boundary statement** to the System Scope document:

> *"Physical clearance processing and Certificate of Registration (COR) verification are handled externally by DYCI's existing enrollment and registrar systems. SAGE provides evaluation completion data that drives clearance status display in the Student Portal but does not maintain a dedicated clearance record store or a separate College Office portal."*

This is honest, defensible, internally consistent — and requires no new code.

---

### Option B — Absorb Into Dean Portal (Compromise)

If the team wants the clearance audit view to exist somewhere visible:

- Add a **Clearance Compliance tab** inside the Dean Portal's existing Evaluation Results page
- No new role, no new portal, no new route guard needed
- Read-only matrix: section → student → eval submitted → clearance status
- Estimated effort: **~1 day**

---

## 6. Evidence Summary for Team Discussion

| Evidence Point | Source Document | Finding |
|---|---|---|
| COR feature officially cut by team | `SAGE_Master_Documentation.md` | Portal lost its primary purpose |
| No screens designed for it | `capstone-system-design-v2.md` §8.6 | Never fully designed (0 of 41 screens) |
| Not mentioned in Capstone 1 defense | `CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md` | No panel mandate to include it |
| `clearance_records` table doesn't exist | Supabase migrations + `mockDb.js` | No data layer behind the portal |
| All features duplicated elsewhere | Admin + Dean portals | Zero unique functionality remaining |

---

*End of Analysis — Prepared for SAGE Capstone Team Discussion.*
