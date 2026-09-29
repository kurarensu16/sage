# ASPIRE System Development & Updates Report

This document reports all architectural updates, new page components, layout enhancements, security refactorings, and cleanup operations implemented in ASPIRE (Academic Support and Performance Advising with Intervention, Risk, and Evaluation) since the baseline project initialization.

---

## 1. Executive Summary of Changes

The ASPIRE platform has been updated with several critical enhancements designed to address usability feedback, resolve broken layout navigation, establish robust data auditing labels, and deliver role-adaptive user controls.

Key changes include:
* **Student Section & Year Level Cascade**: Enforced program-level structure constraints by mapping and cascading College $\rightarrow$ Program $\rightarrow$ Year Level $\rightarrow$ Section.
* **Audit Logs Integration**: Refactored the generic Activity Log to "System Audit Logs" across all sidebars, routes, and system documentation.
* **Restored Notifications Routing**: Created custom notification listing screens for Admin and Dean portals, resolving page-load failures.
* **Dynamic Settings Page**: Implemented a unified, role-adaptive settings component supporting profile changes, security updates, notification toggles, and system resets.
* **Header Navigation Cleanup**: Removed unused/mock layout items (Help Center, profile down arrow) to ensure zero dead links during capstone defense.
* **Mock DB Schema Auto-Migration**: Added self-healing capability to the client-side localStorage db to automatically merge new keys on cached datasets.

---

## 2. Comprehensive Change Log

### Feature 1: Student Section & Year Level Cascade
* **Scope**: User registration, batch CSV importing, and user list filtering.
* **Summary**: Standardized student accounts to include a mandatory `yearLevel` property. Added cascade filtering where changing a student's program or year level limits sections to those matching both properties (e.g. choosing **2nd Year** displays only second-year sections like `BSIT-2B`).
* **Key Files**:
  * [`mockDb.js`](../../src/lib/mockDb.js) — Updated seed database with year levels; added auto-migration schema self-healing helper.
  * [`UserForm.jsx`](../../src/pages/admin/UserForm.jsx) — Added year level selection grid, cascading logic, and input validations.
  * [`UserList.jsx`](../../src/pages/admin/UserList.jsx) — Reconfigured CSV/Excel parser to optionally support, derive, and assign year levels from student uploads. Added Program and Year Level filters to the main toolbar.

### Feature 2: Audit Logs Refactoring
* **Scope**: Activity auditing and system labelling.
* **Summary**: Replaced all references to "Activity Log" with "Audit Logs" to align with academic compliance standards. Modified sidebar layout icons to use the Lucide `Shield` indicator for high-priority visual presence.
* **Key Files**:
  * **[NEW]** [`AuditLog.jsx`](../../src/pages/admin/AuditLog.jsx) — Page showing logs of administrative activities (renamed from `ActivityLog.jsx`).
  * [`Sidebar.jsx`](../../src/components/layout/Sidebar.jsx) — Reconfigured admin sidebar routes to target `Audit Logs` with the `Shield` icon.
  * [`App.jsx`](../../src/App.jsx) — Registered `/admin/auditlog` route.
  * [`Dashboard.jsx`](../../src/pages/admin/Dashboard.jsx) — Realigned activity log shortcut links.

### Feature 3: restored Notifications Routing
* **Scope**: System alert portals.
* **Summary**: Designed and registered notifications components for Admin and Dean portals. Restored the Topbar bell notifications icon pathing to dynamically open `/${role}/notifications`.
* **Key Files**:
  * **[NEW]** [`Notifications.jsx (Admin)`](../../src/pages/admin/Notifications.jsx) — Customized system notifications list for administrators.
  * **[NEW]** [`Notifications.jsx (Dean)`](../../src/pages/dean/Notifications.jsx) — Customized notifications covering evaluation deadlines and performance thresholds.
  * [`App.jsx`](../../src/App.jsx) — Registered `/admin/notifications` and `/dean/notifications` routes.
  * [`Topbar.jsx`](../../src/components/layout/Topbar.jsx) — Linked notifications bell to dynamic path.

