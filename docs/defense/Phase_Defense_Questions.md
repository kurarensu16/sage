# SAGE Major Update — Defense Questions (Panelist Style)

Here are potential questions a defense panelist might ask for each phase. They are phrased in a direct, conversational style so you can practice how you would answer them during your actual capstone defense.

---

## 🏢 Phase 1: Multi-Tenancy & School Isolation
1. **Requirement:** Why do we need multi-tenancy or school isolation? This was originally designed just for DYCI, right? Is there a business plan to sell this to other schools as a SaaS?
2. **Data Security:** If multiple schools share the same database, how can you guarantee that one school can't access another school's data? Is it truly safe from data leakage?
3. **Scalability:** If a new school decides to use your system, how hard is it to set them up? Is it a manual backend configuration, or is the onboarding automated?

## 🔐 Phase 2: Secure Authentication & College Office Portal
1. **HWID / Fingerprinting:** You mentioned browser fingerprinting to avoid frequent OTPs. What happens if a user clears their browser cache or moves to a different computer in a lab? Won't the constant OTP requests become a hassle?
2. **Role Boundaries:** What prevents a `department_admin` (College Office) from simply changing their department tag in the system to view grades and records from another college?
3. **Onboarding:** You removed public registration, meaning all accounts must be created by an admin. Won't that cause a massive bottleneck at the start of the semester when thousands of accounts need to be created?

## 🧮 Phase 3: Standardized Subject Grading Computations
1. **Faculty Autonomy:** Why lock the grading weights entirely per subject? Couldn't you set them as defaults but still give professors the freedom to adjust them for their specific sections if needed?
2. **Mid-Term Updates:** What happens if the admin changes their mind and updates a grading template (e.g., changing exams to 50%) in the middle of the semester? Will that break the existing grades already encoded by the professors?
3. **Edge Cases:** How do you handle subjects that don't fit into your standard templates? For example, special project classes that are purely output-based and have no written exams?

## 📝 Phase 4: Professor-Led Enrollment & COR Verification
1. **Storage Costs:** Since you require a COR (PDF file) upload for every student every semester, won't your server storage fill up quickly? What is your retention policy for these files?
2. **Pending Students:** What happens if a student's COR verification is still `pending` but they've already taken a quiz in the classroom? Where do their grades go if they aren't officially active in your system yet?
3. **Join Code Leaks:** What if a student shares the join code in a public group chat and random people join the class? How can the professor filter them out quickly?

## 📊 Phase 5: Grade Posting & Student Acknowledgment
1. **Acknowledgment:** What if a student just ignores the banner and doesn't click the "Acknowledge" button for their midterm grade? Does it have any effect on your system, or will it block them from anything?
2. **FDA (Failure Due to Absence):** For the FDA badge that appears after 4 absences, does the system automatically fail the student, or is it just a warning/recommendation left to the professor's discretion?
3. **Accidental Locks:** What if a professor makes an encoding mistake and accidentally clicks "Post Semestral Grade" (SG) too early? Since it locks the class record, how can they fix it before it goes to the registrar?

## 📁 Phase 6: Grade Change Requests & File Uploads
1. **Tech Stack:** Why do you need to use Cloudflare R2 for uploading evidence in the Grade Change Request? Couldn't you just use Supabase Storage to keep everything on one platform?
2. **Approval Delays:** What if it's the deadline for grade submissions and the Dean is offline or hasn't approved the grade change request in the system? Is there an override mechanism for the registrar?
3. **Audit Trail Integrity:** How do you protect your audit logs? Could an admin tamper with or delete them to hide unauthorized grade changes?

## 🎓 Phase 7: Evaluation Locks, Clearance, & Dean Gates
1. **Retaliation:** You separated "On-time" and "Late" evaluations. What stops a student from waiting until the window closes to submit a bad "Late" evaluation as revenge against a professor who failed them?
2. **Dropped Classes:** What if a student drops a subject mid-semester? Do they still need to evaluate that dropped professor just to unlock their grades in their other subjects?
3. **Dean Gate Transparency:** If the Dean chooses NOT to release the evaluation results to a professor (`is_released_to_faculty = false`), does the system inform the professor why their results are on hold?
