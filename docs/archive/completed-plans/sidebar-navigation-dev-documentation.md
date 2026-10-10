# Sidebar Navigation Restructuring — Developer Documentation

## 1. Purpose

This document specifies the target sidebar navigation structure for all four portals (Student, Faculty, Dean, Admin) in the ASPIRE system. It is a **navigation/IA (information architecture) change only** — no backend logic, routing behavior, database schema, or business logic described in the original module specification is being altered. Every "sub-page" below maps 1:1 to an **already-existing** module; only its **grouping in the sidebar** and its **display label** are changing.

**No new pages need to be built.** This is a reorganization of existing, already-functional screens into grouped sidebar sections with clearer labels — not a request for new features. The only item that may require new work is the Account module (see §1a), and even that may already partially exist.

Use this document as the single source of truth when refactoring sidebar components and route labels. Do not rename database tables, API endpoints, model classes, or internal variable names based on the display labels in this document — those remain as already implemented unless a separate ticket says otherwise.

### 1a. Note on the Account Module

The existing sidebar already has an "Account Settings" entry, so a settings page likely already exists in some form. Before treating Profile / Change Password / Notification Settings as three new pages to build, **check what's already implemented** — it may only need to be split into three sections/tabs rather than built from scratch. Confirm with the current codebase before scoping this as new work.

---

## 2. Scope of Change

| In scope | Out of scope |
|---|---|
| Sidebar menu structure (grouping, ordering, labels) | Backend business logic |
| Adding collapsible/grouped nav sections | Database schema changes |
| Renaming **displayed** page titles/labels | API route paths (unless team agrees to align them — see §5) |
| Adding the new Account module (all portals) | Permission/role logic changes |

---

## 3. Naming Convention Rules

Apply these rules consistently across all portals when implementing:

1. **Dashboard** is never grouped. It is always a standalone top-level sidebar item, positioned first.
2. **Account** is never grouped under a domain. It is always a standalone item, positioned last (directly above Sign Out).
3. A **Module** = a collapsible sidebar group (parent). A **Sub-Page** = a child nav item inside that group, corresponding to one existing feature/screen.
4. Display labels use plain language — no internal abbreviations (COG, HITL, FDA-as-a-label, etc.) should appear in user-facing text. Abbreviations may still appear inside page content where contextually explained (e.g., "Failure Due to Absences (FDA)").
5. Group order within each portal follows frequency of use for that role (daily-use items first), not alphabetical order.
6. Every module group must contain at least 2 sub-pages, with the following approved exceptions where a domain currently has only one associated screen: **Attendance** (Student), **Consultations** (Student), **Reports** (Dean). Do not force-split these into fake sub-items to satisfy the "2+" convention.

---

## 4. Full Navigation Map (all portals)

Legend: `Module` → `Sub-Page` (`slug-suggestion`) — *maps to original module*

### Sample Visual — Faculty Portal (Before vs. After)

The wireframe below illustrates the change described in this document: the same pages, regrouped into collapsible sections instead of one flat list. No page listed on the right is new — every item already exists on the left, just relabeled and grouped.

![Sidebar before/after wireframe — Faculty Portal](sidebar-wireframe.png)


### STUDENT PORTAL

```
Dashboard                                   (standalone)

My Grades
  ├─ My Subjects            (my-subjects)        ← Subject List Registry
  ├─ Grade Report           (grade-report)        ← Official Grade Ledger
  └─ Score Breakdown        (score-breakdown)     ← Activity Score Breakdown

My Attendance
  └─ Attendance & Warnings  (attendance)          ← Attendance and FDA Advisory

Academic Support
  ├─ Advisories & Study Plans (advisories)        ← Faculty Advising Inbox
  └─ AI Study Advisor       (ai-advisor)          ← AI Academic Advisor and What-If Simulator

Consultations
  └─ Request a Consultation (consultations)       ← Direct Consultations

Account                                     (standalone)
  ├─ My Profile             (account/profile)
  ├─ Change Password        (account/password)
  └─ Notification Settings  (account/notifications)
```

