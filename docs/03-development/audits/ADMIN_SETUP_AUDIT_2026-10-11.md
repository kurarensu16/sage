# Admin Setup Audit and Fix Plan: colleges, programs, sections, terms, users, classrooms

- **Date:** 2026-10-11
- **Trigger:** QA report: an admin created a classroom for **BSIT-1A**, but the saved classroom was for **ACT-1A**.
- **Scope:** every admin function: Manage Users, Import Users (CSV/Excel), Subjects, Grading Formulas (COG), Sections, Colleges (Departments) and Programs, Classrooms, Term Settings, Grade Override, Activity Logs. Also the faculty **Create Classrooms** window, which shares the section logic. Covers dropdown filtering and every create, update, upsert, and delete.
- **Method:** read-only code audit, plus three read-only database queries run by the owner on 2026-10-11 (§9).
- **Status:** Audit complete; **owner approved the plan on 2026-10-11:** fix all code (Batches 1–3), then a **partial reset** and rebuild (§6). Track progress in the Status column of §4 and §7.
- **Change process:** each fix follows the change freeze (`AGENTS.md`): file-by-file approval, a change record in `docs/05-operations/agents/feature-updates/`, and test cases in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`. When a batch is built, its implementation report goes in `docs/03-development/implementation-reports/` and links back here.

---

## 1. Summary

1. **The QA bug is a display-vs-value mismatch in the Classrooms window (H1).** After the Program or Year filter is used, the section dropdown *shows* the first visible option (BSIT-1A), while the value still held from before the filter (ACT-1A, the first section of the college alphabetically) is what gets *saved*. The subject dropdown has the same flaw.
2. **The user form uses a hard-coded college list (C1).** The computing college in the database is **"Technology and Engineering College for Humanity"**, which isn't in that list. The form saves colleges and sections **by name**, so users from that college are saved with **no college and no section**, without any error.
3. **All 320 students have no home section (C3, from query 2).** Classes still work (they use class enrollments), but **Dean pages show no students**, **every student is labeled Irregular**, and **block-section auto-enrollment never runs**.
4. **Deleting a section or subject deletes its classes** and, through them, posted grades, scores, attendance, and evaluations (C2, confirmed by query 3). The classroom "delete" says it archives, but it permanently deletes.
5. **The semester rollover caused the empty home sections (R1, from queries 8–12).** QA ran the rollover to 2026-2027 · 1st before any sections existed for that term. The rollover function promoted every student's year level, tried to move each student to a next-term section that didn't exist, and **set every student's section to empty**. It also archived **no** classes, because sections and classes never store `term_id` (R2). A snapshot of each student's Summer section survives in `student_term_details` (315 of 320 students).
6. **Agreed principles for every fix:** read colleges, programs, sections, and terms **from the database**; select and save **by ID**; show **active-term** sections (earlier terms in an archive view); **reject instead of guessing**; remove the **Office** role; subjects stay a **term-free catalog** (offered per term through classrooms).

## 2. Background: home section vs class enrollment

ASPIRE has two different "sections". Only the first is empty.

| | **Home section** (`users.section_id`) | **Class enrollment** (`enrollments.section_id` + `subject_id`) |
|---|---|---|
| Meaning | The block a student belongs to (e.g., Juan is in BSIT-1A) | A student is in a specific class (e.g., Juan takes ITP113 with BSIT-1A) |
| Set by | Admin: Manage Users, Import Users | Classroom setup, approved join requests, seed data |
| Used by | **Dean pages** (find a college's students), the **Irregular** label, **block-section auto-enrollment** (trigger `sync_student_section_enrollments`) | **Class rosters:** grade sheet, attendance, Evaluate Students, the student's My Subjects |
| State on 2026-10-11 | **Empty for all 320 students** | Present, so classes and rosters work |

**Why a class shows 20 students, not 320:** a roster lists only students **enrolled in that class** (its section and subject). That is correct.

**Why home sections are empty:**
1. The user form's hard-coded college names leave the section dropdown empty for the computing college, so it saves no section (C1).
2. The import matches sections by name and by the hard-coded college name; failures are silently saved as no section (H3).
3. The seed data likely created class enrollments only.

**Effects:**

| Effect | Evidence |
|---|---|
| Dean pages list no students | `dean/AtRiskStudents.jsx:231` selects students `.in('section_id', sectionIds)`; `dean/Dashboard.jsx:198` filters students by `sectionIds.includes(u.section_id)` |
| Every student labeled "Irregular" on faculty pages | `getEnrollmentType()` (`src/lib/classRoomService.js`) returns *Irregular* when the student has no home section |
| Block-section auto-enrollment and roster notices never fire | Migration `20261010160000` triggers on section assignment, which never happens |

## 3. Severity scale
| Level | Meaning |
|---|---|
| **Critical** | Data is lost or saved wrong, at scale or silently |
| **High** | The wrong record or wrong person is affected |
| **Medium** | Wrong or incomplete behavior with a workaround, or fragile logic that breaks as data grows |
| **Low** | Wording or minor UX |

## 4. Findings

| ID | Severity | Page | Problem | Evidence | Status |
|---|---|---|---|---|---|
| **C1** | Critical | Manage Users → Add/Edit | College and program dropdowns use a **hard-coded list** (`DYCI_ACADEMIC_PROGRAMS`), not the database. College and section are resolved **by name** on save. The computing college ("Technology and Engineering College for Humanity") and "Department of General Education" are missing from the list, so users are saved with **no college/section**. In edit mode the dropdown shows the wrong college, and touching it wipes the user's college (and a student's section). | `UserForm.jsx:40` (default), `:439` (options), `:166–184` (name lookups), `src/lib/constants.js:1` | Done (Batch 1, 2026-10-11): pending QA |
| **C2** | Critical | Sections / Subjects / Classrooms delete | Deleting a **section or subject cascades** to its classes, and from each class to posted grades, scores, attendance, evaluations, join requests, and drafts (only `grade_correction_history` blocks). Confirm texts understate it ("affect new classroom creations"); the classroom confirm says "archive" but **hard-deletes**. Classroom delete checks only posted grades, from a list read in one request (capped at 1,000 rows). | `SectionList.jsx:98–107`, `SubjectList.jsx:65–67`, `ClassroomProvisioning.jsx:410–429`; query 3 (§9) | Done (Batch 2, 2026-10-11): pending migrations + QA |
| **C3** | Critical | Data (users) | **All 320 students have no home section** (query 2), caused mainly by the rollover (R1), plus the user form and import (C1, H3). Dean pages empty, everyone labeled Irregular, auto-enrollment inactive (§2). Year levels were also promoted by the rollover (query 12). | Queries 2, 10, 12 (§9) | Planned (partial reset, §6) |
| **R1** | Critical | Term Settings → semester rollover (`perform_semester_transition`) | Runs even when the next term has **no sections**. Then it (1) promotes every active student's year level, (2) sets each student's section to the next-term match, which is **empty** when none exists, (3) archives old classes only `WHERE term_id = old term`, which matches nothing (R2). It logged *"All old classrooms archived"* while 12 Summer classes stayed active. | `supabase/migrations/20260606164500_add_attendance_and_semester_transition.sql` (function); queries 8–12 (§9) | Done (Batch 2, 2026-10-11): pending migrations + QA |
| **R2** | High | Sections form, classroom creation | `term_id` is **never saved** on sections or classes (0 of 60 sections, 0 of 17 classes), so term-based logic (rollover archive, section carry-over) can't match anything. | `SectionForm.jsx` (payload has no `term_id`), `classRoomService.js` `provisionClassroomByAdmin` (insert has no `term_id`); query 11 | Done (Batch 2, 2026-10-11): pending migrations + QA |
| **R3** | Critical | Rollover vs. unposted grades | Once archiving works (R2), archived classes **vanish** for faculty (their pages show only active classes), and **posting is refused** (posting requires an active class), so unposted grades would be stuck. Students' grade report and My Subjects load only **active** classes, so previous-term classes and their posted grades would **disappear**. The pre-rollover check counts unposted classes by `term_id` (always 0 today) and shows **made-up example classes** if loading fails. The late flag marks every MR/TFR row as late. | `TermManagement.jsx` (pre-check, fallback), `student/MyGradesList.jsx` and `student/MySubjects.jsx` (`.eq('status', 'active')`), posting function (active-class check), rollover function | Done (Batch 2, 2026-10-11): pending migrations + QA; design §5.11 |
| **H1** | High | Classrooms → Create (**QA bug**) | After Program/Year filtering, the **displayed** section/subject differs from the **submitted** one. The selection is set from the unfiltered college list and never re-checked against the filtered options. | `ClassroomProvisioning.jsx:317–345` (filtered options), `:357–367` (initial selection), `:852–860` (section select) | Done (Batch 1, 2026-10-11): pending QA |
| **H2** | High | Grade Override → search | Uses the **first** matching student (`matchedUsers[0]`) without showing others; a common surname can override the **wrong student**. | `GradeOverride.jsx:132` | Done (Batch 3, 2026-10-11): pending migration + QA |
| **H3** | High | Import Users | Sections matched **by name only** (any term/college). A student row **without a section gets a guessed one** (first section with the year digit). An unmatched section is silently saved as none. Section assignment now auto-enrolls, so a guess creates real class enrollments. | `UserList.jsx:826–836` (guess), `:951–957` (name match) | Done (Batch 2, 2026-10-11): pending migrations + QA |
| **H4** | High | Classrooms, faculty Create Classrooms, user form | Section lists include **every term**; from the next term on, two identical "BSIT-1A" entries appear. | `ClassroomProvisioning.jsx:103`, `faculty/FacultyCreateClassroomModal.jsx:91`, `UserForm.jsx:58` | Done (Batch 1, 2026-10-11): pending QA |
| **M1** | Medium | Manage Users → Add/Edit | Section option value is the **name**; saving uses `.eq('name', …).maybeSingle()`, which fails ("multiple rows") or picks the wrong row once names repeat across terms. | `UserForm.jsx:178–184`, `:548` | Done (Batch 1, 2026-10-11): pending QA |
| **M2** | Medium | User form + import | **"Office" role** still offered and accepted (portal discarded). | `UserForm.jsx:408`, `UserList.jsx:853` | Form done (Batch 1); import done (Batch 2). Pending QA |
| **M3** | Medium | Grading Formulas (COG) | Editing saves each component weight as a **separate request** (partial failure → weights ≠ 100%). Creating is two separate steps. The delete message says subjects "fall back to default", but the database **blocks** deleting a template in use. *(Good: existing template structure is locked.)* | `GradeComputationsList.jsx:180–190`, `:206–226`, `:258` | Done (Batch 3, 2026-10-11): pending migration + QA |
| **M4** | Medium | Grade Override | Accepts any decimal 1.00–5.00 (not only DYCI grade steps). Sets `effective_grade` on MR/TFR rows too, not only the SG. Overwrites the previous remark note. | `GradeOverride.jsx:168–188` | Done (Batch 3, 2026-10-11): pending migration + QA |
| **M5** | Medium | Activity Logs (+ writers) | Logs load in one request, so only the newest **1,000** are visible or filterable. Classroom actions write **garbled** entries: `logActivity(actor, action, details)` instead of `(action, details, actor)`, and `resolveActorName(user, profile)` arguments are swapped. Term rollover logs twice, once into a non-existent `details` column. | `AuditLog.jsx:98–100`; `ClassroomProvisioning.jsx:388`, `:429`; `TermManagement.jsx:302–304` | Done (Batch 3, 2026-10-11): pending migration + QA |
| **M6** | Medium | Term Settings | If loading terms fails, the page shows **cached or made-up terms** as real; rollover could run against outdated data. | `TermManagement.jsx:54–68` | Done early (Batch 2, Term Settings rewrite): pending QA |
| **M7** | Medium | Manage Users (mobile filters) | The phone's college filter uses the hard-coded list, so it filters to nothing; desktop uses the database. | `UserList.jsx:1968` | Done (Batch 2, 2026-10-11): pending migrations + QA |
| **M8** | Medium | Manage Users → Add | New user number = role count + 1, which can **repeat** after accounts are removed. (The import path checks for duplicates.) | `UserForm.jsx:232–238` | Done (Batch 1, 2026-10-11): pending QA |
| **M9** | Medium | Sections → Add/Edit | School-year choices are **hard-coded** (2024–2027) and don't default to the active term. The format ("2025-2026") differs from seeded data ("AY 2025-2026"), which breaks active-term filtering. | `SectionForm.jsx:49`, `:383–395` | Done (Batch 1, 2026-10-11): pending QA |
| **M10** | Medium | Colleges | Choosing "No Dean" doesn't unassign the current dean. Clearing the previous dean isn't error-checked. Not atomic. | `DepartmentsList.jsx:132–147` | Done (Batch 3, 2026-10-11): pending migration + QA |
| **M11** | Medium | Manage Users → Edit | Changing an email likely updates the profile but **not the login email** (needs verification). | `UserForm.jsx:207–211` | Verified (no login-email sync exists); email locked in edit mode (Batch 1). Pending QA |
| **L1** | Low | Classrooms window | Text says provisioning creates *"0 initial students… students self-enroll"*, which is outdated (section students are auto-enrolled; code joins need approval). | `ClassroomProvisioning.jsx:729` | Done (Batch 1, 2026-10-11): pending QA |
| **L2** | Low | Colleges and Programs | **Programs can't be created or edited** anywhere in the app; they come only from seed data. | No write to `programs` in `src/` | Decided 2026-10-11: keep programs seed-only (a Programs page would be a new feature) |
| **L3** | Low | Class rosters | Archived or inactive students may still appear in class rosters (rosters don't filter by account status). | `classRoomService.js` roster query | Decided 2026-10-11: no change. Inactive students stay on rosters because they still need a final remark (Dropped/FDA), and auto-archiving waits for every enrolled student's SG |
| **L4** | Low | Term Settings (first term) | With no terms at all (e.g. after a reset), Term Settings cannot create the first term: its wizard only creates the *next* term of an active one. Found while preparing the 2026-10-11 test-year seed. | `TermManagement.jsx` (wizard needs an active term) | Workaround: first term created by SQL (`docs/05-operations/database/TEST_YEAR_SEED_2026-2027.md`, Stage 0). Fix to be decided |

### Verified safe (no change needed)
| Area | Why |
|---|---|
| Subjects form | College and COG stored **by ID**; COG required, with a blank first option, so it can't save a template the admin didn't pick. |
| Sections form | Name built from program, year, and suffix; saved by ID; duplicate name within a term rejected (`23505`). |
| COG templates | Weights must total 100% (with tolerance); a template in use can't be deleted (`ON DELETE RESTRICT`); existing template structure is locked. |
| Colleges | Dean picker lists only unassigned deans plus the college's current dean. |
| Classrooms | Duplicate class (same subject, section, term) refused. |
| Faculty Create Classrooms | Re-checks its section selection when filters change (only H4 applies). |
| Manage Users list (desktop) | Filters use database colleges and the loaded users. |

## 5. Fix plan by page (what changes and what the admin will see)

### 5.1 Manage Users: Add / Edit user (C1, M1, M2, M8, M11)
- **College** = colleges from the database; **Program** = that college's programs from the database.
- **Year level → Section** = that program's sections **for the active term**, labeled with the term (e.g., *BSIT-1A (2025-2026 · 1st)*).
- Dropdown values and saved values are **IDs**. Students must have a section, or the form shows *"Choose a section"* and doesn't save.
- **Roles:** Student, Faculty, Dean, Admin (**Office removed**). Fields by role: Student = college, program, year, section; Faculty and Dean = college; Admin = none.
- **User number** = next unused number (no repeats).
- **Email** locked after creation, unless M11 verification shows a safe way to change the login email too.

### 5.2 Import Users, CSV/Excel (H3, M2, M7)
- Each row is checked against the database: the **college** must exist, and for students the **section** must exist in **that college and the active term**.
- **No guessing.** Invalid rows are **rejected with a reason**, e.g.:
  - *"Row 12: assign a section for this student."*
  - *"Row 15: section BSIT-9Z not found in Technology and Engineering College for Humanity for 2025-2026 · 1st."*
- The preview lists valid and rejected rows; only valid rows are saved. Office is no longer accepted.
- The mobile college filter uses the database colleges (M7).

### 5.3 Classrooms (admin) and Create Classrooms (faculty) (H1, H4, C2, L1, M5)
- After any filter change, the selected section and subject are **re-checked against the visible options**, so **what is shown is what gets saved**.
- Only **active-term** sections are offered; earlier terms appear in an **"Archive / previous terms"** view (read-only).
- Window text explains automatic section enrollment and code-join approval (L1).
- **Delete** only for a class with **no scores, attendance, evaluations, or posted grades**; otherwise *"This class has records and can't be deleted."* Wording no longer says "archive".
- Activity log entries written correctly (M5).

### 5.4 Sections and Subjects (C2, M9)
- **Delete blocked** while a section or subject has classes or enrollments, e.g., *"BSIT-1A has 6 classes. Remove or archive them first."* A migration changes the database rules from `CASCADE` to `RESTRICT` (§7, Batch 2).
- Section school year and semester come from **Term Settings**, defaulting to the active term, in one consistent format.
- Subjects remain a **term-free catalog**: added once, offered in any term by creating a classroom.

### 5.5 Colleges (M10)
- Choosing "No Dean" unassigns the current dean; errors shown; dean changes saved together.

### 5.6 Grading Formulas, COG (M3)
- Weight edits saved in **one transaction** (all or nothing); template creation in one step.
- Delete message: *"This template is used by subjects and can't be deleted."*

### 5.7 Term Settings (M6)
- If terms fail to load: show an **error** and **block rollover**; no cached or made-up terms.
- Rollover writes one correct log entry (M5).

### 5.8 Grade Override (H2, M4)
- Search shows **all matches** (name, ID number, college, section); the admin **picks one**.
- New grade must be a **DYCI grade step** (1.00, 1.25, …, 5.00); override applies to the **SG only**; the previous remark note is kept in the log.

### 5.9 Activity Logs (M5)
- Logs are paged so **all** entries are reachable; filters apply across all entries.

### 5.11 Term rollover and unposted grades: approved design (R1, R2, R3)

**Decision (owner, 2026-10-11):** a grace period with escalation. **No admin-made or automatic grades:** only the instructor posts grades, and later SG changes use the existing SG correction process (Dean approval). The owner rejected two alternatives: the admin posting the SG for a non-compliant instructor, and auto-posting after 30 days.

**Before the rollover (admin)**
- The pre-check lists **every class in the term without a posted SG** (subject, section, instructor), matched by school year and semester. *Send reminders* notifies those instructors.
- The rollover is **refused** until sections exist for the next term (R1), and proceeds only after the admin types CONFIRM.
- The rollover **never empties** a student's section and never promotes students without a matching next-term section.

**Class states and SG labels**

| Moment | Class state | Instructor can | SG label when posted |
|---|---|---|---|
| Before the rollover | Open (current term) | Everything | **On time** |
| Rollover → end of grace period (default **30 days**, set per term in Term Settings) | **Open, previous term**, shown as **Pending (SG due in N days)** | Finish grading (scores) and **post the SG**; new-term work (attendance, new evaluations) closed | **Late** |
| After the grace period, still unposted | **Open, previous term**, shown as **Overdue**; also on the Dean's Grade Submission Status | Finish grading and post the SG; the Dean follows up | **Late (overdue)** |
| SG posted (any time) | **Archived**: read-only for everyone | View only; SG changes via SG correction (Dean approval) | label kept on record |

**History (read-only, grouped by term)**
- **Student:** a previous-term class whose SG isn't posted stays in **My Subjects**, marked *"Grade not yet posted"*. When the SG is posted, it moves to their **history**, and they get the existing **New Grade Posted** notification.
- **Faculty:** previous-term classes appear under **Past Archives** (My Class Records); Pending and Overdue classes still allow posting.
- **Dean:** a term selector on Dean pages; **Grade Submission Status** shows Pending, Late, and Overdue per instructor (matches the paper's "overdue indicators").
- **Admin:** Classrooms term filter (Batch 1).

**Implementation outline (Batch 2):**
- **Migration:**
  - grace days on `academic_terms` (default 30)
  - an SG submission label on posted SGs (On time / Late / Late (overdue)), replacing the yes/no late flag for this purpose
  - `perform_semester_transition` rewritten: pre-checks, no section wipe, archive only classes whose SG is posted, others marked previous-term pending
  - the posting function: allows SG posting for a previous-term pending class, sets the label, archives the class after the SG
  - `term_id` saved on new sections and classes (R2)
- **Pages:** Term Settings (pre-check list, reminders, grace setting), faculty My Class Records (Pending/Overdue in Past Archives), student My Subjects and Grades (term selector, *Grade not yet posted*), Dean pages (term selector; Grade Submission Status labels).

**Freeze classification:** the grace period, the submission labels, and "open until the SG is posted" are recorded as **New feature (approved outside the documented flow)**. The rollover safety, the history views, and the fixed pre-check are **Fix**.

**Why it improves the system:**
- no stuck grades
- no lost history for students, faculty, and Deans
- grades stay human-made (human-in-the-loop)
- one late instructor never blocks the school's rollover
- lateness is recorded and visible to the Dean
- students are informed
- previous-term grades remain available for GWA, honors, and the AI Study Tutor
- consistent with the DYCI handbook's late and INC handling

### 5.12 Batch 2 as built (2026-10-11)

- **Migrations** (owner runs, in order): `20261011120000_restrict_destructive_deletes.sql` (CASCADE → RESTRICT on classes/enrollments → sections/subjects, evaluation windows → sections, and classes/attendance/term history → terms) and `20261011130000_term_rollover_grace.sql` (§5.11).
- **`term_id` (R2):** filled by triggers from school year + semester on every new or edited section and class, plus a one-time back-fill. This covers the admin and faculty create paths without client changes.
- **SG label:** `posted_grades.sg_submission_status` (`on_time`, `late`, `late_overdue`), set by the database at the first SG posting and kept on later corrections.
- **Archived classes:** posting is refused except the repost of a Dean-approved SG correction; SG correction requests are allowed on archived classes.
- **Pages:** Term Settings (pre-check via `get_term_sg_status`, reminders, create next term, refuse without sections, grace setting, summary, single log; no sample data), My Class Records (Pending/Overdue/Archived in Past Archives), Score Input (archived view only), Attendance (active term only), My Subjects / My Grades (archived classes kept), Dean Grade Posting Status (archived included, paged loading, labels, term filter fixed).
- **Also fixed while there:** Term Settings read a non-existent `userProfile` for the actor name; Dean page's *Summer* filter never matched (`summer`), its school-year list was hard-coded, and its posted-grade load could be cut at 1,000 rows.

### 5.13 Batch 3 as built (2026-10-11)

- **Migration** `20261011140000_admin_batch3_atomic_saves.sql` (owner runs): `save_grade_template` (create a template with its components, or update an existing template's weights, in one transaction; weights must total 100%) and `assign_department_dean` (unassign the previous dean and assign the new one together; *No Dean* unassigns).
- **Grade Override (H2, M4):** all matches listed (ID number, college, section) for the admin to pick; searching by ID number works; only the SG can be overridden; new grade chosen from the DYCI steps; the previous remark note goes into the log.
- **Grading Formulas (M3):** saves through the function; delete checks subject usage first and says so.
- **Activity Logs (M5):** all entries loaded in pages. Classroom create/delete log entries fixed (argument order, actor name).
- **Colleges (M10):** dean saved through the function.
- **L2, L3:** decided, no code change (see table).

### 5.10 Later decisions
- **Programs management (L2):** add create/edit for programs, or keep them seed-only (paper check needed).
- **Roster status filter (L3):** verify, then hide archived/inactive students from rosters if confirmed.

## 6. Data plan: partial reset after the code fixes (C3, R1)

**Decision (owner, 2026-10-11):** after Batches 1–3 are built, do a **partial reset** and rebuild through the fixed admin pages. A full cold start (deleting the ~370 accounts and logins) was rejected as slower and riskier. The earlier idea of inferring sections from enrollments was dropped: 250 of the 320 students had no enrollments to infer from (query 5).

| Keep | Wipe (reset script, run by the owner) |
|---|---|
| Colleges (`departments`), programs, subjects, COG templates (`grade_computations` and components), **all user accounts and logins** | Terms, sections, class records and everything under them (activities, scores, posted grades, attendance, evaluations, join codes and requests, consultations, drafts), enrollments, notifications and deliveries, AI insights, student term details |

**Steps:**
1. **Preview** (read-only): row counts per table to be wiped, and per table kept.
2. **Reset script**, run by the owner in the Supabase SQL editor; counts re-checked afterwards.
3. **Rebuild through the admin pages:** create terms → set the active term → create sections → assign every student's section and year level (fixed import, update mode, §5.2) → create classrooms (section students auto-enroll).
4. **Verify** with spot-check queries: every active student has a home section in the active term; the Dean pages list students; Irregular labels appear only for irregular students.
5. **Update the reset guide** `docs/05-operations/database/ASPIRE_DATABASE_RESET_AND_MANUAL_SEEDING.md` (outdated: it references the discarded College Office portal) so the procedure is repeatable.

**Still to decide before step 3:** the active term for the rebuild. Recommended: a regular semester (e.g., 2026-2027 · 1st) plus a few Summer sections, so the QA checklist's regular-semester and Summer cases can both run.

**Superseded: quick restore.** A restore of the 315 students' Summer sections and year levels from `student_term_details` remains possible if QA needs data before the fixes land. Not planned.

## 7. Batches

| Batch | Items | Files (expected) | Migration | Unblocks | Status |
|---|---|---|---|---|---|
| **1** | C1, M1, M2 (form), M8, M11 (verify), H1, H4, M9, L1 | `src/pages/admin/UserForm.jsx`, `src/pages/admin/ClassroomProvisioning.jsx`, `src/pages/faculty/FacultyCreateClassroomModal.jsx`, `src/pages/admin/SectionForm.jsx` | No | QA: creating users and classrooms | **Done (code), 2026-10-11; pending QA** (cases AS-01–AS-14) |
| **2** | H3, M2 (import), M7, C2, **R1, R2, R3** | `src/pages/admin/UserList.jsx`, `src/pages/admin/SectionList.jsx`, `src/pages/admin/SubjectList.jsx`, `src/pages/admin/ClassroomProvisioning.jsx`, `term_id` filled by a database trigger instead (no change needed in `SectionForm.jsx` or `classRoomService.js`), `src/pages/admin/TermManagement.jsx` (rollover pre-check), new migrations (deletes → `RESTRICT`; `perform_semester_transition` rewritten: refuses without next-term sections, never empties sections, archives by school year and semester) | **Yes** | Data safety; required before the reset | **Done (code), 2026-10-11; pending migrations + QA** (cases AS-15–AS-40) |
| **3** | H2, M4, M3, M5, M6, M10, L2, L3 | `src/pages/admin/GradeOverride.jsx`, `src/pages/admin/GradeComputationsList.jsx`, `src/pages/admin/AuditLog.jsx`, `src/pages/admin/TermManagement.jsx`, `src/pages/admin/DepartmentsList.jsx`; possibly a migration for one-transaction COG weight updates | Maybe | Correctness and polish | **Done (code), 2026-10-11; pending migration + QA** (cases AS-41–AS-49) |

| **Reset** | C3 (data) | Preview + reset SQL (owner runs), rebuild through the admin pages, reset-guide update | Data | Clean baseline for QA | Planned (after Batch 3) |

Each batch adds QA test cases to the active checklist, a change record, and, when finished, an implementation report.

**Paper impact (after Batches 1–2):**
- *Import Users* requires a valid section for students.
- Roles are Student, Faculty, Dean, and Admin only.

## 8. Test plan outline (detailed cases added per batch)
- **H1:** Program filter BSIT → pick BSIT-1A → the created classroom is BSIT-1A (repeat with Year filter and with the subject).
- **C1/M1:** create and edit a student in "Technology and Engineering College for Humanity" → college, program, and section saved; the edit form shows the right college.
- **H4/M9:** two terms with "BSIT-1A" → only the active-term one is offered; the earlier one appears under Archive.
- **H3:** import rows with a missing section, an unknown section, and a section from another college → each rejected with its reason; valid rows imported.
- **C2:** delete a section with classes → blocked with a message; delete an empty class → allowed; delete a class with scores → blocked.
- **C3:** after repair, Dean At-Risk lists students; regular students have no Irregular badge.
- **H2:** search a shared surname → all matches listed; override only the chosen student; non-step grade rejected.

## 9. Evidence: database queries (owner, 2026-10-11)

**Query 1: colleges in the database**

| Name |
|---|
| College of Accountancy |
| College of Art and Sciences |
| College of Business Administration |
| College of Education |
| College of Health Sciences |
| College of Hospitality Management and Tourism |
| College of Maritime Education |
| Department of General Education |
| School of Psychology |
| Technology and Engineering College for Humanity |

The user form's hard-coded list has *College of Computer Studies* and *School of Mechanical Engineering* (not in the database), and lacks *Technology and Engineering College for Humanity* and *Department of General Education*.

**Query 2: users missing a college or section**

| Role | Total | No college | Students with no section |
|---|---|---|---|
| admin | 1 | 1 | 0 |
| dean | 10 | 0 | 0 |
| faculty | 40 | 0 | 0 |
| student | 320 | 0 | **320** |

(An admin without a college is expected.)

**Query 3: delete rules** (`c` = CASCADE, `r` = RESTRICT, `n` = SET NULL)

| Parent | Children |
|---|---|
| `subjects` | `enrollments` **c**, `class_records` **c** |
| `sections` | `enrollments` **c**, `class_records` **c**, `evaluation_windows` **c**, `users` n, `student_term_details` n |
| `class_records` | all **c** (posted_grades, student_term_scores, student_activity_scores via class_activities, attendance_records, student_risk_evaluations, class_join_requests, class_room_join_codes, remark_override_requests, drafts, consultations, …) except `grade_correction_history` **r** |

**Query 4: terms and sections**

| Kind | School year | Semester | Info |
|---|---|---|---|
| term | 2025-2026 | 1st | inactive |
| term | 2025-2026 | 2nd | inactive |
| term | 2025-2026 | Summer | inactive |
| term | 2026-2027 | 1st | **active** |
| sections | 2025-2026 | Summer | **60** (no sections for the active term) |

Format is consistent ("2025-2026"; "1st"/"2nd"/"Summer"), so no format clean-up is needed.

**Query 5: inferring home sections from enrollments:** 70 students with exactly one section; **250 with no enrollments**.

**Query 6: past Grade Overrides:** none.

**Query 7: classes created on 2026-10-11 (PH time):**

| Time | Subject | Section saved | Faculty | Students |
|---|---|---|---|---|
| 09:28 | CAL113 | ACT-1A | Cruz | 0 |
| 08:38 | UTS113 | BSMID-1A | Ocampo | 0 |
| 08:38 | CMF313 | BSMID-1A | Bautista | 0 |
| 08:19 | ITC113 | ACT-1A | Cruz | 0 |
| 08:15 | ITP113 | ACT-1A | Rivera | 0 |

**Query 8: rollover:** *"Semester Transition: AY 2025-2026 (Summer) → AY 2026-2027 (1st). All old classrooms archived."* by `admin@sage.edu.ph` at 2026-10-10 23:50 UTC (2026-10-11 07:50 PH).

**Query 9: classes per term:** 2025-2026 Summer: 12 **active** (not archived); 2026-2027 1st: 5 active (today's, on Summer sections).

**Query 10: rollover snapshot:** `student_term_details` for 2025-2026 Summer: 315 rows, all 315 with a section.

**Query 11: `term_id` saved:** sections 0 of 60; class records 0 of 17.

**Query 12: student year levels after the rollover:** 2nd Year 140, 3rd Year 80, 4th Year 50, Graduating 50 (all promoted).

## 10. Related documents
- Active test runbook: `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`
- Class-code approval and section enrollment (2026-10-10): `docs/03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md`
- Large-scale data handling (paging, 1,000-row cap): `docs/06-future-enhancements/SCALABILITY_AND_DATA_HANDLING_2026-10-10.md`
- Change process: `docs/05-operations/agents/CHANGE_FREEZE_GUIDE.md`
