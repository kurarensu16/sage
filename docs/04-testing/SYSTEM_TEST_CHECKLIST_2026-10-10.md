# ASPIRE System Test Checklist (Combined, 2026-10-10)

**Purpose:** One runbook for all untested updates on the `ghost` branch.
- **Part A, Grading Workflow Remediation.** Cases carried over from `GRADING_WORKFLOW_REMEDIATION_CHECKLIST.md` §12 (commits up to `b977c7d`).
- **Part B, 2026-10-10 updates.** Plan acknowledgment, task verification, follow-up snapshot (now requiring reviewed tasks), re-evaluation guidance, Intervention Results, baseline freeze, notification preferences, password rules, profile photo and contact number, AI Study Tutor and menu labels, mobile menu and install card, removal of the unlock path, **class-code joins requiring faculty approval (B10a)**, and **block-section enrollment with professor roster notices (B10b)**. See `THESIS_AUDIT_2026-10-10.md` and `docs/03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md`.
- **Part B, 2026-10-11 admin setup fixes (B10c–B10e, AS-01 to AS-51).** User form and classroom creation (Batch 1); import validation, delete guards, safe term rollover with the SG grace period and term history (Batch 2); Grade Override, COG saves, Activity Logs, college deans (Batch 3); no duplicate subjects. See `docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md`.
- **Test data:** the 2026-2027 test year (§0.4 below and `docs/05-operations/database/TEST_YEAR_SEED_2026-2027.md`).

**Status:** NOT RUN. Nothing below has been executed yet.

**Deferred and out of scope for this run:** Row Level Security, the AI model setting (Gemini 2.5 Flash), and the hosted Supabase password policy. The user will apply these later. Cases that depend on RLS are listed in §D and are not release-blocking for this run.

---

## 0. Before Testing

### 0.1 Database preconditions

- [ ] Confirm every migration up to `20261008180000_grading_authorization_hardening.sql` is applied to the target Supabase project. Check in the Supabase dashboard, SQL editor, or migration history.
- [x] Apply `20261010120000_intervention_followup_and_task_verification.sql`. Applied 2026-10-10.
- [x] Apply `20261010130000_profile_contact_and_photo.sql`. Applied 2026-10-10; it creates the private `avatars` storage bucket and its owner-only policies.
- [x] Apply `20261010140000_followup_requires_task_review.sql`. Applied 2026-10-10; it redefines `record_intervention_followup` so a follow-up cannot be recorded while a reported task is unreviewed.
- [x] Apply `20261010150000_class_join_approval.sql`. Applied 2026-10-10. It adds `request_class_join`, `resolve_class_join_request`, and `dismiss_class_join_request`, plus tracking columns on `class_join_requests`. Joining by class code then requires faculty approval.
- [x] Apply `20261010160000_section_enrollment_sync_and_notice.sql` **after** `20261010150000`. Applied 2026-10-10. Section assignment enrolls block students immediately; professors get a roster notice with the number of students added.
- [x] Apply `20261011120000_restrict_destructive_deletes.sql`. Applied 2026-10-11 (Batch 2A: deleting a section, subject, or term in use is refused).
- [x] Apply `20261011130000_term_rollover_grace.sql`. Applied 2026-10-11 (Batch 2B: safe rollover, SG grace period and labels, `term_id`, `get_term_sg_status`).
- [x] Apply `20261011140000_admin_batch3_atomic_saves.sql`. Applied 2026-10-11; `save_grade_template` and `assign_department_dean` confirmed.
- [x] Apply `20261011150000_unique_subjects.sql`. Applied 2026-10-11 (no duplicate subject codes, or names within a college).
- [x] Confirm the new functions exist (verified 2026-10-10): `acknowledge_student_evaluation`, `verify_intervention_task`, `record_intervention_followup`, `update_own_contact_number`, and `set_own_avatar_path`.
- [x] Confirm the new columns exist (verified 2026-10-10):
  - `student_risk_evaluations.acknowledged_at`, `followup_recorded_at`, `followup_recorded_by`
  - `users.contact_number`, `users.avatar_path`
- [x] Confirm the `avatars` bucket exists, is **private**, has a 2 MB limit, and allows JPG/PNG/WebP only. Verified 2026-10-10: `public=false`, `limit=2097152`, `image/jpeg,png,webp`.
- [x] Evaluation data reset for a clean QA run (2026-10-10). Removed 4 legacy evaluations (all created before the 2026-10-10 update; none acknowledged), with their 4 private notes and 2 Dean referrals, plus 13 AI intervention drafts; working drafts were already empty. Post-reset counts were 0 for `student_risk_evaluations`, `student_risk_private_notes`, `student_evaluation_referrals`, `student_evaluation_referral_requests`, `faculty_intervention_working_drafts`, and `faculty_intervention_drafts`. Grades, scores, attendance, posted milestones, users, classes, and old notifications were not touched.

### 0.2 Team execution rules (from the remediation checklist)

> **Mandatory manual QA rule:**
> - A human tester must perform every end-to-end case manually on the deployed frontend.
> - Inspect labels, loading and saving states, validation messages, modals, navigation, refresh behavior, and role-specific screens.
> - AI must not execute, simulate, infer, or mark any frontend case as passed.
> - Scripts, database queries, and AI analysis are supplementary evidence only.

> **Branch control:**
> - Test against the deployed `ghost` branch preview, not `main` or production.
> - Record the preview URL and commit SHA.
> - Do not merge `ghost` into `main` until every release-blocking case passes, failed cases are fixed and retested, and the QA lead and product owner approve.

**Setup:**
- [ ] Use the test year in §0.4 (reset 2026-10-11, seeded 2026-2027). Never use real student grades.
- [ ] Record the build or commit, Supabase project, browser, tester, and date at the top of the test report.
- [ ] Prepare one regular-semester class and one summer class. The test year covers three COG templates (General Education Core, Maritime Lecture, Maritime Laboratory); the two Health Sciences templates are not in this run.
- [ ] Prepare accounts:
  - at least two students
  - two faculty accounts assigned to different classes
  - two Dean accounts from different departments
  - one Admin account
