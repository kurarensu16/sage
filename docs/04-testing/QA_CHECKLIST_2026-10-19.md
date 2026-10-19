# QA checklist — 2026-10-19 change batch

- **Scope:** every code change made on 2026-10-19 — the faculty export split, the hard-coded identity removal, and the notification privacy and dean-scoping fixes.
- **Why manual:** there is no test framework in this repo. `npm run lint`, `npm run build`, `npm run verify:grading` and `npm run verify:csv` all pass, but **none of the UI below has been exercised at runtime.**
- **Related:** [`02-thesis/defense/ASPIRE_DEFENSE_AUDIT_2026-10-19.md`](../02-thesis/defense/ASPIRE_DEFENSE_AUDIT_2026-10-19.md) · [`03-development/implementation-reports/FACULTY_IRREGULAR_ENROLLEE_EXPORT_2026-10-19.md`](../03-development/implementation-reports/FACULTY_IRREGULAR_ENROLLEE_EXPORT_2026-10-19.md)

Mark each row **PASS**, **FAIL** or **N/A**, and note anything unexpected. A FAIL on A-1, D-1 or D-2 should block the defense demo.

---

## 0. Prerequisites

### 0.1 Credentials — the repo's are dead

The database was cleaned out in the week before 2026-10-19. The demo users and `DemoPassword123!` in `AGENTS.md`, and the seed accounts in `src/lib/seedDatabase.js`, **no longer work**. Get the real ones:

```sql
SELECT u.role,
       u.email,
       u.user_number,
       u.status,
       d.name AS college
FROM public.users u
LEFT JOIN public.departments d ON d.department_id = u.department_id
WHERE u.status = 'active'
ORDER BY u.role, u.email;
```

**Verified against the live `users` table, 2026-10-19.** These accounts are `active` **and** have `must_change_password = false`, so they sign straight in without hitting the forced-change screen — use these in preference to any others:

| Role | Account | College | Notes |
|---|---|---|---|
| Admin | `admin@sage.edu.ph` | — | `ADM-2026-00001` |
| **Dean — TECH** | `tech.dean@dyci.edu.ph` | Technology & Engineering | `DN-2026-00001`. **The account for every Dean step** |
| Dean — CME | `maritime.dean@dyci.edu.ph` | Maritime Education | `DN-2026-00005` |
| Faculty — TECH | `a.rivera@sage.edu.ph` | Technology & Engineering | `FAC-2026-00101`. Still exists after the cleanout |
| Faculty — TECH (spares) | `m.cruz@sage.edu.ph`, `e.delossantos@sage.edu.ph`, `v.navarro@sage.edu.ph` | Technology & Engineering | all `must_change_password = false` |
| Student — TECH | `j.abad@dyci.edu.ph`, `r.gatchalian@dyci.edu.ph`, `andrew.quezon@dyci.edu.ph`, `abalos.carl@dyci.edu.ph` | home section `0c3e0c0a…` | 1st Year |
| Student — TECH | `m.quiambao@dyci.edu.ph`, `s.uy@dyci.edu.ph` | home section `4fe7378c…` | 1st Year, **different home section** — candidates for the irregular tests |
| Student — CME | `t.rivera@dyci.edu.ph`, `r.pangan@dyci.edu.ph` | home section `27f4cfb9…` | 1st Year |

**Every other account in the table has `must_change_password = true`** and will land on the forced-change screen at login. That is correct behaviour, not a bug — just avoid those accounts for QA.

**Two of `AGENTS.md`'s four demo users no longer exist at all:** `c.valdes@sage.edu.ph` (dean) and `s.jenkins@student.sage.edu` (student). The other two, `admin@sage.edu.ph` and `a.rivera@sage.edu.ph`, do still exist — their **passwords** changed, not their emails. Deans are now named `<college>.dean@dyci.edu.ph` and students `<name>@dyci.edu.ph`.

**The one irregular enrollee — verified live 2026-10-19.** The enrollment query returned exactly **one** irregular row in the whole database:

| Student | Home section | Enrolled in | Classification |
|---|---|---|---|
| `andrew.quezon@dyci.edu.ph` | **BSIT-1A** | **DSA123 / BSIT-2A** | **Irregular** |

That makes **DSA123 / BSIT-2A the only class in the system that can demonstrate the export split.** Its roster:

