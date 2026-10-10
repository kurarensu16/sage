# ASPIRE Thesis (Chapters 1–2) vs. Codebase Audit — Revision 3

**Document audited**: `ASPIRE_Chapters_1-2_Master.docx` (Chapter 1: Project Rationale; Chapter 2: System Development)
**Codebase state**: HEAD `b977c7d` on branch `ghost`, plus 2026-10-10 working-tree changes and three new migrations: `20261010120000_intervention_followup_and_task_verification.sql` and `20261010130000_profile_contact_and_photo.sql` (both applied 2026-10-10), and the testing fix `20261010140000_followup_requires_task_review.sql` (applied 2026-10-10). Also `20261010150000_class_join_approval.sql` and `20261010160000_section_enrollment_sync_and_notice.sql` (to apply): class-code joins now require faculty approval, as the paper describes (§E2); block-section students are enrolled immediately on section assignment, and professors receive a roster notice. The user confirmed these are the **final feature changes**; only fixes from testing follow.
**Date**: 2026-10-10
**Supersedes**: Revisions 1–2 of this file (same date) and `CHAPTER_1_2_CODEBASE_COMPARISON.md` (2026-08-05, written against an older thesis draft)
**Revision 3 adds**: the implementation status of §A, §H (evaluation tool updates, now applied), and §I (paper text needed for the new behavior)

> **Note on Row Level Security (RLS):** This audit disregards every RLS statement in the documentation. The paper's RLS wording is accepted as written: Ch. 1 Data Privacy section, Ch. 2 Phase 1, ERD Layer 4 ("RLS is enabled on every risk and note table"), Development Stack, Table 2.10, System Testing ("RLS enforcement per role"), the ISO Security characteristic, and Ethical Considerations. No finding below concerns RLS state, policies, or grants, and no change to the paper's RLS text is recommended.
>
> **Note on the AI model:** This audit likewise disregards the paper's AI model statements ("Google Gemini 2.5 Flash by default" in Ch. 1, the Development Stack, Table 2.10, and the OpenRouter reference). That wording stays as written, and finding B1 is informational only; no paper change is recommended.
>
> **Note on the hosted Supabase password setting:** The password rule is enforced in the application code (First Login, Reset Password, Change Password) and in the local `supabase/config.toml`. The matching hosted-project Auth setting is deferred together with RLS and the AI model, and is not an action item in this audit.

---

## Summary

All of the paper's **numeric figures still match the code exactly**: the COG templates, milestone formulas, transmutation scale, the four risk-factor tables, the risk tiers, and the Honors thresholds (§6).

The recent migrations did change things the paper describes, in three areas:

| Area | Findings | Severity |
|---|---|---|
| A. Closed-loop outcome pipeline (Hypothesis 2) | 3 | **Critical** → implemented in the working tree; pending migration and an end-to-end test |
| B. Claims that no longer match behavior | 6 | Medium: needs a fix to either the paper or the code |
| C. ERD (Figures 2.13–2.17 and their text) | 3 layers affected | Medium: new tables are missing and one relationship is described wrongly |
| D. Scope: added and removed pages, Account module, labels | 5 | Medium (D3, Account module) / Low (the rest) |
| E. Legacy code that contradicts the paper | 1 | Low: code cleanup |
| H. Evaluation tool (questionnaires, phasing guide, consent form) | 4 files | Medium → **applied** 2026-10-10; evaluation not yet started, so the normal Phase 1 validation follows |
| I. Paper text required by the 2026-10-10 code changes | 9 | Medium: new behavior the paper must describe |

> **Implementation status (2026-10-10, final feature set):** all of the following are in the working tree but **not live** until both migrations are applied, and none has been tested end to end in a browser. Lint (no new warnings), the production build, and `scripts/verifyEvaluationTracking.js` pass.
> 1. **Closed-loop pipeline (§A):** follow-up snapshot, faculty task verification, and Intervention Results columns, plus per-plan student acknowledgment and frozen published baselines (§I).
> 2. **Notification preferences (§D3):** saved and enforced.
> 3. **Password policy and reset sign-out (§B5).**
> 4. **Class-wide unlock path removed (§E1).**
> 5. **Profile photo and contact number (§D3b).**

**Correction to Revision 1:** Revision 1 said the ERD needed no changes and that Intervention Results was "confirmed implemented." Both statements were wrong. The ERD needs updates (§C). Intervention Results shows only GWA change, and its follow-up values are never captured (§A).

---

## A. Critical — Closed-loop outcome pipeline (affects Hypothesis 2)

Hypothesis 2's H1 needs three things: (a) a paired baseline **and follow-up** snapshot for every evaluated student, (b) correct GWA change, risk-level transition, and task completion rate, and (c) those metrics shown on the Dean's Intervention Results dashboard. As the code stood at HEAD `b977c7d` (before the 2026-10-10 changes), (a) and (c) could not pass, and (b) could only be partly computed. The findings below describe that state; each now carries its current status.

### A1. The follow-up snapshot is never written
> **Status: implemented (not live).** `record_intervention_followup` RPC plus a "Record follow-up" button in `faculty/EvaluatedStudents.jsx`. The button is enabled only after an MR, TFR, or SG is posted following publication. The snapshot is immutable (trigger), stamps the milestone, task counts, actor, and time, and closes the plan. The Dean views mark cases where a follow-up is due.
- `student_risk_evaluations.followup_snapshot` is created in `20260914120000_aspire_pipeline_v3_1.sql:31`.
- A repo-wide search finds **no writer**: no page, service, edge function, SQL function, trigger, or script ever sets it. It is only read, in `dean/AtRiskStudents.jsx:628`, `dean/SummaryReports.jsx:298`, `student/Dashboard.jsx:238`, `student/AcademicInsights.jsx:321`, and `lib/insightFreshness.js:93`.
- As a result, every evaluation stays in "Active Intervention" / "In Intervention" forever. `AtRiskStudents.jsx` fills the follow-up columns from the student's **current live** GWA and risk score. That is a moving value, not the frozen follow-up record the paper describes.
- **Paper text affected:** Ch. 1 Closed-Loop section ("verifies whether baseline and follow-up snapshots… correctly yield…"); Objective 5; Dean Intervention Results; ERD Layer 4 ("baseline and follow-up snapshots as JSON"); Data Capture Stage 3; Hypothesis 2 (a)–(c).
- **Fix (code; the paper already describes the intended behavior):** add a faculty "Record Follow-up" action, or capture the snapshot automatically when the next grade milestone is posted. It should freeze `{gwa, risk_score, risk_level, tasks_total, tasks_completed, captured_at, milestone}` into `followup_snapshot` through a `SECURITY DEFINER` RPC and refuse to overwrite an existing snapshot.