- [ ] Prepare data for B10a/B10b (class-code joins and section enrollment):
  - a block section with **at least two active classes taught by different faculty** (EN-01, EN-02)
  - an **irregular** student account whose home section differs from the class section (EJ-07)
  - a student with **no** enrollment in the test subject, for code joins (EJ-02 to EJ-09)
  - a CSV with **5 new student accounts** in the block section (EN-03)
  - a second faculty account **not** assigned to the class (EJ-10)
  - one class with a **posted MR** (from Part A posting) for the late-join hint (EJ-12)
  - the class code of each test class (*My Class Records*)
- [ ] Use separate browser profiles or private windows per role. Never switch roles in one session.
- [ ] Capture baseline screenshots or exports before changing grades. For database-sensitive cases, record row values before and after.
- [ ] Never use the Supabase service-role key for role tests.
- [ ] Do each workflow through the UI first. Direct API or database checks confirm enforcement only.
- [ ] Stop a scenario on an unexpected result. Capture the console, network response, timestamp, IDs, and steps.
- [ ] Android in this run: test the **PWA** in Chrome (⋮ menu → *Install app*, or the browser). **Do not use "Download ASPIRE APK"**: the hosted APK is an older build and will be rebuilt after QA. APK-specific checks (e.g., PR-08 on the APK) are deferred to the APK build.

**Result labels:**
- `PASS`: UI and stored data match every expected result.
- `FAIL`: wrong result, exposed data, unexpected change, or screens that disagree.
- `BLOCKED`: the case cannot run; state the exact blocker.
- `NOT RUN`: no attempt yet. Not a release result.

**Evidence for every case:**
- Before-and-after screenshots.
- The relevant network response.
- Read-only database confirmation where data changes.
- A defect ID and severity for every FAIL.
- Tester name, time, and result.

| Test ID | Environment/build | Account/role | Test data IDs | Expected | Actual | Result | Evidence/defect |
|---|---|---|---|---|---|---|---|
| Example: ACK-01 | ghost preview / SHA | Student | Class, evaluation ID | Banner + Acknowledge button | | PASS/FAIL/BLOCKED | Screenshot |

### 0.3 Supplementary automated checks (not a substitute for manual QA)

- [ ] `npm run verify:grading` passes.
- [ ] `node scripts/verifyEvaluationTracking.js` passes.
- [ ] `npm run verify:insights` and `npm run verify:csv` pass.
- [ ] `npm run build` succeeds on the tested commit.

### 0.4 Test data: the 2026-2027 test year

**Database reset, 2026-10-11 (owner-run):**
- **Removed:** all 320 old students and their logins, terms, sections, classes and everything under them, enrollments, notifications, and AI insights. Subjects were trimmed to the 10 used by the seed.
- **Kept:** the admin, deans, and faculty; colleges; programs; COG templates; activity logs.

Seed and step-by-step stages: `docs/05-operations/database/TEST_YEAR_SEED_2026-2027.md`.

| | BSIT (Technology and Engineering College) | BSMarE (College of Maritime Education) |
|---|---|---|
| Sections (each term) | BSIT-1A, BSIT-1B (10 students each) | BSMARE-1A, BSMARE-1B (10 students each) |
| COG | General Education Core | Maritime Lecture, Maritime Laboratory |
| Faculty | `a.rivera@sage.edu.ph`, `m.cruz@sage.edu.ph` | `r.aquino@sage.edu.ph`, `m.garcia@sage.edu.ph` |
| Dean | `tech.dean@dyci.edu.ph` | `maritime.dean@dyci.edu.ph` |
| Students | 20 `@dyci.edu.ph` accounts (see the seed CSV) | 20 `@dyci.edu.ph` accounts |

**Logins:** new students start with `SagePassword123!` and must set a new password at first login (use one shared new password for testing). Existing faculty and dean passwords are unchanged by the reset.

**Which cases to run at each stage of the test year:**

| Stage | Cases |
|---|---|
| Setup and 1st semester (classes, users, grading) | AS-02 – AS-26, AS-41 – AS-51; Part A grading cases on the 8 classes |
| 1st → 2nd rollover (30-day grace; ITP113 BSIT-1B left unposted) | AS-27 – AS-34, AS-36 – AS-40 |
| 2nd → Summer rollover (0-day grace; BSIT has no Summer section) | AS-31 (BSIT students keep their section), AS-35 |

---

## Part A — Grading Workflow Remediation (carried over)

### A1. Dynamic COG

**Notes:**
- Use a separate QA class per official template, with simple scores you can also calculate by hand.
- Record the `computation_id`, weights, term rating, milestone rating, and transmuted GWA.
- Compare Grade Entry, Preview & Post Grades, the posted record, Student Grades, reports, exports, and current risk. Any mismatch is a FAIL.

**Snapshot test:**
1. Post the first milestone.
2. Make a reversible change to a QA template.
3. Confirm the snapshotted class does not change.
4. Confirm an unsnapshotted class uses the current template.
5. Restore the QA template.

- [ ] COG-01 General Education Core.
- [ ] COG-02 Health Sciences (Theory).
- [ ] COG-03 Health Sciences (RLE / Clinical Practicum).
- [ ] COG-04 Maritime Studies (Lecture).
- [ ] COG-05 Maritime Studies (Laboratory / Simulator).
- [ ] COG-06 Grade entry, preview, posting, student display, report, export, and risk all use the same formula.
- [ ] COG-07 Editing a global template leaves an already-snapshotted class unchanged.
- [ ] COG-08 An eligible unsnapshotted class uses the current assigned template.

### A2. NULL and zero posting

**Notes:**
- SQL `NULL` means pending; numeric `0` is a recorded score.
- Wait for the Faculty "Saved" indicator before checking the Student portal.
- Run each milestone from both Log Class Scores and Preview & Post Grades.

- [ ] NZ-01 Enter a positive score and save.
- [ ] NZ-02 Enter numeric zero and save.
- [ ] NZ-03 Leave a score NULL and save.
- [ ] NZ-04 Cancel the blank-score review; NULL stays NULL after refreshing both portals.
- [ ] NZ-05 Confirm the conversion; numeric zero is stored, and the milestone is posted in the same operation.
- [ ] NZ-06 Force a posting failure on a QA class; neither the conversion nor the posting is partially kept.
- [ ] NZ-07 Retry safely; one milestone row, no duplicate notifications.
- [ ] NZ-08 Repeat for MR, TFR, and SG.
- [ ] NZ-09 Repeat for regular and summer classes.
- [ ] NZ-10 After posting, clearing a covered score is restored or rejected in the UI and rejected by the database. Try keyboard delete, blur, bulk save, and a direct authenticated request.

