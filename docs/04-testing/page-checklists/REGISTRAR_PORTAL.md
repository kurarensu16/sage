# Registrar portal — page checklists

**Portal introduced by:** Phase 1 (Admin/Registrar Role Split), 2026-10-29
**Prerequisites for every case below:** all three Phase 1 migrations applied in
order (`20261029034500` → `20261029040940` → `20261029044752`), and a registrar
account that can sign in.

> **Before running anything:** restart the dev server. `npm run dev` on port
> **5175**. A stale server was already mistaken once for a missing Registrar
> option on account creation.

## Portal-wide gates (run first)

**ID:** `REG-GATE` · **Last touched by:** Phase 1

- [ ] Signing in as registrar lands on `/registrar/dashboard` — **not** NotFound,
      and with no redirect loop. (Every post-auth redirect interpolates
      `/${role}/dashboard`, so a missing route loops through NotFound.)
- [ ] The sidebar shows exactly: Dashboard, User Accounts, Academic Setup,
      Student Records, Records, Reports.
- [ ] No Admin-only item appears: no Manage Users, no Import Users, no Audit Logs,
      no Classroom Provisioning.
- [ ] Visiting an admin URL directly (`/admin/userlist`) redirects to `/403`.
- [ ] The notification bell opens `/registrar/notifications` and renders.
- [ ] The settings link opens `/registrar/settings` and renders.
- [ ] Mobile: the bottom nav shows Dashboard / Setup / Records / Reports and each
      tab highlights on its own pages.
- [ ] **Security:** a registrar attempting to change their own role to `admin`
      (via Settings or a direct table write) is refused —
      `prevent_self_role_escalation` must still bite.

---

## Dashboard

**ID:** `REG-DASH` · **Route:** `/registrar/dashboard` · **File:** `src/pages/registrar/Dashboard.jsx`
**Last touched by:** Phase 1 · **Expected to change in:** Phase 3 (per-class thresholds)

- [ ] Four stat tiles render: Active Term, Enrollments, Sections, Subjects.
- [ ] Active Term matches the row flagged `is_active` in `academic_terms`.
- [ ] Enrollments total matches a manual count for the active term.
- [ ] **Records Integrity** lists only non-zero items; with none outstanding it
      shows the green "No outstanding records issues" state.
- [ ] Each integrity row links to the page that fixes it, and the link resolves
      (`/registrar/enrollment`, `/registrar/sectionlist`, `/registrar/subjectlist`,
      `/registrar/sectionmasterlist`).
- [ ] Records Integrity does **not** list students without a block section. At DYCI
      an irregular student legitimately has none, so it is a normal category rather
      than work to clear. It appears on Enrollment Management as a count and filter only.
- [ ] **Enrollment by College** chart renders with a Regular/Irregular split, and
      the tooltip shows the full college name rather than the truncated axis label.
- [ ] "Largest sections" chips appear and the numbers are plausible.
- [ ] **Term Readiness** bars render; colour reflects completion (green ≥90%,
      amber ≥50%, red below).
- [ ] **Academic Structure** chart shows Sections and Programs per college.
- [ ] Refresh re-queries and the spinner stops.
- [ ] Empty-state check: with no active term, tiles show `—` and panels show their
      empty messages instead of throwing.
- [ ] **Scale check:** with more than 1000 enrollments, totals are still correct
      (the service paginates; a silent 1000-row cap would under-report).

---

## Reports

**ID:** `REG-REPORTS` · **Route:** `/registrar/reports` · **File:** `src/pages/registrar/Reports.jsx`
**Last touched by:** Phase 1

- [ ] Active term banner matches the active term.
- [ ] All four report cards render: Enrollment, Section Roster Masterlist,
      Academic Structure Inventory, Grade Override Log.
- [ ] Each export downloads an `.xlsx` that opens without a repair prompt.
- [ ] Enrollment export: columns are College, Section, Student No., Student,
      Subject Code, Subject, Units, Enrollment Type — and the Regular/Irregular
      value matches what a faculty roster shows for the same student.
- [ ] Academic Structure export flags template-less subjects as `NOT ASSIGNED`.
- [ ] Grade Override Log shows before/after figures and who applied each one.
- [ ] Row count appears beside each card after an export.
- [ ] A report with zero rows reports "nothing to export" and does **not**
      download an empty file.
