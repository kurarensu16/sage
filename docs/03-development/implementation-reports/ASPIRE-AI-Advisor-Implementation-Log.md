# ASPIRE AI Academic Advisor — Living Implementation Log

**Started:** September 25, 2026  
**Source plan:** [ASPIRE AI Academic Advisor Plan](../../archive/completed-plans/ASPIRE-AI-Academic-Advisor-Plan.md)  
**Engineering review:** [ASPIRE AI Academic Advisor Recommendations](../../archive/completed-plans/ASPIRE-AI-Academic-Advisor-Recommendations.md)  
**Update rule:** This is the single implementation record. Update it whenever an advisor feature is completed or its delivery status changes.

---

## Delivery Status

| ID | Feature | Status | Completed |
|---|---|---|---|
| F-001 | Faculty-controlled activity release | Schema deployed; application implemented | September 25, 2026 |
| F-002 | Deterministic advising engine | Implemented locally | September 25, 2026 |
| F-003 | Advisor workspace decomposition | Implemented locally | September 25, 2026 |
| F-004 | Ask ASPIRE server-side execution | Deployed; authenticated UI smoke test pending | September 26, 2026 |
| F-005 | Closed-loop outcome tracking | Planned | — |
| SR-001 | Student private-note exposure containment | Deployed | September 26, 2026 |
| SR-002 | Restricted risk notes and RLS boundary | Deployed | September 26, 2026 |

## Fixed Product Contract

1. Draft activity configurations and scores are faculty-private.
2. A student can see an activity result only after the faculty member explicitly releases its activity column.
3. Released activities may support early study guidance but must not be presented as an unofficial term grade.
4. Official student term grades remain the institutionally posted Midterm and Final milestones.
5. Deterministic code owns calculations, thresholds, and risk classification. AI may explain evidence and recommend actions but may not alter academic records.
6. A failed or unavailable AI provider must not remove deterministic action items.

## F-001 — Faculty-Controlled Activity Release

### Goal

Create the trusted data boundary required for proactive advising: faculty decide when an activity becomes student-visible, and Academic Insights consumes only released activities.

### Implementation Decisions

- Release is stored on `class_activities`, not duplicated per student score. A faculty action releases the assessment column to the whole enrolled class.
- New activities default to `Draft`.
- An activity cannot be released until at least one student score row exists.
- `topic_tag` is optional and supplements the required activity description when grouping related weak results.
- `released_at` and `released_by` provide an auditable release event.
- The current project-wide development RLS posture is preserved. Production RLS is a separate security feature and must not be partially introduced here.

### Database Migration

Migration: `supabase/migrations/20260925090000_add_activity_release_controls.sql`

Added to `class_activities`:

- `is_released BOOLEAN NOT NULL DEFAULT FALSE`
- `topic_tag VARCHAR(100)`
- `released_at TIMESTAMPTZ`
- `released_by UUID`
- Composite release lookup index for class, term, visibility, and creation order

### Engineering Corrections Applied

The recommendation SQL was not copied verbatim because the actual repository schema differs:

- `class_records` uses `class_record_id`, not `id`.
- Runtime migrations use `users(user_id)` for student and faculty identities.
- Grading tables currently follow a development policy with RLS disabled.
- Release belongs to the activity column, so a second per-score release flag would create conflicting sources of truth.

### Completion Checklist

- [x] Corrected additive database migration created.
- [x] New faculty activities are always created as Draft.
- [x] Faculty can change an existing scored activity between Draft and Released.
- [x] Release is blocked until at least one score row exists.
- [x] Faculty grade headers show Draft/Released status.
- [x] Existing release metadata loads into the faculty gradebook.
- [x] Student Academic Insights requests released activities only.
- [x] Production build succeeds.
- [x] Feature status and validation evidence recorded below.

### Files Changed

- `supabase/migrations/20260925090000_add_activity_release_controls.sql`
- `src/pages/faculty/ScoreInput.jsx`
- `src/pages/student/AcademicInsights.jsx`
- `docs/03-development/implementation-reports/ASPIRE-AI-Advisor-Implementation-Log.md`

### Validation Evidence

- `npm run build` passed on September 25, 2026: 1,890 modules transformed and the production bundle completed successfully.
- Targeted ESLint passed with zero errors. It reported three existing warnings in `ScoreInput.jsx`: two unused catch parameters and one pre-existing hook dependency warning.
- `git diff --check` reported no whitespace errors in the implementation files.
- Static data-flow verification confirms the student query includes `.eq('is_released', true)`.
- Static workflow verification confirms new activities force `is_released: false` and first release checks `student_activity_scores` for recorded rows.