### A3. SG correction

**Notes:**
- Use one request for rejection and a separate request for approval and application.
- Record the official SG, effective GWA, remark, lock state, and student-facing value before submitting.
- While a request is pending or approved, every screen must still show the original SG.

- [ ] SG-01 Post an SG; it is locked.
- [ ] SG-02 Submit a correction request with the exact proposed values plus a reason or evidence.
- [ ] SG-03 While pending, the student still sees the original SG.
- [ ] SG-04 Reject one request; no academic value changes, and the SG stays locked.
- [ ] SG-05 Approve one request; approval alone does not change the SG.
- [ ] SG-06 Only the affected student's row in the named class becomes editable. Attempts against another student, another class, or a second use are rejected.
- [ ] SG-07 Apply corrected scores or remarks through the official grading engine.
- [ ] SG-08 Review the before-and-after values.
- [ ] SG-09 **(2026-10-10)** Reposting an SG that **differs** from the approved proposal is rejected ("The corrected percentage differs from the approved proposal").
- [ ] SG-10 Repost the matching SG; the row is locked again.
- [ ] SG-11 The request changes from `approved` to `applied`, and a `grade_correction_history` row is written and cannot be edited.
- [ ] SG-12 Student, Faculty, Dean, Admin, reports, and exports show the corrected value.
- [ ] SG-13 Current GWA and risk recalculate.
- [ ] SG-14 Historical risk-evaluation snapshots stay unchanged.

### A4. Student privacy

**Notes:**
- Refresh only after the Faculty "Saved" indicator appears.
- A recorded zero must never show or count as missing.
- Create one draft evaluation and one published evaluation for the same student. Put a unique marker in the draft's private note and search every student screen and network payload for it.

- [ ] PRV-01 An activity without a score shows `Pending` to the student.
- [ ] PRV-02 A saved positive score shows as `Tentative`.
- [ ] PRV-03 A saved zero shows as `Tentative · Recorded Zero`.
- [ ] PRV-04 Positive and zero scores update live performance and current risk.
- [ ] PRV-05 NULL is excluded from grade and recorded-zero calculations.
- [ ] PRV-06 A modified tentative score shows the saved revision.
- [ ] PRV-07 After posting, the UI distinguishes the official milestone from tentative evidence.
- [ ] PRV-08 Faculty can see both the draft and the published evaluation.
- [ ] PRV-09 The student sees only the published evaluation, and the draft never appears.
- [ ] PRV-10 Private faculty notes never appear to students, including in network payloads.

### A5. Intervention drafts

**Notes:**
- Generate a plan with at least one Pending activity and one recorded zero.
- Pending must be treated as missing evidence and zero as low-scoring evidence.
- A class without a snapshot must use the subject's assigned COG, never a 50/10/40 fallback.
- A subject with no valid COG must fail with a clear error.

- [ ] DR-01 Generate an initial three-task AI plan.
- [ ] DR-02 Edit one AI task.
- [ ] DR-03 Add a manual task.
- [ ] DR-04 Add an additional AI task.
- [ ] DR-05 Remove or reorder a task, if supported.
- [ ] DR-06 Refresh; all changes remain.
- [ ] DR-07 Close and reopen the modal; everything is restored (text, source, order, deadline, referral, guidance, private notes).
- [ ] DR-08 Submit; the final task order and content are preserved, and the plan links to the working draft.

### A6. Audit and AI insight freshness

- [ ] AU-01 Export audit data containing commas, double quotes, and line breaks.
- [ ] AU-02 Every CSV row has the expected number of columns, checked in a text editor and in a spreadsheet.
- [ ] AU-03 The event source (application vs. database trigger) appears on screen, and source filtering works.
- [ ] AU-04 Change grade or attendance evidence after an AI Study Tutor insight exists.
- [ ] AU-05 The previous explanation is marked stale or regenerates.
- [ ] AU-06 The displayed explanation matches current evidence.

### A7. Database integrity (does not depend on RLS)

- [ ] DB-01 Activity scores above `max_score` or below zero are rejected by the database.
- [ ] DB-02 Clearing a posted-term score to NULL, or deleting its row, is rejected.
- [ ] DB-03 A formula snapshot cannot change after first posting, through a table update or client manipulation.

---

## Part B — 2026-10-10 Updates

### B1. Plan acknowledgment

- [ ] ACK-01 Faculty publishes an evaluation. The student's Advisories & Study Plans card shows a "Please acknowledge this plan" banner with an **Acknowledge plan** button.
- [ ] ACK-02 Before acknowledging, the task checkboxes are disabled, and the hint reads "Acknowledge the plan to start reporting progress".
- [ ] ACK-03 Click **Acknowledge plan**. The card shows "You acknowledged this plan on [date]", and the checkboxes become usable.
- [ ] ACK-04 Faculty → Evaluated Students shows "Acknowledged by student · [date and time]". Before acknowledgment it shows "Not yet acknowledged by student".
- [ ] ACK-05 Dean → Intervention Results shows the acknowledgment under the student name. The Generate Reports intervention export has a "Student Acknowledged" column.
- [ ] ACK-06 Faculty reopens the evaluation and changes a task, a due date, or the student-visible guidance, then republishes. The acknowledgment is cleared, and the student must acknowledge again.
- [ ] ACK-07 Faculty changes **only** the private faculty note and republishes. The acknowledgment is kept.
- [ ] ACK-08 Clicking Acknowledge twice (double click or retry) keeps the first acknowledgment time.
- [ ] ACK-09 Direct check: calling `set_legacy_advising_task_completion` before acknowledgment fails with "Acknowledge this intervention plan before reporting task progress."
- [ ] ACK-10 Drafts or unpublished plans never appear to the student at all; no locked card is shown.

### B2. Task verification and return

