# Pre-Final Defense Revisions: Registrar Side, SG Approval, Faculty Loading

**Date:** 2026-11-18
**Status:** Planning. Nothing here is built yet. Each phase starts only when the developer says so.
**Paper used for the section map:** `ASPIRE_Chapters_1-4_UPDATED_2026-11-16.docx` (in `Downloads/ASPIRE Thesis - Chapters 1-2/`)

---

## 1. What we agreed to change

| # | Revision | Current system | After the revision |
|---|---|---|---|
| 1 | **SG posting flow:** Faculty → Dean's office approves → Registrar | When faculty post the SG, students see it at once and the email goes out. The Dean only monitors submissions. | Faculty **submit** the SG. The Dean **approves** or **returns** it. Only after approval do students see it and the email go out, and the Registrar **receives** it as a record. MR and TFR post as they do now. |
| 2 | **Remove Faculty Loading from the Registrar** | The Registrar and the Dean both do faculty loading. | **Only the Dean** does faculty loading for their own college, including placing irregular or off-block students into classes. |
| 3 | **Registrar sees each student's enrolled subjects** | Not available. Enrollment Management shows only the home section, year and college. | New **Student Records** screen, Enrolled Subjects tab. |
| 4 | **Registrar sees the grade sheet per class** (by college, department and year level) | Not available. | New **Class Grade Sheets** screen, filtered by College → Program → Year Level. |
| 5 | **Registrar sees each student's grade history** | Only inside Grade Override, mixed in with override actions. | New **Student Records** screen, Grade History tab grouped by term. |

**Decisions made (2026-11-18):**
- Dean approval applies to the **SG only**.
- The Registrar **only receives** the approved SG and does not release it. Students see the SG once the Dean approves it.
- Faculty Loading stays with the **Dean**. The faculty portal gets no loading page.
- "Department" in the grade sheet filter means **Program**: College → Program → Year Level.

**Still open:**
1. Does the Dean have to give a reason when returning an SG?
2. Should the Registrar be able to override an SG while it is still waiting for the Dean?
3. Should the Dean have an "Approve All" button for a section or term?
4. Does the SG overdue clock stop when faculty submit, or when the Dean approves? Does the dispute window start at approval?
5. Should Student Records get its own tab on the mobile bottom nav?
6. Do the new Registrar screens also get a Previous Terms (archive) view?

---

## 2. Phases

| Phase | Work | Risk | Paper impact |
|---|---|---|---|
| **0. Foundation** | List every screen, function and report that reads a posted SG: Grade Report, GWA, President's List, risk engine, dispute window, grade emails, Dean posting status, `get_term_sg_status`, rollover. Get the live posting function definition (owner runs a read-only query). Check that the Registrar can read `enrollments`, `class_records` and `posted_grades`. Plan the shared College → Program → Year filter, with values loaded from Supabase, never hard-coded. | None (read-only) | None |
| **1. Remove Faculty Loading from the Registrar** | Route becomes a redirect so old notification links still work. Remove it from the sidebar and bottom nav. Migration: loading becomes Dean-only, and the loading notices stop going to the Registrar. | Low | Section 4 items marked **P1** |
| **2. Registrar read-only screens** | 2a Student Records: Enrolled Subjects. 2b Student Records: Grade History. 2c Class Grade Sheets. | Low to medium (no writes) | Section 4 items marked **P2** |
| **3. SG approval workflow** | 3a Database: approval status per class SG, Dean approve/return functions, SG hidden from students until approved, SG email delayed until approval, existing SGs counted as approved. 3b Dean approval queue. 3c Faculty submit/return status. 3d Registrar sees approved SGs in Class Grade Sheets. | **High**: changes the core posting path | Section 4 items marked **P3** |
| **4. Paper, docs and testing** | Apply section 4 to the paper, update figures, `ASPIRE_SYSTEM_SCOPE.md`, the test checklist, and a click-through test guide for each phase. | None | All of section 4 |

Order: 0 → 1 → 2 → 3 → 4. Phases 1 and 2 are safe to finish before the defense. Phase 3 builds on the Phase 2 grade sheet.

---

## 3. New screens, features and navigation

### Registrar

**Sidebar**
```
BEFORE                                   AFTER
Dashboard                                Dashboard
People                                   People
  View Users                               View Users
  New Student Accounts                     Student Records                  ← NEW screen
                                           New Student Accounts
Academic Setup (unchanged)               Academic Setup (unchanged)
Enrollment & Loading                     Enrollment                         ← renamed
  Faculty Loading & Provisioning  ✕        Enrollment Management
  Enrollment Management                    Section Rosters
  Section Rosters                        Grade Records
Grade Records                              Class Grade Sheets               ← NEW screen
  Grade Override                           Grade Override
  Late Grade Changes                       Late Grade Changes
Reports                                  Reports
```
(As built. Student Records went under People instead of a group of its own, because the sidebar rule is that a group must hold more than one link.)

| Screen | Route (proposed) | What it shows |
|---|---|---|
| **Student Records** (list) | `/registrar/studentrecords` | Search by name or ID; filter by College → Program → Year Level. Each row: ID, name, program, year, home section, Regular/Irregular. |
| **Student Records** (detail) | `/registrar/studentrecords/:id` | Header card plus two tabs. **Enrolled Subjects:** term picker (active term by default); subject, units, section, instructor, schedule, room, and off-block marker. **Grade History:** grouped by term; MR, TFR, SG, remarks, SG status (Awaiting Dean / Approved / Overridden), and term GWA. |
| **Class Grade Sheets** (list) | `/registrar/gradesheets` | Filters: Term → College → Program → Year Level → Section. Each class: subject, section, instructor, enrolled count, SG status with approval date, and a "Recently approved" filter. |
| **Class Grade Sheet** (one class) | `/registrar/gradesheets/:classId` | Roster with MR, TFR, SG, remarks and override flag, plus who posted, who approved and when. Export to Excel and print. |
| ~~Faculty Loading & Provisioning~~ | `/registrar/facultyloading` | **Removed.** The route redirects to the Dashboard. |