### Deployment Record

The additive release schema was applied to linked Supabase project `ettnwknyhdhehoclrwwh` on September 25, 2026 using a single-file linked database query. Verification against `information_schema.columns` confirmed:

- `is_released BOOLEAN NOT NULL DEFAULT FALSE`
- `released_at TIMESTAMPTZ`
- `released_by UUID`
- `topic_tag VARCHAR`

A normal migration push was intentionally not used because nine unrelated repository migrations are absent from the remote migration history. Applying only the advisor SQL prevented those unrelated migrations from being deployed implicitly. The advisor migration remains idempotent and may safely be encountered later when the migration history is reconciled.

Immediately after deployment, the database contained 21 activities: 21 Draft and 0 Released. Existing records correctly inherited the safe default and require an explicit faculty release decision. An authenticated Draft-to-Released role test remains required.

## F-002 — Deterministic Advising Engine

### Goal

Turn trusted academic evidence into bounded, explainable student guidance before the grading period ends. The engine must recognize activity evidence without presenting it as an unofficial term grade.

### Files Changed

- `src/lib/advisingEngine.js`
- `src/pages/student/AcademicInsights.jsx`
- `docs/03-development/implementation-reports/ASPIRE-AI-Advisor-Implementation-Log.md`

### Implemented Rules

The engine evaluates signals in this priority order:

1. Four or more absences: critical FDA-threshold consultation signal.
2. Three absences: high-priority prevention signal.
3. Official cumulative GWA above `3.00`: critical official-grade recovery signal.
4. Two related released activities below `75%`: actionable course concern.
5. One released activity below `75%`: evidence-building state, not a trend classification.
6. Released scored activities without a repeated weak pattern: monitoring/on-track state.
7. No released scored activity: waiting-for-evidence state.

Related activities are grouped within the same term using `topic_tag` when available. Without a topic tag, ASPIRE falls back to an inferred assessment category such as quiz, laboratory, assignment, project, recitation, or general formative activity.

### Recommendation Contract

Every deterministic result returns:

- state and severity
- signal type
- evidence-based headline and summary
- evidence items
- focus topics
- one to three bounded actions
- review trigger
- faculty-consultation recommendation
- institutional boundary statement

### Student Interface Corrections

- Removed the official-grade-only gate from proactive guidance.
- One weak released result now displays **ASPIRE is building your academic evidence**.
- Two related weak released results now display a focused course concern and three-step action plan.
- Draft and unreleased activities remain excluded by the student query.
- The What-If Grade Simulator is locked until an official Midterm milestone exists.
- Removed premature honors and target-grade claims when no official grade exists.
- Replaced the generic three-pillar prescription with the deterministic **ASPIRE Action Plan**.
- Corrected the low class-standing state from misleading `Moderate`/positive language to `Needs Attention`.
- Zero-percent scored evidence is now distinguished from missing evidence.
- Enrolled units are calculated from enrolled courses instead of only courses with posted grades.
- The Ask ASPIRE context now receives the authoritative deterministic signal and action plan.

### Validation Evidence

- Targeted ESLint completed with zero errors and zero warnings for `advisingEngine.js` and `AcademicInsights.jsx`.
- Production build completed successfully: 1,891 modules transformed.
- Deterministic scenario checks passed for:
  - no evidence
  - zero-percent evidence
  - one weak result
  - two related weak results
  - two unrelated weak results
  - on-track results
  - FDA attendance threshold
  - official nonpassing grade priority
- `git diff --check` reported no whitespace errors in the implementation files.
- Obsolete interface copy such as `Awaiting Official Midterm or Final Grades`, generic honors recovery claims, and the former `3-Pillar` prescription was removed.

### Expected Result for the September 25 Screenshot

If the changed faculty activity is released and it is the only below-75% result, the student receives an evidence-building card identifying that activity and one early-review action. It does not calculate a term grade. A second related released result below 75% promotes the card to an actionable concern with a focused three-step plan.

### Hotfix — Student Advisor White Screen

