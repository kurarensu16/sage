# SAGE — Smart Academic Grading & Evaluation System

SAGE is a premium, high-fidelity academic portal system engineered for **Dr. Yanga's Colleges, Inc.** It serves as an integrated platform for grading oversight, student evaluations, GWA analysis, academic early risk warning alerts, and administration workflows.

---

## 🚀 Portals & Core Modules

The system is split into **4 main portals** plus public authentication screens, totaling over 35 distinct pages linked together via a unified state engine.

### 1. Shared / Public Screens (S01 – S03)
* **Login Page (S01)**: Split-screen authentication layout. Features server-side simulated role resolution and a **Quick Demo Accounts Selector** drawer.
* **Forgot Password (S02)**: Registered account verification and token dispatch logger.
* **Reset Password (S03)**: Password constraints validator that updates local credentials.

### 2. Admin Portal (S04 – S14)
* **Dashboard (S04)**: Global metrics and live system-wide transaction activity ledger feed.
* **User Management (S05-S06)**: Complete user registry with role management, search filters, and account toggle controls.
* **Classrooms Directory (S07)**: Subject listings with faculty reassignment modals and grade-lock checks on archiving.
* **Class Creation & CSV Registry (S08)**: CSV parser panel allowing copy-pasting of registry files with interactive preview validation grids before saving.
* **Evaluation Form Builder (S09-S10)**: Criteria editor with drag/click reordering, max rating adjustments, and a side-by-side **Student View Live Preview** panel.
* **Evaluation Windows Scheduler (S11-S12)**: Timer-driven window planner targeting sections and faculty, tracking real-time response ratios.
* **Grade Override Module (S13)**: Lookup panel allowing administrators to override locked grade periods with mandatory reason auditing.
* **Audit Ledger (S14)**: audit history logging all reassignments, overrides, AI triggers, and account operations.

### 3. Dean Portal (S15 – S21)
* **Dashboard (S15)**: Strategic summary counters with active **AI Performance Prediction & Warning** alert notifications.
* **Grade Posting Status (S16)**: Matrix tracking posted vs pending grade submissions (Prelim/Midterm/Finals) for all faculty.
* **Grade Distribution (S17)**: Analytics dashboard with average GWA calculators and a custom **CSS Grade Bracket Distribution Chart**.
* **Faculty Evaluations Dashboard (S18-S19)**: Cumulative rating directories linking to detailed breakdowns (question rating bars, anonymized comment cards, and AI fitness performance verdicts).
* **At-Risk Students early Warning (S20)**: Academic risk warning list tracking low running GWAs, color-coded severity indicators, and AI advisories.
* **Summary Reports Exporter (S21)**: Printable preview sheet layout displaying print-formatted reports with printer stylesheet page breaks.

### 4. Faculty Portal (S22 – S28)
* **Overview & Class Records (S22)**: Section summaries.
* **Grade Components Weight Setup (S23)**: Weight setup inputs and weight sum validators.
* **Score Input Table (S24)**: Spreadsheet scorecard featuring computed running GWAs and period grades.
* **Grade Computation Preview (S25-S26)**: Computes final GWA metrics before sealing grades.
* **Evaluation Analytics & Notifications (S27-S28)**: Evaluation scores dashboard and notification system.

### 5. Student Portal (S29 – S35)
* **Dashboard & Subject List (S29-S31)**: Course registries, period scores, and warning flag indicators.
* **Evaluations (S32-S33)**: Active survey window list and anonymized rating forms.
* **AI Advisor (S34)**: Performance advisor diagnosing weakness metrics and rendering counselor recommendations.

---

## 🛠️ Technology Stack

* **Core Framework**: React (Vite bundler)
* **Styling & Theme**: Tailwind CSS v4
  * Anchored on custom `@theme` brand colors: Sage Green (`#022C22` / `sage-900`) and Emerald accent scales.
  * Google Fonts: **Sora** (headers and titles), **DM Sans** (body text), **JetBrains Mono** (GWA stats, grades, and audit timestamps).
* **Icons Library**: Lucide Icons exclusively
* **SVG Vector Assets**: Custom spline-vectorized SAGE logo (`SageLogo.jsx`) Vectorized in binary mode.

---

## 💾 LocalStorage persistent Database Engine (`src/lib/mockDb.js`)

To keep the application prototype dynamic and fully integrated, we engineered a persistent local storage database helper.
* Actions executed in the Admin portal (e.g. creating users, reassigning faculty, overriding grades) update the central store in real time.
* Updates propagate dynamically to the Dean Portal dashboards, Faculty Grade Sheets, and Student Portals on page refresh.

---

## 🏁 Getting Started

To launch the project locally and begin evaluation:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Open browser**:
   Navigate to [http://localhost:5173/](http://localhost:5173/) to launch the Login screen. Use the **Quick Demo Accounts Selector** at the bottom of the card to log in as Admin, Dean, Faculty, or Student instantly.