### A2. Intervention Results shows GWA only, not risk transition or task completion rate
> **Status: implemented (not live).** `dean/AtRiskStudents.jsx` (Intervention Results) and `dean/SummaryReports.jsx` (table and Excel export) now show baseline and follow-up risk with GWA, GWA change, verified tasks and completion %, risk transition (Improved / Unchanged / Worsened), and student acknowledgment. The `|| 3.0` fallback and the live-value substitution are removed. Both pages use a single helper (`summarizeInterventionOutcome`), covered by `scripts/verifyEvaluationTracking.js`.
- `dean/SummaryReports.jsx:296-321` (Generate Reports → intervention report and Excel export) shows Initial Risk, Baseline GWA, Follow-up GWA, and a status label. It has **no follow-up risk level, no risk-tier transition, and no task completion rate**.
- `riskEngine.js:348` `calculateInterventionOutcome()` computes `tasksCompletionRate` and `riskScoreChange`. Only `AtRiskStudents.jsx:629` calls it, and only when a follow-up exists, which per A1 is never.
- Both pages fall back to `parseFloat(snapshot.gwa || 3.0)`. A missing GWA silently becomes 3.00 and can produce a wrong "Recovered" or "Needs Continued Escalation" label.
- **Fix (code):** add "Follow-up Risk," "Risk Transition" (e.g. High → Watch), and "Task Completion %" columns to both the on-screen table and the export, sourced from `calculateInterventionOutcome()`. Replace the `|| 3.0` fallback with an explicit "Unavailable" state.

### A3. There is no faculty verification of task completion
> **Status: implemented (not live); the code option was chosen.** `verify_intervention_task` RPC with Verify and Return (note required) buttons in Evaluated Students. Verified tasks are locked for the student, and the completion rate counts verified tasks only. Students must first acknowledge the plan (`acknowledge_student_evaluation`). The paper's "faculty-verified" wording is now accurate; see §I for the text to add.
- Students toggle tasks through `set_legacy_advising_task_completion` (`student/FacultyAdvisingInbox.jsx:87`). No faculty "verify" step, column, or RPC exists.
- The UI itself says so: "Student reporting is not the same as faculty verification" (`components/faculty/RiskEducationNote.jsx:55`) and "Reported completion does not establish instructor verification" (`faculty/EvaluatedStudents.jsx:190`).
- **Paper text affected:** Objective 5 ("verified task completion"); Evaluate Student ("review task completion"); Stage 2 ("distinguished from faculty verification"); Stage 3 ("task verification status… verified completion"); Statistical Treatment ("faculty-verified task completion rates").
- **Fix:** choose one.
  - **Code (recommended, because the hypothesis depends on it):** add `verified`, `verified_by`, and `verified_at` per task, plus a faculty action in `EvaluatedStudents.jsx`, and compute the completion rate from verified tasks.
  - **Paper:** replace "verified/faculty-verified task completion" with "student-reported task completion" throughout. Note that this weakens the evidence for Hypothesis 2.

---

## B. Claims that no longer match behavior

### B1. The default AI model is not Gemini 2.5 Flash
- `supabase/functions/invoke-advisor/index.ts:5`: `OPENROUTER_MODEL` env var, otherwise **`poolside/laguna-s-2.1:free`**.
- `supabase/functions/generate-intervention-draft/index.ts:4-5`: `INTERVENTION_MODEL` or `OPENROUTER_MODEL`, otherwise `poolside/laguna-s-2.1:free`, falling back to `openrouter/free`.
- The paper says "Google Gemini 2.5 Flash by default" in Ch. 1 (AI-Assisted Advising), Development Stack, and Table 2.10, and cites the OpenRouter Gemini model page.
- The deployed Supabase secrets could not be checked from the repo. If `OPENROUTER_MODEL` is already set to `google/gemini-2.5-flash` in production, the paper is accurate for the deployment, but the code default still contradicts it.
- **Fix:** change both code defaults to `google/gemini-2.5-flash` and confirm the production secret. Alternatively, reword the paper as "a configurable OpenRouter model" and drop the Gemini citation.

### B2. SG correction requests now store a binding proposed grade
- **ERD Layer 3 text says:** REMARK_OVERRIDE_REQUESTS "does not authoritatively store a proposed replacement numeric grade."
- **Code (`20261008160000_sg_correction_integrity.sql`):** the request stores `proposed_computed_grade`, `proposed_effective_grade`, `proposed_remark`, `proposed_score_changes`, and `evidence_url`. A trigger (lines 472-485) **rejects any faculty repost whose grade differs from the approved proposal**. Statuses are now `pending | approved | rejected | applied | cancelled`, and each applied correction writes an immutable row to the new `grade_correction_history` table.
- What still holds: the Dean approves or rejects but never edits grades, and faculty reposting is what applies the change.
- **Fix (paper):** replace that sentence with something like: "REMARK_OVERRIDE_REQUESTS records the faculty's proposed corrected SG, remark, and supporting evidence. Dean approval authorizes only that exact proposal; the request becomes *Applied* when the faculty reposts a matching SG, and the change is recorded immutably in GRADE_CORRECTION_HISTORY." Make the same adjustment to the Dean Grade Corrections bullet and the Level 1 Dean DFD text.

### B3. The "Grace Pass" rule is undocumented
> **Decision (2026-10-10):** The attendance/FDA rules, computation of grades, President's Lister criteria, and grading system (including Grace Pass) come from the **DYCI Student Handbook, 2025–2026 edition**. Keep the feature. In the paper, update the handbook reference from "(n.d.)" to the 2025–2026 edition and add one sentence on Grace Pass under Table 2.3 or Grade Corrections, citing its handbook section.
- `faculty/PostedGradesView.jsx:1445` and `dean/RemarkOverrideRequests.jsx:487`: through an SG correction, a faculty member can request a **Passed** remark. The engine caps the effective grade at **3.00** even when the recalculated GWA is worse than 3.00.
- Table 2.3 says ratings below 75.00 transmute to 5.00 Failed, and the paper presents all grading rules as DYCI Handbook policy.
- **Fix:** if the Handbook allows this, add a sentence under Table 2.3 or under Grade Corrections that cites the provision. If it doesn't, remove the feature.

### B4. Unapproved plans are hidden from students, not shown with a lock
> **Decision (2026-10-10):** Hidden. This is a paper change only: "Plans become visible to the student only after the instructor publishes them."
- The paper (Scope → Advisories & Study Plans; Proposed System for the Student) says unapproved plans "show a 'Pending Instructor Review' lock and cannot be opened."
- In the code, `student/FacultyAdvisingInbox.jsx:61` loads only `submitted` and `acknowledged_by_student` evaluations, and the publication guard migration (`20261008140000`) keeps drafts faculty-only. Students never see an unapproved plan at all. The `Lock` / "Draft" branch at line 155 can never render, and the text "Pending Instructor Review" appears nowhere in `src/`.
- **Fix (paper, simplest):** "Plans become visible to the student only after the instructor publishes them." Alternatively, show a locked placeholder card in code.

### B5. Password reset does not end active sessions, and first-login strength rules are advisory
> **Status (2026-10-10): implemented in code.**
> - **Reset Password** has a "Sign out of all other devices" checkbox (checked by default). When checked, `supabase.auth.signOut({ scope: 'others' })` revokes every other session after the password changes. The audit log records which choice was made.
> - **One password rule everywhere** (`src/lib/passwordPolicy.js`): at least 8 characters with an uppercase letter, a lowercase letter, a number, and a special character. It is enforced on First Login, Reset Password, and Settings → Change Password, each with a live requirements checklist. Local `supabase/config.toml` now sets `minimum_password_length = 8` and `password_requirements = "lower_upper_letters_digits_symbols"`.
> - The hosted-project Auth setting is deferred (see the note at the top) and is not an action item here.
> - The default temporary password (`SagePassword123!`) already complies.
> - **Paper wording:** First Login — "a new password of at least 8 characters containing uppercase and lowercase letters, a number, and a special character." Forgot/Reset — "updates the password and, if the user chooses, signs out all other active sessions."
- **Paper:** Forgot/Reset "updates the password, and ends active sessions." First Login requires "a new password that meets strength rules."
- **Code:** `public/ResetPassword.jsx:32` calls only `supabase.auth.updateUser()`, with no `signOut({ scope: 'global' })`. `public/ForceChangePassword.jsx:53` enforces only a 6-character minimum. The 5-point strength meter (lines 35-39) is display-only.
- **Fix (code, small):** after a successful reset, call `supabase.auth.signOut({ scope: 'others' })`. On first login, require a minimum strength score, for example ≥ 8 characters with an uppercase letter and a digit. Or soften the paper's wording.