**Date:** September 25, 2026  
**Symptom:** Opening `/student/academic-insights` produced a blank page and the browser console reported `TypeError: Illegal constructor` in the `<Lock>` component.  
**Cause:** The locked What-If state rendered `<Lock>` without importing the Lucide component. The identifier resolved to the browser's native Web Locks constructor, which cannot be constructed as a React component.  
**Resolution:** Added `Lock` to the `lucide-react` imports in `AcademicInsights.jsx`.  
**Verification:** Targeted ESLint passed with zero errors and the production build completed successfully with 1,891 modules transformed.

## F-003 — Advisor Workspace Decomposition

### Goal

Turn the Academic Advisor from a dense grade-analytics dashboard into a focused advising workspace that tells a student what needs attention, what to do next, and when the evidence will be reviewed again.

### Product Decisions Recorded

The engineering recommendations now explicitly define the following disposition:

- Remove the permanent Component Strength & Weakness grid from the rendered Advisor experience. Relevant evidence appears with the current recommendation and under My Courses.
- Remove the What-If Grade Simulator from the rendered Advisor experience. Its planned destination is Score Breakdown / Grade Planning, gated by an official Midterm Rating.
- Replace the fixed three-pillar prescription with one to three evidence-bound actions.
- Keep consultation as a contextual escalation workflow rather than a primary Advisor tab.
- Use three workspaces: Today, My Courses, and My Progress. Ask ASPIRE remains a contextual drawer.

### Student Experience Implemented

- **Today** shows the official milestone summary, the authoritative deterministic advisory, its supporting evidence, and a checkable one-to-three-item action plan.
- **My Courses** shows faculty-released activity evidence even before an official Midterm or Final milestone is posted.
- Official milestone selection in My Courses is limited to Midterm Rating and Semestral Grade.
- **My Progress** shows completed actions, released evidence count, the current advisor state, and the next review trigger.
- Action completion persists in browser storage per signed-in student and per recommendation signal/course.
- The Request Consultation header action and Ask ASPIRE escalation remain available without occupying an Advisor navigation tab.

### Ask ASPIRE Grounding Hotfix

The advisor drawer previously exposed a hidden faculty risk classification while the visible page said no evidence existed. This produced contradictory messages such as “No Grades Posted Yet” and “high risk” in the same interaction.

The fix makes the deterministic advisor result authoritative for conversation responses:

- `no_evidence`, `no_enrollment`, and `building_evidence` states use bounded local responses.
- Overall no-evidence context no longer forwards hidden course risk scores or risk labels.
- The model prompt may explain only visible evidence and may not override the deterministic state.
- The drawer welcome message uses the same headline displayed on Today.

### Files Changed

- `docs/archive/completed-plans/ASPIRE-AI-Academic-Advisor-Recommendations.md`
- `docs/03-development/implementation-reports/ASPIRE-AI-Advisor-Implementation-Log.md`
- `src/pages/student/AcademicInsights.jsx`
- `src/components/student/AskAspirePanel.jsx`
- `src/lib/openrouter.js`

### Validation Evidence

- Targeted ESLint passed with zero errors and zero warnings for `AcademicInsights.jsx`, `AskAspirePanel.jsx`, and `openrouter.js`.
- Production build passed on September 25, 2026: 1,891 modules transformed.
- Deterministic Ask ASPIRE checks for `hello`, `why`, and `what?` in a no-evidence context produced no hidden risk label, risk score, or “marked as” claim.
- `git diff --check` reported no implementation whitespace errors; repository-wide output contained only existing LF-to-CRLF notices.

### Known Delivery Boundary

Action completion currently persists in the student's browser only. Database-backed action plans and before/after outcome deltas remain part of F-005.

## F-004 — Secure Ask ASPIRE Server Execution

### Goal

Remove the OpenRouter credential and provider call from the browser while ensuring generated explanations cannot override ASPIRE's deterministic academic evidence, grading rules, or institutional risk engine.

### Architecture Implemented

- Added the authenticated Supabase Edge Function `invoke-advisor` for both official-milestone explanations and Ask ASPIRE follow-up questions.
- Replaced direct browser-to-OpenRouter requests with `supabase.functions.invoke('invoke-advisor')`.
- Stored `OPENROUTER_API_KEY` as a server-only Supabase project secret.
- Restricted function access to authenticated profiles whose role is `student`.
- Added a 48 KB request limit and per-user in-memory request throttling.
- Sanitized context, chat history, evidence, activities, and actions before provider submission.
- Excluded hidden faculty risk-evaluation objects from the server prompt. Only the visible evidence list and deterministic advising result are forwarded.