- [ ] TV-01 The student checks a task. It shows "Reported done on [date]" and "Awaiting instructor verification". The card heading reads "(1/N reported · 0 verified)", and the top-right badge reads "0/N verified" (it counts verified tasks only, matching the faculty view).
- [ ] TV-02 Faculty → Evaluated Students shows "Tasks: 0 verified · 1 awaiting review · N total", and the button reads "Tasks and referrals (1 to review)".
- [ ] TV-03 Faculty clicks **Verify**. The task shows "Verified by instructor" and the verified time, and the notice confirms it counts toward the verified completion rate.
- [ ] TV-04 The student's verified task is locked; the checkbox cannot be unchecked.
- [ ] TV-05 Faculty clicks **Return to student**. Return is disabled until a note is entered, and the note is limited to 500 characters.
- [ ] TV-06 The returned task is unchecked for the student and shows "Returned by your instructor: [note]".
- [ ] TV-07 The student checks the returned task again; it goes back to "Awaiting instructor verification".
- [ ] TV-08 A task the student has not reported cannot be verified or returned; no buttons are shown.
- [ ] TV-10 After the faculty verifies the task, the student badge and progress bar update to "1/N verified", and they match the faculty's "Verified tasks" count.
- [ ] TV-09 Faculty edits the plan (for example, adds a task) after some tasks are verified. Verified, returned, and reported states of existing tasks survive the edit.
- [ ] TV-10 In "Authored history (read-only)" or for an inactive class, no Verify or Return buttons appear.
- [ ] TV-11 Direct check: a different faculty account calling `verify_intervention_task` is rejected ("Only the currently assigned faculty of an active class can verify intervention tasks.").

### B3. Follow-up snapshot

- [ ] FU-01 Right after publishing, the button reads "Available after the next MR, TFR, or SG is posted" and is disabled.
- [ ] FU-02 Post the next milestone (e.g., MR) for that class. The case shows "Follow-up due · Midterm Rating posted", and **Record follow-up** becomes active.
- [ ] FU-03 The dialog shows Baseline (tier, points, GWA) next to Follow-up (now), plus "Verified tasks: x/y".
- [ ] FU-04 Confirm. The case shows "Recorded follow-up": tier → tier, Improved/Unchanged/Worsened, follow-up GWA, milestone and time, and verified tasks with %.
- [ ] FU-05 The follow-up cannot be recorded again; the button reads "Follow-up recorded".
- [ ] FU-06 After recording, the plan is closed:
  - The student sees "Plan closed after your instructor recorded the follow-up", and the checkboxes are disabled.
  - Faculty cannot verify or return tasks.
  - Republishing the evaluation is rejected.
- [ ] FU-07 Database check (read-only): `followup_snapshot` holds `milestone`, `milestone_posted_at`, `tasks_total`, `tasks_reported`, `tasks_verified`, `captured_at`, and `captured_by`.
- [ ] FU-08 Database check: an attempt to change a recorded `followup_snapshot` is rejected ("A recorded follow-up snapshot is immutable.").
- [ ] FU-09 A milestone posted **before** the evaluation was published does not enable the follow-up.
- [ ] FU-10 Repeat FU-01 to FU-04 for a summer class, using the Midterm or Final milestone.
- [ ] FU-15 Unreviewed tasks block the follow-up: with a milestone posted and a task the student reported but the faculty has not verified or returned, the button reads **Review reported tasks first** and is disabled. After verifying or returning that task, it becomes **Record follow-up**. Tasks the student never reported do not block it.
- [ ] FU-16 Database check: calling `record_intervention_followup` while a reported task is unreviewed fails with "Review every task the student reported (verify or return it) before recording the follow-up…".
- [ ] FU-17 **N/A for this run:** the legacy record it needed (Caleb Tolentino · ITP113 · Midterm) was removed by the 2026-10-10 evaluation data reset (§0.1). FU-15 and FU-16 now prevent new records from reaching this state. *(Original case: the student sees the unreviewed task of a plan closed before this fix as "Not verified before the plan closed".)*
- [ ] FU-11 Re-evaluation, same term (closed): on **Evaluate Students**, select the term whose follow-up was recorded. That student's button reads **Closed** (disabled), the line below reads "Follow-up recorded · evaluate again in a later term", and hovering explains why.
- [ ] FU-12 Re-evaluation note: on **Evaluated Students**, the closed case reads "Closed for {term}. If the student still needs support, evaluate again in a later grading term." The link opens Evaluate Students. Both pages' help notes include a **Re-evaluation** entry.
- [ ] FU-13 Re-evaluation, later term: select the next grading term (e.g., Semi-Final) for the same class. The student shows **Evaluate** (or appears in Needs evaluation if Moderate or higher). Publish it; the new case has its own baseline (the current standing), and the earlier closed case remains unchanged in history.
- [ ] FU-14 Re-evaluation, same term, before follow-up: **Review / edit** reopens the existing evaluation. Change a task and republish: the baseline stays the same, and the student must acknowledge the plan again.

### B4. Intervention Results and report export

- [ ] IR-01 Dean → Intervention Results shows these columns: Baseline, Follow-up, GWA Change, Verified Tasks, Risk Transition, Faculty Lead.
- [ ] IR-02 Status values match the case state: In intervention, Escalated to Dean, Follow-up due, Improved, Unchanged, or Worsened.
- [ ] IR-03 GWA Change equals follow-up GWA minus baseline GWA, shown with a sign. Negative means improvement.
- [ ] IR-04 Verified Tasks shows "verified/total (%)", counting **verified tasks only**, not reported ones.
- [ ] IR-05 A missing GWA shows "—", never a default of 3.00.
- [ ] IR-06 Draft or unpublished evaluations are not listed.
- [ ] IR-07 Generate Reports → intervention outcomes shows the same values as the tracker.
- [ ] IR-08 The Excel export columns are Student, Section, Scope, Student Acknowledged, Baseline Risk, Baseline GWA, Follow-up Risk, Follow-up GWA, GWA Change, Verified Tasks, Task Completion, Risk Transition / Status, and Faculty. Values equal the on-screen table.

### B5. Baseline freeze

- [ ] BF-01 Publish an evaluation and record its baseline (risk level, score, GWA, published time).
- [ ] BF-02 Change the student's grades so their live risk changes.
- [ ] BF-03 Reopen the evaluation, edit tasks, and republish. The baseline snapshot, risk level, risk score, and publication time are **unchanged**, while the task edits are saved.

### B6. Notification preferences

- [ ] NP-01 Settings → Preferences shows only the categories each role receives:
  - **Student:** grades; plans and Dean notices; risk and AI insights; class enrollment; system.
  - **Faculty:** correction decisions; Dean notices; administrative grade adjustments; reminders; system.
  - **Dean:** escalated cases; correction requests; your risk actions; reminders; system.
  - **Admin:** security and accounts; roster imports; system.