- [ ] Each export writes an entry to Admin's Audit Logs.
- [ ] Term-scoped cards are disabled when no term is active; the override log,
      which is not term-scoped, stays enabled.
- [ ] **Deliberate absence:** there is no faculty-load export here — that belongs
      to Phase 4's Faculty Loading page.

---

## Notifications

**ID:** `REG-NOTIF` · **Route:** `/registrar/notifications` · **File:** `src/pages/registrar/Notifications.jsx`
**Last touched by:** Phase 1

- [ ] Page renders from the bell with no error.
- [ ] A roster import produces a notice **grouped under Records**, not System.
      (The dispatcher emits type `roster_import`; a mismatch here silently files
      it as a generic system message.)
- [ ] Filter tabs All / Unread / Records / System each filter correctly.
- [ ] Unread count on the Unread tab matches the bell badge.
- [ ] Clicking an unread notice marks it read and decrements the badge.
- [ ] Mark-all-read clears every unread.
- [ ] Select-all plus Delete removes the selected notices and they stay gone
      after a refresh.
- [ ] A notice whose `link` points outside `/registrar/` is **not** followed —
      it expands in place instead, since following it would 403.
- [ ] Empty state renders when nothing matches the filter.

---

## View Users

**ID:** `REG-VIEWUSERS` · **Route:** `/registrar/viewusers` · **File:** `src/pages/registrar/ViewUsers.jsx`
**Last touched by:** Phase 1

- [ ] Directory lists all accounts; the total matches Admin's Manage Users total.
- [ ] Role tabs (all/student/faculty/dean/registrar/admin) count correctly.
- [ ] Search matches on name, email, and ID number.
- [ ] **No write control exists anywhere on the page** — no add, edit,
      deactivate, or archive.
- [ ] Each row shows role, status, college, section, and year level.
- [ ] The notice pointing to Enrollment Management for student records is visible.
- [ ] **Database-level check:** a registrar attempting an `UPDATE` on `public.users`
      directly (for example from the browser console) is refused. The UI showing
      no button is not the control; `users_update_self_or_admin` is.
- [ ] **Scale check:** with more than 1000 accounts, the role counts are still
      correct.

---

## Degree Programs — list

**ID:** `REG-PROG` · **Route:** `/registrar/programlist` · **File:** `src/pages/registrar/ProgramList.jsx`
**Last touched by:** Phase 1

- [ ] Programs list with abbreviation, name, and college.
- [ ] Programs and Colleges tiles show correct counts.
- [ ] Search matches program name, abbreviation, and college.
- [ ] College filter narrows the list.
- [ ] Section count chip appears for programs whose abbreviation prefixes section
      names.
- [ ] Edit opens `/registrar/programform?id=…` pre-filled.
- [ ] Delete asks for confirmation and states the advisory section count.
- [ ] Delete succeeds and the row disappears.
- [ ] The footnote explaining that section linkage is name-based is present —
      nothing in the schema holds a foreign key to `programs`, and the page must
      not imply the database verified it.

## Degree Programs — form

**ID:** `REG-PROGFORM` · **Route:** `/registrar/programform` · **File:** `src/pages/registrar/ProgramForm.jsx`
**Last touched by:** Phase 1

- [ ] Create: name, abbreviation, and college are all required.
- [ ] Abbreviation uppercases as typed.
- [ ] Saving with a duplicate name reports "already exists" rather than a raw
      database error.
- [ ] Edit loads existing values and saves changes.
- [ ] Cancel and the breadcrumb both return to `/registrar/programlist` — and
      stay inside `/registrar/`.
- [ ] A new program appears immediately in Section Form's program picker.
- [ ] Create and edit both write an Audit Logs entry.

---

## Enrollment Management

**ID:** `REG-ENROLL` · **Route:** `/registrar/enrollment` · **File:** `src/pages/registrar/EnrollmentManagement.jsx`
**Last touched by:** Phase 1

- [ ] Students tile and **Irregular** tile show correct counts (Irregular = students with no block section).
- [ ] Three tiles render: Students, **Irregular** (no block section) and
      **Off-block** (has a block but takes a subject outside it). They count
      different things and must not be conflated.
- [ ] The Off-block tile counts students with a block who are enrolled in at
      least one class of a different section; it reads 0 until classes exist.
- [ ] Tapping the Off-block tile filters to exactly those students.
- [ ] Tapping the **Irregular** tile filters to exactly those students; the label
      switches to "Filtering — tap to clear".
