# SAGE — Master SDLC Task Tracker & Checklist

> **Project:** SAGE (Smart Academic Grading and Evaluation System)  
> **Institution:** Dr. Yanga's Colleges, Inc. (DYCI) — Capstone Project  
> **Stack:** React 19 + Vite + Tailwind CSS + Supabase + Google Gemini 2.5 Flash API + Supabase Storage  

This document serves as the master, highly-detailed **Software Development Life Cycle (SDLC)** tracker for the SAGE project, tracking every granular technical and business milestone from conception through Capstone Defense alignment and production deployment.

---

## 📋 Definition of Done (DoD)
- **UI & UX:** Responsive at 375px, 768px, 1280px; all async actions have loading skeletons; empty states handled; Sora, DM Sans, and JetBrains Mono typography enforced.
- **Styling:** Adheres exclusively to brand variables (`sage-*` semantic tokens); no arbitrary hex codes or dark mode variants.
- **Backend & Security:** 21-table database schema, RLS policies, JWT Authentication enforced, Supabase Edge Functions tested locally.
- **Accuracy:** All grading mathematics strictly match DYCI Excel rounding standards (`MR`, `TFR`, `SG`).
- **Auditability:** Every administrative override, faculty reassignment, or grade unlock triggers an `activity_logs` audit entry.

---

## 🔎 Phase 1: Requirements Gathering & Analysis
*Objective: Extract precise academic business rules, institutional policies, and define system scope.*

### Business Logic & Grading Extraction
- [X] Elicit the official **Subject Weight Templates** (e.g., General Ed, Health Sciences, Maritime) from DYCI stakeholders.
- [X] Analyze legacy Excel spreadsheet calculations and identify exact `ROUND()` behaviors.
- [X] Extract the official GWA Transmutation scale (1.00 - 5.00) and Remarks logic.
- [X] Determine the 4-term progression sequence: Prelim, Midterm, Semi-Final, Final.
- [X] Extract Capstone Defense rulings: Fairness Clause, Clearance Locking, FDA Advisory Absences, Dean Controlled Release, and Evidence Resubmission workflows.

### Scope Definition & Feature Selection
- [X] **KEEP:** Professor-Led Enrollment Model (Join Codes) to support irregular students.
- [X] **KEEP:** Early Warning System (EWS) to track at-risk students in real-time.
- [X] **KEEP:** Class Archiving for end-of-semester record locking.
- [X] **ADD:** College Office (Department Admin) portal for clearance auditing and CSV roster imports.
- [X] **ADD:** Supabase Storage for evidence file upload attachments during grade change requests.

---

## 📐 Phase 2: System Architecture & Design
*Objective: Design the database, algorithms, UI/UX, and technology stack.*

### Database Design (Supabase PostgreSQL)
- [X] Architect the complete **21-table relational schema** (`SAGE_DATABASE_SCHEMA.md`).
- [X] Design the Entity Relationship Diagram (ERD).
- [X] Define PostgreSQL Enums (`user_role`, `term_period`, `grade_remarks`, `class_status`).
- [X] Add Capstone defense schema extensions: `submitted_timely`, `is_released_to_faculty`, centralized `grade_computations` templates, and `grade_change_requests`.

### UI/UX & Frontend Design System
- [X] Map out User Journeys for all portals (Student, Faculty, Dean, Admin, College Office).
- [X] Establish the Tailwind Theme System: Sage Green (`sage-900`) primary and Emerald accent scales.
- [X] Select and map Typography: Sora (Headers), DM Sans (Body), JetBrains Mono (GWA/Stats).
- [X] Standardize system branding to **SAGE** across topbar, sidebar, login, and layout wrappers.

---

## 💻 Phase 3: Implementation (Development)
*Objective: Build UI components, backend infrastructure, and policy enforcement engines.*

### Sprint 3.1: Foundation & Shared UI (Completed)
- [X] Initialize React 19 + Vite environment.
- [X] Build `mockDb.js` LocalStorage engine for UI prototyping and real-time state propagation.
- [X] Build Login Flow with "Quick Demo Accounts Selector" and Password Reset validation.