### Feature 4: Dynamic Settings Page
* **Scope**: User preferences and profile configuration.
* **Summary**: Implemented a unified settings panel loaded at `/${role}/settings` for all 4 roles. Supports profile updates, password complexity checking, role-specific notification toggles (EWS, grade releases, evaluative feedback), and admin maintenance features (JSON exports, cache clears).
* **Key Files**:
  * **[NEW]** [`Settings.jsx`](../../src/pages/shared/Settings.jsx) — Reusable settings component loaded by path prefix.
  * [`App.jsx`](../../src/App.jsx) — Registered settings routes for Admin, Dean, Faculty, and Student roles.
  * [`Topbar.jsx`](../../src/components/layout/Topbar.jsx) — Upgraded static settings button to dynamic Link component.

### Feature 5: Header Navigation Cleanup
* **Scope**: UI polish.
* **Summary**: Removed the Help Center button (which was empty) and the static ChevronDown icon from the profile block to simplify the Topbar header layout and avoid broken menu expectations.
* **Key Files**:
  * [`Topbar.jsx`](../../src/components/layout/Topbar.jsx) — Removed Help Center button and chevron elements.

---

## 3. Files Modified, Deleted, & Untracked

Below is the compilation of file status changes relative to the baseline commit:

### Files Added / Untracked
- [`src/pages/shared/Settings.jsx`](../../src/pages/shared/Settings.jsx) (Dynamic Settings Component)
- [`src/pages/admin/Notifications.jsx`](../../src/pages/admin/Notifications.jsx) (Admin Notifications Component)
- [`src/pages/dean/Notifications.jsx`](../../src/pages/dean/Notifications.jsx) (Dean Notifications Component)
- [`src/pages/admin/AuditLog.jsx`](../../src/pages/admin/AuditLog.jsx) (Admin Auditing Dashboard)
- [`src/pages/admin/SubjectList.jsx`](../../src/pages/admin/SubjectList.jsx) & [`SubjectForm.jsx`](../../src/pages/admin/SubjectForm.jsx)
- [`src/pages/admin/SectionList.jsx`](../../src/pages/admin/SectionList.jsx) & [`SectionForm.jsx`](../../src/pages/admin/SectionForm.jsx)

### Files Deleted
- `src/pages/admin/ActivityLog.jsx` (Replaced by `AuditLog.jsx`)
- `capstone-system-design-v2.md` (Moved from root to `docs/design/`)
- `DESIGN_SYSTEM (1).md` (Cleaned up temporary duplicate file)

### Core Files Modified
- [`src/App.jsx`](../../src/App.jsx) (Configured all settings/notifications routes)
- [`src/components/layout/Topbar.jsx`](../../src/components/layout/Topbar.jsx) (Linked headers, removed Help and chevron icons)
- [`src/components/layout/Sidebar.jsx`](../../src/components/layout/Sidebar.jsx) (Updated Audit Log route, labels, and icons)
- [`src/lib/mockDb.js`](../../src/lib/mockDb.js) (Added YearLevel values and schema auto-migration)
- [`src/pages/admin/UserForm.jsx`](../../src/pages/admin/UserForm.jsx) (Cascading filters, YearLevel selector)
- [`src/pages/admin/UserList.jsx`](../../src/pages/admin/UserList.jsx) (YearLevel columns, CSV auto-derivations, new toolbars)

---

## 4. Verification & Testing

* **Build Compilation**: Successfully built using Vite build pipeline (`npm run build`). Outputs generated with no compilation warnings:
  ```
  vite v8.0.14 building client environment for production...
  transforming...✓ 1802 modules transformed.
  rendering chunks...
  ✓ built in 925ms
  ```
* **Cascading Select Rules**: Validated that student year levels filter available sections correctly (e.g. BSIT 1st Year displays only BSIT-1A/BSIT-1B, and BSIT 2nd Year displays BSIT-2A/BSIT-2B).
* **Reset Database**: Validated that clicking "Reset Storage Cache" under Admin Settings clears outdated localStorage entries and successfully re-seeds database values on reload.