- [ ] NP-02 The old sound-effects, evaluation-release, and email-digest switches are gone. The "in-app inbox is always kept" note is shown.
- [ ] NP-03 Changing a switch saves automatically, and the setting survives a page reload and a new login.
- [ ] NP-04 Turn the **Device** switch off for a category, then trigger that notification type. It still appears in the Notifications inbox, but no device or desktop alert pops up.
- [ ] NP-05 The **Email** switch appears only for student grade postings and corrections, and for Dean escalated cases. Other categories show "No email for this type".
- [ ] NP-06 With student grade-posting email off, posting a grade creates the in-app notice but no email delivery (check `notification_deliveries`).
- [ ] NP-07 With Dean escalated-case email off, a faculty referral creates no email delivery for that Dean.

### B7. Password rules and reset sign-out

**Scope:** app screens only. The hosted Supabase password policy is deferred.

- [ ] PW-01 First Login shows the five-rule checklist, and each rule ticks as it is met.
- [ ] PW-02 `abcdefgh`, `Abcdefg1`, and `Abcdefgh!` are rejected with the policy message. `Abcdef1!` is accepted.
- [ ] PW-03 Settings → Change Password applies the same rule and checklist.
- [ ] PW-04 Reset Password applies the same rule and checklist.
- [ ] PW-05 The reset page's "Sign out of all other devices" checkbox is **checked by default**.
- [ ] PW-06 With the checkbox checked: sign in on browser B, reset the password from browser A's recovery link, then refresh browser B. Browser B is signed out. The success screen says other devices were signed out.
- [ ] PW-07 With the checkbox unchecked, browser B stays signed in, and the success screen says so.
- [ ] PW-08 Admin → Activity Logs records the reset and which sign-out choice was made.
- [ ] PW-09 Creating a user with the default temporary password still works, and that user must change it on first login.

### B8. Profile photo and contact number

- [ ] PR-01 Settings → Profile says name, email, ID number, and department are maintained by the administrator. Those fields are read-only.
- [ ] PR-02 Uploading a JPG shows the photo cropped to a square in the Settings header and the top-bar avatar.
- [ ] PR-03 Repeat PR-02 with a PNG and a WebP.
- [ ] PR-04 A phone photo larger than 2 MB uploads successfully, because it is resized before upload.
- [ ] PR-05 A GIF, PDF, or HEIC file is rejected with "Choose a JPG, PNG, or WebP image."
- [ ] PR-06 Change the photo. The new one shows, and the old file is deleted from the `avatars` bucket.
- [ ] PR-07 **Remove**. Initials show again, and the file is deleted.
- [ ] PR-08 **Android app:** upload, change, and remove a photo using the device's file picker or camera.
- [ ] PR-09 Contact number: `0917 123 4567`, `+63 917-123-4567`, and `639171234567` are each saved and shown as "0917 123 4567".
- [ ] PR-10 `12345` and `0817 123 4567` are rejected with the format message.
- [ ] PR-11 Saving a blank contact number removes it, and the field shows "Not set".
- [ ] PR-12 Student: guardian editing still works as before.
- [ ] PR-13 Repeat PR-02 and PR-09 for Faculty, Dean, and Admin accounts.

### B9. Labels: AI Study Tutor and menus

- [ ] LB-01 The student sidebar shows **AI Study Tutor**, and the page title is "AI Study Tutor".
- [ ] LB-02 The Dashboard text, the advisories inbox buttons ("AI Study Tutor", "Open AI Study Tutor"), and the Ask ASPIRE panel subtitle all use the AI Study Tutor name.
- [ ] LB-03 The insight notification title reads "AI Study Tutor Insight Ready".
- [ ] LB-04 The Log Class Scores activity hint reads "(Required for AI Study Tutor)".
- [ ] LB-05 The Admin sidebar **Import Users (CSV/Excel)** opens the import. Both a `.csv` and an `.xlsx` file import successfully.
- [ ] LB-06 Faculty menu labels match the thesis: My Class Records, Preview & Post Grades, Evaluate Students, Evaluated Students, Performance Reports.
- [ ] LB-07 Mobile menu (phone width, each of the 4 roles): the bottom bar shows 4 shortcuts plus **More**. Tapping **More** opens the full sidebar menu with every group and page, plus Settings, the install button, and Sign Out. Tapping a page opens it and closes the menu; tapping the backdrop or ✕ closes it. On a page with no shortcut (e.g., Faculty → Evaluated Students), **More** is highlighted.
- [ ] LB-09 Settings on a phone: the card reads **Install ASPIRE App** with a "Detected: Android/iPhone/Desktop" chip, and the button uses the theme color. Tapping it opens the install guide, where the Android APK, iPhone, and desktop tabs are all selectable. The sign-out button reads "Sign Out of ASPIRE".
- [ ] LB-08 Student mobile: Attendance & Warnings, Score Breakdown, AI Study Tutor, and Request a Consultation are reachable through **More**.

### B10. Removed class-wide unlock path

- [ ] UL-01 Dean → Grade Posting Status shows posting status only, with no "Approve Request" or unlock button.
- [ ] UL-02 Faculty → Posted Grades has no milestone unlock-request action. SG changes go only through the SG correction request.
- [ ] UL-03 Admin → Term Management rollover audit: "Pending Dean Grade Override Requests" equals the number of **pending SG correction requests**.

### B10a. Class-code joins require faculty approval

Test with a block-section student and an irregular student (home section different from the class section).

- [ ] EJ-01 Wrong or inactive code: *"Invalid or inactive classroom code…"*. No request or enrollment is created.
- [ ] EJ-02 Valid code: the student sees *"Request sent to the instructor of <code> (<section>). You'll be added once it's approved."* The class is **not** in the student's subjects, grades, or attendance.
- [ ] EJ-03 *My Subjects* shows a **locked** card for the request (subject, section, instructor, "Waiting for approval"). The card doesn't open.
- [ ] EJ-04 Entering the same code again while pending: *"Your request to join … is already waiting for your instructor's approval."*
- [ ] EJ-05 A student already enrolled in the subject: *"You are already enrolled in …"*. No request is created.
- [ ] EJ-06 Faculty receives an in-app **New Enrollment Request** notification (no email). Faculty → Enrollment Requests lists the request with the student's name, ID, class, and request date.
- [ ] EJ-07 **Approve:** the student is added to the roster (with the IRREGULAR badge for the irregular student) and gradebook. The faculty sees a confirmation. The student gets a **Class Registration Success** notification, and the class appears as a normal card on *My Subjects*.
- [ ] EJ-08 **Reject:** the student isn't enrolled and gets **Enrollment Request Not Approved**. *My Subjects* shows a "Not approved" card with **Dismiss**; dismissing hides it.
- [ ] EJ-09 After a rejection, entering the code again creates a new pending request (EJ-02 to EJ-03 repeat).
- [ ] EJ-10 Only the class's assigned faculty can decide: a different faculty account, or the same request decided twice (e.g., two tabs), gets an error, and nothing changes.
- [ ] EJ-11 Approving a student already enrolled in the subject in **another section** shows an error; the request stays pending.
- [ ] EJ-12 **Late-join hint:** for a class with a posted MR (or TFR/SG), the request card says the milestone is posted and to enter 0 for missing posted-term work after approving. After approval, saving the grade sheet requires those cells (late-joiner decision record).
- [ ] EJ-13 Notification preferences: the student's "Class enrollment" and the faculty's "Enrollment requests" device-alert toggles work. These categories offer no email option.
- [ ] EJ-14 Students enrolled before this change, and old approved requests, are unaffected.