### FACULTY PORTAL

```
Dashboard                                   (standalone)

Grades
  ├─ Score Sheet            (score-sheet)        ← Score Input Spreadsheet
  └─ Grade Preview          (grade-preview)       ← Grade Computation Preview

Classes
  ├─ My Classes             (my-classes)          ← Class Records and Room Creation
  └─ Enrollment Requests    (enrollment-requests) ← Irregular Verification

Student Risk
  ├─ At-Risk Students       (at-risk-students)    ← Educator Triage Roster
  └─ Evaluate Student       (evaluate-student)    ← HITL Student Risk Evaluation

Attendance
  └─ Attendance Monitoring  (attendance)          ← Absence and FDA Monitoring

Consultations
  └─ Consultation Requests  (consultations)       ← Consultation Resolution

Account                                     (standalone)
  ├─ My Profile             (account/profile)
  ├─ Change Password        (account/password)
  └─ Notification Settings  (account/notifications)
```

### DEAN PORTAL

```
Dashboard                                   (standalone)

Grades
  ├─ Grade Submission Status (grade-status)       ← Grade Posting Status Matrix
  ├─ Grade Corrections       (grade-corrections)  ← Grade Resubmission Review
  └─ Grade Distribution      (grade-distribution) ← Grade Distribution Analytics

Student Risk
  ├─ Risk & Honors Overview  (risk-honors)        ← Risk and Honors Analytics Matrix
  ├─ Escalated Cases         (escalated-cases)    ← Faculty-Dean Collaboration Queue
  └─ Intervention Results    (intervention-results) ← Intervention Outcomes

Reports
  └─ Generate Reports        (reports)            ← Summary Reports Exporter

Account                                     (standalone)
  ├─ My Profile              (account/profile)
  ├─ Change Password         (account/password)
  └─ Notification Settings   (account/notifications)
```

### ADMIN PORTAL

```
Dashboard                                   (standalone)

User Accounts
  ├─ Manage Users            (manage-users)       ← User Management
  └─ Import Users (CSV)      (import-users)       ← Bulk User CSV Import

Academic Setup
  ├─ Subjects                (subjects)           ← Subjects Catalog
  ├─ Grading Formulas        (grading-formulas)   ← COG Templates
  ├─ Sections                (sections)           ← Sections Management
  └─ Departments & Programs  (departments)        ← Departments and Programs

System
  ├─ Activity Logs           (activity-logs)      ← Audit Trail
  └─ Term Settings           (term-settings)       ← Term Settings

Account                                     (standalone)
  ├─ My Profile              (account/profile)
  ├─ Change Password         (account/password)
  └─ Notification Settings   (account/notifications)
```

---

## 5. Route/URL Alignment (recommendation)

Existing backend routes and component names do **not** need to change. However, if this is a new build or a phase where routes are still being defined, it is strongly recommended to align URL slugs with the sidebar labels above (see the slug suggestions in parentheses in §4) rather than the original long module names, for consistency between what the user sees in the sidebar and what appears in the URL bar. Example:

```
/faculty/score-sheet          instead of   /faculty/score-input-spreadsheet
/student/grade-report         instead of   /student/official-grade-ledger
```

If renaming routes is not feasible in the current phase, keep existing routes and only update the **label/title props** passed to sidebar and page-header components. Do not break existing bookmarks/links without confirming with the team.

---

## 6. Sidebar Component Structure (implementation guidance)

Recommended data shape for building the sidebar dynamically per role, rather than hardcoding four separate sidebar markups:

```ts
type SidebarItem = {
  label: string;
  route: string;
  icon?: string;
};

type SidebarGroup = {
  label: string;          // e.g. "My Grades" — omit/null for standalone items
  standalone?: boolean;   // true for Dashboard and Account
  items: SidebarItem[];
};

type PortalSidebar = SidebarGroup[];
```

Each portal (`student`, `faculty`, `dean`, `admin`) should have its own config object of this shape, consumed by a single shared `<Sidebar>` component. This avoids duplicating sidebar markup per portal and makes future label/grouping changes a config edit rather than a component edit.