Other Registrar changes:
- **Dashboard:** the readiness card counts **approved** SGs, with Awaiting Dean shown separately.
- **Notifications:** new "SG approved" notice; the loading notices are removed.
- **Links:** student names in View Users, Section Rosters and Grade Override open Student Records.

### Dean
- **New screen: SG Approvals** (`/dean/sgapprovals`, first item under Grades). It lists SGs awaiting a decision (oldest first, days waiting, resubmissions flagged) and those decided in the last 30 days. Opening a class (`/dean/sgapprovals/:classRecordId`) shows its SG sheet and distribution with **Approve SG** and **Return to instructor** (reason required, at least 10 characters). *As built: a separate screen instead of a tab inside Grade Submission Status, and no sidebar count badge.*
- **Faculty Loading** is unchanged, but the Dean is now the only role that places irregular students into classes.
- New notice: "SG submitted for approval".

### Faculty
- Review & Post Grades: the SG button becomes **Submit SG to Dean**. MR and TFR are unchanged.
- My Classes and Posted Grades show an SG status badge: Submitted / Approved / Returned with the Dean's reason. A returned SG can be fixed and resubmitted.
- New notices: "SG approved" and "SG returned".

### Student
- Grade Report: the SG shows **Pending approval** until the Dean approves.
- The SG email is sent at approval, not at submission.

---

## 4. Paper changes, section by section

How to read this section:
- **P1/P2/P3** is the phase that makes the change true. Edit the paper only for phases that are actually built.
- "Find" quotes the current text so you can search for it in Word.
- Suggested wording is a draft for the team to edit.
- Following the project rule, the paper describes the system as built. Do not add "to be implemented" notes.

### Chapter 1

| Section | Find (current text) | Change | Phase |
|---|---|---|---|
| Specific Problems, item 7 | "controlled grade-posting and correction workflows, Registrar-authorized overrides" | Add Dean approval: "…controlled grade-posting with Dean approval of the Semestral Grade, correction workflows, Registrar-authorized overrides…" | P3 |
| Specific Objectives, item 6 | "Support Faculty–Dean collaboration through Dean referrals…" | Add "Dean approval of submitted Semestral Grades" to the list. | P3 |
| Specific Objectives, item 7 | "Implement controlled grade correction, Registrar override…" | Optional: add "Registrar access to class grade sheets and student grade histories". | P2 |
| Scope › Dashboard Module, Registrar | "Shows term readiness, enrollment and section coverage, faculty loading progress, and outstanding academic-setup work" | Remove "faculty loading progress". Add "and SG approval progress". | P1, P3 |
| Scope › User Accounts Module, Registrar – View Users | "for verification during enrollment and loading" | Change to "for verification during enrollment". | P1 |
| Scope › Enrollment and Faculty Loading Module | "Registrar – Faculty Loading and Provisioning. Assigns faculty to subject-section classes for the active term in any college…" | **Delete this bullet.** Move its rule details (lock, schedule, room, conflict checks across colleges) into the Dean bullet. | P1 |
| Same module, Registrar – Enrollment Management | "Maintains block-section enrollment and adds irregular or off-block students directly to a class roster." | Change to "Maintains block-section enrollment." Move "adds irregular or off-block students directly to a class roster" to the Dean bullet. | P1 |
| Same module, Dean – Faculty Loading and Provisioning | "Assigns faculty to subject-section classes within the Dean's own college…" | Make this the only loading bullet. Add "and adds irregular or off-block students directly to a class roster". Keep the clause that, when a conflicting class belongs to another college, only that college and program are disclosed. | P1 |
| Scope › Classes and Grading Module, Faculty – Review and Post Grades | "posts official MR, TFR, and SG grading-period results…" | "…posts official MR and TFR results and **submits the SG to the Dean for approval**, in the required MR, TFR, then SG sequence." | P3 |
| Same module, Faculty – Posted Grades and Corrections | "Displays posted grading-period results…" | Add "and the approval status of the submitted SG (submitted, approved, or returned with the Dean's reason)". | P3 |
| Same module, Student – Grade Report | "Shows officially posted MR, TFR, SG…" | Add "an SG appears once the Dean approves it". | P3 |
| Same module, Dean – Grade Submission Status | "Tracks instructor submissions by grading period and identifies pending, late, and overdue classes." | Add "and approves or returns each class's submitted SG". | P3 |
| Same module, **new bullets** | none | Add "**Registrar – Student Records.** Shows each student's enrolled subjects per term and grade history across terms (MR, TFR, SG, remarks, and term GWA), read-only." and "**Registrar – Class Grade Sheets.** Shows the grade sheet of each class, filtered by college, program, and year level, including the SGs the Dean has approved, with Excel export." | P2 |
| Scope › Reports Module, Registrar | "Produces enrollment, section, loading, and grade-record summaries." | Remove "loading". (The current Registrar Reports page already has no loading export, so this fixes an existing mismatch.) | P1 |
| Scope › Notifications Module | "enrollment, loading, and grade records for the Registrar" | Change to "enrollment, approved SGs, and grade records for the Registrar". Add "SG approvals" to the Dean's list and "SG approval or return" to the faculty list. | P1, P3 |
| Scope › Academic Period and Archive Access, Registrar | "Registrar – Previous Terms. Sections and reports." | Add "class grade sheets and student records" **only if** open item 6 is approved and built. | P2 |
| Delimitations, 2nd paragraph | "MR, TFR, and SG become official only after authorized posting." | "MR and TFR become official when the faculty member posts them; the SG becomes official only after the Dean approves it." | P3 |
| Delimitations, 4th paragraph | "controlled faculty posting, Dean-approved student-scoped SG correction authority" | Add "Dean approval of submitted SGs". | P3 |
| Definition of Terms › Block Section | "added directly to a class roster by the Registrar or the Dean" | Change to "by the Dean". | P1 |
| Definition of Terms › Faculty Loading | "done by the Dean or the Registrar under an exclusive per-college edit lock" | Change to "done by the Dean of the college under an exclusive per-college edit lock". | P1 |
| Definition of Terms › Posted Grade | "computed on the server and released to the student" | Add "an SG is released to the student once the Dean approves it". | P3 |
| Definition of Terms › Registrar | "maintains academic setup, academic terms, enrollment, faculty loading, and official grade records" | Remove "faculty loading". Optionally add "and receives Dean-approved Semestral Grades". | P1, P3 |
| Definition of Terms, **new terms** (optional) | none | Add **SG Approval** ("the Dean's review of a class's submitted Semestral Grade, which releases it to students and to the Registrar, or returns it to the faculty member with a reason"), **Class Grade Sheet**, and **Student Grade History**. | P2, P3 |
| RRL › Automated Faculty Loading and Scheduling | none | **No change.** This section reviews related studies, not ASPIRE's roles. | none |