### B6. Bulk import accepts more formats and more record types than the paper says
- The Delimitation says "validated CSV files," and Scope says "uploaded spreadsheet file," for users only.
- The code accepts **Excel or CSV** for users (`admin/UserList.jsx`), **sections** (`admin/SectionList.jsx`), and **subjects** (`admin/SubjectList.jsx`).
- **Fix (paper):** "validated CSV or Excel files," and mention the Sections and Subjects import under Academic Setup.

---

## C. ERD Changes Needed (Figures 2.13–2.17 and their descriptions)

**Layer 1, Identity & Academic Structure, and Layer 2, Enrollment & Classroom Setup:** these match. No change needed.

### C1. Layer 3: Grading Engine (Figure 2.15)
| Add or change | Why |
|---|---|
| **STUDENT_TERM_SCORES** and **CLASS_GRADING_COLUMNS** | These are still the main score store for 14+ pages (`ScoreInput`, `GradeComputationPreview`, `PostedGradesView`, every student grade page, Dean dashboards). The ERD shows only CLASS_ACTIVITIES / STUDENT_ACTIVITY_SCORES. |
| **STUDENT_COMPONENT_SCORES** (new, `20261007130000_dynamic_grade_sheet_v2.sql`) | Normalized per-component term scores (FK to GRADE_COMPUTATION_COMPONENTS) |
| **GRADE_CORRECTION_HISTORY** (new, `20261008160000`) | Immutable record of applied SG corrections (FKs to REMARK_OVERRIDE_REQUESTS, POSTED_GRADES, CLASS_RECORDS, USERS) |
| REMARK_OVERRIDE_REQUESTS attributes | Add the proposed-grade, evidence, decision, applied, and cancelled columns (see B2) |
| POSTED_GRADES → REMARK_OVERRIDE_REQUESTS | New FK `last_correction_request_id` |
| GRADE_COMPUTATIONS attribute | New `formula_version` |
| UNLOCK_REQUESTS | Still read by Dean and Admin pages. Either draw it as the legacy milestone-unlock table or remove it along with E1. |

### C2. Layer 4: Risk, Advising & Consultation (Figure 2.16)
| Add or change | Why |
|---|---|
| **STUDENT_EVALUATION_REFERRALS** and **STUDENT_EVALUATION_REFERRAL_REQUESTS** (new, `20261006120000`) | The text currently says escalation is "captured by a referral flag, with the referral rationale and the Dean's disposition recorded on the same record." That is now **wrong**. Referrals are a separate 1-to-many table holding reason, pending/resolved state, resolution note, last review note, and reviewer. The `refer_to_dean` flag on the evaluation is only a summary, and the requests table makes retries idempotent. |
| **FACULTY_INTERVENTION_DRAFTS** (new, `20261007120000`) | AI-generated task drafts: exactly **3 tasks**, snapshot plus hash, `model`, `prompt_version`, status `generated / accepted / discarded / superseded`, and FK `accepted_evaluation_id`. This is the AI provenance trail behind "AI-suggested tasks are reviewed by faculty before release." |
| **FACULTY_INTERVENTION_WORKING_DRAFTS** (new, `20261008170000`) | Unpublished, faculty-only work in progress (feedback, private note, 1–5 tasks, deadline, referral intent), linked to the evaluation on submit |
| STUDENT_RISK_EVALUATIONS attributes | `status` (`draft / submitted / acknowledged_by_student`), `published_to_student_at`, `published_by`, `requires_tutoring`. The advising plan is validated at **1–5 tasks**, and AI-sourced tasks carry `action_type`, `priority`, `deliverable`, and `basis_codes`. |
| FACULTY_PERFORMANCE_INSIGHTS | Still named in the text. Check whether it is still used. The legacy-table query found no `.from('faculty_performance_insights')` in `src/`. |

### C3. Layer 5: System & Notifications (Figure 2.17)
| Add | Why |
|---|---|
| **NOTIFICATION_DELIVERIES** | Per-channel delivery queue (in-app, push, email) with status |
| **NOTIFICATION_PREFERENCES** | Per-user, per-type channel opt-in (this backs the "Notification Settings" screens) |
| **USER_PUSH_TOKENS** | Capacitor push registration |
| **GUARDIANS** | Guardian contacts for notifications. This is consistent with the Delimitation's "no guardian portal role." |

### C4. Legacy tables still in the database but outside the paper's scope
`evaluation_forms`, `evaluation_criteria`, `evaluation_windows`, `evaluation_responses`, `evaluation_ratings`, `evaluation_comments` (student-to-faculty evaluation, which the Delimitation excludes), `grade_components`, and `component_scores`. None of these are queried from `src/`. Leave them out of the ERD. Optionally drop them in a cleanup migration so the database matches the paper.

---

## D. Scope: Page Additions, Removals, and Module Wording

This section compares the paper's Scope module list with the live sidebar (`src/components/layout/Sidebar.jsx`) and routes (`src/App.jsx`), and with the page additions and deletions in git history since 2026-09-01.

**Correction to earlier drafts:** "Escalated Cases," "Intervention Results," and "Import Users" **are** separate menu entries. `/dean/escalatedcases` and `/dean/interventionresults` render `AtRiskStudents` with their own tab, and `/admin/userlist?action=import` opens the import. The earlier "not separate screens" finding is withdrawn; the paper is correct at the menu level. The Faculty Grades menu also has exactly the two items the paper lists, so that finding is withdrawn too.

### D1. Removed pages: the paper is already consistent
| Removed (commit `97440e3`, 2026-09-22) | Paper status |
|---|---|
| `office/` portal, 11 pages (Dashboard, RosterImport, EvalBuilder, EvalFormsList, EvalWindowForm, EvalWindowList, ComplianceAudit, StudentSections, SubjectAssignmentForm, SubjectAssignmentList, Notifications) | ✅ Not in the paper, which describes four roles only |
| Student `EvalForm`, `EvalList`; Dean `EvalResultsFaculty`, `EvalResultsOverview`; Faculty `EvalResultsMy` | ✅ The Delimitation excludes "student-to-faculty evaluation forms and standalone evaluation scheduling" |
| Faculty "At-Risk Students" screen (`/faculty/atriskstudents` now redirects to `/faculty/evaluatestudent`) | ❌ **Still documented.** Scope → Faculty → Student Risk Module lists "At-Risk Students" as its own screen. The risk-prioritized roster is now the "Evaluate Students" screen. |

