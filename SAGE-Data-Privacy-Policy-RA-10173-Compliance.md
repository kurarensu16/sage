# Implementation Plan: SAGE Data Privacy Policy (RA 10173 Compliance)

## 📌 Goal Description
Develop and integrate a comprehensive, legally aligned **SAGE Data Privacy Policy** strictly governed by the **Philippine Data Privacy Act of 2012 (Republic Act No. 10173)** and its Implementing Rules and Regulations (IRR).

Because SAGE processes personal, academic, and administrative data across five user roles (Students, Faculty, Deans, College Office, and Admins)—including user profile metadata, enrolled subject loads, grade rosters, attendance logs, anonymous faculty evaluation ratings, and mobile push notification device tokens (`ph.edu.dyci.sage`)—a formal Privacy Policy guarantees institutional compliance and neutralizes panel scrutiny during thesis defense.

> [!IMPORTANT]
> **Zero Code Breakage Guarantee**: This implementation is **strictly additive and read-only**. It will **not modify, alter, or break any existing code logic, database tables, or core portal features**.

---

## 📄 Complete Content Outline of the Privacy Policy

The Privacy Policy will contain 8 comprehensive, legally structured sections tailored specifically to Dr. Yanga's Colleges, Inc. (DYCI) and SAGE's multi-portal architecture:

```
                          SAGE PRIVACY POLICY CONTENT STRUCTURE
                                            │
   ┌──────────────────────┬─────────────────┴─────────────────┬──────────────────────┐
   ▼                      ▼                                   ▼                      ▼
1. RA 10173 MANDATE    2. DATA CATEGORIES                  3. PROCESSING PURPOSES 4. ANONYMITY MECHANICS
Scope & Principles     Profiles, Grades, Telemetry        Grade Calc, Alerts,    Tokenized Evaluation
(Transparency,         (Note: COR Uploads                 Evaluations, FCM Push  Protection (FR25)
Legitimate Purpose)    Explicitly Removed)                Notifications          
   │                      │                                   │                      │
   ▼                      ▼                                   ▼                      ▼
5. SECURITY & RLS      6. RETENTION & DISPOSAL             7. DATA SUBJECT RIGHTS 8. DPO CONTACT INFO
Supabase Encryption &  CHED & Registrar                    Access, Rectification,  Data Privacy Office &
Role Isolation         Schedules                           Portability, Objections SAGE Support Contact
```

### Section 1: Institutional Policy Statement & Regulatory Mandate
* **Legal Anchor**: Enforces compliance with **Republic Act No. 10173 (Philippine Data Privacy Act of 2012)** and CHED memorandum guidelines.
* **Scope**: Applies to all registered users (Students, Faculty, Deans, College Office, and System Administrators) at Dr. Yanga's Colleges, Inc. (DYCI).
* **Core Privacy Principles**: Adheres to **Transparency**, **Legitimate Purpose**, and **Proportionality**.

### Section 2: Categories of Personal Information Processed
1. **User Account Profile Data**: Full Name, Student/Faculty/Staff ID Number, Institutional Email (`@dyci.edu.ph`), Program, Department/College Unit, Year Level, Account Role, and Profile Status.
2. **Academic & Grading Records**: Enrolled Subject Loads, Section Blocks, Raw Formative Activity Scores, Milestone Term & Semestral Grades, Attendance Logs, and Grade Override/Correction Requests.
3. **Faculty Evaluation Data**: Aggregated 1–4 Likert survey ratings and qualitative feedback comments. *(Strictly decoupled from student identities)*.
4. **Mobile & System Telemetry**: IP Addresses, User-Agent Device Strings, Encrypted Session JWTs, and Firebase Cloud Messaging (FCM) Push Notification Tokens (`public.user_push_tokens`).
5. **Explicit Exclusions**: *Certificate of Registration (COR) document file uploads are explicitly excluded as the feature has been removed from SAGE.*

