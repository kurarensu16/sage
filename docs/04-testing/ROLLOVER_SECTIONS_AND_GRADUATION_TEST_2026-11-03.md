# Rollover, section lifecycle and graduation — click-through test

**Date:** 2026-11-03 · **Status:** Current — run before the 2nd → Summer rollover
**Covers:** B-17 to B-25, the section lifecycle dialog, and graduation

Run as the demo users (`DemoPassword123!`). Most of this can only be tested
around a rollover, so §6 is deliberately last.

## Migration to run first

```
20261103170601_mark_students_as_graduated.sql
```

The other two from today (`20261103162842`, `20261103163715`) are already in.

---

## 1 · CSV section import (B-17)

Registrar → **Manage Sections**.

| # | Step | Expect |
| - | ---- | ------ |
| 1.1 | Click **Import CSV**, then **Load Sample** | A sample using one of your real colleges, not a placeholder |
| 1.2 | Click **Check** / parse | "Successfully parsed 2 section records" and a preview table |
| 1.3 | Click **Save … Imported Sections** | The sections appear in the list. **Before 2026-11-03 this silently did nothing.** |
| 1.4 | Re-import the same rows | Refused: "already registered". Nothing duplicated. |
| 1.5 | Change one row's college to `Nonsense College` and save | Refused, listing the valid college names. **Check the other row was NOT created** — all-or-nothing is the point. |
| 1.6 | Admin → Activity log | One "Section Creation" entry naming the sections |

---

## 2 · Faculty sees classes they still owe (B-22)

Sign in as `a.rivera@sage.edu.ph` or `m.cruz@…`.

| # | Step | Expect |
| - | ---- | ------ |
| 2.1 | Faculty → **My Classes**, Current Term | DSA123 / ITC113 / ITP113 visible with **"Pending · SG due in N days"** |
| 2.2 | | IT213 **absent** — archived, SG posted |
| 2.3 | Click a pending class | Opens normally; **Finish Grading & Post SG** works |
| 2.4 | Switch to Previous Terms → load 1st Sem | The archive still loads; no duplicates of the pending classes |

---

## 3 · Reminder links (B-21)

| # | Step | Expect |
| - | ---- | ------ |
| 3.1 | As an instructor, open the bell → "Semestral Grade Still Outstanding" | Lands on **My Classes**, not a 404 |
| 3.2 | | Message names the class, the posting deadline in Philippine time, and 22 **school** days |

---

## 4 · Student portal is term-scoped (B-23, B-24, B-25)

Sign in as `s.jenkins@student.sage.edu` (or `john doe`). **Hard-reload** — the
dashboard caches for 120 seconds.

| # | Step | Expect |
| - | ---- | ------ |
| 4.1 | Student → Dashboard | Banner reads the **current** term |
| 4.2 | | "Action Items Awaiting Completion" banner **gone** |
| 4.3 | | Action Tasks tile reads **CLOSED · Prelim period finalized**, padlock icon |
| 4.4 | | Faculty Action Plans card says the plan **closed when the grading period was finalized** — it must NOT say "Great job, all completed" |
| 4.5 | | Enrolled Subjects: "No subjects yet for AY … · 2nd Semester", with a Grade Report link |
| 4.6 | | SUBJECTS `00`, Running GWA `—`. **Not a bug** — last term's GWA lives in Grade Report |
| 4.7 | **Grade Report** → previous term | 1st semester grades all present |
| 4.8 | **AI Study Advising** | Offers **no** subjects, or only current-term ones. It must not list last semester's subjects. |
| 4.9 | AI Study Advising → existing plans | Old plans visible as read-only history; checkboxes disabled |

---

## 5 · Graduation (#5)

Registrar → **Academic Terms** → **Record Graduations**.

| # | Step | Expect |
| - | ---- | ------ |
| 5.1 | Paste a real student ID number, click **Check** | One matched row showing their name and year level |
| 5.2 | Add a nonsense ID like `9999-99999` | Red block: "1 ID number did not match". **Record button disabled.** |
| 5.3 | Remove it, leaving a non-4th-year student | Amber warning: "not 4th years" — but recording is still allowed |
| 5.4 | Click **Record Graduations** | Green confirmation with the count |
| 5.5 | Admin → User list → that student | `year_level` = **Graduated**, `status` still **active** |
| 5.6 | Sign in as that student | Portal works normally; notification "You Have Been Marked as Graduated" |
| 5.7 | Re-run the same ID | Listed as "Already graduated", skipped, not double-counted |
| 5.8 | Upload an `.xlsx` with IDs in the first column | Parsed the same way; header row ignored |

**Why `status` must stay `active`:** it is read as `= 'active'` by the rollover,
class lists, rosters and the RLS policies. A graduated student with a different
status would vanish from all of them at once, with no error — the shape of
B-01, B-02, B-04 and B-11.

---

## 6 · The 2nd → Summer rollover (B-19, #4)

Do this last. **Back up first — the rollover cannot be undone.**

### 6a. The section plan

| # | Step | Expect |
| - | ---- | ------ |
| 6.1 | Delete the Summer sections (they have no students yet, so deletion is allowed) | — |
| 6.2 | Registrar → Academic Terms → **Start Next Semester** | Amber block: "The next term needs its sections", listing all 8 as `BSIT-1A → BSIT-1A` |
| 6.3 | | Same school year, so **no year levels change** |
| 6.4 | Click **Carry forward 8 sections** | Green: "exists with 8 sections, and every student has one to move into" |
| 6.5 | `Next Step →` | Now enabled |

### 6b. The stranded-student block

| # | Step | Expect |
| - | ---- | ------ |
| 6.6 | Delete **one** Summer section that has students | — |
| 6.7 | Reopen the wizard | Red block naming each affected student and `BSIT-1A → BSIT-1A` |
| 6.8 | | `Next Step →` **disabled**. There is no "Continue anyway". |
| 6.9 | Click **Create 1 missing section** | Block clears, Next Step enables |

### 6c. The rollover

| # | Step | Expect |
| - | ---- | ------ |
| 6.10 | Run it, grace days 30 | `students_kept` = **0** |
| 6.11 | Each student | Notification **"Your Grades Are Final Unless You Question Them"** with a date and "22 school days" → links to Grade Change Requests |
| 6.12 | A student with no posted grades | The other message: "A New Academic Term Has Started" |
| 6.13 | Registrar and admin | Receive "Academic Term Activated" — before today only faculty and deans did |
| 6.14 | Any instructor still owing an SG | "Semestral Grade Still Outstanding", one per class |

### 6d. After

```sql
SELECT s.code, e.term, e.closure_state, e.closed_by_event
FROM student_risk_evaluations e
JOIN class_records c ON c.class_record_id = e.class_record_id
LEFT JOIN subjects s ON s.subject_id = c.subject_id
WHERE e.closure_state IS NOT NULL ORDER BY e.closed_at;
```

A mix of `milestone_finalized` and `term_rollover` means both closure paths
fired. All one value means only one did.

```sql
-- Nobody stranded
SELECT s.school_year, s.semester::TEXT, count(*)
FROM users u JOIN sections s ON s.section_id = u.section_id
WHERE u.role::TEXT = 'student' AND COALESCE(u.status,'active') = 'active'
GROUP BY 1,2 ORDER BY 1,2;
```

Every active student should sit under the new active term.

---

## Not covered here

Maintenance read-only and the announced countdown — planned but not built. See
[`MAINTENANCE_READ_ONLY_PLAN_2026-11-03.md`](../03-development/audits/MAINTENANCE_READ_ONLY_PLAN_2026-11-03.md).
