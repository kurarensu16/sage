# SAGE Major Update — What to Keep vs. What to Drop

Based on an architectural review of the `SAGE_Major_Update_Phasing_Strategy.md` document and the current state of the SAGE codebase, here is a detailed breakdown of which features should be absorbed into the capstone project and which should be dropped or modified.

---

## ❌ Phase 1: Multi-Tenancy & School Isolation
**Verdict: DROP ENTIRELY**

*   **Why we should drop it:** SAGE is currently designed specifically as a capstone project for DYCI. Multi-tenancy (adding subdomains, tenant resolvers, and a `school_id` foreign key to every single table) is a massive structural change designed for a commercial SaaS product, not an academic requirement.
*   **Impact of keeping it:** It would require rewriting every single database query and enabling complex Row-Level Security (RLS) rules, which conflicts with your current decision to keep RLS disabled.

## ⚠️ Phase 2: Secure Authentication & College Office Portal
**Verdict: KEEP THE PORTAL, DROP THE OVER-ENGINEERING**

*   **What to Keep:** The new `department_admin` role and the College Office portal itself. Allowing a department-level admin to manage their own classrooms, accounts, and student clearances adds realistic administrative depth to the system.
*   **What to Drop (HWID & SMTP):** The HWID (browser fingerprinting) and OTP email verification flows are completely over-engineered for this capstone. Similarly, setting up SMTP for batch CSV email invitations requires third-party services and edge functions.
*   **Alternative:** Keep user creation strictly manual by the Admin or Office staff, and rely on standard Supabase authentication without the custom hardware fingerprinting.

## ✅ Phase 3: Standardized Subject Grading Computations
**Verdict: KEEP FULLY (Highest Priority)**

*   **Why we should keep it:** This is the core academic engine of SAGE. Locking grading weights (e.g., 50% Class Standing, 40% Exams, 10% Character) at the subject level ensures institutional grading consistency.
*   **Codebase Fit:** It integrates perfectly with your existing `SubjectForm.jsx` and prevents professors from arbitrarily changing official DYCI grading formulas. 

## ⚠️ Phase 4: Professor-Led Enrollment & COR Verification
**Verdict: KEEP ENROLLMENT, SIMPLIFY FILE UPLOADS**

*   **What to Keep:** The "Join Code" system. Right now, your database has a real `enrollments` table, but adding students relies entirely on Admin batch CSV imports. Shifting this to a student-driven process (students enter a code, sit in a "pending" queue, and get approved by the professor) removes administrative burden and creates a real, defensible enrollment lifecycle.
*   **What to Modify (COR Uploads):** The spec calls for uploading the COR (Certificate of Registration) to **Cloudflare R2**. Do not introduce a new cloud provider. Simply change this to use **Supabase Storage**, which is already built into your current backend.

## ✅ Phase 5: Grade Posting & Student Acknowledgment
**Verdict: KEEP FULLY**

*   **Why we should keep it:** Releasing grades in three stages (Midterm Rating → Tentative Final Rating → Semestral Grade) perfectly mirrors actual school operations. The student "Acknowledgment" banner adds accountability, and the FDA (Failure Due to Absence) badge is a documented DYCI policy.
*   **Codebase Fit:** You already have the `GradeComputationPreview.jsx` and `MyGradesList.jsx` pages ready for these flags.

## ⚠️ Phase 6: Grade Change Requests & File Uploads
**Verdict: KEEP THE WORKFLOW, SIMPLIFY THE STORAGE**

*   **What to Keep:** The formal Grade Change Request workflow. Allowing professors to submit a correction request (with a written reason) to the Dean's approval queue prevents unauthorized, silent edits to locked grades.
*   **What to Modify:** Just like Phase 4, drop Cloudflare R2 and use Supabase Storage for the evidence file uploads. Also, ensure the 30-day window logic bug in the original document is fixed before coding it.

## ✅ Phase 7: Evaluation Locks, Clearance, & Dean Gates
**Verdict: KEEP FULLY**

*   **Why we should keep it:** Tying the student evaluation survey to grade visibility (blurring the Semestral Grade until evaluations are done) is a brilliant, high-impact feature for a defense panel. 
*   **Dual-Channel Ratings:** The concept of tracking "On-time" vs. "Late" evaluations to prevent student grade retaliation is academically sophisticated and will impress the panelists.
*   **Codebase Fit:** The Dean's `is_released_to_faculty` toggle is already partially implemented in your `EvalResultsOverview.jsx`.

---

## 🎯 Summary of Execution Priorities

If we are going to implement this strategy, we must execute it in this specific order:

1.  **Phase 0 (Prerequisite):** Complete the Supabase Migration (Move Admin/Dean off `mockDb`). None of the above phases will work until this is done.
2.  **Phase 3:** Standardized Grading Templates (Easiest win, highest academic impact).
3.  **Phase 5:** Grade Posting State Machine.
4.  **Phase 7:** Evaluation Locks.
5.  **Phase 6:** Grade Change Requests (Extends the existing Dean page).
6.  **Phase 4:** Enrollment System (Join codes).
7.  **Phase 2:** College Office Portal (Largest scope, save for last).