### Structured Response Contract

The provider must return JSON containing:

- `message`
- zero to three `actions`
- `consultation_recommended`
- the exact institutional boundary statement

The Edge Function parses and validates this object before returning it. Invalid, empty, or boundary-violating provider output is rejected rather than displayed.

### Defense-Guide Alignment

- The AI does not calculate grades, risk scores, risk tiers, FDA decisions, or scholarship eligibility.
- Unencoded future terms are treated as missing rather than zero.
- Absences do not deduct grade points.
- Four or more absences may support an FDA recommendation, but the official FDA decision remains with faculty.
- Institutional risk computation remains outside the model and authoritative in `src/lib/riskEngine.js`.

### Fallback Behavior

- `no_evidence`, `no_enrollment`, and `building_evidence` questions continue to use deterministic local responses without contacting the provider.
- Provider, network, or schema-validation failure returns the deterministic advisor summary and first supported action instead of removing guidance from the student.
- Official-milestone explanation failures leave the deterministic page content intact.

### Files Changed

- `src/lib/openrouter.js`
- `supabase/functions/invoke-advisor/index.ts`
- `supabase/config.toml`
- `docs/archive/completed-plans/ASPIRE-AI-Academic-Advisor-Recommendations.md`
- `docs/03-development/implementation-reports/ASPIRE-AI-Advisor-Implementation-Log.md`

### Deployment Record

- Deployed `invoke-advisor` to Supabase project `ettnwknyhdhehoclrwwh` on September 26, 2026.
- Added the server-only `OPENROUTER_API_KEY` project secret without logging its value.
- Confirmed the deployed function rejects an anonymous/anon-key request with HTTP `401`.

### Validation Evidence

- No `VITE_OPENROUTER_API_KEY`, browser Authorization header, or direct `openrouter.ai` request remains under `src/`.
- Targeted ESLint passed with zero errors and zero warnings for `openrouter.js`, `AskAspirePanel.jsx`, and `AcademicInsights.jsx`.
- Production build passed: 1,893 modules transformed.
- Existing deterministic no-evidence responses remain covered by the earlier F-003 scenario checks.

### Remaining Deployment Check

Authenticated faculty and student sessions were verified on September 28, 2026. Caleb Tolentino currently has no released activity or official milestone evidence, so Ask ASPIRE correctly uses its bounded local response and does not call the provider. A real authenticated provider response still requires a student context with permitted released evidence; do not release class data solely to manufacture this test condition.

## SR-001/SR-002 — Privacy-Safe Student Risk Notes

### Goal

Contain the existing exposure of faculty-only observations, separate restricted notes from student-visible academic guidance, and enforce the separation at the database boundary under the Philippine Data Privacy Act of 2012 (RA 10173).

### Application Changes

- Removed `professor_notes` from all student page queries, rendering, and Ask ASPIRE context.
- Added `shared_academic_feedback` as the only faculty narrative intended for students and AI-supported explanation.
- Removed the larger risk-evaluation object from the browser-to-advisor payload; the deployed Edge Function now sanitizes and forwards only the explicitly shared academic feedback.
- Split the faculty evaluation form into:
  - **Restricted Faculty Observation**, visible only to authorized faculty and the student's department dean.
  - **Student-Visible Academic Guidance**, published to the Advising Inbox and permitted in Ask ASPIRE context.
- Replaced the faculty's direct evaluation-table upsert with transactional RPC `submit_student_risk_evaluation`.
- Replaced the student's whole-JSON evaluation update with temporary narrow RPC `set_legacy_advising_task_completion` until normalized intervention tasks are delivered.
- Replaced the dean's direct evaluation-row update with narrow RPC `review_student_risk_evaluation`.
- Updated dean views to read restricted observations through `student_risk_private_notes` rather than the legacy student-readable column.

### Database Changes

Migrations:

- `supabase/migrations/20260926120000_secure_student_risk_notes.sql`
- `supabase/migrations/20260926123000_harden_risk_evaluation_grants.sql`

The deployed schema now:

- stores private observations in `student_risk_private_notes`;
- stores student-visible narrative in `student_risk_evaluations.shared_academic_feedback`;
- records publication actor and timestamp;
- enables RLS on evaluations and private notes;
- permits student evaluation reads only for the authenticated student's published records;
- permits faculty reads only for assigned evaluations;
- permits dean/private-note reads only within the dean's department;
- provides an explicit administrative read policy;
- revokes direct client mutation privileges and uses actor-validating RPCs;
- fixes each security-definer function to `search_path = public, pg_temp`;
- removes all anonymous table privileges and leaves authenticated clients with `SELECT` only.

### Legacy-Data Migration

The migration treats every existing `professor_notes` value as private by default:

1. Copy the note into the restricted table.
2. Verify that an identical restricted record exists for every non-empty legacy note.
3. Abort the transaction if verification fails.
4. Clear the legacy column only after verification succeeds.
5. Retain the nullable legacy column temporarily for rollback compatibility; remove it in a later verified cleanup migration.

Live verification after deployment reported:

- 1 student risk evaluation;
- 1 restricted note after backfill;
- 0 uncleared values in the legacy `professor_notes` column;
- RLS enabled on both risk tables;
- 4 role-specific evaluation SELECT policies and 3 restricted-note SELECT policies;
- only authenticated `SELECT` remains as a direct client table privilege;
- only authenticated callers have execute permission on the three scoped RPCs.

### Validation Evidence

- Repository-wide ESLint passed with zero errors.
- Production build passed on September 26, 2026: 1,893 modules transformed.
- `git diff --check` reported no whitespace errors in the implementation files.
- Static search found no `professor_notes` or `professorNotes` reference under `src/` or the advisor Edge Function.
- The updated `invoke-advisor` sanitizer was deployed to linked Supabase project `ettnwknyhdhehoclrwwh` after the privacy separation.
- Anonymous API verification returned zero visible evaluations and `permission denied` for the restricted-note table.
- Linked migrations `20260926120000` and `20260926123000` were applied individually and recorded as applied. A broad migration push was intentionally avoided because unrelated historical migrations remain absent from the remote migration ledger.

### Remaining Role-Session Check

Faculty and student authentication, role routing, the split evaluation form, student inbox isolation, Advisor evidence isolation, and the student denial on `student_risk_private_notes` were verified on September 28, 2026. The existing Caleb Tolentino intervention record was not overwritten merely to manufacture test data. The remaining walkthrough requires a dean session and a naturally created or explicitly approved new evaluation:

1. Faculty submits both a restricted observation and student-visible guidance without overwriting an unrelated active record.
2. Student sees only the shared guidance and assigned tasks.
3. Ask ASPIRE receives only the shared guidance when permitted released evidence exists.
4. The assigned faculty and department dean can read the restricted observation.

### Hotfix — Internal Risk Classification Removed from Student Advisor

**Date:** September 28, 2026  
**Symptom:** The course-scoped Ask ASPIRE drawer displayed the faculty-only risk tier and score even when the student-visible Advisor correctly reported that no released academic evidence was available.  
**Cause:** `AcademicInsights.jsx` still selected `risk_level`, `risk_score`, and `risk_breakdown` from the student-readable evaluation row and appended the tier and score to Ask ASPIRE's evidence list. The course workspace also retained a legacy risk-score badge.  
**Resolution:**

- Removed internal risk fields from student page projections.
- Removed the risk tier and score from the Ask ASPIRE evidence contract and course workspace.
- Renamed the student card to **Faculty Academic Guidance & Recovery Plan**.
- Removed unused risk fields from the Faculty Advising Inbox query.
- Added Edge Function defense-in-depth filtering for evidence labels that identify internal risk, classification, tier, faculty-only, or restricted data.

**Verification:**

- Targeted ESLint passed with zero errors and zero warnings.
- Production build passed with 1,893 modules transformed.
- Authenticated student browser verification confirmed that the rebuilt course-scoped drawer contains no faculty risk label, tier, or score.
- The no-evidence question **Why was this identified?** returned the bounded local explanation and did not make a risk conclusion from hidden records.
- The hardened `invoke-advisor` bundle was deployed to Supabase project `ettnwknyhdhehoclrwwh` on September 28, 2026.
- A count-only query executed from Caleb Tolentino's authenticated student session was denied access to `student_risk_private_notes` and returned zero rows. The temporary probe requested no note contents and was removed immediately after verification.

## Next Feature

SR-003 will replace the temporary JSON advising plan with normalized intervention tasks and the full Assigned → In Progress → Overdue / Pending Faculty Review → Revision Required → Completed workflow. F-005 outcome tracking will then consume those durable task records.