- [ ] The explainer frames irregular as a normal category, not a backlog to clear.
- [ ] Search matches name and student number.
- [ ] College filter narrows the list.
- [ ] Save appears only on a row that was actually changed.
- [ ] Assigning a section auto-fills the matching college.
- [ ] Section dropdown narrows to the chosen college's sections.
- [ ] Save persists and survives a refresh.
- [ ] **The point of the page:** after assigning a home section to a previously
      unassigned student, that student stops reading **Irregular** in a class of
      their own section — on the faculty roster, in the Enrollment export, and in
      the dashboard's Regular/Irregular split.
- [ ] Mismatch guard: choosing a section whose college differs from the selected
      college is rejected with a clear message (enforced in the RPC, not just the
      UI).
- [ ] Year level only accepts the four handbook values.
- [ ] Each save writes an Audit Logs entry.
- [ ] **Scale check:** more than 1000 students load (paginated) — the unassigned
      count must not stop at 1000.
- [ ] **Security:** the page cannot change a role, a status, or any staff record.
      Confirm by calling `registrar_set_student_records` against a faculty
      `user_id` and seeing it refused.
- [ ] **Negative:** a faculty or student session calling that RPC gets `42501`.

---

## Import Students — RETIRED

**ID:** `REG-IMPORT` · **Retired by:** the 2026-10-29 handover redesign

This page was removed. Admin's Import Users already required and validated a
student's section, so it had nothing to fix and validated less than Import Users
did. Replaced by `REG-INTAKE` and `ADM-INTAKE` below. Kept here deliberately so a
reviewer knows the page is gone on purpose rather than missing by accident.

---

## Relocated pages (moved from Admin in Phase 1)

These nine pages moved with `git mv`, so their internals are unchanged and their
pre-existing behaviour is already proven. What needs verifying is that the move
did not break navigation or authorization.

**Shared checks — run for each page below:**

- [ ] Reachable from the Registrar sidebar.
- [ ] Every in-page navigation stays inside `/registrar/` (Cancel, breadcrumbs,
      Add buttons, row actions). Thirteen such links pointed at `/admin/...`
      after the move and would have 403'd.
- [ ] Registrar can **write**, not merely view — create, edit, and delete all
      succeed. A page that renders but cannot save is the exact failure the role
      split risks.
- [ ] Admin visiting the page's old `/admin/...` URL does not reach it.

| Page | ID | Route | Page-specific must-pass |
|---|---|---|---|
| Subjects list | `REG-SUBJ` | `/registrar/subjectlist` | Create/edit/delete a subject |
| Subject form | `REG-SUBJFORM` | `/registrar/subjectform` | Cancel returns to the registrar list. **Phase 3 added the FDA limit field — see `REG-FDA` below** |
| Grading Templates | `REG-COG` | `/registrar/gradecomputationslist` | Save a template — exercises `save_grade_template`, whose gate moved to registrar. **Phase 3 added the passing threshold — see `REG-THRESHOLD` below** |
| Manage Sections | `REG-SECT` | `/registrar/sectionlist` | Create a section; the program picker is populated |
| Section form | `REG-SECTFORM` | `/registrar/sectionform` | Section name builds from program abbreviation + year + suffix |
| Section Rosters | `REG-ROSTER` | `/registrar/sectionmasterlist` | Rosters populate — needs the `enrollments` read added for registrar |
| Colleges & Departments | `REG-DEPT` | `/registrar/departmentslist` | Create/rename a college; dean assignment still reflects correctly |
| Academic Terms | `REG-TERM` | `/registrar/termmanagement` | **Critical:** create/activate a term, and run a semester transition. This page writes `academic_terms` directly *and* calls two RPCs, all three of which had to be re-pointed. A silent failure here is the most likely Phase 1 defect |
| Grade Override | `REG-OVERRIDE` | `/registrar/gradeoverride` | Apply an override end to end and confirm `grade_correction_history` records it. **Also confirm Admin can no longer do this through the legacy `apply_admin_grade_override` v1/v2 RPCs, not just the v3 the UI calls** |

---

## Dynamic grading policy (Phase 3)

Added by Phase 3 on top of two relocated pages. These are the highest-risk cases
in the whole suite, because a defect here changes posted grades rather than a
screen. **Requires migration `20261029054241`.**

