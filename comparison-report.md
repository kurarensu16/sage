================================================================
FEATURE COMPARISON REPORT
Proposed Features vs. Final Decisions
SAGE: Smart Academic Grading and Evaluation System
Dr. Yanga's Colleges, Inc. — BS Information Technology Capstone
================================================================


----------------------------------------------------------------
SUMMARY OF DECISIONS
----------------------------------------------------------------

  Feature                   Decision    Key Reason
  ─────────────────────────────────────────────────────────────
  Class Join Codes          CUT         DYCI has a separate enrollment system
  COR Validation            CUT         Dependent on join codes; handled externally
  Early Warning System      KEEP        Strongest feature; no new tables; feeds AI
  Co-Teaching Support       REPLACED    Simpler solution exists for the use case
  Class Archiving           KEEP        Low effort; necessary for semester cleanup


================================================================
FEATURE 1 — CLASS JOIN CODES
================================================================

FINAL DECISION: CUT

────────────────────────────────────────
A. PROPOSED BY GROUPMATES
────────────────────────────────────────

Description:
  Admin creates a classroom by linking subject, section, and
  faculty. System generates a unique 6-8 character alphanumeric
  join code. Students self-enroll by inputting the code into a
  Join Class modal.

Proposed Functional Requirements:
  FR27 - Admin creates classrooms by linking subject, section,
         and faculty.
  FR28 - System generates a unique join_code upon class creation.
  FR29 - Assigned faculty is notified when a class and code
         are generated.
  FR30 - Faculty can view the join_code on their dashboard to
         share with students.
  FR31 - Students can input the join_code to self-enroll.

Database Changes Proposed:
  class_records: Add join_code (VARCHAR, Unique)
  class_records: Add status (ENUM: active, archived)

Strengths:
  + Solves the irregular student problem cleanly
  + Reduces admin workload for manual enrollment encoding
  + Mirrors familiar tools like Google Classroom — zero
    learning curve for students
  + Simple to implement and highly demonstrable during defense

Weaknesses:
  - Students could join the wrong class if codes are shared
    unintentionally
  - No cross-check with official registrar records
  - Creates a parallel enrollment path that conflicts with
    DYCI's existing enrollment system
  - Panel may question why a grading system handles enrollment

────────────────────────────────────────
B. FINAL DECISION
────────────────────────────────────────

Reasoning:
  DYCI already has a separate enrollment system that handles
  all student enrollments — regular and irregular. SAGE should
  not duplicate this responsibility. Adding join codes creates a
  conflict over which system is the source of truth for
  enrollment data. The panel will immediately ask: "Why does a
  grading system have an enrollment feature when there is
  already an enrollment system?" There is no strong answer to
  that question.

Replacement:
  Admin imports enrolled students via CSV at the start of each
  semester — a clean handoff from the existing enrollment system
  into SAGE. No self-enrollment needed.

Impact on Documents:
  REMOVE: FR27-FR31 (old join code requirements)
  ADD:    FR27 (new) — Admin shall be able to create a classroom
          by linking a subject, section, and faculty member.
  ADD:    FR28 (new) — Admin shall be able to import enrolled
          students into a class via CSV.


================================================================
FEATURE 2 — COR VALIDATION
================================================================

FINAL DECISION: CUT

────────────────────────────────────────
A. PROPOSED BY GROUPMATES
────────────────────────────────────────

Description:
  Students upload their Certificate of Registration (COR) when
  joining a class via join code. The system stores the latest
  COR per student for reuse across semesters. Faculty and Admin
  can randomly audit uploaded CORs.

Proposed Functional Requirements:
  FR32 - Students shall upload or reuse their latest COR
         upon joining a class.
  FR33 - Faculty and Admin shall have the capability to
         randomly audit COR uploads.

Database Changes Proposed:
  users:       Add latest_cor_url (TEXT)
  enrollments: Add cor_url (TEXT)
  New Supabase Storage bucket: student_cors