### Chapter 2

| Section | Find (current text) | Change | Phase |
|---|---|---|---|
| System Workflow › Existing System (Dean and Registrar paragraphs) | "files the grade sheets forwarded by the Dean" | **No change.** The manual process already goes faculty → Dean → Registrar. The new SG flow is the digital version of it, which is a good point to make at the defense. | none |
| Proposed System › Enrollment and Faculty Loading Module | "both the Registrar and the Dean of that college can perform the task" | Rewrite: only the Dean of the college performs loading, and the lock stops two sessions on the same college at once. Change "once the Registrar enrolls students by block section or directly into a class" to "once the Registrar enrolls students by block section, or the Dean adds them directly into a class". | P1 |
| Proposed System › Classes and Grading Module | "Faculty preview and post official MR, TFR, and SG results…" | Rewrite the last sentences: faculty post MR and TFR, then submit the SG; the Dean approves or returns it; approval releases it to the student's Grade Report and to the Registrar, who sees it on the class grade sheet and in the student's grade history. | P2, P3 |
| Data Flow, step 2 | "The Registrar or the Dean assigns faculty, schedules, and rooms…" | Change to "The Dean assigns faculty, schedules, and rooms… and the Registrar enrolls students by block section". | P1 |
| Data Flow, step 4 | "faculty post the Midterm Rating, Tentative Final Rating, and Semestral Grade in that order. Posted grades update the student's Grade Report and GWA." | "…faculty post the MR and TFR and submit the SG; the Dean approves the SG, which then updates the student's Grade Report and GWA and reaches the Registrar's records." | P3 |
| Data Flow, step 10 | none | Add "SG approvals" to the notifications list. Add "class grade sheets and student grade histories" to what the Registrar draws. | P2, P3 |
| Business Rules (Table 2.3), loading row | "One office edits a college's faculty loading at a time…" | "Only the Dean of a college edits its faculty loading, one session at a time; bookings into another college's sections, such as General Education's, are checked and saved one at a time per section and per faculty member, and the owning college is notified." (See section 9.) | P1 |
| Business Rules (Table 2.3), **new row** | none | Rule: "A submitted SG reaches students and the Registrar only after the Dean approves it; a returned SG goes back to the faculty member with the Dean's reason." Module: Classes and Grading. Source: ASPIRE system rule / DYCI practice. | P3 |
| Business Rules (Table 2.3), posting-order row | "Grading periods post in order: the TFR requires the MR, and the SG requires both" | Add "…and the SG requires Dean approval before release". | P3 |
| Academic Setup Module › Academic Terms (Ch 1 scope) | "SG grace periods, and pending or overdue status" | Depends on open item 4: say whether "overdue" counts until submission or until approval. | P3 |
| Process Design › Existing System DFDs (Figs 2.2–2.6) | none | **No change.** | none |
| **Fig 2.7** Level 0 Context Diagram + text | Faculty / Dean / Registrar flows | Faculty → *submitted SG*. Dean → *SG approval decision*. ASPIRE → Registrar: *approved SGs, class grade sheets, student records*. Remove the Registrar's *faculty loading* flows. ASPIRE → Faculty: *SG approval or return*. | P1–P3 |
| **Fig 2.8** Student Portal, My Grades (3.0) | "retrieves posted milestones (MR, TFR, SG)" | "…MR, TFR, and Dean-approved SG". | P3 |
| **Fig 2.9** Faculty Portal, Grades (3.0) | "posts the official MR, TFR, and SG milestones" | "posts the official MR and TFR, submits the SG for Dean approval, and retrieves its approval status". | P3 |
| **Fig 2.10** Dean Portal, Faculty Loading (3.0) | "Faculty Loading (3.0) works under an exclusive per-college edit lock…" | Add the flow for *irregular or off-block student added to a roster*, which moves over from the Registrar diagram. | P1 |
| **Fig 2.10** Dean Portal, Grades (4.0) | "retrieves submission status and grade distribution, reviews SG correction proposals…" | Add: *retrieves submitted SGs, saves the approval or return decision, notifies faculty and Registrar*. Add the data store for SG approvals. | P3 |
| **Fig 2.11** Registrar Portal, Dashboard (2.0) | "summarizes term readiness, enrollment and section coverage, and faculty loading progress" | Remove "faculty loading progress"; add "SG approval progress". | P1, P3 |
| **Fig 2.11** Registrar Portal, Enrollment and Loading (5.0) | "works under an exclusive per-college edit lock, saves drafted, finalized, and reassigned load, retrieves the room catalog, provisions the class record…" | Rename it **Enrollment (5.0)**. Remove every loading flow (lock, drafts, room catalog, provisioning, irregular-to-roster). Keep *saves block membership*. | P1 |
| **Fig 2.11** Registrar Portal, **new process(es)** | none | Add **Student Records** (*retrieves enrollments, class records, posted grades* → *enrolled subjects, grade history*) and **Class Grade Sheets** (*retrieves class records, posted grades, SG approvals* → *grade sheet, export*). Either renumber the processes or put both under Grade Records (6.0). | P2, P3 |
| **Fig 2.11** Registrar Portal, Reports (7.0) | "retrieves enrollment and section coverage, the loading summary, and posted grade records" | Remove "the loading summary". | P1 |
| Fig 2.11 closing paragraph | "Because the Registrar is institution-wide by definition, a schedule conflict is disclosed here in full…" | **Delete.** The Registrar no longer meets schedule conflicts. Keep the matching sentence in the Dean figure. | P1 |
| **Fig 2.13** VTOC (both parts) | Enrollment and Faculty Loading module; Classes and Grading module | Remove the Registrar › Faculty Loading and Provisioning box. Add Registrar › Student Records and Registrar › Class Grade Sheets under Classes and Grading. Update the Dean › Grade Submission Status label to include SG approval. Renumber the affected boxes. | P1–P3 |
| Database Design intro | "ASPIRE's database holds 55 tables." | **57 tables.** Phase 3 adds `sg_approvals` and `sg_held_notifications`. | P3 |
| **Fig 2.17a/b** ERD: Grading Outcomes | none | Add **SG_APPROVALS**: class_record_id (PK, FK → CLASS_RECORDS), status, submitted_by (FK → USERS), submitted_at, submission_count, decided_by (FK → USERS), decided_at, return_reason, approved_before_workflow. Add **SG_HELD_NOTIFICATIONS**: held_id (PK), class_record_id (FK → CLASS_RECORDS), recipient_id (FK → USERS), type, title, link, severity, message, payload, held_at, released_at. Update the figure text. | P3 |
| Fig 2.20a/b (FACULTY_LOAD_DRAFTS, PROVISIONING_LOCKS) | "PROVISIONING_LOCKS makes faculty loading…" | **No change.** The Dean still uses both tables. | none |
| User Interface Design intro | "organized according to the access privileges of Students, Faculty members, Deans, and Administrators" | Add "the Registrar" (it is already missing). | P2 |
| **Fig 2.28** Review & Post Grades text | "Faculty may post the MR, TFR, or SG after review" | "…post the MR or TFR, or submit the SG for Dean approval, after review". Retake the screenshot so it shows the Submit SG button. | P3 |
| UI Design, **new figures** (optional) | none | Candidates: Registrar Class Grade Sheet, Registrar Student Records, Dean SG Approval queue. Adding them renumbers Figures 2.29–2.37 and every in-text reference to them. Decide as a team. | P2, P3 |
| Implementation Plan | "After SG posting, ordinary faculty editing remains locked" | "After SG submission…". Check that the rest of the paragraph still reads correctly. | P3 |
| Verification, Validation and Testing | "Dean review of student-scoped SG correction requests and escalated cases, and Registrar-authorized direct grade overrides" | Add "Dean approval of submitted SGs" to the workflows listed. | P3 |
| Appendix I: Data Dictionary | none | Add both new tables (same columns as Fig 2.17 above). | P3 |