- **10 regular** students, all home-section BSIT-2A: `aldrin.mercado@`, `alyssa.serrano@`, `cedric.villanueva@`, `danica.tolentino@`, `enzo.mendoza@`, `janelle.aquino@`, `kristoffer.domingo@`, `louise.castillo@`, `mikaela.santiago@`, `nico.ramos@`
- **1 irregular:** `andrew.quezon@dyci.edu.ph` (also a regular member of BSIT-1A for ITC113 and ITP113, which is correct — the classification is per class, not per student)

`andrew.quezon@dyci.edu.ph` has `must_change_password = false`, so QA can sign in as him directly.

> **Fragile.** This single enrollment is the only thing making A-1, A-2, A-4, A-5, A-6, A-7 and A-10 testable. If it is removed or the term rolls over, re-create it (student joins DSA123 by code, faculty approves) before running section A.

**Clean comparison classes with no irregulars** — use for A-3 and A-8: `ITP113 / BSIT-1A`, `ITP113 / BSIT-1B`, `ITC113 / BSIT-1A`, `ITC113 / BSIT-1B`, `MSH111`, `NAV113`.

**Avoid for export tests:** `ITP123`, `MSH122`, `SST103`, `AUX123`, `SEA103` have a COG template assigned but **no enrollments**, so their sheets come out empty.

### 0.2 Data the tests need

```sql
-- a) A TECH/BSIT class with at least one irregular enrollee (needed for A-1)
SELECT s.code AS subject, sec.name AS class_section,
       u.email AS student, home.name AS home_section,
       CASE WHEN u.section_id = e.section_id THEN 'Regular' ELSE 'Irregular' END AS enrollment_type
FROM public.enrollments e
JOIN public.users u              ON u.user_id = e.student_id
JOIN public.subjects s           ON s.subject_id = e.subject_id
LEFT JOIN public.sections sec    ON sec.section_id = e.section_id
LEFT JOIN public.sections home   ON home.section_id = u.section_id
WHERE u.role = 'student'
ORDER BY s.code, enrollment_type DESC, u.email;

-- b) Which COG template each college uses (needed for E-4 and the defense exhibit)
SELECT dep.name AS college, s.code AS subject, gc.name AS cog_template,
       comp.name AS component, comp.weight, comp.max_score, comp.is_multiple
FROM public.subjects s
JOIN public.departments dep ON dep.department_id = s.department_id
LEFT JOIN public.grade_computations gc   ON gc.computation_id = s.computation_id
LEFT JOIN public.grade_computation_components comp ON comp.computation_id = gc.computation_id
ORDER BY dep.name, s.code, comp.weight DESC;

-- c) Which dean owns each active class's college (needed for D-1 and D-2)
SELECT sec.name AS section, dep.name AS college,
       u.email AS scoped_dean, u.status AS dean_status
FROM public.class_records cr
JOIN public.sections sec         ON sec.section_id = cr.section_id
LEFT JOIN public.departments dep ON dep.department_id = sec.department_id
LEFT JOIN public.users u         ON u.department_id = sec.department_id
                                AND u.role::TEXT = 'dean'
WHERE cr.status = 'active'
ORDER BY sec.name;
```

If query (a) returns **no Irregular row** for any class, A-1 and A-2 cannot be tested — enrol a student from another home section by join code first.

### 0.3 Verified COG templates

Confirmed live 2026-10-19 — use these exact values when checking E-4:

| College | Template | Subjects | Components |
|---|---|---|---|
| TECH | General Education Core | DSA123, ITC113, ITP113, ITP123 | Class Standing (Formative) 50% / max 20 / multiple · Major Examination 40% / max 40 · Character Rating 10% / max 100 |
| CME | Maritime Lecture Scale | AUX123, NAV113, SEA103 | Class Standing 60% / max 100 / multiple · Major Examination 40% / max 100 |
| CME | Maritime Laboratory Scale | MSH111, MSH122, SST103 | Demonstration of Competence 60% / max 100 · Systematic Exercises 40% / max 100 / multiple |

Every subject in both active colleges has a template assigned, so no class is blocked from posting by a missing COG.

### 0.3 Environment

`npm run dev` on port **5175**. Grant browser notification permission if you intend to test section C.

---

## A. Faculty export split

The headline change: official sheets carry the **block section only** so they match the registrar's masterlist; join-code students get a parallel `(Irregular)` set.