Strengths:
  + Adds accountability to the self-enrollment flow
  + Reuse feature is thoughtful UX — no re-upload every semester
    if COR hasn't changed
  + Audit capability gives oversight without making it mandatory
    to check every single upload

Weaknesses:
  - COR contains sensitive personal data — RA 10173 compliance
    becomes more critical
  - File storage adds infrastructure complexity
  - No automatic rejection flow — relies entirely on manual
    auditing by faculty or admin
  - Directly dependent on the self-enrollment feature — if join
    codes are cut, COR validation has no trigger point

────────────────────────────────────────
B. FINAL DECISION
────────────────────────────────────────

Reasoning:
  COR validation is directly dependent on the self-enrollment
  flow. Since join codes were cut, there is no trigger point
  for COR upload in SAGE. Furthermore, the existing DYCI
  enrollment system already validates student registration
  before students appear in any class list. Adding COR handling
  to SAGE would be redundant and would introduce unnecessary
  file storage infrastructure and data privacy obligations.

Replacement:
  None needed. Enrollment validation is handled entirely
  outside SAGE by the existing enrollment system.

Impact on Documents:
  REMOVE: FR32-FR33 (old COR requirements)
  REMOVE: latest_cor_url field from users table
  REMOVE: cor_url field from enrollments table
  REMOVE: student_cors Supabase Storage bucket


================================================================
FEATURE 3 — EARLY WARNING SYSTEM
================================================================

FINAL DECISION: KEEP

────────────────────────────────────────
A. PROPOSED BY GROUPMATES
────────────────────────────────────────

Description:
  System computes a real-time running grade per student based
  on currently encoded score components using a base-50 formula.
  Students are flagged as Safe (green), At-Risk (yellow), or
  Failing Trajectory (red) on the faculty dashboard. A hover
  tooltip shows the exact running percentage per student.

Proposed Functional Requirements:
  FR09.b - System shall calculate a real-time running grade
           based on current encoded components.
  FR09.c - System shall visually flag students as Safe,
           At-Risk, or Failing Trajectory based on running
           grade thresholds.

Database Changes Proposed:
  None — computed from existing component_scores
  and grade_components data in real time.

Strengths:
  + Directly addresses panel concern about student performance
    monitoring
  + Highly demonstrable during defense — live score changes
    trigger indicator changes in real time
  + Computation logic is clearly defined (base-50 formula)
  + Ties directly into the AI recommendation module — at-risk
    flags feed the student recommendation engine
  + Transforms the Faculty dashboard from passive record-keeping
    to active student monitoring

Weaknesses:
  - Base-50 grading formula must be confirmed per DYCI
    department standards before implementation
  - Running grade is a projection, not a final grade — UI must
    make this distinction very clear to avoid confusion
  - May cause concern if students interpret a projected grade
    as their actual posted grade

────────────────────────────────────────
B. FINAL DECISION
────────────────────────────────────────

Reasoning:
  This is the strongest new feature in the batch. It adds
  genuine academic value, requires no new database tables,
  and directly strengthens the AI recommendation engine by
  providing real-time performance signals. The weakness around
  UI clarity is easily addressed by labeling the indicator
  as "Running Grade (Projected)" rather than "Grade". The
  base-50 formula concern is a pre-implementation task, not
  a reason to cut the feature.

Replacement:
  N/A — kept as proposed with minor UI label clarification.

Impact on Documents:
  ADD: FR32 — System shall compute a real-time running grade
       per student based on currently encoded score components.
  ADD: FR33 — System shall display a visual standing indicator
       per student: Safe (green), At-Risk (yellow), or
       Failing Trajectory (red).
  ADD: FR34 — System shall display a tooltip on At-Risk and
       Failing Trajectory indicators showing the exact
       running percentage.
  ADD: NFR09 — Running grade computation must update within
       2 seconds of a new score being saved.
  MODIFY: S24 (Score Input screen) — Add Running Grade column,
          standing indicator dot, and hover tooltip per row.
  MODIFY: S20 (Faculty Dashboard) — Add At-Risk student count
          card across all classes.