### Chapter 3

| Section | Find (current text) | Change | Phase |
|---|---|---|---|
| Table 3.2 Manual Functional Test Cases | "Registrar: faculty-loading schedule conflict" | Change to **"Dean: faculty-loading schedule conflict"**. | P1 |
| Table 3.2, new rows | none | "Dean: approve submitted SG → student sees SG, Registrar receives it"; "Dean: return SG → faculty sees reason, student still sees Pending"; "Registrar: class grade sheet by college/program/year". | P2, P3 |
| Table 3.2, "Student: Grade Report after posting" | "Posted grading-period results (MR/TFR/SG) replace tentative values" | Add "SG appears only after Dean approval". | P3 |
| Evaluation results (TAM / ISO) | none | **Team decision:** if the respondents evaluated the system before these revisions, say what version they evaluated, or re-run the affected items. Do not imply that the new screens were evaluated if they were not. | — |

### Chapter 4 and Appendices

| Section | Change | Phase |
|---|---|---|
| Summary of the Study / Conclusion | Read through for "faculty loading by the Registrar" or "faculty post the SG" and adjust if found. None were found in the 2026-11-16 copy, but recheck after other edits. | P1, P3 |
| Appendix O: User Manual | Registrar: remove the Faculty Loading section; add Student Records and Class Grade Sheets. Dean: add SG approval. Faculty: Submit SG. | P1–P3 |
| Appendix P: Screenshots | Retake the Registrar sidebar, Dean Grade Submission Status, the faculty Submit SG screen, and the student Grade Report showing a pending SG. | P1–P3 |

---

## 5. Repo docs to update with the code (Phase 4)