**Fix (paper):** merge the Faculty "At-Risk Students" and "Evaluate Student" bullets into one: "**Evaluate Students**: risk-prioritized roster (Critical → High → Watch → Safe) from which faculty open the unified Academic Intervention form for any student…" Update the VTOC (Figure 2.12) and Faculty Level 1 DFD (Figure 2.9) to match.

### D2. Added pages: one is not documented
| Added | Commit | Paper status |
|---|---|---|
| Faculty **Evaluated Students** (`EvaluatedStudents.jsx`, sidebar entry) | `de33c8e`, 2026-10-06 | ❌ **Not documented.** It tracks submitted evaluations, student-reported task progress, and Dean referral status. |
| Student Consultations (`Consultations.jsx`) | `6aee7b7`, 2026-10-04 | ✅ Consultations Module |
| Faculty Class Performance, Performance Comparison | `8d162ea`, 2026-10-01 | ✅ Reports Module |
| Faculty Create Classrooms modal | `568fef7`, 2026-09-23 | ✅ Classes → Create Classrooms |
| Faculty Consultation Requests, Enrollment Requests, Student Risk; Student My Subjects | `c41d69e`, 2026-09-22 | ✅ Documented |
| Admin Classrooms; Faculty Evaluation modal; Student Advisories inbox | `97440e3`, 2026-09-22 | ✅ Documented |

**Fix (paper):** add to the Faculty Student Risk Module: "**Evaluated Students**: lists the faculty's submitted evaluations with student-reported task progress, publication status, and Dean referral status." Add it to the VTOC and Figure 2.9.

### D3. Account module: the paper claims more than the Settings page does (medium)
> **Status (2026-10-10): notification preferences implemented (not live until the migration is applied).** Settings → Preferences now saves to `notification_preferences` (`src/components/settings/NotificationPreferences.jsx`, `src/lib/notificationPreferences.js`). Each role sees only the categories it actually receives:
> - **Device alert** on/off: enforced in `AuthContext.jsx` before a device alert is shown.
> - **Email** on/off: only for emailed types (grade postings and corrections for students; escalated cases for Deans). Already enforced server-side.
> - The **in-app inbox** stays always on; the migration adds a `CHECK (in_app)` constraint.
> - The fake switches (sound effects, evaluation release alerts, email digests) were removed.
> - The migration grants the INSERT/UPDATE the existing owner-only policies needed.
>
> **Still open:** the profile remains read-only (no name, photo, or contact editing), and the placeholder IDs are still shown. Reword the paper for the profile, or ask for a fix.
The paper (Account Module, all four roles) says users can "update personal details (name, photo, contact information), change login credentials, and choose which alerts to receive." In `src/pages/shared/Settings.jsx`:
- **Profile is read-only.** There is no handler for saving name, photo, or contact details, and no photo upload exists. Students can edit their **guardian** contact (`upsert_primary_guardian` RPC), which the paper doesn't mention.
- **Notification preference toggles are not saved.** They are local React state (line 238) and reset on reload. The `notification_preferences` table exists, and the Dean-referral email path reads it, but nothing in `src/` writes to it.
- When `user_number` is missing, the profile tab shows hardcoded placeholder IDs (`'2026-00005'`, `'FAC-2026-00003'`, lines 436-441).
- Change Password works.

**Fix:** choose one. **Code:** persist the toggles to `notification_preferences`, add profile edit for name and contact (and photo if you keep it in the paper), and remove the placeholder IDs. **Paper:** reword to "view profile, change password, manage notification preferences (and, for students, guardian contact)," and drop "photo." Persisting the preferences is the smallest code fix and keeps the paper's claim true.

#### D3b. Profile editing: current state and options

> **Decision and status (2026-10-10): Option C approved and implemented (not live until migration `20261010130000` is applied).**
> - **Identity fields stay admin-managed:** name, email, ID number, and department. They identify the user on official grade and audit records, and every account is created by an admin with its own ID, so the placeholder-ID fallback is never reached and was left unchanged (user decision).
> - **Contact number (all roles).** New `users.contact_number` column, stored as `+639XXXXXXXXX` with a CHECK constraint. Users edit only their own number through `update_own_contact_number`, which accepts 09XX XXX XXXX, 639…, or +639… and rejects other formats. Leaving it blank removes it. Shown as "0917 123 4567" on the Profile tab.
> - **Profile photo (all roles, optional).** New `users.avatar_path` column and a **private** `avatars` storage bucket: 2 MB limit, JPG/PNG/WebP only, owner-only read/write/delete policies on `storage.objects`. `set_own_avatar_path` accepts only objects in the caller's own folder. The browser center-crops the image to 512×512 JPEG before upload. Photos are shown through 1-hour signed URLs on the Settings header and the top-bar avatar, falling back to initials. Changing a photo deletes the old file, and Remove deletes it.
> - **Students** additionally keep editing their primary guardian contact (unchanged).
> - **Files:** `src/lib/profileService.js`, `src/components/settings/ProfilePhotoAndContact.jsx`, `src/components/layout/UserAvatar.jsx`, `src/pages/shared/Settings.jsx`, `src/components/layout/Topbar.jsx`.
> - **Not yet tested:** photo upload through the Android app's file picker. Include it in the device test.
>
> The analysis below is kept for the record.

**What the paper claims (Scope → Account Module):**
| Role | Paper says the user can update |
|---|---|
| Student | "personal details (name, photo, contact information)" |
| Faculty | "personal and department information" |
| Dean | "personal information" |
| Admin | "personal information" |

**What the system does today** (Settings → Profile, `src/pages/shared/Settings.jsx`):
| Field | Shown | Editable by the user | Who can change it now |
|---|---|---|---|
| Full name | Yes | No | Admin, through Manage Users (`admin/UserForm.jsx`) |
| Email (also the login ID) | Yes | No | Admin, through Manage Users |
| Student number / Employee ID | Yes. Shows **fake placeholders** (`2026-00005`, `FAC-2026-00003`) when none is assigned | No | Admin |
| Department / college | Yes | No | Admin (Manage Users, Departments) |
| Section / year level (students) | Not on this tab | No | Admin |
| **Guardian** name, relationship, email (students only) | Yes | **Yes** (`upsert_primary_guardian`) | Student |
| Phone / contact number | **No such field** on `users` (only `guardians.phone` exists) | — | — |
| Profile photo | **No such field** and no file storage; the top bar shows initials | — | — |
| Password | Security tab | Yes | User |
| Notification preferences | Preferences tab | Yes (as of 2026-10-10) | User |

So the only personal data a user can edit is the student's guardian contact. Name, email, ID, and department are institutional records owned by the Admin.

**Options:**

| | Option A: Reword the paper (recommended) | Option B: Add a self-editable contact number | Option C: Full paper claim (contact number and photo) |
|---|---|---|---|
| What changes | Paper only, plus removing the fake placeholder IDs | Adds a `contact_number` column; users edit only their own number via a `SECURITY DEFINER` function (PH mobile format check); shown on the Profile tab | Option B, plus a photo: `avatar_url` column, a Supabase Storage bucket with owner-only upload, image size/type limits, upload UI, and the photo shown in the top bar |
| Name / email / department | Stay Admin-managed (stated in the paper) | Same | Same |
| New features | None | One small field | Two, including file storage (the largest change) |
| Risk before defense | None | Low | Medium (storage permissions, image handling, Android upload path) |
| Fits "no new features" | Yes | Mostly | No |