| ID | Steps | Expected | Result |
|---|---|---|---|
| **A-1** | Faculty (`a.rivera@sage.edu.ph`) → Class Records → **DSA123 / BSIT-2A** → Score Input → Export → *Download Complete Workbook* | Workbook has **6 sheets**: `Subject Profile`, `Record Sheet`, `Report of Grades`, `Subject Profile (Irregular)`, `Record Sheet (Irregular)`, `Report of Grades (Irregular)` | |
| **A-2** | In that workbook, compare `Record Sheet` against `Record Sheet (Irregular)` | Official sheet lists exactly the **10 BSIT-2A** students. `(Irregular)` sheet lists exactly **1** — `andrew.quezon@dyci.edu.ph`. 11 enrolled, 11 accounted for, **nobody on both sheets** | |
| **A-3** | Open **ITP113 / BSIT-1A** (no irregulars) → Export → *Download Complete Workbook* | Exactly **3 sheets**, no `(Irregular)` tabs, same rows as before this change | |
| **A-4** | On any `(Irregular)` sheet, read the `Section:` field in the header block | Reads `<section> - CROSS-ENROLLED LIST` | |
| **A-5** | Export a **single** sheet: Export → select *Report of Grades* only, on a class with irregulars | **2 sheets**: `Report of Grades` and `Report of Grades (Irregular)` | |
| **A-6** | For `andrew.quezon@dyci.edu.ph`, compare MR / TFR / SG / remark on `Report of Grades (Irregular)` against the same student on the Grade Computation Preview screen | Values match exactly. The companion sheet is not a second calculation | |
| **A-7** | Open the export preview on **DSA123 / BSIT-2A** | Amber notice appears reading **1 cross-enrolled student** (singular, not "students") and naming section BSIT-2A | |
| **A-8** | Open the export preview on **ITP113 / BSIT-1A** | **No** amber notice | |
| **A-9** | Repeat A-1 on **Grade Computation Preview** and on **Posted Grades View** | Identical behaviour on all three screens. **Posted Grades View is the critical one** — it had no enrollment classification at all before this change, so confirm its `(Irregular)` sheet is populated and correct | |
| **A-10** | Cross-check `andrew.quezon@dyci.edu.ph` against Admin → Section Masterlist (BSIT-2A) | The same student is shown as irregular there. Classification agrees across the app | |

---

## B. Hard-coded identity removal

Previously, a slow profile load displayed a **different real person's name**. Force the loading state with a hard refresh (Ctrl+Shift+R) or by throttling the network in devtools.

| ID | Steps | Expected | Result |
|---|---|---|---|
| **B-1** | Sign in as any role. Hard-refresh and watch the **top-right header** during load | A **skeleton placeholder**, then the signed-in user's real name. **Never** "Prof. Amanda Rivera", "Dr. Carlos Valdes" or "Admin System Control" | |
| **B-2** | Go to Settings. Hard-refresh and watch the profile header | Skeleton, then the real name / email / title. **Never** "Sarah Jenkins" or a borrowed department and college | |
| **B-3** | Settings, with the profile loaded | Name, email, title, department and college are the signed-in user's. Fields with no value show `—`, not someone else's data | |
| **B-4** | Settings → the ID-number panel | Shows the real `user_number`, or the panel is **absent** if the account has none. **Never** `2026-00005` or `FAC-2026-00003` | |
| **B-5** | Sign in as a dean → Summary Reports → generate → **export to Excel**. Open the file and read the "Author" line | The signed-in dean's real name, or just `Dean` if unavailable. **Never** "Carlos Valdes" | |
| **B-6** | Same on screen (Summary Reports header and footer) | Same as B-5 | |
| **B-7** | Admin → User List. Check the role filter tabs and the role badges | Tabs are All / Students / Faculty / Deans / Admins. **No "Office" tab, count or badge anywhere** | |
| **B-8** | Admin → Grade Override → apply an override. Check the resulting audit entry / notification actor name | The admin's real name or email. **Never** "Admin System Control" | |

---

## C. Notification privacy

12 notification types now show only the event title on a device banner or desktop toast, while the **in-app inbox keeps full detail**. Requires notification permission granted (browser) or the APK.

