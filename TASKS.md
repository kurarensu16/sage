# SAGE — Comprehensive SDLC Task Tracker & Checklist

> **Project:** SAGE (Smart Academic Grading and Evaluation System)
> **Institution:** Dr. Yanga's Colleges, Inc. (DYCI) — Capstone Project
> **Stack:** React 19 + Vite + Tailwind CSS v4 + Supabase + Claude API

This document serves as the master, highly-detailed **Software Development Life Cycle (SDLC)** tracker for the SAGE project, tracking every granular technical and business milestone from conception to capstone defense.

---

## 📋 Definition of Done (DoD)
- **UI:** Responsive at 375px, 768px, 1280px; all async actions have loading skeletons; lists have empty states.
- **Styling:** Adheres exclusively to brand variables (`--color-sage-900`, etc.) and designated Google Fonts.
- **Backend:** RLS enabled, JWT Authentication enforced, Supabase Edge Functions tested locally.
- **Accuracy:** All grading mathematics strictly match DYCI Excel rounding standards (`MR`, `TFR`, `SG`).
- **Auditability:** Every administrative override or reassignment triggers an `activity_logs` entry.

---

## 🔎 Phase 1: Requirements Gathering & Analysis
*Objective: Extract precise academic business rules and define the system scope.*

### Business Logic & Grading Extraction
- [X] Elicit the official **50/10/40** grading formula from DYCI stakeholders.
- [X] Analyze the legacy Excel spreadsheet calculations and identify exact `ROUND()` behaviors.
- [X] Extract the official GWA Transmutation scale (1.00 - 5.00) and Remarks logic.
- [X] Determine the 4-term progression sequence: Prelim, Midterm, Semi-Final, Final.

### Scope Definition & Feature Selection
- [X] **CUT:** Student Self-Enrollment (Join Codes) to prevent conflicts with DYCI's official registrar.
- [X] **CUT:** COR (Certificate of Registration) Validation to avoid data privacy/storage overhead.
- [X] **CUT:** Complex Co-Teaching models in favor of simpler Admin Faculty Reassignment.
- [X] **KEEP:** Early Warning System (EWS) to track at-risk students in real-time.
- [X] **KEEP:** Class Archiving for end-of-semester record locking.

### Requirements Documentation
- [X] Draft Functional Requirements (e.g., FR28: Admin CSV import, FR32: Real-time running grade computation).
- [X] Draft Non-Functional Requirements (e.g., NFR09: 2-second update limit for running grades).

---

## 📐 Phase 2: System Architecture & Design
*Objective: Design the database, algorithms, UI/UX, and technology stack.*

### Database Design (Supabase PostgreSQL)
- [X] Architect the complete 19-table relational schema.
- [X] Design the Entity Relationship Diagram (ERD).
- [X] Define PostgreSQL Enums (`user_role`, `term_period`, `grade_remarks`, `class_status`).
- [X] Structure the Faculty Evaluation schema (Forms -> Windows -> Responses -> Ratings).

### Algorithm & Logic Design
- [X] Formulate the **Base-50 Running Grade Algorithm**: `(Current_CS / Max_CS * 50) + (Char * 0.1)`.
- [X] Define EWS Visual Thresholds: Safe (Green), At-Risk (Yellow), Failing Trajectory (Red).
- [X] Formulate intermediate rounding chains: `MR = ROUND(AVG(Prelim, Midterm))`.

### UI/UX & Frontend Design
- [X] Map out User Journeys for all 35+ screens across 4 portals.
- [X] Establish the Tailwind v4 Theme System: Sage Green (`#022C22`) and Emerald accent scales.
- [X] Select and map Typography: Sora (Headers), DM Sans (Body), JetBrains Mono (GWA/Stats).
- [X] Vectorize the custom SAGE Logo (Spline binary SVG).

---

## 💻 Phase 3: Implementation (Development)
*Objective: Write the code, build the UI, and connect the backend infrastructure.*

### Sprint 3.1: Foundation & Shared UI (Completed)
- [X] Initialize React 19 + Vite environment.
- [X] Configure Tailwind CSS v4 and `lucide-react` icons.
- [X] Build `mockDb.js` LocalStorage engine for robust UI prototyping and real-time state propagation.
- [X] **S01-S03**: Build Login Flow with "Quick Demo Accounts Selector" and Password Reset validation.