### Passing threshold — Grading Templates

**ID:** `REG-THRESHOLD` · **Route:** `/registrar/gradecomputationslist` · **Last touched by:** Phase 3

- [ ] The Passing Threshold field appears, blank by default, placeholder
      "Institutional default (75%)".
- [ ] It is editable on an **existing** template, unlike the structural fields —
      it is a scale parameter, not a structural change.
- [ ] Saving blank stores `NULL`; saving 80 stores 80; reopening shows what was
      saved.
- [ ] Out-of-range values are rejected (below 50, above 94) by the database
      constraint, not only the input's `min`/`max`.
- [ ] **Zero-change guarantee:** a template left blank produces exactly today's
      grades. Verify against a known class: every student's GWA and remark must
      be unchanged after the migration.
- [ ] **Freeze guarantee — the one that matters most:** set a template to 80,
      then open a class **created before** that edit. Its grades must be
      unchanged, because its snapshot froze the old policy. Then provision a
      **new** class from the same template and confirm it uses 80.
- [ ] The rescaled bands match the implemented formula, not the plan's original
      worked example: at an 80% threshold a 1.00 requires **98.40**, not 100.
- [ ] A score exactly at the threshold is 3.00 (passing); just below is 5.00.
- [ ] Spot-check the defense case: a raw 78 is `2.75` in a 75% class and `5.00`
      in an 80% class.

### FDA absence limit — Subjects

**ID:** `REG-FDA` · **Route:** `/registrar/subjectform` · **Last touched by:** Phase 3

- [ ] The FDA Absence Limit field appears, blank by default, placeholder
      "Institutional default (4)".
- [ ] Saving blank stores `NULL`; saving 3 stores 3; reopening shows it.
- [ ] Out-of-range values are rejected (below 2, above 10) by the constraint.
- [ ] **Zero-change guarantee:** a subject left blank keeps today's 2/3/4
      warning, near-FDA, and FDA tiers.
- [ ] Set a subject to 3 and provision a new class. Risk scoring must trigger the
      FDA recommendation at 3 absences, early warning at 1, approaching at 2.
- [ ] Risk detail text states the **actual** absence count rather than a
      hardcoded "3 absences" — a non-default limit must not produce a message
      that contradicts its own tier.
- [ ] A class created **before** the edit keeps the 4-absence behaviour.

### Cross-cutting

**ID:** `REG-POLICY-PROP` · **Last touched by:** Phase 3

- [ ] `npm run verify:grading` passes, reporting the dynamic-threshold
      comparisons against the SQL twin. This is the regression gate: it fails if
      the JS ladder and `aspire_transmute_grade(NUMERIC, NUMERIC)` ever diverge.
- [ ] Legacy one-argument `aspire_transmute_grade(rating)` still works in SQL —
      if it had been given a defaulted second parameter, every existing call site
      would raise "function is not unique".
- [ ] Faculty Score Input and the grade preview show GWA consistent with the
      class's frozen threshold.
- [ ] Dean and faculty reports label Average versus Struggling using the class's
      own passing threshold.
- [ ] President's List and honors are **unchanged** — they read transmuted GWA,
      which keeps the same nine bands regardless of threshold.
- [ ] No already-posted grade changed anywhere as a result of this migration.

---

## New Student Accounts (Registrar side of the handover)

**ID:** `REG-INTAKE` · **Route:** `/registrar/newstudentaccounts` · **File:** `src/pages/registrar/StudentAccountRequests.jsx`
**Last touched by:** 2026-10-29 · **Requires:** migration `20261029085444`

- [ ] Template downloads with headers LastName, FirstName, MiddleName, IDNumber,
      College, Program, Section, YearLevel — and **no Email and no Role column**,
      since neither is the Registrar's to decide.
- [ ] The template's sample row names a college, program and section that
      **actually exist**. It is generated from live data, so a retired college
      can never appear in it.
- [ ] Uploading classifies every row **Ready / Existing / Error**.
- [ ] A student who already has an account is **Existing**, not Error.
- [ ] An ID already sitting in the queue is **Existing**.
- [ ] A repeated ID within the same file is an **Error**.
- [ ] A missing IDNumber is an Error — it is required and unique
      institution-wide across students and personnel.