### Section 3: Specific Purposes of Data Processing
* **Automated Grade Computation**: Calculating milestone grades and GWA forecasts based on approved COG templates.
* **Academic Performance Tracking & Early Warnings**: Generating Absence Advisories (FDA warnings for $\ge 4$ absences) and AI-driven academic counseling insights.
* **Faculty Instruction Quality Evaluation**: Conducting time-bound, anonymous faculty evaluations without academic retaliation risk.
* **Real-time Mobile Notification Dispatch**: Delivering instant notifications for grade postings, evaluation window openings, and clearance alerts via Supabase Realtime and FCM (`ph.edu.dyci.sage`).
* **Auditability & Accountability**: Maintaining an immutable administrative audit ledger (`public.activity_logs`) to prevent unauthorized grade modifications.

### Section 4: Data Anonymization & Faculty Evaluation Protection Mechanics
* **Tokenized Survey Submissions**: Student evaluation responses are submitted via anonymized transaction tokens.
* **Identity Decoupling**: Student names, ID numbers, and section blocks are completely stripped from survey rating rows (`public.evaluation_ratings` and `public.evaluation_comments`).
* **Aggregated Reporting**: Faculty members and Deans access aggregated rating scores and anonymized comment feeds only after survey windows officially close.

### Section 5: Data Storage, Security & Access Control Protocols
* **Database Security**: Hosted on Supabase managed PostgreSQL with Row-Level Security (RLS) policies enforcing strict role isolation.
* **Transport Encryption**: All web and mobile HTTP communications enforced via Transport Layer Security (TLS/HTTPS).
* **Mobile Session Security**: FCM tokens stored in `public.user_push_tokens` with user-scoped isolation; session tokens encrypted in client storage.

### Section 6: Data Retention & Secure Disposal Schedule
* **Academic Records**: Retained in alignment with CHED guidelines and DYCI institutional registrar retention schedules.
* **Mobile Push Device Tokens**: Automatically invalidated upon user logout or account archiving.
* **Testing & Capstone Evaluation Data**: Research survey responses anonymized or destroyed upon official capstone defense completion.

### Section 7: Rights of Data Subjects Under RA 10173
Details data subject rights guaranteed to DYCI students, faculty, and staff:
1. *Right to be Informed*
2. *Right to Access Personal Data*
3. *Right to Rectification / Correction*
4. *Right to Object / Suspend Processing*
5. *Right to Data Portability*

### Section 8: Data Protection Officer (DPO) & Support Contact
* Provides formal contact channels for privacy inquiries: `privacy@dyci.edu.ph` / SAGE Capstone Project Team.

---

## 🛠️ Proposed Additions (Additive & Read-Only)

### Component 1: Academic & Institutional Documentation
#### [NEW] [`misc/SAGE_Privacy_Policy.md`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/misc/SAGE_Privacy_Policy.md) & `.docx`
* Create the complete, formal, 8-section Data Privacy Policy document formatted for academic submission and defense appendix inclusion.

---

### Component 2: Frontend Web & Mobile UI Integration

#### [NEW] [`src/pages/public/PrivacyPolicy.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/public/PrivacyPolicy.jsx)
* A modern, responsive, read-only React component rendering the privacy policy with tabbed navigation or section headers (Dark Slate theme matching SAGE UI aesthetics).

#### [MODIFY] [`src/App.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/App.jsx)
* Register public route `/privacy` mapping to `PrivacyPolicy.jsx` (No auth required, open to all visitors).

#### [MODIFY] [`src/pages/public/Login.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/pages/public/Login.jsx)
* Add a subtle, professional footer link at the bottom of the login card:  
  `🔒 Data Privacy Act (RA 10173) Compliant | Privacy Policy`

#### [MODIFY] [`src/components/layout/SmartInstallModal.jsx`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/sage/src/components/layout/SmartInstallModal.jsx) (or Sidebar)
* Add a reference link in the installation modal informing mobile students that the Android APK (`ph.edu.dyci.sage`) complies with RA 10173.

---

## 🧪 Verification Plan

### Automated & Build Checks
- Run Vite dev build (`npm run dev`) to ensure `/privacy` route renders without console errors.
- Run production build (`npm run build`) to confirm zero compilation or bundling issues.

### Manual Cross-Platform Verification
1. **Public Browser Access**: Visit `http://localhost:5173/privacy` ➔ Confirm page loads cleanly without requiring login.
2. **Login Page Footer Check**: Visit Login page ➔ Click "Privacy Policy" link ➔ Navigates smoothly to `/privacy`.
3. **Mobile & PWA Inspection**: Open on mobile screen simulation ➔ Verify typography, touch targets, and readable layout.