### Sprint 3.2: Admin & Dean Portals (Completed)
- [X] **S08**: Build Admin CSV Class Registry Import parser with interactive preview validation grids.
- [X] **S09-S10**: Build Evaluation Form Builder with drag/click reordering and Live Student Preview.
- [X] **S11-S12**: Implement Evaluation Windows Scheduler targeting specific sections.
- [X] **S13-S14**: Build Grade Override Module and wire up the Audit Ledger history.
- [X] **S16**: Build Dean Grade Posting Status matrix tracking submission ratios.
- [X] **S17**: Build Dean Grade Distribution Analytics with Custom CSS Bracket Charts.
- [X] **S21**: Build Summary Reports Exporter utilizing specialized printer CSS stylesheets.

### Sprint 3.3: Faculty & Student Portals (Completed)
- [X] **S23**: Build Grade Components Weight Setup with sum validators (50/10/40 enforcement).
- [X] **S24**: Build Spreadsheet Score Input Table featuring live running GWAs, visual dot indicators, and precise percentage tooltips.
- [X] **S25-S26**: Build Grade Computation Previews executing the Excel-equivalent rounding logic.
- [X] **S29-S31**: Build Student Subject List showing EWS warning flags mirrored from the faculty portal.
- [X] **S32-S33**: Build Active Survey Window list and Anonymized Evaluation Rating Forms.

### Sprint 3.4: Supabase Backend & AI Integration (Upcoming)
- [ ] Migrate full 19-table SQL schema to live Supabase instance.
- [ ] Replace `mockDb.js` with direct Supabase API calls.
- [ ] Implement JWT Authentication and remove the "Quick Demo Selector".
- [ ] Configure `anon`, `authenticated`, and `service_role` Postgres grants.
- [ ] Develop `analyze-student` Edge Function (Claude API) for **S34 AI Advisor** counseling generation.
- [ ] Develop `predict-faculty` Edge Function (Claude API) for Dean dashboard fitness verdicts.
- [ ] Finalize `SheetJS` export for Record Sheet to dynamically write live Excel formulas.
- [ ] Finalize `SheetJS` export for Report of Grades utilizing a symmetrical 30-row split format.

---

## 🧪 Phase 4: Testing & Quality Assurance
*Objective: Ensure absolute accuracy, security, and stability before launch.*

### Functional & Algorithmic Testing
- [ ] **Unit Tests:** Input dummy scores into SAGE and cross-check the generated GWA strictly against the official DYCI `SAGE_Grading_System_Mock.xlsx` baseline. Check edge cases ending in `.5`.
- [ ] **Data Integrity:** Verify that CSV imports correctly reject duplicate student IDs or invalid formats.
- [ ] **Export Verification:** Ensure generated SheetJS outputs print cleanly onto standard Registrar paper sizes (Legal/A4) without breaking columns.

### Security & Penetration Testing
- [ ] **RLS Auditing:** Attempt to access Faculty Grade Sheets using a Student JWT token (must return 401/403).
- [ ] **Anonymity Checks:** Verify that `evaluation_responses` records contain zero traces of the submitting `student_id` (only the hashed `anonymous_token`).
- [ ] **Edge Function Security:** Ensure Claude API keys are strictly confined to Supabase server environments and not leaked in the Vite client bundle.

### User Acceptance Testing (UAT)
- [ ] Run a full mock semester simulation (Import -> Score -> Grade -> Evaluate -> Archive).
- [ ] Collect feedback on UI responsiveness and loading state clarity.

---

## 🚀 Phase 5: Deployment
*Objective: Provisioning the live production environment.*

- [ ] Provision production Supabase Database, Auth, and Edge Functions.
- [ ] Lock down all frontend `.env` variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- [ ] Compile the final production build (`npm run build`).
- [ ] Deploy the compiled React application to the hosting provider (e.g., Vercel or Netlify).
- [ ] Configure the custom production domain and force strict SSL/HTTPS certificates.

---

## 🛠️ Phase 6: Maintenance & Handoff
*Objective: Post-launch support, monitoring, and panel defense preparation.*

- [ ] **Documentation:** Compile the System Design Document, ERD, and Comparison Reports into a master Capstone Manual.
- [ ] **Training:** Prepare User Manuals and localized training slides for DYCI Faculty and Administrators.
- [ ] **Monitoring:** Set up dashboards to monitor Claude API Token Usage to prevent billing overruns.
- [ ] **Logging:** Establish a routine to monitor the `activity_logs` table for unauthorized administrative grade overrides.
- [ ] **Defense Prep:** Prepare the final live demonstration script highlighting the Early Warning System (EWS) and AI Counseling features for the capstone panelists.
