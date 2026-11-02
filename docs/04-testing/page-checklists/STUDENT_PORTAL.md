# Student portal — page checklists

**First pages checklisted:** Phase 5 (Grade Lifecycle and Consultation Log), 2026-10-29

Only the pages the post-defense phases created or changed are listed here. The
Student portal's other pages are covered by the main runbook,
[`../SYSTEM_TEST_CHECKLIST_2026-10-10.md`](../SYSTEM_TEST_CHECKLIST_2026-10-10.md).

> **Before running anything:** restart the dev server (`npm run dev`, port
> **5175**).
> **Prerequisite:** migration `20261029104037_grade_consultation_windows.sql`
> applied.
> **Expected to change in:** Phase 6 — a Grade Change Request gates on
> `finalized_at` for MR and TFR, but on *posted* for SG, because SG never
> acquires a `finalized_at`.

---

## Consultations (history)

**ID:** `STU-CONSULT` · **Route:** `/student/consultations` · **File:** `src/pages/student/ConsultationHistory.jsx`
**Last touched by:** Phase 5 · **Replaces:** the retired `Consultations.jsx` request form

- [ ] The page is **read-only**. There is no "request a consultation" button or
      form anywhere on it.
- [ ] A note the faculty recorded about this student appears here, with the
      subject, the milestone, the note, who recorded it, and when.
- [ ] A note recorded about a **different** student does not appear.
- [ ] Notes are grouped per term, newest term first, with a count on each tab.
- [ ] With more than one term, the tabs switch the list.
- [ ] The empty state explains that consultations are recorded by the instructor
      and says to contact them directly. It must **not** invite a request the
      process does not offer.
- [ ] The explainer at the bottom distinguishes **Posted — Not Finalized** from
      **Finalized** in plain English.
- [ ] **Security:** querying `grade_consultation_notes` directly for another
      student's rows returns nothing.

---

## My Grades — list

**ID:** `STU-GRADES` · **Route:** `/student/mygrades` · **File:** `src/pages/student/MyGradesList.jsx`
**Last touched by:** Phase 5 (three-state milestone badges)

The three states, in increasing finality:

| Badge | Meaning |
|---|---|
| **Tentative** (amber) | nothing posted yet — a live value computed from recorded scores |
| **Not Final** (sky) | posted, but the consultation window is open, so the instructor can still correct it directly |
| *(no badge)* | finalized — a change now needs a formal grade change request |

- [ ] An unposted MR shows the live value badged **Tentative**.
- [ ] A posted MR with its window **open** shows **Not Final**.
- [ ] A posted MR whose window is **finalized** shows the value with **no** badge.
- [ ] The same three cases behave identically for TFR.
- [ ] A posted **SG** shows **no** badge immediately — it has no window, so it is
      final the moment it posts. It must never show **Not Final**.
- [ ] **Regression guard:** a milestone posted *before* this migration existed has
      no window row, and must read as **finalized**, not **Not Final**. A grade the
      database refuses to change must not look changeable. (Asserted in
      `npm run verify:grading`; check one on screen too.)
- [ ] Both the mobile card grid and the desktop table show the same badge for the
      same milestone.
- [ ] A subject with no grades at all shows `—` and no badge.
- [ ] If the consultation windows cannot be read at all, grades still render and
      read as finalized rather than the page failing.

---

## My Grades — detail

**ID:** `STU-GRADEDETAIL` · **Route:** `/student/mygrades/detail?id=…` · **File:** `src/pages/student/MyGradesDetail.jsx`
**Last touched by:** Phase 5 (three-state milestone badges)

- [ ] The Midterm Rating tile badge reads **Tentative**, **Not Final**, or
      **Finalized**, matching `STU-GRADES` for the same class.
- [ ] The Final Rating tile behaves the same way.
- [ ] A Dean-applied correction still shows **Corrected**, which outranks the
      window state — what the student needs to see first is that the grade moved.
- [ ] While either MR or TFR is **Not Final**, the explanatory notice appears
      above the GWA, in plain English.
- [ ] With both finalized, that notice is gone.
- [ ] The notice never appears for SG alone.
- [ ] The per-term panels (Prelim / Midterm / Semi-Final / Final) are unchanged by
      Phase 5 — `Posted`, `Covered`, `Tentative`, `Pending` still behave as before.