**Why name, email, and department should stay Admin-managed in every option.** They identify the student on posted grades, audit logs, and correction history. Email is also the login. Letting users change them would let a student alter the identity attached to official records. That conflicts with the paper's accountability claims (Objective 6) and least-privilege RBAC. The Admin already edits them in Manage Users.

**Suggested paper wording for Option A:**
- Student — "My Profile, Change Password, and Notification Settings: view personal and enrollment details maintained by the administrator, update the primary guardian's contact information, change login credentials, and choose device and email alerts for grade postings, advisories, and other notices."
- Faculty / Dean / Admin — "My Profile, Change Password, and Notification Settings: view personal and department details maintained by the administrator, change login credentials, and choose which alerts to receive."
- Add once, under the Admin's Manage Users: "Changes to a user's name, email, ID number, department, or section are made by an administrator."

**In every option:** replace the fake placeholder IDs with "Not assigned." This is a bug fix, not a feature.

### D4. Present in code but not in the paper (minor; add a line each, or leave out)
- A **Notifications inbox** for every role (`/admin|dean|faculty|student/notifications`). The paper mentions only notification *settings*.
- **Admin Settings → Database Maintenance** tab (connection status display).
- **App install options:** "Add to Home Screen" and "Install Desktop App" (PWA) alongside the Android APK download. The paper mentions only the Capacitor Android build.
- **Email** as a notification delivery channel (`send-email` edge function; Dean referrals are emailed). Add "in-app, push, and email delivery" to Table 2.10.
- Evaluate Student work **autosaves as an unpublished working draft**, and publishing makes it visible to the student (see C2).

### D5. Menu labels that differ from the paper's names (align one to the other)
| Paper | Live menu label |
|---|---|
| AI Academic Advisor (Academic Insights / Ask ASPIRE) | **AI Study Advisor** |
| My Classes | **My Class Records** |
| Grade Preview and Posting | **Preview & Post Grades** |
| At-Risk Students / Evaluate Student | **Evaluate Students** / **Evaluated Students** |
| Reports Module | **Performance Reports** |
| Import Users (Spreadsheet) | **Import Users (CSV)** (the parser also accepts Excel; see B6) |
| Sections, Departments & Programs (one item) | **Sections** and **Departments & Programs** (two items) |

**Note on figures:** the VTOC (Figure 2.12), the DFDs (Figures 2.6–2.11), and the ERDs are embedded images. This audit checked their captions and descriptive text only. Redraw them to reflect D1, D2, D5, and section C.

---

## E. Legacy Code That Contradicts the Paper

### E1. Class-wide milestone unlock path
> **Status (2026-10-10): removed.**
> - The "Approve Request" button and handler, plus the unlock-request loading, are gone from `dean/GradePostingStatus.jsx`.
> - The dead `handleRequestUnlock`, its state, and the `localStorage` mirroring are gone from `faculty/PostedGradesView.jsx`.
> - The admin term-rollover audit (`admin/TermManagement.jsx`) now counts pending SG correction requests (`remark_override_requests`) instead of legacy unlock requests.
> - The `unlock_requests` table is no longer written or read by the app (optional drop: C4).
- `dean/GradePostingStatus.jsx:136-160`, `handleApproveUnlock()`: approves pending `unlock_requests` and then sets `is_locked = false` on **every** `posted_grades` row in the class.
- The paper says Dean approval "unlocks only the affected student's SG row," and that MR/TFR repost needs no Dean approval.
- On the faculty side, `faculty/PostedGradesView.jsx:759` `handleRequestUnlock()` is never called, so no new requests can be created. The Dean button still renders for any legacy pending rows, and the faculty page still dual-writes unlock state to `localStorage` (lines 677-678 and 776-779).
- **Fix (code):** remove the class-wide unlock button and handler, the dead `handleRequestUnlock`, and the `localStorage` mirroring. Optionally drop `unlock_requests` (see C1).

---

## F. Verified Correct (no change needed)

| Thesis reference | Code location | Result |
|---|---|---|
| Table 2.1: all 5 COG templates (weights and component names) | `src/lib/officialGradingPresets.js` | Exact match |
| Table 2.2: MR / TFR / SG, regular and summer | `src/lib/gradingMath.js:438` | Exact match |
| Table 2.3: transmutation, 9 bands plus 5.00 | `src/lib/academicPolicy.js:5` | Exact match (but see B3, Grace Pass) |
| Tables 2.4–2.5: GWA deficit (2.25→28, 2.50→30, 3.00→35, 4.00→55, 5.00→60) | `src/lib/riskEngine.js:82-108` | Exact match |
| Table 2.6: attendance 0/10/25/50 | `academicPolicy.js:20`, `riskEngine.js:110-131` | Exact match |
| Table 2.7: recorded zeros 0/10/15 | `riskEngine.js:133-147` | Exact match |
| Table 2.8: trajectory >5/>10/>15 → 3/7/10, Prelim vs. Midterm only | `riskEngine.js:149-171`; callers `StudentRow.jsx:384`, `classRoomService.js:619` | Exact match |
| Table 2.9: tiers 0-24 / 25-49 / 50-74 / 75-100 | `academicPolicy.js:21` | Exact match |
| Factor ceilings 60+50+15+10 = 135, capped at 100 | `riskEngine.js:21-26, 175` | Exact match |
| Honors: GWA ≤1.75, no subject >2.00, no INC, ≥18 units | `academicPolicy.js:10, 60-70` | Exact match |
| GWA is the unweighted arithmetic mean | `academicPolicy.js:53` (`method: 'plain_mean'`) | Exact match |
| Formula snapshot on first posting | `class_records.grading_formula_snapshot`; `20261008150000_atomic_grade_milestone_posting.sql:92-114` | Match |
| Faculty cannot change COG weights | `faculty/GradeComponentsSetup.jsx` (no weight editing) | Match |
| AI Advisor 75% weak-activity benchmark; deterministic fallback | `src/lib/advisingEngine.js:4`; `openrouter.js` | Match |
| Admin Grade Override is logged | `admin/GradeOverride.jsx:204` → `activity_logs` | Match |
| Capacitor Android build and Vercel deployment | `capacitor.config.json`, `android/`, `vercel.json` | Present |
| Four roles only | `AuthContext.jsx` `role` | Match |

---

## G. Secondary Finding (outside this audit's scope)

The repository's `AGENTS.md`, which is not part of the thesis, is stale. It describes a `mockDb.js` that doesn't exist, an `office/` portal that doesn't exist, wrong page counts, "5 migrations / 21 tables" (actually 48 migrations and roughly 49 tables), 2 edge functions (actually 5), and a fixed 50/10/40 formula (the live engine is dynamic per COG). Regenerate it separately.

---

## H. Evaluation Tool Updates