- [ ] An unknown college, program or section is an Error naming the value.
- [ ] A section belonging to a different college than the one given is an Error.
- [ ] Rows are grouped **by college**, each with its own counts.
- [ ] "Review and send" opens a confirmation showing the **per-college split**,
      how many Existing rows are skipped, and how many Errors will not be sent.
- [ ] Sending submits only Ready rows and writes one audit entry.
- [ ] Admin receives a notification that records are waiting.
- [ ] Pending / Created / Rejected tabs track what happened to each batch.
- [ ] A returned record shows Admin's reason.
- [ ] **Security:** a non-registrar calling `submit_student_account_requests`
      is refused.

---

## Student Account Requests (Admin side of the handover)

**ID:** `ADM-INTAKE` · **Route:** `/admin/studentaccountrequests` · **File:** `src/pages/admin/StudentAccountRequests.jsx`
**Last touched by:** 2026-10-29 · **Nav:** Admin → User Accounts

- [ ] Appears under **User Accounts**, between Manage Users and Import Users —
      the order the work actually happens in.
- [ ] Pending / Created / Returned tabs count correctly.
- [ ] The four-step instruction is visible and links to Import Users.
- [ ] **Export** produces a file whose columns match Import Users exactly:
      LastName, FirstName, MiddleName, Email, Role, College, Program, Section,
      YearLevel, IDNumber, RequestID.
- [ ] `Email` is **blank**, `Role` is pre-filled `student`, and the academic
      columns carry the Registrar's values unchanged.
- [ ] **The round trip — the case that matters most:** fill in Email, upload
      through Import Users, and confirm the accounts are created **and** those
      queue rows flip to **Created** by themselves, linked to the new accounts.
- [ ] Re-uploading the same file neither fails nor double-links; the link step
      is idempotent.
- [ ] A file **without** a RequestID column still imports normally. Ordinary
      imports must not depend on the queue existing.
- [ ] **Return** requires a reason, and that reason reaches the Registrar.
- [ ] A returned row cannot be returned a second time.
- [ ] **This page cannot create accounts.** Confirm no create control exists
      anywhere on it. Import Users is the single creation path, which is what
      keeps section, college, year level and ID uniqueness validated in one
      place rather than two that can drift.
- [ ] **Security:** a non-admin calling `reject_student_account_request` or
      `mark_student_account_request_created` is refused.

---

## Faculty Loading & Provisioning (Registrar scope)

**ID:** `REG-LOADING` · **Route:** `/registrar/facultyloading` · **File:** `src/pages/registrar/FacultyLoadingAndProvisioning.jsx`
**Last touched by:** Phase 4

The shared workspace behaviour — lock, scheduling, conflict detection, drafts,
roster — is checklisted once in
[`FACULTY_LOADING.md`](FACULTY_LOADING.md) (`LOAD-LOCK`, `LOAD-SCHED`,
`LOAD-CONFLICT`, `LOAD-DRAFT`, `LOAD-ROSTER`). **Run that file as registrar**,
then the registrar-only cases below.

- [ ] The college picker lists **every** college from `departments`, not just one,
      and lists no retired college (there is no College of Computer Studies).
- [ ] Switching colleges releases the lock on the first and acquires it on the
      second, rather than holding both.
- [ ] The active term is read from `academic_terms` and shown; with no active term
      the page explains that plainly instead of rendering an empty workspace.
- [ ] Conflict details are shown **in full** here: college, program, days, time,
      subject code and section name. (Registrar handles the institution, so the
      specifics are theirs to see — contrast `DEAN-LOADING`.)
- [ ] A load created here for a college the registrar does not belong to still
      saves. Registrar scope is institution-wide, not department-scoped.
- [ ] Breadcrumb reads as the Registrar portal.

---

## Late Grade Changes

**ID:** `REG-LATE` · **Route:** `/registrar/lategradechanges` · **File:** `src/pages/registrar/LateGradeChanges.jsx`
**Last touched by:** Phase 6

The Registrar's authorisation of a grade change to a term that has already
closed. It is the fourth step of the Phase 6 dispute chain and only appears for
requests that outlive the 30-school-day dispute window.

Its cases live with the rest of that chain in
[`GRADE_CHANGE_REQUESTS.md`](GRADE_CHANGE_REQUESTS.md) under `REG-LATE`, because
nothing reaches this page without a student, an instructor and a Dean having
acted first — testing it in isolation would mean testing it against data that
cannot occur.
