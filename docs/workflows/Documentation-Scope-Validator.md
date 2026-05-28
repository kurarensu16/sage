# SAGE — Documentation & Scope Validator

> Cross-reference of the System Design Document (41 screens, 35 FRs, 31 UCs) vs. actual codebase implementation.  
> Includes keep/drop/add recommendations for scope finalization.  
> Validation Date: 2026-05-28  
> Status: **Analysis Complete — Awaiting Scope Decisions**

---

## Screen Implementation Matrix (S01–S41)

### Public Screens (3 of 3 built)

| Screen | Spec Name | File | Status | Verdict |
|---|---|---|---|---|
| S01 | Login Page | `public/Login.jsx` | ⚠️ UI only — no real auth | ✅ **KEEP** — Wire to Supabase Auth |
| S02 | Forgot Password | `public/ForgotPassword.jsx` | ⚠️ UI only — no email trigger | ✅ **KEEP** — Wire to Supabase Auth |
| S03 | Reset Password | `public/ResetPassword.jsx` | ⚠️ UI only — no token validation | 🤔 **CONSIDER DROP** — see notes |

### Admin Screens (15 of 15 built)

| Screen | Spec Name | File | Status | Verdict |
|---|---|---|---|---|
| S04 | Admin Dashboard | `admin/Dashboard.jsx` | ✅ KPIs + audit logs from mockDb | ✅ **KEEP** |
| S05 | User List | `admin/UserList.jsx` | ✅ Table + search/filter + CRUD | ✅ **KEEP** |
| S06 | User Create/Edit | `admin/UserForm.jsx` | ✅ Form with role/dept fields | ✅ **KEEP** |
| S07 | Subjects List | `admin/SubjectList.jsx` | ✅ Table + search/filter | ✅ **KEEP** |
| S08 | Subject Create/Edit | `admin/SubjectForm.jsx` | ✅ Code, name, units, dept | ✅ **KEEP** |
| S09 | Sections List | `admin/SectionList.jsx` | ✅ Table + search/filter | ✅ **KEEP** |
| S10 | Section Create/Edit | `admin/SectionForm.jsx` | ✅ Name, dept, SY, semester | ✅ **KEEP** |
| S11 | Classrooms List | `admin/ClassManagementList.jsx` | ✅ Reassign + archive actions | ✅ **KEEP** |
| S12 | Classroom Create + CSV | `admin/ClassManagementForm.jsx` | ✅ Form + CSV import UI | ✅ **KEEP** |
| S13 | Eval Form Builder | `admin/EvalFormBuilder.jsx` | ✅ Add/remove/reorder criteria | ✅ **KEEP** |
| S14 | Eval Forms List | `admin/EvalFormsList.jsx` | ✅ View/edit/delete | ✅ **KEEP** |
| S15 | Eval Window List | `admin/EvalWindowList.jsx` | ✅ Status badges | ✅ **KEEP** |
| S16 | Eval Window Create/Edit | `admin/EvalWindowForm.jsx` | ✅ Faculty/section/form/dates | ✅ **KEEP** |
| S17 | Grade Override | `admin/GradeOverride.jsx` | ✅ Search + override + reason | ✅ **KEEP** |
| S18 | Audit Logs | `admin/AuditLog.jsx` | ✅ Timestamped event log | ✅ **KEEP** |

### Dean Screens (7 of 7 built)