> **Status: applied 2026-10-10.** All changes in H1–H4 are in both the `.md` and `.docx` of each document. The pre-change versions are in `Evaluation Tool\_backup_2026-10-10`.
> - **Questionnaires (H1, H2):** the Word files were edited in place. Formatting is unchanged; only the listed wording differs.
> - **Phasing guide and consent form (H3, H4):** the old Word files were shorter drafts. The phasing guide lacked Phase 4b and the compliance/Hypothesis 2 steps; the consent form lacked items 5–8 and the researcher contact block. Both Word files were **rebuilt from the updated Markdown**, using the old file as the style template (same page size, margins, and heading styles; the consent form in Times New Roman 12). Emoji headings were dropped, as in the old Word versions, and formulas are written in plain notation.
> - All four Word files pass OOXML schema validation. Rendered page images were not reviewed (LibreOffice isn't installed), so open each file in Word once before printing.
> - **Next:** the normal Phase 1 validation once the code is final (H5). The evaluation hasn't started, so no rework is needed.

**Folder:** `C:\Users\JC Gabriel\Downloads\New ASPIRE\Evaluation Tool`. Each document exists as `.md` and `.docx`; keep both identical.

**Kept as written, per this audit's notes:** every RLS statement (Expert ISO 5.1; Consent item 3) and the AI disclosure wording.

### H1. `ASPIRE_ISO_25010_End_User_Questionnaire`
| Item | Current text | Change to | Why |
|---|---|---|---|
| ISO 1.2 | "milestone grades, dynamic GWA forecasts, and composite risk scores … based on syllabus criteria and grading weights" | "milestone grades (MR, TFR, SG), transmuted GWA (1.00–5.00), and composite risk scores (0–100) based on each subject's assigned grading template" | Grades come from the assigned COG template, not "syllabus criteria." "Forecasts" aren't what respondents rate. |
| ISO 1.3 | "…faculty risk triage with Human-in-the-Loop (HITL) intervention logging, and Dean-level oversight" | "…HITL intervention plans that students acknowledge and faculty verify, and Dean-level oversight of intervention results" | Reflects acknowledgment and verification |
| ISO 3.1 | "risk status badges (Low, Moderate, High, Critical)" | "(Safe, Watch, High, Critical)" | The live badges show Safe and Watch (Ch. 2, Table 2.9) |
| ISO 3.4 | "(e.g., before submitting final grades or updating intervention statuses)" | "(e.g., before posting grades, returning an intervention task, or recording a follow-up)" | Names the actual confirmation points |
| ISO 5.2 | "…baseline/follow-up snapshots are protected against unauthorized modification or tampering" | add: "once recorded, a follow-up cannot be changed" | Follow-ups are now immutable |
| ISO 5.4 | "All grade submissions, Dean-approved grade change requests, and faculty intervention actions are … logged" | "…grade change requests, plan acknowledgments, and faculty task verifications are logged…" | Names the newly logged actions |
| TAM PU 1.3 | "(remediation logging, follow-up snapshots, and status tracking)" | "(plan acknowledgment, faculty-verified task completion, and recorded follow-up snapshots)" | Matches the implemented loop |
| TAM PEOU 2.2 | "(Low, Moderate, High, Critical)" | "(Safe, Watch, High, Critical)" | Same as ISO 3.1 |
| TAM PEOU 2.3 | "(such as logging in, exploring course progress, and viewing advisory insights)" | add "acknowledging intervention plans" | A new workflow end users perform |

### H2. `ASPIRE_ISO_25010_Expert_Questionnaire`
| Item | Current text | Change to | Why |
|---|---|---|---|
| ISO 1.3 | "CSV roster ingestion, … HITL intervention logging, baseline/follow-up snapshots, and Dean-level grade change governance" | "CSV/Excel user, section, and subject import; HITL intervention plans with student acknowledgment and faculty task verification; immutable baseline/follow-up snapshots; and Dean-approved SG correction governance" | Import covers 3 record types and 2 formats (B6); the SG flow is per-student (B2) |
| ISO 3.4 | "(e.g., prior to final grade posting or Dean override approvals)" | "(e.g., prior to grade posting, Dean SG-correction decisions, or recording an intervention follow-up)" | The Dean approves corrections; the Admin does overrides |
| ISO 5.4 | "Grade modification requests require Dean approval and are recorded in immutable audit logs alongside faculty intervention history" | "Semestral Grade corrections require Dean approval and are recorded in an immutable correction history; intervention actions, including plan acknowledgments and task verifications, are recorded in the activity audit log" | Matches GRADE_CORRECTION_HISTORY and ACTIVITY_LOGS |
| ISO 6.3 | "(CSV roster parsing, structured JSON payloads, and reporting exports)" | "(CSV/Excel imports, structured JSON payloads, and Excel/PDF report exports)" | Actual formats |
| ISO 6.4 | "(e.g., office productivity suites, PDF/COR viewers)" | "(e.g., office productivity suites, spreadsheet applications, and PDF viewers used for exported reports)" | The COR feature was discarded with the old thesis draft |
| TAM PU 1.3 | same as H1 TAM PU 1.3 | same change | — |
| TAM PEOU 2.3 | "(like profile registration, password setup, and section block updates)" | "(like first-login password setup, joining a class by code, and acknowledging intervention plans)" | Profile registration and section block updates don't exist (accounts are admin-provisioned; profile is read-only, D3) |

### H3. `ASPIRE_Evaluation_Phasing_Guide`
| Location | Current text | Change to | Why |
|---|---|---|---|
| Phase 4, Select Cohort | "50 participants (40 students, 8 faculty members, 2 academic deans/administrators)" | "40 students, 8 faculty members, and 1–2 deans/administrators (≈49–50 end users)" | Matches Table 2.11 |
| Phase 4, Gather Data | "to all 50 participants" / "to 3–5 IT/CS experts" | "to all end-user participants" / "to 1–3 IT experts not involved in ASPIRE's development" | Matches Table 2.11 and inclusion criterion (d) |
| Phase 4, Conduct Testing | the role workflows listed | add: faculty verifying reported tasks; students acknowledging plans and reporting tasks; deans reviewing Risk & Honors Overview, Escalated Cases, and Intervention Results | Respondents must have used what they rate |
| Phase 4b, Step 1.1 | "every risk tier (Low, Moderate, High, Critical) and both evaluation contexts (`passing_recovery`, `pl_retention`)" | "every risk tier (Safe/Low, Watch/Moderate, High, Critical), all through the unified Academic Intervention form" | Those two contexts are legacy; the thesis uses a single form |
| Phase 4b, Step 1.2 | "tasks assigned and tasks completed" | "tasks assigned and tasks verified" | Completion counts verified tasks only |
| Phase 4b, Step 2.1 | "Open At-Risk Students" | "Open Evaluate Students" | That screen was merged (D1) |
| Phase 4b, Step 2.3 | "Record task completions through Advisories & Study Plans and verify them as faculty" | "As the student, acknowledge each plan and report task completions in Advisories & Study Plans; as the faculty, verify or return each reported task in Evaluated Students" | Actual screens and steps |
| Phase 4b, Step 2.4–2.5 | "post the milestone" / "Capture the follow-up snapshot" | "post the next milestone (MR, TFR, or SG) in Preview & Post Grades" / "In Evaluated Students, click Record follow-up (enabled only after that milestone is posted)" | Actual control and its precondition |
| Phase 4b, Step 3 table | "Tasks assigned / completed", "Completion rate" | "Tasks assigned / verified", "Verified completion rate"; add a row "Plan acknowledged by student" | Matches the Dean's Intervention Results columns |
| Phase 5, step 4 | "the instrument collects 1–5 ratings" | "1–4 ratings" | Error; the instrument is a 4-point scale |
| Phase 5, step 5 | "Wilcoxon, McNemar and the paired t-test are specified in the manuscript…" | "The Wilcoxon signed-rank and McNemar tests named in the manuscript apply only to a separate longitudinal evaluation…" | The manuscript does not specify a paired t-test (Statistical Treatment) |
| Appendix, item 2 | "Per the ASPIRE-Complete-Document.md Instrument section" | "Per the Instrument and Validation section of Chapter 2" | Cites a superseded document |

### H4. `ASPIRE_Consent_and_Validation`
| Item | Current text | Change to | Why |
|---|---|---|---|
| Consent item 5 | "…and again after the following grading period. These paired records are analyzed only in aggregate to measure whether the intervention process produced measurable academic improvement." | "…and again when your instructor records a follow-up after the next official grade milestone. These paired records are analyzed only in aggregate to verify that ASPIRE records and computes intervention outcomes correctly; this study does not measure or claim academic improvement." | **Contradicts the thesis**, which says it validates calculation correctness, not improvement (Ch. 1 Closed-Loop section, Hypothesis 2) |
| Consent item 6, 2nd bullet | "…released to a student only after the assigned faculty member has reviewed and approved it." | add: "Students acknowledge each published plan, and task completion they report counts only after faculty verification." | Discloses the new student-facing steps |

### H5. After editing
- The evaluation has not started (confirmed 2026-10-10), so nothing needs to be redone. Proceed with the normal Phase 1 expert validation (Instrument Validation Sheet) on the updated wording, then the Phase 3 pilot and Cronbach's alpha.
- Freeze the instrument wording once code changes stop. Start Phase 1 only after the system is final, so respondents rate the version that gets defended.

### E2. Class-code joins skipped faculty approval
> **Status (2026-10-10): fixed in code; migration `20261010150000_class_join_approval.sql` to apply.**
- **Paper:** Faculty Portal → Enrollment Requests, *"Queue for approving or rejecting students who joined by code before they are added to the roster and gradebook"*; Figure 2.3 (*Enrollment Requests → Approve?*); Figure 2.9 process 6.0 (*join requests, decision → approved student → enrollments*).
- **Code before:** `classRoomService.js` → `submitJoinRequest` enrolled the student immediately and stored the request as approved, so the queue never received code joins.
- **Fix:** a pending request on join; one-step faculty-only approval that also enrolls; locked "Waiting for approval" cards on the student's My Subjects; a late-join hint for classes with posted milestones. Details: `docs/03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md`.
- **Paper:** no change required. One optional sentence for the new notifications is listed in §I item 10.
- **Related fix:** block-section students were only enrolled into existing classes when a professor opened My Class Records. Section assignment now enrolls them immediately (migration `20261010160000`), and professors get a *Class Roster Update* notice with the number of students added (§I item 11).

---

## I. Paper Text Required by the 2026-10-10 Code Changes

These describe behavior added while closing §A. Without them, the paper and the system disagree again.

1. **Student acknowledgment (new).** Scope → Student → Advisories & Study Plans; Proposed System for the Student; Level 1 Student DFD (Figure 2.8). Add: students acknowledge each published plan before reporting task progress; faculty and the Dean see the acknowledgment time; a faculty change to the tasks, due dates, or guidance clears it and requires re-acknowledgment.
2. **Task verification.** Scope → Faculty → Evaluate Student / Evaluated Students; Stage 2 of Data Capture. Add: faculty verify or return (with a note) each student-reported task, and verified tasks are locked. The paper's existing "faculty-verified" wording becomes accurate.
3. **Follow-up recording.** Data Capture Stage 3; Dean Intervention Results. Add: the faculty records the follow-up once, after the next MR, TFR, or SG is posted following publication; recording freezes the values and closes the plan; the Dean view flags cases where a follow-up is due.
4. **Baseline freeze.** ERD Layer 4 text and Stage 1. Add: once published, an evaluation keeps its first baseline, risk classification, and publication time even if the faculty later edits the plan.
5. **ERD Layer 4 attributes** (adds to C2). On STUDENT_RISK_EVALUATIONS: `acknowledged_at`, `followup_recorded_at`, `followup_recorded_by`. Per-task fields in the advising plan JSON: `verification_status` (verified or returned), `verified_at`/`verified_by`, `return_note`/`returned_at`/`returned_by`.
6. **Account Module (all four roles)**, replacing "update personal details (name, photo, contact information)" and "personal and department information": "My Profile, Change Password, and Notification Settings: view personal and department details maintained by the administrator, upload an optional profile photo, update a contact number, change login credentials, and choose device and email alerts." For students, add: "…and update the primary guardian's contact information." Under Admin → Manage Users, add: "Changes to a user's name, email, ID number, department, or section are made by an administrator."
7. **ERD Layer 1 (Figure 2.13):** USERS gains `contact_number` and `avatar_path` (photo stored in a private storage bucket).
8. **Data Privacy (Ch. 1) and the consent form (evaluation tool, item 2 or a new item):** "Profile photos are optional, stored privately, visible only to the account owner, and can be removed at any time."
9. **Password rules (B5):** First Login and Forgot/Reset wording as given in §B5.
10. **Enrollment Requests (optional, 2026-10-10):** add *"The instructor is notified of new requests, and the student is notified of the decision."* The request/decision notifications were approved by the owner as a new feature outside the original documented flow.
11. **Class roster notice (optional, 2026-10-10):** in the Faculty Portal (My Class Records), add *"Faculty are notified of the number of students added to their classes through section enrollment."* Approved by the owner as a new feature.

---

## Action Checklist

> **Paper text applied as tracked changes (2026-10-10):** 35 edits, author "Claude (Audit 2026-10-10)", in `C:\Users\JC Gabriel\Downloads\ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-10.docx`. The original file is unchanged. Review in Word (Review → Track Changes) and accept or reject each edit. The edits cover:
> - **B2, B3, B4, B5, B6:** SG correction proposal; Grace Pass and the 2025–2026 handbook citation; published-only plans; password rules and optional sign-out; CSV/Excel import.
> - **C1–C3 text:** the Layer 1/3/4/5 ERD descriptions.
> - **D1, D2:** Evaluate Students roster, the Academic Intervention Form, and the new Evaluated Students bullet.
> - **D4:** the delivery channels added to Table 2.10.
> - **I1–I9:** acknowledgment, verification, follow-up, baseline freeze, Account Module wording, and the photo privacy line.
>
> **Figures redrawn (2026-10-10):** 14 figures replaced as tracked changes (old image deleted, new image inserted) in the same TRACKED copy:
> - Flowcharts 2.2–2.5
> - Level 0 DFD 2.7 and Level 1 DFDs 2.8–2.11
> - VTOC 2.12
> - ERD Layers 3–5 (2.15–2.17)
> - UI wireframe 2.18
>
> Sources are in `docs/02-thesis/figures/`. Most are Mermaid `*.mmd`, rendered with the same grayscale ELK style as the originals. Figure 2.7 is generated by `make_figure_2_7.py` as a hand-laid context diagram:
> - the system is centred, with external entities around it
> - each entity has separate "to ASPIRE" and "from ASPIRE" arrows
> - a legend explains the notation
>
> Figure 2.3 was re-laid into two rows of modules, with shorter decision steps, so it prints at a larger text size. The new figures:
> - use the UI labels (AI Study Tutor, Preview & Post Grades, My Class Records, Evaluate / Evaluated Students, Performance Reports, Import Users (CSV/Excel), separate Sections and Departments & Programs)
> - show acknowledgment, task verify/return, the one-time follow-up, and the SG correction proposal and matching repost (D13 `unlock_requests` removed)
> - add the new stores: D28 guardians, D29 notification_preferences, D30 avatars (private storage), D31 student_evaluation_referrals, D32 faculty_intervention_drafts, D33 faculty_intervention_working_drafts, D34 grade_correction_history
> - add a Manage Account process to each Level 1 DFD
>
> The Figure 2.8 text now says "nine processes" and describes account management.
>
> **Unchanged on purpose:** 1.1 (conceptual framework), 2.1 (SDLC), 2.6 (existing manual system), 2.13 ERD Layer 1 (entity-only ERD; the new USERS columns are not drawn), and 2.14 ERD Layer 2 (no schema change).
>
> **Figures 2.9 and 2.11, revised layout (2026-10-10):**
> - Both are now two-column composites (`*-A.mmd` / `*-B.mmd` joined by `compose_columns.py`), so they are no longer tall, narrow strips.
> - **Figure 2.9** gained two processes the Scope lists but the DFD lacked: **6.0 Manage Classes** (class_records, D35 class_room_join_codes, D36 class_join_requests, enrollments) and **11.0 Generate Performance Reports**. It now has 13 processes in menu order and prints about 8% larger than before. The paper's Figure 2.9 paragraph gained one sentence describing the two processes.
> - **Figure 2.11** content is unchanged. It is now half a page tall and prints about 13% smaller than the single-column version.
>
> **Not changed in the paper:**
> 1. **Figures:** see above.
> 2. **D5 menu labels (done 2026-10-10):** The paper now uses the UI labels, as tracked edits:
>    - "My Class Records"
>    - "Preview & Post Grades"
>    - "Performance Reports Module" (Faculty)
>    - separate "Sections" and "Departments & Programs" bullets
>
>    Faculty inclusion criterion (b) now names the current screens. In the code, the sidebar now reads "Import Users (CSV/Excel)".
>
> **Feature name unified to "AI Study Tutor" (2026-10-10):**
> - **Paper:** 15 tracked edits in the same TRACKED copy. Chapter 1 defines it once ("Performance Advising is provided through the AI Study Tutor, ASPIRE's AI academic advising module…"), and every reference to the feature by name was renamed. Generic research wording ("AI advising", "AI advisory service/logs") is unchanged, so the title and literature still support "Performance Advising".
> - **App:** the sidebar, the AI Study Tutor page title, Dashboard text, inbox buttons, the Ask ASPIRE panel subtitle, the insight notification title, and the activity-metadata hint in Log Class Scores all say "AI Study Tutor". "Ask ASPIRE" stays as the chat inside it.
> - **Evaluation tool:** End-User items 3.2 and 7.3, the phasing guide (Phases 3 and 4), and consent item 6 (`.md` and `.docx`). Generic "advisory" wording in the Expert questionnaire is unchanged.
> 3. **The System Testing sentence** "Integration testing verified … the end-to-end HITL pipeline": this is accurate only after the end-to-end test is run.
> 4. **RLS and AI model wording,** per this audit's notes.

**Code: must fix before Hypothesis 2 verification** (implemented in the working tree 2026-10-10; not live)
- [x] A1: Capture and freeze `followup_snapshot`
- [x] A2: Add risk-transition and task-completion columns to Intervention Results and its export; remove the `|| 3.0` fallback
- [x] A3: Add faculty task verification
- [x] Added: per-plan student acknowledgment; baseline freeze on published evaluations
- [x] Apply migration `20261010120000_intervention_followup_and_task_verification.sql` (applied 2026-10-10 after fixing a PL/pgSQL `IF … CASE … THEN` parse error)
- [x] Apply migration `20261010130000_profile_contact_and_photo.sql` (applied 2026-10-10; creates the private `avatars` bucket and its policies)
- [ ] Apply migration `20261010140000_followup_requires_task_review.sql` (fix: a follow-up cannot close a plan while a student-reported task is unreviewed; the student badge now counts verified tasks)
- [ ] Run the full flow once with demo accounts: evaluate → acknowledge → report task → verify/return → post MR → record follow-up → Dean Intervention Results
- [ ] Execute the combined test runbook `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`. It covers the remediation cases and every 2026-10-10 update; RLS-dependent cases are deferred.

**Evaluation tool**
- [x] H1–H4: Wording changes applied to both `.md` and `.docx`; phasing guide and consent `.docx` rebuilt from their `.md` (2026-10-10)
- [ ] Open each `.docx` in Word once to check layout before printing
- [ ] H5: Once the code is final, run Phase 1 expert validation on the updated instruments, then the pilot (evaluation not yet started, so no rework)

**Paper: new behavior**
- [x] I1–I5: Acknowledgment, task verification, follow-up recording, baseline freeze, ERD Layer 4 attributes (tracked changes)

**Code or paper: pick one per item**
- [x] B3: Decided to keep Grace Pass (handbook-based). Paper: cite the DYCI Student Handbook 2025–2026 (also replace "(n.d.)" in References)
- [x] B4: Decided on hidden. Paper: reword the Advisories & Study Plans and Proposed System for the Student text
- [x] B5: Optional sign-out of other sessions on reset; 8+ character password rule with upper, lower, number, and symbol enforced in all three screens and local config

**Paper only**
- [x] B2: SG correction description rewritten (tracked changes)
- [x] B6: CSV or Excel; sections and subjects import (tracked changes)
- [x] C1–C3 (text): Layer 3/4/5 ERD descriptions, including the referral relationship (tracked changes)
- [x] C1–C3 (figures): ERD Figures 2.15–2.17 redrawn (2.13 unchanged: entity-only ERD)
- [x] D1 (text): "At-Risk Students" renamed "Evaluate Students" in the Scope (tracked changes); the VTOC and Figure 2.9 still need redrawing
- [x] D2: "Evaluated Students" bullet added (tracked changes)
- [x] D4 (partial): Email and device channels and working drafts described (tracked changes)
- [x] D5: Feature name unified to "AI Study Tutor" across paper (tracked), app, and evaluation tool
- [x] D5: Menu labels aligned (paper follows the UI; sidebar "Import Users (CSV/Excel)")
- [ ] D4 (optional): Notifications inbox and PWA install lines
- [x] Figures: flowcharts, DFDs, VTOC, ERDs, and wireframe redrawn with current labels including "AI Study Tutor" (tracked)
- [x] Redraw the VTOC (Figure 2.12), the DFDs (Figures 2.7–2.11), the ERDs (Figures 2.15–2.17), flowcharts 2.2–2.5, and wireframe 2.18 (tracked)

**Code or paper: Account module**
- [x] D3a: Notification preferences now saved and enforced (device alerts and email; in-app always on)
- [x] D3b: Option C approved and implemented: self-service contact number and optional profile photo; identity fields stay admin-managed
- [x] D3b: Placeholder-ID fallback left unchanged (every user is created with an ID; user decision)
- [ ] D3b: Test photo upload on the Android app
- [x] I6–I9: Account Module, ERD Layer 1, photo privacy line, and password rules (tracked changes)

**Code cleanup**
- [x] E1: Class-wide unlock path and `localStorage` mirroring removed; admin audit now counts pending SG corrections
- [ ] C4 (optional): Drop unused legacy tables
