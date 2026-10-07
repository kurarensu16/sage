# ASPIRE Role Connection and RLS Hardening Guide

**Prepared:** October 7, 2026  
**Purpose:** Explain the role-connection audit findings and provide a safe plan for database hardening after functional testing.  
**Scope:** Documentation only. This guide does not apply SQL or change application behavior.

## Regrouped hardening plan

The work is divided into three related but independent security layers. All three are required because none of them is sufficient alone.

| Workstream | Main question | Primary implementation | What it prevents |
|---|---|---|---|
| **A. RLS** | Which rows is this signed-in user allowed to access? | Enable RLS and create role/relationship-aware policies | Reading or modifying rows outside the user's scope |
| **B. Database privileges** | Which operations may browser roles attempt on this table at all? | Revoke broad grants and grant only required operations | Anonymous writes and unnecessary delete/update capability |
| **C. Ownership validation** | Does this specific record belong to the actor's Student account, assigned class, or department? | Policies plus validated transactional RPCs using `auth.uid()` | Forged IDs, cross-class actions, and cross-department approvals |

### Shared identity rule

Every protected operation must begin with the authenticated database identity:

```text
auth.uid()
  -> public.users.user_id
  -> active account and supported role
  -> Student ownership, Faculty assignment, Dean department, or Admin authority
  -> requested resource
```

The client may submit the ID of the target resource, such as a class, evaluation, consultation, or request. It must not be trusted to declare the actor's role, Student identity, Faculty identity, or department. The database derives those values from `auth.uid()`.

### Workstream A — RLS

#### Objective

Enable row-level enforcement so direct Supabase API calls receive no more access than the visible interface.

#### Table groups

1. **Student-private data**
   - `student_academic_insights`
   - `student_consultation_requests`
   - Student-specific grades and attendance
   - advising and intervention records
2. **Faculty-owned academic data**
   - class activities and grading columns
   - component and activity scores
   - grade computations and posted grades
   - attendance records and class enrollment views
3. **Dean-controlled workflow data**
   - grade unlock requests
   - remark override requests
   - department referrals and review records
4. **Administrative and audit data**
   - users and institutional configuration
   - activity logs

#### Deliverables

- A migration enabling RLS for each table group.
- Explicit policies for every permitted role and operation.
- No policy means no access; avoid catch-all authenticated policies.
- Automated SQL checks for both allowed and forbidden cases.

### Workstream B — Database privileges

#### Objective

Reduce the operations available before RLS policies are evaluated.

#### Required changes

- Revoke academic and personal-data writes from `anon`.
- Revoke `DELETE` from `authenticated` where deletion is not a supported feature.
- Revoke direct `UPDATE` and `DELETE` on the authoritative audit ledger.
- Grant browser clients only the operations needed by approved pages.
- Keep `service_role` use inside trusted Edge Functions or controlled server jobs.
- Grant `EXECUTE` only on approved RPCs, and revoke execution on internal helper functions when appropriate.

#### Important distinction

Privileges and RLS are cumulative safeguards. A user needs the table privilege and must also satisfy the RLS policy. Revoking an unnecessary privilege provides protection even if a later policy is accidentally too broad.

### Workstream C — Ownership validation

#### Objective

Validate the actor-to-resource relationship for every sensitive action.

#### Ownership rules

| Actor | Required relationship |
|---|---|
| Student | `target.student_id = auth.uid()` and any referenced class has an active enrollment for that Student |
| Faculty | Target class is active and `class_records.faculty_id = auth.uid()` |
| Dean | Dean is active and the target Subject/Class department equals the Dean profile department |
| Admin | Admin is active; the operation is explicitly authorized and audited |

#### Actions that should use transactional RPCs

- Grade posting and null-to-zero confirmation
- Consultation creation, cancellation, and resolution
- Grade unlock approval or rejection
- Remark override approval or rejection
- Student-risk evaluation submission and Dean review
- Referral creation and resolution
- AI insight or intervention-draft persistence

