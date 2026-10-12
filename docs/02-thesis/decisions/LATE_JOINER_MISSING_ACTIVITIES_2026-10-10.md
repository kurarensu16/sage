# Decision: Late-joining students and missing activities

**Date:** 2026-10-10
**Decided by:** Owner (ghostbyte1014)
**Status:** Current. This describes how the system already behaves; no code change was made.

## Context
A student can join a class after a grade milestone has been posted. This is often an irregular student, and the late enrollment is usually arranged between the office and the family. The activities from earlier, already-posted terms (e.g., before the Midterm Rating) have no scores for this student.

ASPIRE separates two kinds of empty scores:
- **Pending** (blank cell): the activity has no score yet. It adds **no** risk points.
- **Recorded zero** (a typed `0`): a real result of zero. It **does** add risk points.

A grade stays editable until it is locked by posting; the Semestral Grade (SG) is the final milestone.

## Decision
**For a late joiner, missing work in an already-posted term is entered as `0`.** It is replaced with the real score when the student completes make-up work.

The grade sheet enforces this: when a term is covered by a posted milestone, every cell in that term must hold a number before the class can be saved (`src/pages/faculty/ScoreInput.jsx:1124-1152`). A posted-term cell can later be **corrected to another number**, but never cleared.

## Why
- **ASPIRE is an early-warning system.** If missing work stayed blank ("pending"), the late joiner would get no risk points and would look safe while actually being behind. That is a **false negative**, the most harmful error for an early-warning system.
- **The student sees the gap.** Zeros make the missing requirements visible on their grade and score breakdown.
- **It leads to intervention.** Recorded zeros raise the risk score, so the student appears in *Needs evaluation*. The faculty can then publish an intervention plan with make-up tasks.
- **It is reversible.** Make-up scores replace the zeros; nothing is permanently lost before the SG is posted.

## Alternative considered and rejected
**Keep a late joiner's earlier cells pending until their own milestone is posted** (a per-student check instead of the class-wide one). Rejected because the student would show no risk for missed work, which defeats the system's purpose.

## Points to watch
1. **Posting the MR for a late joiner.** After entering the zeros, the faculty must be able to post the Midterm Rating for that one student, who was not part of the original posting. Verify in QA.
2. **Clear guidance on screen.** The "cannot be empty" message should tell the faculty to enter `0` for missing work and replace it after make-up.
3. **Data-size interaction (important).** Today, classes with more than 1,000 score rows can fail to load some real scores. Those show as empty, and the posted-term rule asks for a number, so a faculty member could type `0` over a **real score that simply didn't load**. This is tracked as **F-02 / E-02 (P0)** in [`06-future-enhancements/SCALABILITY_AND_DATA_HANDLING_2026-10-10.md`](../../06-future-enhancements/SCALABILITY_AND_DATA_HANDLING_2026-10-10.md). The zero policy is sound; the loading problem must be fixed so the policy can't be misapplied.

## Suggested QA cases
- Enroll a student after the MR is posted. The class cannot be saved until that student's earlier posted-term cells have numbers; enter `0`; the student's risk rises and they appear in *Needs evaluation*.
- Replace a `0` with a make-up score; the grade and risk update accordingly.
- Post the MR for the late joiner alone (point 1).