================================================================
FEATURE 4 — CO-TEACHING SUPPORT
================================================================

FINAL DECISION: REPLACED

────────────────────────────────────────
A. PROPOSED BY GROUPMATES
────────────────────────────────────────

Description:
  Replaces the direct faculty_id on class_records with a
  class_faculty junction table. Supports primary faculty and
  co-faculty assignments per class, enabling team teaching,
  substitute assignments, and multi-faculty class management.

Proposed Functional Requirements:
  No explicit FR assigned — proposed as a schema and
  architectural change.

Database Changes Proposed:
  REMOVE: faculty_id from class_records
  ADD:    class_faculty table
          (class_faculty_id, class_record_id, faculty_id,
           is_primary BOOLEAN, assigned_at TIMESTAMP)

Strengths:
  + More flexible architecture — one class can have multiple
    faculty assigned simultaneously
  + Supports real DYCI scenarios: substitute teachers,
    team teaching, department head monitoring
  + is_primary boolean cleanly distinguishes lead from
    support faculty
  + Better long-term database design than a single faculty_id

Weaknesses:
  - Adds JOIN complexity to almost every grade-related query
    in the system
  - Co-faculty permissions need full definition — can they
    post grades? input scores? view evaluations?
  - Significant scope increase — permission logic touches
    every module
  - Panel may question if DYCI actually practices co-teaching
    regularly enough to justify the added complexity

────────────────────────────────────────
B. FINAL DECISION
────────────────────────────────────────

Reasoning:
  The primary use case raised for co-teaching was a faculty
  going on leave mid-semester. That scenario does not require
  two faculty to be simultaneously assigned to a class. It only
  requires the ability to replace one faculty with another
  without disrupting the class record and its existing scores.
  The full co-teaching architecture solves a much larger problem
  than what SAGE v1 actually needs, and introduces permission
  complexity across every module.

Replacement:
  Replaceable Faculty with Audit Log. Admin can reassign a
  class to a new faculty member at any time. The class record
  and all previously encoded scores are fully preserved.
  A new class_faculty_log table tracks the full reassignment
  history for audit purposes.

  class_faculty_log table:
    log_id            UUID        PK
    class_record_id   UUID        FK → class_records
    faculty_id        UUID        FK → users
    assigned_at       TIMESTAMP
    replaced_at       TIMESTAMP   nullable (null = currently active)
    replaced_by       UUID        FK → users (admin)

Impact on Documents:
  REMOVE: class_faculty junction table
  KEEP:   faculty_id on class_records (now updatable by Admin)
  ADD:    class_faculty_log table (18 total tables)
  ADD:    FR29 — Admin shall be able to reassign a faculty
          member to an existing class.
  ADD:    FR30 — The system shall log all faculty reassignments
          with timestamp and actor.
  MODIFY: S04 (Admin Dashboard) — Add Recent Faculty
          Reassignments to activity log.
  ADD:    S12.b — Class Management List screen with reassign
          and archive actions.
  ADD:    S12.c — Class Management Create screen with CSV
          import for student enrollment.


================================================================
FEATURE 5 — CLASS ARCHIVING
================================================================

FINAL DECISION: KEEP

────────────────────────────────────────
A. PROPOSED BY GROUPMATES
────────────────────────────────────────

Description:
  Admin can archive a class at semester end. Archiving prevents
  new enrollments and locks the class from further grading
  edits beyond what is already locked at the posted grade level.

Proposed Functional Requirements:
  FR34 - Admin shall be able to archive a class, preventing
         new enrollments and locking it from further
         grading edits.

Database Changes Proposed:
  class_records: Add status (ENUM: active, archived)