Each RPC should authenticate the actor, validate ownership, validate the state transition, perform all related writes, create notifications, create an audit event, and roll back the entire transaction on failure.

### Module regrouping

| Module | RLS | Privileges | Ownership/RPC | Frontend follow-up |
|---|---|---|---|---|
| Grading and posting | Required | Remove anonymous writes; limit deletes | Faculty assigned-class validation and atomic posting RPC | Replace direct posting writes with RPC call |
| Academic Insights | Required | Student read only; trusted writer | Student identity derived from JWT; Edge Function saves authoritative output | Stop trusting client-supplied identity/context |
| Consultations | Required | Remove anonymous writes; limit direct updates | Student enrollment and Faculty assignment RPCs | Remove cached-local success behavior |
| Unlock requests | Required | Limit writes to workflow functions | Faculty ownership and Dean department validation | Call approve/reject RPCs |
| Remark overrides | Tighten existing RLS | Remove broad update rights | Department-scoped transactional approval | Replace separate client updates |
| Attendance | Tighten existing RLS | Limit writes | Faculty assigned-class validation | Use scoped operations/RPC where necessary |
| Risk evaluation/referrals | Mostly implemented | Retain restricted grants | Existing secured RPC pattern | Regression testing only |
| Audit ledger | Required | Revoke client update/delete | Server/trigger-authoritative inserts | Distinguish official audit from UI telemetry |
| Admin user management | Edge authorization | Service role only | Require active Admin and safe transaction/compensation | Improve errors and remove retired Office choices |

### Regrouped delivery sequence

#### Stage 0 — Preparation

- Freeze the supported roles as Admin, Dean, Faculty, and Student.
- Build the table/operation permission matrix.
- Prepare test identities across two departments and multiple classes.
- Back up the development database before changing grants or policies.

#### Stage 1 — Privilege baseline

- Remove `anon` writes first.
- Remove unsupported delete/update privileges.
- Confirm login and public pages still work.

#### Stage 2 — Student isolation

- Secure Academic Insights, consultations, personal grades, attendance, and advising data.
- Verify that one Student cannot access another Student's rows.

#### Stage 3 — Faculty ownership

- Secure class records, enrollments, score sheets, activities, attendance writes, and posting.
- Add or update transactional Faculty RPCs.
- Verify cross-Faculty access is denied.

#### Stage 4 — Dean department scope

- Secure unlocks, overrides, referrals, and department reports.
- Move multi-table approvals to RPCs.
- Verify cross-department actions are denied.

#### Stage 5 — Admin and audit hardening

- Require active Admin status in privileged Edge Functions.
- Protect the audit ledger.
- Remove remaining Office-role values and permissions.

#### Stage 6 — End-to-end verification

- Test every allowed action through the interface.
- Test every denied action through direct Supabase requests.
- Verify rollback behavior, audit records, notifications, and user-facing errors.
- Enable the policies in production only after the same migration set passes staging.

## Feature-by-feature smooth-transition protocol

Hardening must be delivered as a sequence of small feature packages. A package must include both the database protection and the corresponding codebase audit. No policy should be activated merely because the SQL is syntactically correct.

### Transition unit

Each implementation unit should cover one complete business feature, for example:

- consultations;
- Academic Insights;
- attendance;
- score-sheet drafts;
- grade posting;
- unlock requests;
- remark overrides;
- risk evaluation and referrals;
- notifications;
- audit logging;
- user administration.

Do not group unrelated features into one migration. If a package fails, it should be possible to isolate or roll back that feature without disabling the protection already completed for other modules.

### Mandatory package contents

Every feature-hardening package must contain:

1. **Feature inventory** — all pages, components, hooks, services, Edge Functions, RPCs, tables, views, triggers, and storage behavior used by the feature.
2. **Role map** — the exact actions allowed for Admin, Dean, Faculty, and Student.
3. **Operation inventory** — every read, insert, upsert, update, delete, and function invocation.
4. **Ownership path** — how the database proves the actor is related to the target record.
5. **Compatibility decision** — ready, query adjustment, RPC required, ownership field required, remove operation, or institutional decision required.
6. **Database package** — grants, revokes, RLS policies, RPCs, triggers, and indexes required by that feature.
7. **Code package** — only the frontend or Edge Function changes required to remain compatible with the database package.
8. **Test package** — allowed, forbidden, regression, transaction, notification, audit, and error-display cases.
9. **Deployment and rollback plan** — order of deployment, compatibility window, verification queries, and a tested recovery path.

### Per-feature audit template

Complete this matrix before implementing a feature's SQL:

| Item | Required information |
|---|---|
| Feature | Business feature being hardened |
| User roles | Roles that view or change the feature |
| Entry points | Routes, buttons, forms, scheduled jobs, and Edge Functions |
| Read paths | Queries and expected row visibility per role |
| Write paths | Inserts, upserts, updates, deletes, and RPC calls |
| Ownership source | Student self, active enrollment, Faculty assignment, Dean department, or active Admin |
| Client-supplied IDs | IDs currently sent by the browser and whether they are trusted or only treated as targets |
| Related effects | Recalculation, notification, email, audit, lock, referral, or status transition |
| Transaction boundary | Which operations must succeed or fail together |
| Current failure behavior | What the user sees and whether the UI can falsely report success |
| Future policy | RLS, privileges, RPC, and trigger behavior |
| Compatibility result | Ready or required code change |
| Test evidence | Allowed and denied cases with results |
| Rollback | Safe method for reverting the feature package |

### Required role audit for every feature

For each of the four supported roles, record all three outcomes:

- **Visible and permitted:** the user can access and complete the intended workflow.
- **Visible but read-only:** the user can inspect the approved information but cannot mutate it.
- **Not permitted:** the database rejects access even when the user bypasses the interface.

Absence of a button is not evidence that an action is prohibited. Every prohibited write must also be denied by privileges, RLS, or a secured RPC.

### Operation-level compatibility audit

Every code location using Supabase must be registered with at least these fields:

| Field | Example |
|---|---|
| Code location | `src/pages/faculty/ScoreInput.jsx` |
| Database object | `student_component_scores` |
| Operation | Upsert |
| Actor | Faculty |
| Current condition | Browser supplies class and Student IDs |
| Required ownership | Active Faculty owns class; Student is enrolled |
| RLS compatibility | Pending review |
| RPC requirement | Yes for posting; possibly no for autosaved drafts |
| Failure handling | Display database rejection and keep unsaved state |

This registry becomes the checklist used to confirm that no page or background action was missed.

### Safe deployment pattern

Use a compatibility-first sequence for each feature:

#### Gate 1 — Discover

- Trace the complete feature in the current codebase.
- Search for direct table calls and indirect service calls.
- Identify all consumers of the same tables, including dashboards and reports.
- Record current behavior before changing anything.

#### Gate 2 — Design

- Define the role and ownership matrix.
- Decide which simple operations may remain direct under RLS.
- Design RPCs for sensitive or multi-table operations.
- Specify notifications, audit events, and error handling.

#### Gate 3 — Prepare compatibility

- Add the required RPCs or compatible code paths before enforcing restrictive policies.
- Where necessary, temporarily support both the old and new call path in staging.
- Do not report local-only or partially completed operations as successful.

#### Gate 4 — Test before enforcement

- Run existing-role regression tests.
- Run direct API attempts that should be rejected after enforcement.
- Test insert and update branches of every upsert separately.
- Test empty, duplicate, stale, archived, and cross-owner cases.

#### Gate 5 — Enforce in staging

- Apply grants, revokes, RLS policies, and RPC permissions in staging.
- Repeat interface and direct-API tests.
- Confirm reports, notifications, emails, risk recalculation, and audit events still work.

#### Gate 6 — Release

- Deploy compatible code before or together with its database enforcement.
- Apply only the migration for the audited feature.
- Run a short production smoke test for every affected role.
- Monitor rejected database operations and feature-specific errors.

#### Gate 7 — Close

