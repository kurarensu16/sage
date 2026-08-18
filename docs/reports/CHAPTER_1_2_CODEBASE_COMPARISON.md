# Chapter 1 & 2 Documentation vs. SAGE Codebase Comparison Report

**Document Analyzed**: `Chapter12_With_Diagrams.docx`  
**Repository**: SAGE (`c:\Users\sadia\SAGE`)  
**Date**: August 5, 2026  

---

## Executive Summary

This document presents a comprehensive comparison between the updated Capstone Thesis documentation (**Chapter 1: Project Rationale** and **Chapter 2: System Development** contained in `Chapter12_With_Diagrams.docx`) and the actual implementation state of the **SAGE (Smart Academic Grading & Evaluation System)** codebase.

The updated documentation introduces significant expansions across:
1. **User Roles & Portals**: Introducing a 5th dedicated role and portal — **College Office (Department Admin)**.
2. **Grading & Evaluation Mathematics**: Adding subject program-specific Computation of Grades (COG) templates (General Ed, Health Sciences Theory/RLE, Maritime) and 2-term Summer vs 4-term Regular period branching.
3. **Anti-Retaliation & Privacy**: Adding **Dual-Channel (On-Time vs. Late) Evaluation Filters**, **Retaliation-Drift Analytics**, and **Semestral Grade (SG) Column Blurring** until survey completion.
4. **Third-Party Infrastructure**: Specifying Cloudflare R2 object storage, Gmail SMTP relay, and Device-Fingerprint Multi-Factor Authentication (MFA).
5. **Academic Frameworks**: Defining TAM 4-point Likert scale metrics, ISO/IEC 25010:2023 software quality evaluation, and a 12-phase Iterative SDLC model.

---

## Master Feature Matrix & Implementation Gap Analysis

| Feature Area | Specifications in `Chapter12_With_Diagrams.docx` | Current Codebase Implementation (`c:\Users\sadia\SAGE`) | Status & Action Required |
| :--- | :--- | :--- | :--- |
| **Portals & Roles** | **5 Portals**: Student, Faculty, Dean, **College Office (Department Admin)**, System Administrator. | **4 Portals**: `src/pages/` contains `admin/`, `dean/`, `faculty/`, `student/`. No `college_office/` folder. | ⚠️ **Gap**: Create `college_office/` pages for Roster Import (CSV) and Clearance Auditing. |
| **Data Layer** | Cloud-hosted Supabase Postgres DB with active Row-Level Security (RLS) and `school_id` multi-tenancy. | **`mockDb.js` (localStorage)** for Admin/Dean; inline arrays for Faculty/Student. Supabase RLS is currently **disabled**. | ⚠️ **Gap**: Complete migration to Supabase DB and enable RLS per `docs/workflows/Supabase-Migration.md`. |
| **Cloud Services** | **Cloudflare R2** (COR uploads, grade change evidence) and **Gmail SMTP Relay** (account activation & OTP). | Mocked or in-memory; no Cloudflare R2 SDK or SMTP mailer integrated in codebase. | 💡 **Info**: Integrate Cloudflare R2 bucket storage & SMTP endpoints if live file hosting is required. |
| **Authentication & MFA** | **Device Fingerprinting MFA** (`user_trusted_devices` table) with OTP verification for new devices. | Standard split-screen login with `AuthContext.jsx` and Quick Demo Accounts Selector drawer. | ⚠️ **Gap**: Implement device-fingerprint hashing and OTP prompt for unrecognized devices. |
| **Grading Engine & COG Templates** | **Program COG Templates** (Gen Ed 50/40/10, Health Sciences 30/60/10 & RLE, Maritime) + **Summer 2-term (MR, Final)** vs **Regular 4-term** branching. | Fixed 4-term regular progression (Prelim, Midterm, Semi-Final, Final) using standard 50/10/40 weighting across all subjects. | ⚠️ **Gap**: Update `ScoreInput.jsx` and grading helpers to support program COG templates and Summer term branching. |
| **Grade Release & Survey Gating** | Semestral Grade (SG) column **blurred & locked** on `My Grades` until student completes survey. Late surveys unlock grades but are flagged late. | Survey submission exists, but automated visual column blurring / late-flag exclusions are basic. | ⚠️ **Gap**: Enforce SG blurring until survey submission; pass `is_late` flag to evaluation engine. |
| **Faculty Evaluation Analytics** | **Dual-Channel View** (On-Time Official vs. Late Informational vs. Combined) with **Retaliation-Drift Cards**. | Basic rating charts & comment lists viewable upon Dean release. | ⚠️ **Gap**: Add On-Time / Late toggle buttons and delta-rating calculation for Deans/Faculty. |
| **Roster Verification & COR** | Students upload Certificate of Registration (COR) on onboarding; Faculty approve/reject join code queue. | Simple join code / section roster list. | ⚠️ **Gap**: Add COR file viewer & approval/rejection toggle in Faculty roster view. |
| **Grade Acknowledgment & Reset** | Students click "Acknowledge Grade"; editing an acknowledged grade resets status and notifies student. | Grade posting exists; automatic acknowledgment reset loop on edit is unlinked. | ⚠️ **Gap**: Add acknowledgment status column and reset logic upon faculty grade updates. |
| **Subdomain Multi-Tenancy** | Runtime subdomain resolution (e.g. `dyci.sage.edu.ph`) dynamically switching tenant logo/watermark. | Static single-tenant branding using `SageLogo.jsx` and local DYCI constants. | 💡 **Info**: Implement hostname/subdomain parsing in frontend layout wrapper. |