### Sprint 3.2: Admin & Dean Portals (Completed UI)
- [X] Build Admin CSV Class Registry Import parser with interactive preview validation grids.
- [X] Build Evaluation Form Builder with drag/click reordering and Live Student Preview.
- [X] Implement Evaluation Windows Scheduler targeting specific sections.
- [X] Build Grade Override Module and wire up the Audit Ledger history.
- [X] Build Dean Grade Posting Status matrix tracking submission ratios.
- [X] Build Dean Grade Distribution Analytics with Custom CSS Bracket Charts.
- [X] Build Summary Reports Exporter utilizing specialized printer CSS stylesheets.

### Sprint 3.3: Capstone Defense Policy Enforcement (Active)
- [X] **Fairness Clause**: Exclude `submitted_timely = false` survey submissions from faculty effectiveness ratings (`EvalResultsOverview.jsx`).
- [X] **Clearance Gating**: On-time survey completion signs clearance; incomplete surveys lock grade summaries (`MyGradesList.jsx` & `Dashboard.jsx`).
- [X] **Grade & Activity Visibility**: Restrict student official grade summaries to Midterm & Final; enforce full activity names (no abbreviations like `Q1`).
- [X] **FDA Absence Policy**: Treat 4 absences as an advisory recommendation badge for faculty review, preserving faculty discretion (`StudentRow.jsx`).
- [X] **Department Evaluation Metrics**: Display department respondent counts and comparative instructor ratings (`EvalResultsOverview.jsx`).
- [X] **Grading Policy Flexibility**: Dynamic weights per department & term branching (4-term regular vs 2-term summer).
- [X] **Top Performing Faculty Hierarchy**: Display top performers on Dean/Admin dashboards based strictly on on-time evaluations.
- [X] **Dean Controlled Access**: Evaluation results release controls (`is_released_to_faculty` toggle in `EvalResultsOverview.jsx` & gatekeeper notice in `EvalResultsMy.jsx`).
- [X] **Grade Change Workflow**: Formal requests requiring valid reason + evidence attachment via Supabase Storage $\rightarrow$ Dean review & approval (`PostedGradesView.jsx` & `RemarkOverrideRequests.jsx`).
- [X] **College Office Portal**: CSV roster imports (`RosterImport.jsx`) and clearance auditing interfaces (`ComplianceAudit.jsx`).

### Sprint 3.4: Supabase Backend & AI Integration (Active)
- [X] Migrate full **21-table SQL schema** to live Supabase instance per `docs/workflows/Supabase-Migration.md`.
- [X] Replace `mockDb.js` with direct Supabase API calls across all 5 portals.
- [X] Enforce Supabase Auth with live user profile resolution in `AuthContext.jsx`.
- [ ] Develop `analyze-student` Edge Function (Google Gemini 2.5 Flash API) for AI Advisor counseling generation.
- [ ] Finalize `SheetJS` export for Record Sheet to dynamically write live Excel formulas.

---

## 🧪 Phase 4: Testing & Quality Assurance
*Objective: Ensure absolute accuracy, security, and stability before launch.*

- [ ] **Unit Tests:** Input dummy scores into SAGE and cross-check the generated GWA strictly against official DYCI `SAGE_Grading_System_Mock.xlsx` baseline.
- [ ] **Data Integrity:** Verify that CSV imports correctly reject duplicate student IDs or invalid formats.
- [ ] **Export Verification:** Ensure generated SheetJS outputs print cleanly onto standard Registrar paper sizes (Legal/A4).
- [ ] **RLS Auditing:** Attempt to access Faculty Grade Sheets using a Student JWT token (must return 401/403).
- [ ] **Anonymity Checks:** Verify that `evaluation_responses` records contain zero traces of the submitting `student_id`.

---

## 🚀 Phase 5: Deployment & Maintenance
*Objective: Provisioning the live production environment and preparing for defense.*

- [ ] Provision production Supabase Database, Auth, and Edge Functions.
- [ ] Compile the final production build (`npm run build`).
- [ ] Deploy compiled React application to Vercel/Netlify hosting provider.
- [ ] Configure custom production domain and force strict SSL/HTTPS certificates.
- [ ] **Defense Prep:** Prepare the final live demonstration script highlighting the Early Warning System (EWS), Evaluation Governance, and AI Counseling features for the capstone panelists.