- Save test evidence.
- Mark every inventory entry as verified.
- Document any intentionally denied former behavior.
- Proceed to the next feature only after the current package is stable.

### Feature dependency order

Some features share tables and must be handled in a controlled order:

1. **Identity and active-role helpers** — reusable database checks based on `auth.uid()`.
2. **Class ownership and enrollment helpers** — shared by grades, attendance, consultations, evaluation, and AI context.
3. **Student-private reads** — grades, attendance, insights, and advising.
4. **Consultations** — contained workflow suitable for validating the transition method.
5. **Attendance** — Faculty ownership plus Student self-read.
6. **Grade drafts and score upserts** — test both branches of each upsert.
7. **Grade posting and recalculation** — transactional and high impact.
8. **Unlocks and remark overrides** — depends on secured grade records and Dean scope.
9. **Risk evaluation, referrals, and intervention** — regression-check already hardened paths against new shared policies.
10. **Notifications and guardian delivery** — confirm every secured workflow can still dispatch accurately.
11. **Audit ledger** — enforce authoritative, append-only recording after all event sources are inventoried.
12. **Admin user lifecycle and retired-role cleanup**.

### Definition of ready for SQL enforcement

A feature is ready for its RLS migration only when:

- every code entry point is inventoried;
- all four roles have documented expected behavior;
- each database operation has an ownership rule;
- direct writes are either policy-compatible or replaced by an RPC;
- upsert insert and update paths both pass;
- multi-table operations are transactional;
- user-visible failures are accurate;
- notifications and audit events are verified;
- forbidden direct requests are tested;
- staging passes without relying on service-role access from the browser;
- the deployment and rollback steps are documented.

If any item is missing, the feature remains in audit or compatibility work and its restrictive SQL should not be applied yet.

## 1. Confirmed system scope

ASPIRE currently has four supported roles:

- **Admin** — manages institutional data, users, configuration, and system-wide oversight.
- **Dean** — reviews department-level academic cases, referrals, grade unlocks, and overrides.
- **Faculty** — manages assigned classes, grading, attendance, consultations, and student interventions.
- **Student** — views personal academic information and performs student-owned actions.

The former **Office** role has been intentionally retired because its responsibilities were distributed between Admin and Faculty. Missing Office routes are therefore not considered a defect.

Before production release, remaining `office` values should eventually be removed from account forms, database role constraints, notification permissions, and conditional application logic. This is cleanup rather than a requirement for current functional testing.

## 2. What “RLS disabled” means

Row-Level Security (RLS) is the database layer that decides which individual rows a signed-in user may read, create, update, or delete.

The frontend can hide pages and filter queries, but those controls do not protect the database by themselves. A user can potentially call the Supabase API directly without using the visible page. When RLS is disabled, PostgreSQL evaluates table privileges but does not apply per-user or per-role ownership rules.

Example:

- The Faculty page may request only classes where `faculty_id` equals the signed-in Faculty member.
- With RLS disabled, that filter is only part of the browser request.
- A modified request could omit the filter and request another Faculty member's class.
- With RLS enabled and a correct policy, the database independently rejects or hides unauthorized rows.

Keeping RLS disabled during controlled development testing can be intentional. It should not remain disabled in production when the browser uses the Supabase anonymous key.

## 3. What “grading tables permit broad access” means

The migration for `student_term_scores` currently does both of the following:

1. Disables RLS.
2. Grants `SELECT`, `INSERT`, `UPDATE`, and `DELETE` to both `authenticated` and `anon`.

This is broader than ordinary development access. `anon` represents requests that do not contain a signed-in user session. If the remote database has this exact configuration, a caller with the public project key may be able to manipulate term-score rows directly.

Other grading tables also have RLS disabled, including core and dynamic grading tables such as:

- `grade_components`
- `class_grading_columns`
- `component_scores`
- `posted_grades`
- `student_term_scores`
- `class_activities`
- `student_activity_scores`
- `student_component_scores`
- `grade_computations`
- `grade_computation_components`

### Required ownership rules for grading