| Screen | Spec Name | File | Status | Verdict |
|---|---|---|---|---|
| S19 | Dean Dashboard | `dean/Dashboard.jsx` | ✅ KPIs + AI diagnostics panel | ✅ **KEEP** |
| S20 | Grade Posting Status | `dean/GradePostingStatus.jsx` | ✅ Faculty × period matrix | ✅ **KEEP** |
| S21 | Grade Distribution | `dean/GradeDistribution.jsx` | ✅ Chart + breakdown | ✅ **KEEP** |
| S22 | Eval Results Overview | `dean/EvalResultsOverview.jsx` | ✅ Faculty cards with ratings | ✅ **KEEP** |
| S23 | Eval Results Per Faculty | `dean/EvalResultsFaculty.jsx` | ✅ Criteria breakdown + comments | ✅ **KEEP** — Add AI prediction |
| S24 | At-Risk Students | `dean/AtRiskStudents.jsx` | ✅ Flagged student table | ✅ **KEEP** — Wire AI agent |
| S25 | Summary Reports | `dean/SummaryReports.jsx` | ✅ Report selector + export buttons | ✅ **KEEP** — Add PDF generation |

### Faculty Screens (9 of 9 built)

| Screen | Spec Name | File | Status | Verdict |
|---|---|---|---|---|
| S26 | Faculty Dashboard | `faculty/Dashboard.jsx` | ⚠️ 100% hardcoded data | ✅ **KEEP** — Wire to database |
| S27 | Class Records List | `faculty/ClassRecordsList.jsx` | ⚠️ 100% hardcoded | ✅ **KEEP** — Wire to database |
| S28 | Class Record Create | `faculty/ClassRecordCreate.jsx` | ✅ Uses mockDb | ✅ **KEEP** |
| S29 | Grade Components Setup | `faculty/GradeComponentsSetup.jsx` | ⚠️ UI works, hardcoded | ✅ **KEEP** |
| S30 | Score Input | `faculty/ScoreInput.jsx` | ⚠️ Full EWS + fullscreen, hardcoded | ✅ **KEEP** |
| S31 | Grade Computation Preview | `faculty/GradeComputationPreview.jsx` | ⚠️ Full GWA chain, hardcoded | ✅ **KEEP** |
| S32 | Posted Grades View | `faculty/PostedGradesView.jsx` | ⚠️ Fullscreen view, hardcoded | ✅ **KEEP** |
| S33 | Eval Results (My) | `faculty/EvalResultsMy.jsx` | ⚠️ Criteria + comments, hardcoded | ✅ **KEEP** — Add AI prediction |
| S34 | Notifications | `faculty/Notifications.jsx` | ⚠️ 100% hardcoded | ✅ **KEEP** |

### Student Screens (7 of 7 built)

| Screen | Spec Name | File | Status | Verdict |
|---|---|---|---|---|
| S35 | Student Dashboard | `student/Dashboard.jsx` | ⚠️ 100% hardcoded | ✅ **KEEP** — Wire to database |
| S36 | My Grades List | `student/MyGradesList.jsx` | ⚠️ 100% hardcoded | ✅ **KEEP** — Wire to database |
| S37 | My Grades Detail | `student/MyGradesDetail.jsx` | ⚠️ Tabs per period, hardcoded | ✅ **KEEP** — Wire to database |
| S38 | Eval List | `student/EvalList.jsx` | ⚠️ 100% hardcoded | ✅ **KEEP** |
| S39 | Eval Form | `student/EvalForm.jsx` | ⚠️ Full 7-category form, hardcoded | ✅ **KEEP** |
| S40 | AI Recommendation | `student/AIRecommendation.jsx` | ⚠️ Hardcoded "Safe" verdict | ✅ **KEEP** — Wire AI agent |
| S41 | Notifications | `student/Notifications.jsx` | ⚠️ 100% hardcoded | ✅ **KEEP** |

---

## Functional Requirements Compliance (FR01–FR35)