| ID | Steps | Expected | Result |
|---|---|---|---|
| **C-1** | Faculty posts a grade milestone. Watch the **student's** OS notification | Banner reads the event title plus *"Open ASPIRE to view details."* — **no grade, no remark** | |
| **C-2** | Same event, now open the student's **in-app** notification inbox | **Full detail** — subject, term and remark all present. The filter must not have stripped the inbox | |
| **C-3** | Faculty submits an SG correction request. Watch the **dean's** OS notification | Event title only. **No student name, no remark transition** | |
| **C-4** | Dean approves it. Watch the **faculty** OS notification | Event title only. **No student name, no percentage, no GWA, no remark** | |
| **C-5** | Same event, faculty **in-app** inbox | Full detail, including the authorized result | |
| **C-6** | Admin disables or archives an account. Watch another **admin's** OS notification | Event title only. **No name, no email address** | |
| **C-7** | Any notification from C-1 to C-6 | Still **arrives** (nothing suppressed), has the correct title, and opens the app when tapped | |
| **C-8** | Settings → Notification Preferences → disable push for a channel, then trigger it | **No banner at all.** Preferences are checked before the filter and must still win | |

---

## D. Dean scoping — highest risk

A correction request is now locked to the dean of the college that owns the section. **A FAIL here means a real grade correction reaches nobody.**

| ID | Steps | Expected | Result |
|---|---|---|---|
| **D-1** | Faculty on a **TECH/BSIT** class submits an SG correction request. Sign in as `tech.dean@dyci.edu.ph` → SG Correction Requests | The request **is** in the queue, with full detail | |
| **D-2** | Same request. Sign in as `maritime.dean@dyci.edu.ph` | The request is **not** in their notifications or queue | |
| **D-3** | Repeat with a **CME/BSMARE** class | Mirror image — `maritime.dean` receives it, `tech.dean` does not | |
| **D-4** | `tech.dean` approves the request; faculty reposts the corrected SG | Status walks `pending` → `approved` → `applied`. Student's grade updates | |
| **D-5** | *(Optional, destructive — do not run on demo data)* Temporarily clear the TECH dean's `department_id` so the college has no dean, then submit a request | **Admins** receive a notice with **no student name and no remark**, telling them to assign a dean. No other college's dean is notified. **Restore the `department_id` afterwards** | |

---

## E. Regression — things that must still work

| ID | Steps | Expected | Result |
|---|---|---|---|
| **E-1** | Sign in to all four portals in turn | Each lands on its own dashboard. No `/403`, no stuck "Loading user profile" spinner | |
| **E-2** | Faculty → Score Input → change a score → post Midterm Rating | Posts successfully. Student sees the updated rating | |
| **E-3** | Post Tentative Final Rating on the same class | Posts as a separate locked row. Both milestones visible | |
| **E-4** | Admin → Grade Computations: open **General Education Core**, **Maritime Lecture Scale** and **Maritime Laboratory Scale** | All three present and distinct. GenEd Core has **3** components (50/40/10, max 20/40/100); both Maritime scales have **2** (60/40, max 100/100). Each totals 100% | |
| **E-4b** | Edit a template, then post a grade on an existing class that uses it | Posting still **succeeds** — the class holds its own `grading_formula_snapshot`, so template edits cannot retroactively change or block it | |
| **E-4c** | Faculty → Grade Components Setup on a CME lab subject (MSH111, MSH122 or SST103) | Shows *Demonstration of Competence* and *Systematic Exercises* — **no Character Rating**. Components are data, not a fixed set | |
| **E-5** | Student → My Grades, My Subjects, Attendance, Advising Inbox, AI Study Tutor | All load with real data. AI returns an answer, or degrades to a records summary | |
| **E-6** | Faculty → Class Performance and Comparison reports → export | Charts render, Excel downloads, figures agree with the grade sheets | |
| **E-7** | Student joins a class by code → faculty approves in Enrollment Requests | Enrollment created; the student appears on the roster **and** on the `(Irregular)` export sheet if their home section differs | |
| **E-8** | Admin → User List → import CSV with the sample template | Import works. The sample's placeholder names are template text only and create nothing unintended | |

---

## Not covered

- **Android APK.** Sections B and C were written for the browser. The lock-screen behaviour (`visibility: 1`) is Android-only and needs a device build to verify.
- **Real server push.** Does not exist — `user_push_tokens` is populated but nothing sends FCM, so notifications only fire while the app is running.
- **Guardian email.** Carries the actual remark, rating and GWA **by deliberate design** (2026-10-03 decision, `send-email/index.ts:13-17`). Not a defect; do not "fix" it.
- **Load and concurrency.** See `06-future-enhancements/SCALABILITY_AND_DATA_HANDLING_2026-10-10.md`.