The eventual policies should enforce these rules:

| Role | Read | Create or update | Delete |
|---|---|---|---|
| Student | Own enrolled classes and own released/posted grades only | None | None |
| Faculty | Students and grading data for currently assigned classes | Only currently assigned, active classes and allowed grade state | Only permitted draft/unposted records, if institutionally allowed |
| Dean | Department-level grades needed for oversight | Prefer approval RPCs only; no unrestricted score editing | None under normal workflow |
| Admin | Institution-wide operational access | As explicitly required | As explicitly required and audited |
| Anonymous | Public reference data only | None | None |

### Recommended solution

1. Remove `anon` write grants from every academic and personal-data table.
2. Enable RLS table by table rather than enabling everything in one release.
3. Add ownership-aware `SELECT` policies first.
4. Move important multi-table writes into security-checked database RPCs.
5. Add restricted write policies only when direct client writes are genuinely necessary.
6. Test every role before enabling the next group of policies.

Grade posting should ultimately use one transactional RPC that:

- verifies the Faculty member owns the active class;
- verifies every Student is enrolled;
- confirms the grading term is valid;
- converts accepted null grades according to the approved posting rule;
- writes all affected grade records atomically;
- recalculates the current standing and risk inputs;
- locks the posted records;
- creates notifications and an audit record;
- rolls back everything if any step fails.

## 4. Academic Insights isolation

`student_academic_insights` contains student-specific academic analysis. The Student interface filters using the current Student ID, but the table does not currently have documented RLS policies.

Without isolation, a modified API request could potentially:

- read another Student's insights;
- insert fabricated insight records for another Student;
- replace or delete another Student's insight history;
- cause AI advice to use inaccurate data.

### Recommended ownership model

- **Student:** Read only rows where `student_id = auth.uid()`.
- **Faculty:** Read only for Students actively enrolled in a class currently assigned to that Faculty member, if Faculty access is required.
- **Dean:** Read only for Students belonging to the Dean's department, if this is part of the approved workflow.
- **Admin:** Read institution-wide; writes only when operationally necessary.
- **Edge Function/service role:** Generate or update insight records after validating the target Student.
- **Anonymous:** No access.

Students should not directly insert the authoritative AI insight result. A secured Edge Function should obtain the signed-in user from the JWT, fetch that same Student's academic records from the database, call the AI provider, validate the output, and save the result using the service role.

## 5. Consultation ownership policies

`student_consultation_requests` currently relies on browser query filters and has RLS disabled. Ownership must be defined independently at the database layer.

### Required rules

#### Student

- May create a request only with `student_id = auth.uid()`.
- May select only their own requests.
- May select only a Faculty member actually assigned to one of their active enrolled classes.
- May update or cancel only their own pending request, if cancellation is supported.
- Cannot set Faculty resolution fields, completion status, or internal notes.

#### Faculty

- May select only requests where `faculty_id = auth.uid()` and the class is currently assigned to them.
- May resolve or reschedule only requests assigned to them.
- Cannot change the request's Student, class, or original request content.

#### Dean

- May read department-level consultations only if consultation oversight is an approved responsibility.
- Should not update a Faculty consultation unless an explicit escalation workflow exists.

#### Admin

- May access records for support and compliance according to institutional policy.

### Recommended implementation

Use secured RPCs instead of direct updates:

- `create_student_consultation_request(...)`
- `cancel_student_consultation_request(...)`
- `resolve_faculty_consultation_request(...)`

Each RPC should derive the actor from `auth.uid()`, verify enrollment or assignment, update the consultation, create the notification, and write the audit event in one transaction.

The present local-storage success fallback should not represent a failed database update as a successful resolution. Offline or failed changes should be labeled **Not synced** and retried, not shown as official.

## 6. Dean ownership and department scope

Selecting a Dean's department in the interface is not sufficient authorization. The database must independently establish the Dean's department from the signed-in user's profile.

For grade unlocks, remark overrides, referrals, and department reports, a Dean should be allowed only when:

- the actor is an active Dean;
- the target class belongs to a Subject in the same department;
- the Student is enrolled in that class;
- the request is currently pending;
- the requested state transition is valid.

Approval operations that touch several tables must be transactional RPCs. For example, remark-override approval may update the request, unlock a Student grade, create notifications, and add an audit record. Either all those operations should succeed or none should be committed.

## 7. Activity-log protection

The system-wide audit trigger improves coverage because it captures database mutations even if a page forgets to call the client audit helper. However, the audit table itself should receive additional protection before being described as immutable.

Recommended final rules:

- Enable RLS on `activity_logs`.
- Revoke direct client `UPDATE` and `DELETE` privileges.
- Prefer trigger or security-definer insertion for authoritative mutation events.
- Allow Admin read access to the complete ledger.
- Give other roles only the limited activity views needed by their dashboards.
- Separate authoritative server audit events from optional user-interface telemetry.
- Record export initiation as `export_requested` or `export_generated`, not as proof that a file was delivered.

Useful audit fields include:

- authenticated actor ID and role;
- action and resource type;
- target row ID;
- class, Student, or department scope where applicable;
- request/correlation ID;
- timestamp generated by the database;
- safe before/after metadata without passwords, tokens, or restricted notes.

## 8. Recommended RLS rollout order

Do not enable every policy simultaneously. A staged rollout reduces the chance of breaking working pages.

### Phase 1 — Inventory and test cases

- Confirm the final supported roles are Admin, Dean, Faculty, and Student.
- Create a permission matrix for every table and RPC.
- Prepare at least two users per role, two departments, and classes owned by different Faculty members.
- Record expected allowed and denied operations.

### Phase 2 — Remove anonymous writes

- Revoke anonymous insert, update, and delete access from academic, user, consultation, insight, notification, and audit tables.
- Confirm public/login functionality still works.

### Phase 3 — Personal student data

Secure:

- academic insights;
- consultation requests;
- attendance details;
- Student-specific grades;
- intervention and advising records.

### Phase 4 — Faculty class ownership

Secure class activities, score sheets, grading columns, enrollments, attendance writes, posting, and exports using active Faculty assignment checks.

### Phase 5 — Dean department ownership

Secure unlock requests, remark overrides, referrals, and reports using department-scoped policies or RPCs.

### Phase 6 — Admin and audit hardening

- Require active status in privileged Edge Functions.
- Protect the audit ledger.
- Remove the retired Office role from remaining schema and application choices.

### Phase 7 — Production verification

Test both allowed and deliberately forbidden operations using the Supabase client, not only the visible interface.

## 9. Minimum role-connection test matrix

| Scenario | Expected result |
|---|---|
| Student requests their assigned Faculty member | Allowed |
| Student requests an unrelated Faculty member | Denied by database |
| Student reads their released grades | Allowed |
| Student reads another Student's grades or insights | Denied by database |
| Faculty edits an assigned active class | Allowed |
| Faculty edits another Faculty member's class | Denied by database |
| Faculty resolves a consultation assigned to them | Allowed |
| Faculty resolves another Faculty member's consultation | Denied by database |
| Dean reviews a case in their department | Allowed |
| Dean approves another department's override | Denied by database |
| Inactive Admin calls a privileged Edge Function | Denied |
| Anonymous user writes a score or consultation | Denied |
| Normal user updates or deletes an audit event | Denied |
| Failed multi-table approval | Entire transaction rolls back |

## 10. Release recommendation

Functional testing can continue with the current development configuration if the environment and public keys are controlled and no real student data is used. Before production or real-data deployment, the following are release blockers:

1. Remove anonymous academic-data writes.
2. Enable and test Student data isolation.
3. Enforce Faculty class ownership.
4. Enforce Dean department scope.
5. Convert critical multi-table operations to transactional RPCs.
6. Protect the audit ledger from direct modification.
7. Verify every allowed and denied case using separate role accounts.

RLS should be treated as enforcement of the rules already represented in the interface—not as a replacement for functional testing or validation inside RPCs.
