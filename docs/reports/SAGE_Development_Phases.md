# SAGE: Detailed Development Phases by Module

This document provides a highly granular breakdown of the development phases for the **Smart Academic Grading and Evaluation System (SAGE)**. It is organized by system module to track the historical decisions, current implementations, and future roadmap for every component of the application.

---

## 1. Core Infrastructure & Authentication (Global / S01-S03)

### Phase 1: Foundation (Older)
*   **Tech Stack Setup:** Initialized the project with React 19, Vite, and Tailwind CSS v4. Applied custom `@theme` brand colors (Sage Green, Emerald) and imported font families (Sora, DM Sans, JetBrains Mono).
*   **Mock Database Engine:** Engineered `src/lib/mockDb.js`, a persistent LocalStorage database to simulate a relational structure without a backend, allowing rapid UI prototyping.
*   **Authentication Prototype:** Built the split-screen Login Page (S01) with simulated server-side role resolution. Added a "Quick Demo Accounts Selector" drawer for instant testing across the four user roles.
*   **Vector Assets:** Integrated custom spline-vectorized binary SVGs for the SAGE logo and branding elements.

### Phase 2: Core Enhancements (Current)
*   **State Propagation:** Refined the `mockDb` to support dynamic, real-time state propagation across all portals upon page refresh (e.g., changes in Admin immediately reflect in Faculty/Dean dashboards).
*   **Computation Engine Architecture:** Established the core mathematical logic for the Early Warning System (EWS) and the base-50 running grade formula to be used globally across the app.

### Phase 3: Backend & Production (Completed)
*   **Supabase Migration:** Replaced `mockDb.js` hooks with a live Supabase PostgreSQL database utilizing the fully mapped 26-table schema.
*   **Security & RLS:** Implemented Row Level Security (RLS) policies and explicit Postgres role grants (`anon`, `authenticated`, `service_role`).
*   **Production Authentication:** Integrated genuine JWT-based authentication via Supabase Auth.
*   **In-App Alerts Modals**: Replaced native browser alerts with custom modals (`ConfirmModal`, `SuccessModal`, and `ErrorModal`) designed at z-index `z-[100]` to stack cleanly above overlay panels.

---

## 2. Admin Portal (S04-S14)

### Phase 1: Foundation (Older)
*   **User & Class Setup:** Created the User Management registry and basic Classrooms Directory. 
*   **Evaluation Builder:** Developed the Evaluation Form Builder (S09-S10) with drag-and-drop criteria reordering, max rating adjustments, and a side-by-side Live Preview panel.
*   **Self-Enrollment Concept:** Initially planned "Class Join Codes" and "COR Validation" for student self-enrollment.

### Phase 2: Core Enhancements & Policy (Current)
*   **Enrollment Overhaul:** Cut the "Class Join Codes" and "COR Validation" features entirely to avoid conflicts with DYCI's official enrollment system. 
*   **CSV Registry Imports:** Implemented CSV parser panels (FR28) allowing admins to copy-paste/import official registry files with interactive preview grids before saving.
*   **Faculty Reassignment:** Cut the complex "Co-Teaching Support" model. Replaced it with a cleaner Faculty Reassignment feature (FR29) supported by a `class_faculty_log` for tracking reassignment history and auditing (FR30).
*   **Class Archiving:** Added the ability to archive classes at the end of the semester, permanently locking grades and preventing new enrollments (FR31).
*   **Evaluation Scheduler & Overrides:** Built the timer-driven Evaluation Windows Scheduler targeting sections/faculty, and the Grade Override Module requiring mandatory reason auditing.

### Phase 3: Term Transition & Enrollment (Completed)
*   **Live Semester Transition Wizard**: Built the 3-step transition panel using layman-friendly terms. Connected it to the PostgreSQL stored transaction `perform_semester_transition`.
*   **Automatic Archival & Year Promotions**: Programmed automatic logging of student histories in `student_term_details`, archiving of past classes, late submission flagging, and promotions of year levels (including 4th Year to "Graduating").
*   **Irregular Student Management**: Added a regular/irregular toggle on user edit forms, sorting manual enrollments on top of class rosters, and candidate filtering to search unassigned students during enrollment.

---

## 3. Dean Portal (S15-S21)

### Phase 1: Foundation (Older)
*   **Dashboard Basics:** Implemented basic strategic summary counters and static matrix tables for grade distribution.
*   **Evaluation Summaries:** Created basic directories for cumulative faculty ratings and feedback.