### B10b. Block-section enrollment and roster notices

- [ ] EN-01 Admin creates a student (Manage Users or CSV import) in section BSIT-1A, which has active classes. The student appears **immediately** in every BSIT-1A class roster, grade sheet, and attendance list, without any professor opening My Class Records.
- [ ] EN-02 Each subject professor of BSIT-1A gets **Class Roster Update**: *"1 student was added to <subject> (BSIT-1A) through section enrollment…"*. No student name; no email.
- [ ] EN-03 CSV import of 5 students into BSIT-1A within a few minutes: each professor has **one** unread notice per class, reading "5 students were added…", not five notices.
- [ ] EN-04 Admin creates a **new class** for BSIT-1A (40 students): its professor gets *"<subject> (BSIT-1A) was set up with 40 students from section enrollment."* The count matches the roster and the admin Classrooms page.
- [ ] EN-05 Approving a class-code join request (EJ-07) does **not** produce a Class Roster Update notice.
- [ ] EN-06 An admin changes an existing student's section to BSIT-1B: they're enrolled in BSIT-1B's active classes, and BSIT-1B's professors are notified. (Old BSIT-1A enrollments remain; known limitation, see `06-future-enhancements/SECTION_TRANSFER_ENROLLMENTS_2026-10-10.md`.)
- [ ] EN-07 A student already enrolled in a subject in another section isn't enrolled a second time in that subject.
- [ ] EN-08 Faculty notification preferences: the "Class enrollment" device-alert toggle covers both enrollment requests and roster updates.

### B10c. Admin setup fixes, Batch 1 (audit `docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md`)