---

## Detailed Breakdown by Chapter

### Chapter 1: Project Rationale

1. **Statement of Problems & Specific Objectives**:
   - **System Portal Integration**: Consolidated across 5 role-based portal interfaces (Student, Faculty, Dean, College Office, System Administrator).
   - **Grading Automation**: Explicit compliance with DYCI program COG templates (50-40-10 for Gen/Prof Ed, 30-60-10 for Health Sciences Theory, multi-component RLE and Maritime Education), branching between regular (4 terms) and summer (2 terms) periods.
   - **Time-Bound Evaluation**: Active survey window scheduler controlled by administrators.
   - **Student Data Privacy**: Student identity masking and anonymization filters stripping student IDs/names from evaluation responses.
   - **Diagnostic Analytics**: GWAs below 3.00 flagged with color-coded risk warning badges and heuristic AI counselor advisory recommendations.
   - **TAM & ISO 25010 Validation**: Evaluated via a 4-point Likert scale (forced-choice omitting neutral midpoint) across 50 participants, alongside ISO/IEC 25010:2023 software quality characteristics.

2. **Scope and Delimitation**:
   - **Delimited Functions**: End-of-term Semester Purge Utility soft-deleted/disabled pending review; deterministic rule-based AI advisory logic (no external generative AI/LLM APIs); single-tenant deployment for DYCI despite multi-tenant DB capability; static global admin tenant settings.

3. **Theoretical & Conceptual Frameworks**:
   - **Theoretical Foundation**: Technology Acceptance Model (TAM - Davis, 1989), DeLone & McLean IS Success Model (1992, 2003), Tinto’s Student Integration and Retention Theory (1975, 1993), Cognitive Load Theory (Sweller, 1988).
   - **Conceptual Model**: Input-Process-Output-Feedback (IPOF) research model detailing data flow and validation loops.

---

### Chapter 2: System Development

1. **Development Methodology**:
   - **Iterative and Incremental SDLC Model**: Detailed across 12 explicit phases (Initial Planning, Planning, Requirements, Analysis & Design, Implementation, Testing, Evaluation, Next Iteration cycles, Deployment).

2. **Architectural & System Design (DFDs & VTOC)**:
   - **Level 0 Data Flow Diagram (Context Diagram)**: Maps inputs and outputs across all 5 user roles.
   - **Level 1 Data Flow Diagrams**: Detailed sub-process flows for Student (2.0), Faculty (3.0), College Office (4.0), Dean (5.0), and System Administrator (6.0).
   - **Visual Table of Contents (VTOC)**: Complete menu hierarchy mapping across core academic portals and support governance portals.
   - **ERD & Data Model**: 4 functional database layers: Identity & Access, Academic Structure, Performance & Grades, Evaluations & Logs.

3. **Testing, Deployment & Maintenance**:
   - **Testing Types**: Unit testing on COG formulas, integration testing on authentication & evaluation locks, system end-to-end testing, UAT.
   - **Instruments**: TAM 4-point Likert questionnaire measuring Perceived Ease of Use (PEOU), Perceived Usefulness (PU), and Behavioral Intention (BI), with Cronbach's alpha reliability checks.

---

## Action Plan for Alignment

To align the codebase with the updated thesis documentation:

1. **Phase 1: College Office Portal (`src/pages/college_office/`)**
   - Create `RosterImport.jsx` for CSV bulk user uploads.
   - Create `ComplianceAudit.jsx` to monitor student evaluation progress for clearance sign-off.

2. **Phase 2: Enhanced Grading Engine (`ScoreInput.jsx`)**
   - Implement program-specific COG template selectors (Gen Ed, Health Sciences, Maritime).
   - Add term branching logic for Summer (2 terms: Midterm, Final) vs Regular (4 terms).

3. **Phase 3: Dual-Channel Evaluation & Clearance Locking**
   - Implement On-Time vs. Late feedback filters in Dean and Faculty dashboards.
   - Add Retaliation-Drift delta score visual cards.
   - Enforce blurring on the Semestral Grade (SG) column in `MyGradesList.jsx` until survey submission.