- `docs/01-system/overview/ASPIRE_SYSTEM_SCOPE.md`: Registrar and Dean feature lists, and the grade posting flow.
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`: new and changed test cases (mirror Table 3.2).
- `docs/02-thesis/figures/`: Mermaid sources for Figures 2.7, 2.8, 2.9, 2.10, 2.11, 2.13 and 2.17 (see the figure pipeline note: `.mmd` + mermaid-cli, then swap the image into the .docx).
- `docs/README.md`: index any new docs.

## 6. Phase 0 findings (2026-11-18, read-only)

### 6.1 Possible regression: the Registrar may not be able to read posted grades

`posted_grades` (and student term, component and activity scores, and attendance) can only be read by users that pass `can_read_student_class_record()`.

| Migration | Who that function lets read |
|---|---|
| `20261101012000_registrar_can_read_and_override_official_grades.sql` | student, assigned faculty, Dean, **Registrar**, Admin |
| `20261105152119_an_instructor_keeps_the_classes_they_taught.sql` (later) | student, class faculty, Dean, Admin. **The Registrar is missing.** |

The 2026-11-05 migration says it changes only the faculty arm, but its new definition also drops `is_active_registrar()`. If the live database matches the files, the Registrar reads **no** posted grades today. That affects the existing Grade Override page and would block Phase 2. **Query Q1 confirms it.** If confirmed, the fix is a one-line migration that adds the Registrar arm back, done at the start of Phase 2.

`enrollments` (Registrar arm present), `class_records`, `sections`, `programs` and `departments` (open to every signed-in user) are readable by the Registrar.

### 6.2 Program and year level for the grade sheet filter

`sections` has **no** `program_id` or `year_level` column; both are encoded in the section name (`<PROGRAM ABBR>-<year digit><suffix>`, e.g. `BSIT-1A`). The code already reads them back this way:
- `parseSectionName()` and `YEAR_LEVEL_BY_DIGIT` in `src/lib/facultyLoadingService.js`
- `getCourseFromSectionName()` in `GradeComputationPreview.jsx`

The program abbreviation is matched against `programs.abbreviation` from the database, so nothing is hard-coded.

**Plan:**
- Move `parseSectionName` and `YEAR_LEVEL_BY_DIGIT` into a shared `src/lib/sectionNaming.js`, and have the loading service import it from there.
- The filter is College (`sections.department_id`) → Program (parsed abbreviation, matched to `programs`) → Year Level (parsed digit).
- Sections whose names do not parse are listed under **"Unclassified"** instead of being hidden.
- Query Q4 counts how many there are.
- A real `program_id`/`year_level` column on `sections` would be cleaner, but it is a schema change to a table that predates the migrations, so it is not part of this plan.

### 6.3 Everything that reacts to a posted SG (Phase 3 inventory)

**Database triggers and functions that fire on posting**

| What | Where | What happens to it under Dean approval |
|---|---|---|
| `grade_posted` / `grade_changed` notifications and emails to the student and guardian | inside `post_grade_milestone_v2` (patched in place; see `20261118060222`) | For an SG: hold until approval, then send. On return: send nothing to the student. |
| `trg_set_sg_submission_status` / `trg_keep_sg_submission_status` (on time / late / overdue) | `20261011130000_term_rollover_grace.sql` | Depends on open item 4. Submission stays the faculty's timeliness record. |
| `trg_archive_previous_term_class_after_sg`: archives a previous-term class once its SG is in | same file | **Must wait for approval.** Otherwise a returned SG lands on an archived, read-only class that the faculty member can no longer edit. |
| `trg_open_consultation_window`: consultation window opens on every posting | `20261029104037_grade_consultation_windows.sql` | For an SG: open on approval, since the student cannot consult about a grade they cannot see. |
| `trg_warn_open_plans_on_post` (fires when a consultation window opens) | `20261103092200` | Follows the consultation window, so it moves with it. |
| `trg_close_evaluations_on_finalize` | `20261103091500` | Follows finalization. Check during Phase 3a. |
| Class roster closes after SG | `20261020120000_close_class_roster_after_sg.sql` | Keep at submission (nobody new joins a class being graded). Confirm. |
| `get_term_sg_status`, `class_sg_deadline_state`, `aspire_remind_unposted_sg_on_rollover` | `20261011130000`, `20261103093749` | Add an "awaiting Dean" count. Reminders keep going to faculty who have not **submitted**. |
| `perform_semester_transition` (rollover) | `20261011130000` | Decide: can a term roll over while SGs are still waiting for the Dean? |
| SG correction requests (`submit_sg_correction_request_v2`, etc.) | `20261023211000`, `20261117195907` | Allowed only on an **approved** SG. A pending SG is fixed by the Dean returning it. |
| Registrar override (`apply_admin_grade_override_v3`) | `20261023211000` | Open item 2. Recommended: approved SGs only. |

**Screens that read `posted_grades` (25 files)**

| Who | Files | Effect of a pending SG |
|---|---|---|
| Student | `MyGradesList`, `MyGradesDetail`, `Dashboard`, `AcademicInsights`, `lib/studentRunningGrade` | Must not see it. **Recommended:** hide it with an RLS rule on `posted_grades` (student arm: an SG row is visible only once approved), so all five pages and the AI context are covered at once. Grade Report then shows "Pending approval" when the class status says SG submitted. |
| Faculty | `ScoreInput`, `PostedGradesView`, `GradeComputationPreview`, `Dashboard`, `ClassRecordsList`, `lib/evaluationService`, `lib/evaluationTracking`, `lib/classRoomService` | See their own pending SG, plus a status badge. |
| Dean | `GradePostingStatus`, `GradeDistribution`, `Dashboard`, `AtRiskStudents`, `SummaryReports`, `lib/collegeRiskService` | See pending SGs to review them. **Decision needed:** do risk, honors and distribution counts include pending SGs, or approved only? Recommended: approved only, with pending shown separately. |
| Registrar / Admin / shared | `GradeOverride`, `GradeComputationsList`, `admin/UserList`, `lib/reportsService`, `lib/academicPolicy`, `lib/auditLogPresentation`, `lib/notificationDispatcher` | Show the status. Override behaviour depends on open item 2. |

Legacy rows: `grade_period` may still hold old values (`final`, `sg`) that `getCanonicalGradePeriod()` maps to SG. Any database rule that recognizes an SG must accept those values too, the same as the client does.

### 6.4 Queries for the owner (read-only, Supabase SQL editor)

```sql
-- Q1. Live definitions: the read gate and both posting functions.
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('can_read_student_class_record', 'post_grade_milestone_v2', 'post_grade_milestone_v3')
ORDER BY p.proname;

-- Q2. Read policies on the tables the new Registrar screens use.
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('posted_grades', 'enrollments', 'class_records', 'sections', 'programs', 'users')
ORDER BY tablename, policyname;

-- Q3. Columns of sections and posted_grades (sections predates the migrations).
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('sections', 'posted_grades')
ORDER BY table_name, ordinal_position;