Strengths:
  + Necessary for semester-end cleanup — without this, old
    classes clutter the system indefinitely
  + Low implementation effort — just an ENUM status field
    on class_records
  + Complements the existing is_locked mechanism on
    posted grades
  + Easy and quick to demonstrate during defense

Weaknesses:
  - Behavior for unposted grades at time of archiving needs
    to be explicitly defined
  - No defined notification to faculty before a class is
    archived by Admin

────────────────────────────────────────
B. FINAL DECISION
────────────────────────────────────────

Reasoning:
  Clean, low-effort feature that is necessary for long-term
  system usability. Every academic system needs a way to close
  out a semester's class records cleanly. The weakness around
  unposted grades is addressed by a simple rule: Admin cannot
  archive a class with unposted grades unless all missing
  grades are acknowledged. This is a single validation check,
  not a new feature.

Replacement:
  N/A — kept as proposed with one added rule: system shall
  warn Admin if unposted grades exist before confirming
  archiving.

Impact on Documents:
  ADD:    FR31 (renumbered) — Admin shall be able to archive
          a class, preventing new enrollments and locking it
          from further grading edits.
  ADD:    class_records.status (ENUM: active, archived)
  ADD:    S04 (Admin Dashboard) — Archived Classes count
          added to KPI row.


================================================================
NET CHANGES TO SAGE DOCUMENTS
================================================================

FUNCTIONAL REQUIREMENTS
────────────────────────
  FR27 (new)  ADD     Admin creates a classroom linking subject,
                      section, and faculty.
  FR28 (new)  ADD     Admin imports enrolled students via CSV.
  FR29 (new)  ADD     Admin reassigns faculty to an existing class.
  FR30 (new)  ADD     System logs all faculty reassignments with
                      timestamp and actor.
  FR31 (new)  ADD     Admin archives a class (renumbered from
                      original FR34).
  FR32 (new)  ADD     System computes real-time running grade
                      per student.
  FR33 (new)  ADD     System displays Safe/At-Risk/Failing
                      Trajectory indicator per student.
  FR34 (new)  ADD     System displays tooltip with exact running
                      percentage on at-risk indicators.
  FR27-33     REMOVE  All join code and COR validation
  (old)               requirements cut.

NON-FUNCTIONAL REQUIREMENTS
────────────────────────────
  NFR09       ADD     Running grade computation must update
                      within 2 seconds of a new score saved.

DATABASE / ERD
──────────────
  class_records.status     ADD       ENUM: active, archived
  class_faculty_log        ADD       New table — 18 tables total
  class_faculty            REMOVED   Junction table dropped
  users.latest_cor_url     NOT ADDED COR feature cut
  enrollments.cor_url      NOT ADDED COR feature cut
  student_cors bucket      NOT ADDED COR feature cut

SCREEN LIST
───────────
  S12.b   ADD      Class Management — List
  S12.c   ADD      Class Management — Create (with CSV import)
  S24     MODIFY   Add Running Grade column + standing indicators
  S04     MODIFY   Add Archived Classes KPI + reassignment log
  S20     MODIFY   Add At-Risk student count card
  Join    NOT      All join code and COR screens dropped
  Code    ADDED
  screens


================================================================
CONCLUSION
================================================================

Of the five features proposed, two were kept as-is, one was
replaced with a simpler alternative, and two were cut entirely.

The decisions follow three principles:

  1. Boundary clarity — SAGE does not duplicate responsibilities
     owned by DYCI's existing enrollment system.

  2. Scope discipline — features that add complexity without
     proportional academic value are deferred to future versions.

  3. Defense readiness — every remaining feature can be
     explained, justified, and demonstrated to a panel
     in under two minutes.

The Early Warning System is the standout addition from this
batch. It directly strengthens the core grading module, requires
no new database tables, and provides a highly visible and
demonstrable feature during the capstone defense. It should
be treated as a priority in the implementation sprint plan.

================================================================
End of Report — SAGE Capstone Project, DYCI AY 2025-2026
================================================================