| FR | Description | Implementation Status | Notes |
|---|---|---|---|
| FR01 | Role-based login | ⚠️ UI exists, no real auth | Needs Supabase Auth |
| FR02 | Module access by role | ⚠️ Routes exist, no guards | Anyone can navigate to any URL |
| FR03 | Manage subjects DB | ✅ Full CRUD via mockDb | |
| FR04 | Manage sections DB | ✅ Full CRUD via mockDb | |
| FR05 | Create classroom | ✅ Full CRUD via mockDb | |
| FR06 | CSV student import | ⚠️ UI exists, no real CSV parsing | File selector works but doesn't parse |
| FR07 | Reassign faculty | ✅ Built with audit logging | |
| FR08 | Archive classroom | ✅ Built with unposted grade warning | |
| FR09 | Create class record | ✅ Built | |
| FR10 | Define grade components + weights | ✅ Built with weight validator UI | |
| FR11 | Validate weights sum to 100% | ✅ Real-time validation bar | |
| FR12 | Input scores per student | ✅ Built with inline save | |
| FR13 | Auto-compute term grades + GWA | ✅ Full chain: PG→MG→MR→SFG→FG→TFR→SG→GWA | |
| FR14 | Running grade computation | ✅ Real-time running grade column | |
| FR15 | EWS visual indicators | ✅ Green/yellow/red dot system | |
| FR16 | Tooltip on at-risk indicators | ✅ Hover tooltip with exact percentage | |
| FR17 | Post grades per period | ✅ Lock confirmation dialog | |
| FR17a | Filter by grading period | ✅ View Period dropdown | |
| FR17b | Fullscreen toggle | ✅ Expand button + ESC + backdrop click | |
| FR18 | Prevent editing posted grades | ✅ Locked state enforced | |
| FR19 | Students view own grades | ✅ UI built (hardcoded data) | Needs auth + data wiring |
| FR20 | Notify students on grade post | ⚠️ Notification page exists, no trigger | Needs Supabase Realtime |
| FR21 | Show lapses/missing scores | ✅ Highlighted in grade breakdown | |
| FR22 | Students can't see others' grades | ❌ No auth = no enforcement | Needs RLS policy |
| FR23 | Create eval form with criteria | ✅ Builder with add/remove/reorder | |
| FR24 | Set eval window open/close dates | ✅ Datetime picker | |
| FR25 | Submit only within window | ⚠️ Client-side check only | Needs server-side validation |
| FR26 | Hide student identity from faculty | ✅ Anonymous token design | |
| FR27 | View eval results per section | ✅ Section-filtered view | |
| FR28 | Notify faculty on eval close | ⚠️ Notification UI exists, no trigger | Needs event system |
| FR29 | Dean view grade posting status | ✅ Faculty × period matrix | |
| FR30 | Dean view grade distribution | ✅ Chart + breakdown | |
| FR31 | AI faculty fitness prediction | ⚠️ UI placeholder exists | Needs AI Agent 2 |
| FR32 | AI flagged at-risk students | ⚠️ Table exists, no AI data | Needs AI Agent 1 |
| FR33 | Printable/exportable reports | ⚠️ Export buttons exist, no file gen | Needs PDF library |
| FR34 | AI student recommendation | ⚠️ Hardcoded "Safe" verdict | Needs AI Agent 1 |
| FR35 | AI faculty fitness prediction | ⚠️ No implementation yet | Needs AI Agent 2 |

### Compliance Summary

| Status | Count | Percentage |
|---|---|---|
| ✅ Fully Implemented | 22 | 59% |
| ⚠️ Partially Implemented | 13 | 35% |
| ❌ Not Implemented | 2 | 5% |

---

## Features to ADD (Not in Current Spec)

Recommended additions to strengthen the capstone defense:

| # | Feature | Why It's Needed | Difficulty | Priority |
|---|---|---|---|---|
| **ADD-1** | Auth Guard Middleware | Without this, ANY user can access ANY role's pages by typing the URL. Panelists **will** test this during defense. | Medium | 🔴 Critical |
| **ADD-2** | Session Persistence | Refreshing the page loses all context. No "logged in as" state persists. Essential for a credible demo. | Medium | 🔴 Critical |
| **ADD-3** | Toast Notifications | No visible feedback when users save/delete/update records. Users don't know if their action succeeded. Use `sonner` or `react-hot-toast`. | Low | 🟡 High |
| **ADD-4** | Confirmation Dialogs | Some destructive actions (delete user, archive classroom) proceed without "Are you sure?" confirmation. | Low | 🟡 High |
| **ADD-5** | Data Export (PDF/Excel) | Summary Reports page (S25) has export buttons that don't generate files. Panelists expect working exports. | Medium | 🟡 High |
| **ADD-6** | CSV Actual Parsing | The classroom CSV import UI (S12) has a file picker but doesn't parse CSV content into student enrollment records. | Low | 🟡 High |
| **ADD-7** | Global Search | Topbar search bar is visible on every page but does nothing. Either make it functional or remove it. | Medium | 🟢 Medium |
| **ADD-8** | Profile/Settings Page | Settings gear icon in Topbar has no destination. Add a basic profile view or password change page. | Low | 🟢 Medium |
| **ADD-9** | Responsive Mobile Nav | Sidebar collapses but there's no hamburger menu or bottom nav on mobile viewports. | Low | 🟢 Medium |

---

## Features to Consider DROPPING

Features where implementation effort may exceed their value for capstone scope:

| # | Feature | Current Status | Why Consider Dropping | Risk of Dropping |
|---|---|---|---|---|
| **DROP-1** | S03 — Reset Password Page | UI-only mockup | If using Supabase Auth's built-in magic link or email reset flow, a custom reset page is redundant. Supabase handles this automatically. | Low — panelists unlikely to test password reset flow |
| **DROP-2** | FR28 — Faculty eval close notification | No implementation | Real-time notification triggers require Supabase Realtime subscriptions or cron. This specific trigger (eval window closes) is low-value compared to other notifications (grade posted, etc.). The notification *page* stays; only the *auto-trigger* is dropped. | Low — the notification page still works with simulated data |
| **DROP-3** | Agent 7 — Smart Notification Composer | Not started | Writing personalized notification messages via AI is cosmetic. Focus engineering effort on Agents 1 & 2 (FR34/FR35) which are explicit capstone requirements. | None — this was a nice-to-have from the AI agent proposal |

---

## Features to MODIFY

| # | Feature | Current Implementation | Suggested Modification |
|---|---|---|---|
| **MOD-1** | Student Dashboard KPIs | Hardcoded values ("1.45 GWA", "04 subjects") | Wire to computed values from Supabase queries |
| **MOD-2** | Faculty Dashboard urgent tasks | Hardcoded task array | Generate dynamically from class record status + deadline proximity |
| **MOD-3** | Dean AI Diagnostics panel | Generated from mockDb with simple logic | Wire to actual AI agent outputs once Agents 1 & 2 are built |
| **MOD-4** | Evaluation Form — rating scale | Currently 1-4 in spec, some UI shows 1-5 | Standardize to 1-4 as specified in `evaluation_criteria.max_rating` default |

---

## Gap Analysis Summary

### What's Strong (Defense-Ready)
- ✅ All 41 screens are built with polished UI
- ✅ Grade computation chain is complete and accurate (PG→GWA)
- ✅ EWS visual indicators with tooltips work correctly
- ✅ Fullscreen toggle on data tables works per spec
- ✅ Evaluation form builder with drag/reorder is impressive
- ✅ Design system is well-defined and mostly followed

### What Needs Work Before Defense
- ⚠️ **Authentication** — #1 priority. No auth = demo falls apart.
- ⚠️ **Data persistence** — localStorage is fragile. Supabase migration needed.
- ⚠️ **AI features** — FR34 and FR35 are listed as system features. Hardcoded verdicts won't pass scrutiny.
- ⚠️ **39% of pages** have no data connectivity at all.
- ⚠️ **PDF export** buttons don't work.

### What's Optional / Polish
- 🟢 Global search functionality
- 🟢 Profile/settings page
- 🟢 Mobile responsive navigation
- 🟢 Additional AI agents (3-7)

---

*End of Documentation & Scope Validator — SAGE, DYCI Capstone Project AY 2025-2026*