-- Q4. Section names that do not parse as <ABBR>-<digit><suffix>, or whose
--     abbreviation matches no program.
SELECT s.name, s.school_year, s.semester
FROM public.sections s
WHERE s.name !~ '^.+-[1-9]'
   OR NOT EXISTS (
     SELECT 1 FROM public.programs p
     WHERE upper(p.abbreviation) = upper(left(s.name, length(s.name) - strpos(reverse(s.name), '-')))
   )
ORDER BY s.school_year DESC, s.name;

-- Q5. Triggers on posted_grades as deployed.
SELECT tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t
WHERE t.tgrelid = 'public.posted_grades'::regclass AND NOT t.tgisinternal
ORDER BY tgname;

-- Q6. Grade-period values actually stored, to size the legacy mapping.
SELECT grade_period, count(*) FROM public.posted_grades GROUP BY grade_period ORDER BY 2 DESC;
```

## 7. Migrations

Run in this order in the Supabase SQL editor; each ends with its own verification notice. Each runs inside one transaction, so a failure applies nothing and the file can simply be run again.

| # | File | Phase | Status |
|---|---|---|---|
| 1 | `20261118060222_grade_emails_carry_the_grade.sql` | (owner's, before this plan) | Run (2026-11-18) |
| 2 | `20261118151604_faculty_loading_belongs_to_the_dean.sql` | 1 | Run (2026-11-18) |
| 3 | `20261118152303_registrar_reads_official_grades_again.sql` | 2 | Run (2026-11-18) |
| 4 | `20261118153739_sg_approval_by_the_dean.sql` | 3 | Run (2026-11-18). The first attempt failed (`42883`: the live `posted_grades.locked_milestones` is `character varying[]`, not JSONB) and rolled back cleanly; the fixed version ran successfully. |
| 5 | `20261118183828_a_class_does_not_conflict_with_itself.sql` | QA fix | Run (2026-11-18). Editing a finalized class's schedule (e.g., Mon–Sat narrowed to Wednesday) was refused as a clash with that same class, because its own loading draft was not skipped. Now skipped; a real clash with another class is still refused. Tested in PGlite (4 checks). |
| 6 | `20261118184937_class_changes_notify_students_and_faculty.sql` | 5 | Run (2026-11-18). A live class's schedule or faculty change notifies its enrolled students and the faculty (old and new faculty on a transfer); drafts and no-change saves stay silent. A live class can no longer be removed from the app, only transferred. Tested in PGlite (6 checks). |
| 7 | `20261118192713_a_returned_sg_reopens_its_scores.sql` | QA fix (section 11) | Run (2026-11-18). While the Dean has an SG returned, the instructor can edit that class's scores and attendance again, including terms behind a finalized MR or TFR. When the Dean approves the resubmission, the posted MR and TFR follow the corrected scores, and each student whose MR or TFR changed is notified. Tested in PGlite (11 checks). |
| 8 | `20261118194508_an_approved_sg_reaches_every_student.sql` | QA fix (section 12) | Run (2026-11-18). Approving an SG now notifies every student of the class (in-app, student email, guardian email). Before, only students whose grade changed on a resubmission were told. Backfills the missing notice for SGs already approved. Tested in PGlite (13 + 19 checks, both orders with #7). |

What each one does:
- **#2:** faculty loading is Dean-only on the server, and loading notices to the Registrar stop.
- **#3:** restores the Registrar's read access to posted grades (section 6.1).
- **#4:** SG approval by the Dean: the two new tables; submission on posting; a pending SG is hidden from students and its emails are held; `decide_sg_approval()`; archive on approval; corrections and overrides on approved SGs only; and the patch that lets a returned SG be re-posted. Existing SGs are recorded as already approved.

All eight migrations are live (2026-11-18). #5 fixes the schedule-edit false clash found in QA; #7 and #8 fix the returned-SG scores and the missing approval notices.

## 8. Checklist

Decisions
- [x] Open items 1–6 answered (2026-11-18):
  1. Returning an SG needs a reason.
  2. Overrides and corrections apply to approved SGs only.
  3. Dean analytics include pending SGs.
  4. On-time / late / overdue and rollover are measured at submission.
  5. Student Records sits under People and on the Enrolment mobile tab.
  6. The new screens can load past terms.
- [x] Faculty-loading edit lock kept, Dean-only (section 9).
- [x] Title page: "Faculty of the Technology and Engineering College for Humanity".
- [x] Phase 0 owner queries Q1–Q6: **skipped on purpose.** The owner batched the migrations to the end, and each migration checks the live database itself (the #4 failure above is that check working).

Build
- [x] Phase 0 code review: SG reader list, filter approach, Registrar read regression (section 6).
- [x] Phase 1 built: route redirect, sidebar and bottom nav, Registrar loading page deleted, migration #2.
- [x] Phase 2 built: Student Records (list and detail with Enrolled Subjects and Grade History), Class Grade Sheets (list and sheet, Excel and print), shared `sectionNaming.js`, links from View Users / Section Rosters / Grade Override, migration #3.
- [x] Phase 3 built: migration #4; `sgApprovalService.js`; Dean SG Approvals (list and review); faculty Submit / With the Dean / Approved / Returned → Resubmit; the student Grade Report shows "Pending · Awaiting Dean"; Registrar screens show approval status.
- [x] Lint, build and all verify scripts clean after each phase. Migration #4 tested in PGlite: 19 scenario checks pass.

Database
- [x] Migrations #1–#4 run by the owner (2026-11-18), all successful.
- [x] Migration #4 re-run with the 2026-11-18 fix: successful.
- [ ] Migration #5 (`20261118183828_a_class_does_not_conflict_with_itself.sql`) run.

Testing (use [the QA checklist](../../04-testing/REGISTRAR_REVISIONS_QA_CHECKLIST_2026-11-18.md))
- [ ] Phase 1 click-through tested
- [ ] Phase 2 click-through tested
- [ ] Phase 3 click-through tested (after migration #4)

Paper (`Downloads/ASPIRE Thesis - Chapters 1-2/`, the 2026-11-18 copies)
- [x] P1, P2 and P3 text applied to both the UPDATED and TRACKED copies. TRACKED is built on the 11-16 TRACKED copy, so it carries every earlier round's tracked changes plus this round's.
- [x] Chapter 1 also made Dean-only for faculty loading: Related Studies (Automated Faculty Loading and Scheduling), Related Literature (RBAC paragraph), Significance of the Study, and the Conceptual Framework Output Phase.
- [x] 11 figures re-rendered and swapped: 2.7; 2.8 part 1; 2.9 part 2; 2.10 parts 1–2; 2.11 parts 1, 3 and 4; 2.13 parts 1–2; 2.17b. Page breaks are pinned, so the part-by-part descriptions still match. Image swaps are not tracked changes, so list these figures for the panel.
- [x] Table count (55 → 57) updated. No figure or table was added or renumbered, so no in-text references changed.
- [x] Both copies validated. The new copies are dated 2026-11-18; the 11-16 copies are in `history/`.
- [ ] Appendix O (User Manual) and Appendix P (Screenshots) updated for the new screens: not started.

Repo docs (section 5)
- [ ] `docs/01-system/overview/ASPIRE_SYSTEM_SCOPE.md` updated: not started.
- [ ] `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md` updated with the new test cases: not started.

## 9. Faculty-loading edit lock: decided, nothing to build

**Raised 2026-11-18:** remove the locking access between the Dean's office and the Registrar.
**Decision (2026-11-18):** keep the lock, **Dean-only**, because General Education's Dean books into other colleges' sections and those bookings still need protection.

**Already done in Phase 1, no further code:**
- `acquire_provisioning_lock()` checks `can_load_faculty_for_department()`, which migration #2 made Dean-only. A Registrar can no longer take the lock, so the lock now separates Dean sessions only (two tabs, or two Deans of one college).
- The "Dean is loading" notice to the Registrar is switched off by the same migration.
- The remaining "Registrar" text on the loading page is the official **Registrar Class Schedule form** and its signatory. That is the Registrar's document, not the lock, so it stays.

**How General Education conflicts are protected (unchanged):**
- **The per-college lock** covers one college's own loading session.
- **Bookings across colleges** are serialized per **section** and per **faculty member** by `add_faculty_load_draft` (advisory locks, `20261104205834_first_come_first_served_actually_holds.sql`). If GE and the owning college book the same section slot at the same moment, the second is refused.
- **The owning college's Dean** is notified when GE books one of its sections, and that notice links to `/dean/facultyloading`.

**Paper impact (P1, applied):** Business Rules Table 2.3 now reads "Only the Dean of a college edits its faculty loading, one session at a time; bookings into another college's sections, such as General Education's, are checked and saved one at a time per section and per faculty member, and the owning college is notified."

## 10. Phase 5 (planned 2026-11-18): class-change notices and confirmations

**Requested by the owner during QA (before continuing past QA step 2).** This is a new capability the paper does not describe yet, so it adds paper edits (below).

### 10.1 Decisions (owner, 2026-11-18)
- When an **active** class changes, its students and faculty are notified.
- **Drafts** stay silent and need no confirmation: students cannot see them yet.
- **Changed later the same day:** an **active class can no longer be removed**, only **transferred** to another faculty member. Removing one deletes its enrollments, and sensitive records could be lost by mistake. Drafts can still be removed. This replaces the earlier "removing notifies" decision.

### 10.2 What gets notified

Only the three server functions that change an active class. A class's room cannot be changed on its own (there is no such function), so it is not covered separately.

| Function (live class only) | Recipients | Notice |
|---|---|---|
| `update_class_schedule` (days and/or times) | every enrolled student, plus the assigned faculty | "Schedule changed: IT213 · BSIT-1B now meets Wed 12:45 PM–8:00 PM (was Mon–Sat 12:45 PM–8:00 PM)." |
| `reassign_class_faculty` | every enrolled student, the new faculty, and the previous faculty | Students: "IT213 · BSIT-1B is now handled by Prof. X." New faculty: "You were assigned IT213 · BSIT-1B." Previous faculty: "IT213 · BSIT-1B was reassigned to Prof. X." |
| `delete_class_record` | every enrolled student, plus the assigned faculty | "IT213 · BSIT-1B was removed from this term's schedule." |

How it works:
- **Sent by the database, in the same transaction as the change**, so a change can never happen without its notice (same pattern as grade notices).
- **For a removal, the roster is read before the enrollments are deleted.**
- **Delivery:** in-app inbox and phone push. No email (email stays reserved for grades).
- **New notice type `class_changed`**, with a "Class schedule changes" switch in Notification Settings for students and faculty.
- **Links:** students go to My Subjects, faculty to My Classes.
- **No notice when nothing changed**, e.g. saving the same schedule.

### 10.3 Confirmations (Faculty Loading)

| Action | Today | After |
|---|---|---|
| Save a changed schedule on an **active** class | Saves immediately | Confirmation showing old → new and who will be notified ("32 students and Prof. Rivera will be notified"). |
| Reassign the faculty of an active class | Has a dialog (tick box) | Same dialog, plus "N students, the new and the previous faculty will be notified". |
| Remove an active class | Has a confirmation | Same, plus "N students and the faculty will be notified". |
| Add a draft, or edit a draft's time | No confirmation | Unchanged (drafts are private). |

The other new features already confirm: Dean Approve/Return SG, faculty Submit/Resubmit SG. Registrar Student Records and Class Grade Sheets are read-only.

### 10.4 Work
1. **Migration** (one file):
   - Patch the three functions to send the notices. Each is patched from its deployed body with an anchor assertion, like #4 and #5. It runs after #5, which also touches the conflict check.
   - A PGlite test of each case: schedule change, reassign, remove, a draft (silent), and no change (silent).
2. **App:**
   - The schedule-change confirmation in `FacultyLoadingWorkspace.jsx`.
   - The notified-count line in the reassign and remove dialogs.
   - The `class_changed` category in `notificationPreferences.js`.
   - Check that the student and faculty notification pages show the new type.
3. **QA:** add the Phase 5 steps to the QA checklist (Dean changes, then the student and faculty check their inbox).
4. **Paper** (both 2026-11-18 copies):
   - Ch1 Scope › Notifications Inbox: students also receive class-schedule changes.
   - Ch2 Proposed System › Enrollment and Faculty Loading workflow: active-class changes notify students and faculty.
   - Ch2 Data Flow step 10.
   - Fig 2.10 Faculty Loading (3.0) text: notifies students and faculty of changes. *Not changed (2026-11-18): no Level 1 DFD draws notification writes, so the figure and its text stay consistent without it.*

### 10.5 Checklist
- [x] Owner says "start Phase 5" (2026-11-18)
- [x] Migration #6 written and PGlite-tested (6 checks). Built as a trigger on `class_records` rather than patching each function, so every path that changes a live class (schedule edit, reassign, draft reassign that repoints its class) notifies. `delete_class_record` is no longer callable from the app.
- [x] App:
  - the schedule-change confirmation (From → To, "students and the faculty will be notified");
  - Remove shown on drafts only, and the Remove button now says "Remove" instead of "Finalize";
  - the transfer dialog wording;
  - the `class_changed` notice shown with a calendar icon;
  - notification pages fall back to the notice's own title (this also fixes the SG notices showing as "System Notification");
  - a "Class schedule changes" setting for students and faculty.
  Lint and build clean.
- [x] Owner ran the migrations (#5, #6) (2026-11-18)
- [x] QA steps added to the QA checklist (Step 2, plus inbox checks in Steps 3 and 4)
- [x] QA run (owner, 2026-11-18)
- [x] Paper updated (2026-11-18, round 2): Ch1 Scope (Dean Faculty Loading, Notifications Inbox), Ch2 module workflow, Notifications paragraph, data-flow step 10, Faculty Loading rule; Ch3 Table 3.2 row "Dean: live class change".

## 11. A returned SG reopens its scores (QA fix, 2026-11-18)

### 11.1 The gap
The Dean can return a submitted SG with a reason, but the instructor could only change remarks (INC, Dropped, FDA) before resubmitting. Every score stayed locked: the SG score lock does not lift when the SG is returned, finalized MR/TFR terms stay frozen, and both correction paths are blocked until the SG is approved. A Dean who returned an SG because a score was wrong got the same grade back.

### 11.2 Decision (owner, 2026-11-18)
- While the SG is **returned**, the instructor can edit that class's scores again, then resubmit. The resubmission goes back to the Dean. This repeats until the Dean approves.
- Once the Dean **approves**, the scores lock again. Any later change follows the existing flow: the student's grade change request, or the instructor's SG correction request.
- Submitted and approved SGs stay as locked as before. Class configuration (activity columns, maximum scores) stays locked in every state.

### 11.3 How it works
- Migration #7 opens the SG score lock and the finalized-term freeze while the SG is returned. Who may write is unchanged (the assigned instructor only).
- Editing a Prelim or Midterm score changes the MR the student already saw. The posted MR and TFR are **not** changed while the Dean reviews. When the Dean approves a **resubmitted** SG, MR and TFR are recalculated from the corrected scores, so the student sees MR, TFR and SG change together, once. Each student whose MR or TFR changed gets a "Progress Grade Updated" notice and email. A first-time approval never rewrites MR or TFR.
- App: the Scorebook unlocks its cells while the SG is returned, and the returned notices on the Scorebook and Review & Post Grades say the scores are open again.

### 11.4 Paper
Ch2 Proposed System › SG approval workflow: one sentence. When the Dean returns the SG, the instructor may correct its scores and remarks and resubmit; MR and TFR update together with the SG on approval. Same in Fig 2.10 text and data-flow step for the Dean's decision, if they describe the return.

### 11.5 Checklist
- [x] Owner approved the fix (2026-11-18)
- [x] Migration #7 written and PGlite-tested (11 checks)
- [x] App: `ScoreInput.jsx` (cells unlock while returned, notice text), `GradeComputationPreview.jsx` (notice text). Lint clean.
- [x] Owner ran migration #7 (2026-11-18)
- [x] QA steps added (Steps 7, 8 and 9 of the QA checklist)
- [x] QA run (owner, 2026-11-18)
- [x] Paper updated (2026-11-18, round 2): Ch1 Scope (Faculty Posted Grades, Dean SG Approvals), Ch2 SG rule, Ch3 Maintenance, Ch3 Table 3.2 "Dean: SG return".

## 12. An approved SG reaches every student (QA fix, 2026-11-18)

**Found in QA Step 9.** After the Dean approved a resubmitted SG, the faculty and the Registrar were notified, but the student got no in-app notice or email, and the guardian got no email. The Grade Report itself was correct.

**Cause.** Approval did not write the student's notice; it released the one held back at posting. Returning the SG deletes held notices, and a resubmission writes new ones only for students whose grade changed. So after a return, unchanged students had nothing to release.

**Fix (migration #8).** On approval, one "Official Grade Posted" notice is written per student from the class's SG rows, carrying the subject, term and grade, so the student and guardian emails go out as before. A backfill sends the missing notice for SGs already approved, including the QA class. The MR/TFR notice from #7 carries the same email fields.

**Paper:** no change. Chapter 2 already says students and guardians are notified when the Dean approves.

- [x] Migration #8 written and PGlite-tested (both orders with #7; the original SG approval test still passes)
- [x] Owner ran #8 (2026-11-18)
- [x] QA Step 9 re-checked (2026-11-18): 14 of 14 students notified and emailed, 5 guardian emails, all sent