### Phase 2: Core Enhancements & Policy (Current)
*   **Grade Tracking:** Deployed the Grade Posting Status matrix (S16) tracking posted vs. pending submissions (Prelim, Midterm, Finals) across all faculty.
*   **Advanced Analytics UI:** Built the Grade Distribution dashboard featuring a custom CSS Grade Bracket Distribution Chart and average GWA calculators.
*   **At-Risk Warning List (S20):** Activated the Early Warning System UI for Deans, tracking students with low running GWAs, color-coded by severity (Safe, At-Risk, Failing).
*   **Report Exporter:** Finished the Summary Reports Exporter with specialized printer stylesheets handling page breaks and print layouts.

### Phase 3: Late Badging & AI (Current & Upcoming)
*   **Late Submission Flags**: Dynamic alert badges appear in the Dean's override dashboard for submissions posted after semester transition.
*   **Dean AI Predictions**: Integrating the Claude API to analyze faculty evaluation data and generate "AI Fitness Performance Verdicts."
*   **Institutional AI Alerts**: Enabling active "AI Performance Prediction & Warning" notifications on the Dean Dashboard based on cross-sectional data analysis.

---

## 4. Faculty Portal (S22-S28)

### Phase 1: Foundation (Older)
*   **Class Records:** Built the section summary overviews and basic spreadsheet scorecards.
*   **Weight Setup:** Created the Grade Components Weight Setup inputs with basic sum validators.

### Phase 2: Core Enhancements & Policy (Current)
*   **Strict Grading Formulas:** Hardcoded the official DYCI weighting policy: **50% Class Standing, 10% Character, 40% Term Exam**.
*   **Multi-Term Progression:** Implemented the 4-term calculation logic (Prelim, Midterm, Semi-Final, Final).
*   **Intermediate Rounding:** Applied exact mathematical rounding for intermediate ratings (Midterm Rating, Tentative Final Rating, Semestral Grade) to match DYCI's Excel logic perfectly.
*   **GWA Transmutation:** Built the automated transmutation logic mapping Semestral Grades to the 1.00 - 5.00 scale and Pass/Fail remarks.
*   **Live Early Warning System:** Added real-time visual standing indicators (Green/Yellow/Red dots) and precise percentage hover tooltips to the Score Input Table (S24).

### Phase 3: Attendance, FDA, & Exports (Completed & Current)
*   **Daily Attendance Tracker**: Completed the daily attendance sheet featuring debounced background saves, history quick-load session buttons, and double-confirmation checks on new date initializations.
*   **FDA Grade Worksheet Locks**: Triggering FDA (&ge; 4 absences) forces the GWA to **5.00** and disables the worksheet remarks dropdown.
*   **SheetJS Excel Exports (Upcoming)**: 
    *   **Record Sheet:** Finalizing the export so that outputted grading sheets contain live Excel formulas mimicking the official DYCI spreadsheet.
    *   **Report of Grades:** Building the registrar print layout featuring a symmetrical 30-row split roster linked via cell formulas.
*   **Real-time Notifications**: Wiring Supabase real-time subscriptions for instant alerts regarding new evaluation windows or administrative grade overrides.

---

## 5. Student Portal (S29-S35)

### Phase 1: Foundation (Older)
*   **Dashboard & Surveys:** Designed the basic course registry, period score displays, and the interface for taking active evaluation surveys.

### Phase 2: Core Enhancements & Policy (Current)
*   **EWS Visibility:** Applied warning flag indicators on the student's subject list to mirror the Early Warning System from the Faculty portal.
*   **Detailed Breakdowns:** Enhanced the grade viewing screens to show precise score breakdowns across the 50/10/40 components so students understand exactly how their grade was computed.

### Phase 3: Dashboard Fixes & AI (Completed & Upcoming)
*   **Irregular Student Routing**: Rewrote student dashboard, evaluation, and grades ledger queries to fetch classes and surveys via the `enrollments` table, resolving lockouts.
*   **Student AI Advisor (S34)**: Full integration of the Claude API to act as an automated performance counselor. The AI will ingest the student's component scores, diagnose specific weakness metrics, and render personalized academic recommendations.
*   **Anonymized Submissions**: Ensuring via backend RLS that evaluation survey submissions are completely stripped of student identifiers before being aggregated for the Faculty and Dean dashboards.