**Before testing:** an active term must exist with sections created for it in Sections (see the audit's §6 and the rollover note in R1).

- [ ] AS-01 **QA bug repro (H1):** Classrooms → Provision Classroom → choose the computing college → Filter by Program **BSIT** → select **BSIT-1A** and a subject → create. The new classroom's section is **BSIT-1A** (check the list and Query 7 in the audit). Repeat with the Year filter, and with changing the subject after filtering.
- [ ] AS-02 Classrooms modal offers **only active-term sections**. With no sections for the active term, the dropdown says *"No sections for the active term"*, and creating is refused.
- [ ] AS-03 Classrooms list opens on the **active term**; the term filter labels other terms *(Previous term)* and *All Terms* still works.
- [ ] AS-04 The Classrooms modal text names the active term and explains automatic section enrollment and code-join approval.
- [ ] AS-05 Faculty → Create Classrooms offers only **their own college's active-term** sections; never another college's.
- [ ] AS-06 **User form, college list (C1):** Add User → the College dropdown lists exactly the colleges in the database (incl. *Technology and Engineering College for Humanity* and *Department of General Education*).
- [ ] AS-07 **New student:** choose college → program (that college's programs only) → year → section (that program and year, **active term** only). Save → the user's college and section are stored (check the user list / database). Saving without a section shows *"Choose a section for this student."*
- [ ] AS-08 **Edit student:** the form shows the student's **actual** college, program, and section. Changing college or program clears the section until a new one is chosen.
- [ ] AS-09 Editing a student whose section belongs to a previous term shows it labeled *(term, current)* with a note to choose an active-term section.
- [ ] AS-10 **Roles (M2):** only Student, Faculty, Dean, Administrator are offered (no Office). Faculty and Dean need a college; Administrator shows no college.
- [ ] AS-11 **Email locked (M11):** in edit mode the email is read-only with the note that it's the login.
- [ ] AS-12 **User numbers (M8):** create two students in a row → consecutive, unique numbers (no "duplicate key" error).
- [ ] AS-13 Assigning a section to a student (create or edit) **auto-enrolls** them in that section's active classes, and those classes' professors get a *Class Roster Update* (EN cases).
- [ ] AS-14 **Sections form (M9):** Add Section → the *Academic Term* dropdown lists the terms from Term Settings, defaults to the **active term**, and the saved section shows that school year and semester.

### B10d. Admin setup fixes, Batch 2 (data safety; term rollover with SG grace period)

Run migrations `20261011120000_restrict_destructive_deletes.sql` and `20261011130000_term_rollover_grace.sql` first.

**Batch 2A: data safety**
- [ ] AS-15 **Import, college (H3):** import a faculty row whose college is misspelled → row rejected: *College "…" was not found*. Nothing is guessed.
- [ ] AS-16 **Import, section required:** import a student row with an empty section → rejected: *Section is required for students*.
- [ ] AS-17 **Import, section must be active-term and same college:** a student row naming a section of another college, or of a previous term → rejected with the reason. A correct active-term section → accepted, and the year level is taken from the section (BSIT-2A → 2nd Year).
- [ ] AS-18 **Import, year mismatch:** student row `BSIT-2A` with year level `1st Year` → rejected: *does not match section*.
- [ ] AS-19 **Import, roles (M7):** a row with role `office` → rejected; valid roles listed as admin, dean, faculty, student. The role tabs and the role filter no longer show Office.
- [ ] AS-20 **Import, update mode:** an existing student re-imported with *overwrite* on and a new active-term section → their home section changes, and they are enrolled in that section's classes (roster notice to the faculty).
- [ ] AS-21 **Mobile filters:** on a phone, Manage Users → Filters → the College and Program lists come from the database (same as desktop).
- [ ] AS-22 **Delete section in use (C2):** delete a section that has classes or students → refused with counts; nothing deleted. A new, unused section → deleted after the confirm.
- [ ] AS-23 **Delete subject in use (C2):** delete a subject used by a class → refused with counts. An unused subject → deleted.
- [ ] AS-24 **Delete classroom with work (C2):** a class with any scores, activities, attendance, evaluations, or posted grades → refused with what it has. A brand-new class → deleted after the *Permanently delete* confirm (no "archive" wording).
- [ ] AS-25 **Database guard:** (SQL editor, read-only check) the foreign keys from classes/enrollments to sections/subjects show delete rule `r` (see the verify query at the end of the migration).

**Batch 2B: term rollover and unposted SGs** (do on test data; a rollover cannot be undone)
- [ ] AS-26 **term_id saved (R2):** create a section and a class → both rows have `term_id` set (SQL: `select name, term_id from sections order by created_at desc limit 3`).
- [ ] AS-27 **Pre-check:** Term Settings → Start Next Semester → lists every active-term class whose SG is not posted for all enrolled students (subject, section, instructor, `SG x/y`). No sample/demo classes ever appear.
- [ ] AS-28 **Reminders:** *Send SG Reminder* → each listed instructor gets one **Grade Submission Reminder** naming their classes; it opens My Class Records.
- [ ] AS-29 **Next term must exist:** if the next term does not exist, the wizard offers *Create AY … (…)*; after creating it, Term History shows it as *Next / Not started* and it appears in Add Section → Academic Term.
- [ ] AS-30 **No sections → refused (R1):** with the next term created but no sections, *Next Step* is disabled with a link to Sections. (The database also refuses the rollover.)
- [ ] AS-31 **Rollover moves students safely (R1):** with next-term sections created (same names for 1st→2nd; next year number for a new school year), roll over → summary shows students moved / kept. Moved students have the next-term section (and +1 year level only in a new school year); a student without a matching section **keeps** their section and year level. Nobody's section becomes empty.
- [ ] AS-32 **Archive only posted:** after the rollover, classes whose SG was posted for everyone are **archived**; the others stay open. Term History shows the old term as *Ended* with its grace period.
- [ ] AS-33 **Faculty, Pending:** the instructor of an unposted class sees it under **Past Archives** with *Pending · SG due in N days*; no join code; no attendance link; *Finish Grading & Post SG* opens the score sheet and posting works. The class is not in Attendance.
- [ ] AS-34 **SG label Late:** post that SG within the grace period → the class becomes **Archived · View only**; the Dean sees *Posted · Late*; students get **New Grade Posted**.
- [ ] AS-35 **Overdue:** (test with grace 0 days) an unposted previous-term class shows **SG Overdue** to the faculty and **Overdue** on the Dean's Grade Posting Status; posting it later is labelled *Late (overdue)*.
- [ ] AS-36 **On time:** an SG posted before the rollover shows *Posted · On time* to the Dean.
- [ ] AS-37 **Archived = view only:** open an archived class's score sheet → banner *archived … view only*; Save, add activity, and MR/TFR posting are refused.
- [ ] AS-38 **SG correction still works on archived classes:** submit an SG correction for an archived class → Dean approves → the faculty applies and reposts it → the corrected SG is saved, the label stays as first recorded, and the class stays archived.
- [ ] AS-39 **Student history:** in My Subjects, select the previous term → unposted subjects show *Grade not yet posted*; posted ones show *Completed · Grade posted*. My Grades for that term shows the posted SGs (archived classes are not hidden).
- [ ] AS-40 **Dean term selector:** Grade Posting Status → choose any school year/semester from Term Settings (Summer works) → classes of that term, archived included, with their labels.

### B10e. Admin setup fixes, Batch 3 (run migration `20261011140000_admin_batch3_atomic_saves.sql` first)
- [ ] AS-41 **Grade Override, pick the student (H2):** search a common surname → every match is listed with ID number, college, and section; the grades shown are those of the student you click. A unique match opens directly. Searching by ID number works.
- [ ] AS-42 **Grade Override, SG only (M4):** MR and TFR rows show *View only*; only SG rows have *Override SG*.
- [ ] AS-43 **Grade Override, DYCI steps (M4):** the new grade is a dropdown of 1.00, 1.25 … 3.00, 5.00; saving 5.00 sets the remark to Failed. The activity log entry names the student's ID, the old and new SG, the reason, and the previous remark note.
- [ ] AS-44 **COG create (M3):** create a template whose weights total 100% → template and components appear together. Weights totalling 99% → refused, nothing saved.
- [ ] AS-45 **COG edit (M3):** change weights of an existing template (total 100%) → all saved; the structure (component count and names) cannot change.
- [ ] AS-46 **COG delete (M3):** delete a template used by subjects → *used by N subjects and can't be deleted*. An unused template → deleted after the confirm.
- [ ] AS-47 **Activity Logs (M5):** the page loads all entries (more than 1,000 if present); search and filters find older entries; the export includes them.
- [ ] AS-48 **Classroom log entries (M5):** create and delete a classroom → the logs show action *Classroom Provisioning* / *Classroom Deletion*, the admin's name as actor, and a readable message.
- [ ] AS-50 **Subjects, no duplicates (migration `20261011150000_unique_subjects.sql`):** add a subject whose name already exists in the same college (e.g. a second "Data Structures and Algorithms" in the Technology college) → refused, naming the existing code. A code already in use (any case) → refused. The same name in a **different** college → allowed.
- [ ] AS-51 **Subjects, edit:** renaming a subject to another subject's name in the same college → refused with the same message.
- [ ] AS-49 **Colleges, dean (M10):** edit a college → choose another dean → the old dean is unassigned and the new one assigned. Choose *No Dean* → the college shows *No Dean assigned yet*.

### B11. Hypothesis 2 controlled verification

**Procedure:** follow the Evaluation Phasing Guide, Phase 4b, using a prepared dataset with hand-calculated expected values.

- [ ] H2-01 Cases cover every risk tier (Safe/Low, Watch/Moderate, High, Critical) plus the edge cases: a tier boundary, exactly 75.00%, an improving student, a declining student, and an unencoded future period.
- [ ] H2-02 For each case, the full loop completes: evaluate → publish → acknowledge → report tasks → verify or return → post the next milestone → record the follow-up.
- [ ] H2-03 Completeness: every evaluated case has both a baseline and a follow-up. Report as a count and percentage.
- [ ] H2-04 Correctness: computed vs. expected values match for GWA change, risk-tier transition, and verified completion rate. Record every mismatch with its cause.
- [ ] H2-05 Aggregation: Dean Intervention Results and the export reproduce the stored values.
- [ ] H2-06 Results are labelled as controlled verification data. No significance tests are run on this dataset.

| Case | Baseline GWA / tier | Follow-up GWA / tier | GWA change (computed / expected) | Transition (computed / expected) | Verified completion (computed / expected) | Match? |
|---|---|---|---|---|---|---|
| | | | | | | |

### B12. Regression smoke test

- [ ] RG-01 Each role signs in and reaches only its own portal. Dashboards load without console errors.
- [ ] RG-02 Faculty: Log Class Scores autosave, Preview & Post Grades, and Evaluate Students still work.
- [ ] RG-03 Dean: Risk & Honors Overview, Escalated Cases (referral review and resolution), Grade Corrections, and Generate Reports still work.
- [ ] RG-04 Student: grades, attendance, AI Study Tutor (including the fallback when the AI is unavailable), and consultations still work.
- [ ] RG-05 Admin: Manage Users, subjects and sections import, Grading Formulas, Classrooms, Activity Logs, Term Settings, and Grade Override still work.

---

## D. Deferred until RLS is applied (not release-blocking for this run)

These cases depend on row-level access rules. Run them after the user applies RLS.

- [ ] An anonymous client cannot read or mutate protected grading and advising records.
- [ ] A Student can read only their own enrolled records and cannot mutate grades, activities, evaluations, or corrections.
- [ ] A Student cannot retrieve another student's record by substituting an identifier in a direct request.
- [ ] An assigned active Faculty account can manage only its own active classes.
- [ ] An unassigned Faculty account cannot read private drafts or mutate another faculty member's class.
- [ ] A Dean can review only requests and records within their own department.
- [ ] An out-of-department Dean cannot retrieve or decide a request through a direct RPC or API call.
- [ ] An active Admin can perform only the documented administrative override actions.
- [ ] Profile photos in the `avatars` bucket cannot be read by other users. Storage policies are included in migration `20261010130000`, so this can be spot-checked now.

---

## Release Gates (this run)

**Carried over from Part A:**
- [ ] Activities follow the Pending / Tentative / Official visibility model in authenticated end-to-end testing.
- [ ] Students cannot access draft or unpublished evaluations.
- [ ] NULL-to-zero conversion and posting are atomic.
- [ ] Both Faculty posting pages use one consistent workflow.
- [ ] SG correction keeps complete original, proposed, decision, and final history, and a repost must match the approved proposal.
- [ ] Dean approval cannot silently or automatically alter the official SG.
- [ ] Faculty intervention drafts survive a refresh and restore one to five tasks.
- [ ] CSV exports are structurally valid.
- [ ] Cached AI explanations cannot contradict current evidence without a stale warning.
- [ ] Dynamic COG calculations pass for all five templates.
- [ ] Regular and summer workflows pass focused regression tests.

**New in Part B:**
- [ ] The full Hypothesis 2 loop passes end to end: acknowledgment, verification, one-time follow-up, and Intervention Results (B1–B4, B11).
- [ ] A published baseline stays frozen through edits (B5).
- [ ] Notification preferences persist and are enforced (B6).
- [ ] Password rules are enforced on all three screens, and reset sign-out works (B7).
- [ ] Photo and contact number work on web and Android (B8).
- [ ] A follow-up can't be recorded while a reported task is unreviewed, and student and faculty task counts agree (TV-10, FU-15, FU-16).
- [ ] Re-evaluation: a closed term shows **Closed**; a later term can be evaluated with a new baseline (FU-11 to FU-14).
- [ ] Class-code joins create a **pending** request; only the class's assigned faculty can approve or reject; approval enrolls the student in one step; nobody is enrolled without approval (B10a, EJ-01 to EJ-14).
- [ ] Block-section students are enrolled **immediately** on section assignment, and professors receive one roster notice per class with the correct count, including new classes; approvals send none (B10b, EN-01 to EN-08).
- [ ] New enrollment notifications are in-app and device alerts only: no email, no student names in faculty notices (EJ-06, EN-02).
- [ ] Every page is reachable on a phone through **More**, and the install card is device-neutral (LB-07 to LB-09).

**Sign-off:**
- [ ] Human testers manually verified the deployed frontend. Automated and AI-assisted checks were supplementary only.
- [ ] The tested `ghost` preview commit is the exact commit approved for merge into `main`.
- [ ] The QA lead recorded PASS, FAIL, or BLOCKED for every applicable case, outside §D.
- [ ] After H2 passes, the thesis System Testing sentence ("Integration testing verified… the end-to-end HITL pipeline…") is confirmed accurate. Verify its other claims, such as RLS enforcement, when the deferred work is done.

---

## Recommended Execution Order

1. Complete §0. Confirm `20261010120000`, `20261010130000`, and `20261010140000` are applied, and **apply `20261010150000` then `20261010160000`**. Then record the preview URL, commit SHA, accounts, QA classes, class codes, and baseline values.
2. Run the regression smoke test (RG-01) to confirm each role reaches only its portal.
3. Part A: privacy and NULL/zero (A4, A2), then dynamic COG and posting (A1), then SG correction including SG-09 (A3), then intervention drafts (A5), then audit and AI (A6), then database integrity (A7).
4. Part B, in this order:
   1. Password rules (B7) and profile (B8)
   2. Notification preferences (B6) and labels, mobile menu, and install card (B9, LB-01 to LB-09)
   3. Unlock removal (B10)
   4. **Section enrollment and roster notices (B10b)**, then **class-code join approval (B10a)**. Run these before B1–B4 so test students are in their classes. Run EJ-12 (late-join hint) once a QA class has a posted MR.
   5. Acknowledgment (B1), verification (B2), follow-up (B3, including FU-11 to FU-17 re-evaluation and review rules), and Intervention Results (B4)
   6. Baseline freeze (B5)
5. Run the Hypothesis 2 controlled verification (B11) with the prepared dataset.
6. Retest defects on the updated `ghost` preview, complete one clean regression run, and obtain QA lead and product-owner sign-off. Only then merge into `main`.
7. Later, after the user applies RLS, the AI model setting, and the hosted password policy, run §D.