Rules for the shared component:
- Render `standalone: true` groups without a collapsible header (flat item).
- Render all other groups as collapsible sections with the group label as the header.
- Preserve group order exactly as listed in §4 per portal.
- `Account` group always renders last, directly above Sign Out, regardless of how many sub-items it has.

---

## 7. Traceability Table (for QA / migration reference)

Use this table when verifying that no existing functionality was dropped during the sidebar refactor — every original module must appear exactly once below.

| Portal | New Module | New Sub-Page Label | Original Module Name (spec) |
|---|---|---|---|
| Student | My Grades | My Subjects | Subject List Registry Module |
| Student | My Grades | Grade Report | Official Grade Ledger Module |
| Student | My Grades | Score Breakdown | Activity Score Breakdown Module |
| Student | My Attendance | Attendance & Warnings | Attendance and FDA Advisory Module |
| Student | Academic Support | Advisories & Study Plans | Faculty Advising Inbox Module |
| Student | Academic Support | AI Study Advisor | AI Academic Advisor and What-If Simulator Module |
| Student | Consultations | Request a Consultation | Direct Consultations Module |
| Faculty | Grades | Score Sheet | Score Input Spreadsheet Module |
| Faculty | Grades | Grade Preview | Grade Computation Preview Module |
| Faculty | Classes | My Classes | Class Records and Room Creation Module |
| Faculty | Classes | Enrollment Requests | Irregular Verification Module |
| Faculty | Student Risk | At-Risk Students | Educator Triage Roster Module |
| Faculty | Student Risk | Evaluate Student | HITL Student Risk Evaluation Module |
| Faculty | Attendance | Attendance Monitoring | Absence and FDA Monitoring Module |
| Faculty | Consultations | Consultation Requests | Consultation Resolution Module |
| Dean | Grades | Grade Submission Status | Grade Posting Status Matrix Module |
| Dean | Grades | Grade Corrections | Grade Resubmission Review Module |
| Dean | Grades | Grade Distribution | Grade Distribution Analytics Module |
| Dean | Student Risk | Risk & Honors Overview | Risk and Honors Analytics Matrix Module |
| Dean | Student Risk | Escalated Cases | Faculty-Dean Collaboration Queue Module |
| Dean | Student Risk | Intervention Results | Intervention Outcomes Module |
| Dean | Reports | Generate Reports | Summary Reports Exporter Module |
| Admin | User Accounts | Manage Users | User Management Module |
| Admin | User Accounts | Import Users (CSV) | Bulk User CSV Import Module |
| Admin | Academic Setup | Subjects | Subjects Catalog Module |
| Admin | Academic Setup | Grading Formulas | COG Templates Module |
| Admin | Academic Setup | Sections | Sections Management Module |
| Admin | Academic Setup | Departments & Programs | Departments and Programs Module |
| Admin | System | Activity Logs | Audit Trail Module |
| Admin | System | Term Settings | Term Settings Module |
| All 4 | Account | My Profile / Change Password / Notification Settings | *New — not part of original module spec* |

---

## 8. Implementation Checklist

- [ ] Create shared `<Sidebar>` component driven by a config object (see §6).
- [ ] Define four `PortalSidebar` config objects (student, faculty, dean, admin) matching §4 exactly.
- [ ] Update page `<title>` / header labels to match new display names in §4 (backend routes/components stay as-is unless §5 alignment is approved).
- [ ] Check whether Profile / Change Password / Notification Settings already exist under the current "Account Settings" page; only build what's genuinely missing rather than assuming all three are new.
- [ ] Confirm with QA that every row in the §7 traceability table has a working, reachable page after the sidebar refactor — no module should become orphaned/unreachable.
- [ ] If renaming routes per §5, set up redirects from old routes to avoid breaking any existing bookmarks, saved links, or hardcoded references elsewhere in the codebase.
- [ ] Verify collapsible group state (expanded/collapsed) does not need to persist per user unless product requests it — default behavior should be defined by design/product, not assumed.
