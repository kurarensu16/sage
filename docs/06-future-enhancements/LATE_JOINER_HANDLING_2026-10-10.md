# Late-joining students: current behavior and planned improvements

- **Status:** Proposed (documentation only; nothing here is implemented)
- **Priority:** P2 (polish)
- **Written:** 2026-10-10
- **Last revalidated:** never (cross-check against `feature-updates/` and the current code before implementing; same rule as the [scalability specs](scalability/README.md))
- **Related decision:** [`02-thesis/decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md`](../02-thesis/decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md): late joiners get `0` for missing posted-term work so their risk is visible, corrected after make-up.
- **Depends on:** [E-02 grade sheet safe save](scalability/E-02_GRADE_SHEET_SAFE_SAVE.md), so a `0` is never typed over a real score that didn't load.

## 1. Current behavior (code audit, 2026-10-10)

The system **accepts** students who join after a milestone such as the Midterm Rating (MR) has been posted, regular or irregular. Step by step:

| Step | What happens today | Where |
|---|---|---|
| 1. Joining | **Irregular students** join with the class code from *My Subjects* or *Grades*. They are **enrolled immediately**, with no faculty approval and no check of the term or of posted milestones; the request is stored as already approved. **Block-section students** are added through admin enrollment. Both create an `enrollments` row (`section_id` + `subject_id`). | `src/lib/classRoomService.js` → `submitJoinRequest`; `src/pages/student/MySubjects.jsx`, `MyGradesList.jsx` |
| 2. Roster and risk | The student appears on the roster right away. Their earlier activities are **blank (pending)**, so they add **no risk points** until scores are entered. | `classRoomService.js` (class roster with risk), `src/lib/evaluationTracking.js` |
| 3. Grade sheet | Because the class has a posted milestone, every empty cell in a posted term must hold a number. The late joiner's empty Prelim/Midterm cells **block saving for the whole class** until the faculty enters a number (normally `0`, per the decision). | `src/pages/faculty/ScoreInput.jsx` → `findPostedTermEmptyCells` (class-level posted milestones) |
| 4. Posting their MR | After the MR is posted, the posting screen shows **Update MR**. It re-posts the MR for **every enrolled student**, including the late joiner, and only works when every student's required terms are complete. Blanks block it ("Grades cannot be posted for …"); `0` counts as complete. | `src/pages/faculty/GradeComputationPreview.jsx` (post / Update MR); database function `post_grade_milestone_atomic` |
| 5. Notifications | On Update MR, the late joiner receives a **grade-posted** notification (first time for them). Students already notified are skipped (deduplicated), and students whose grade changed get a **grade-changed** notification. | `GradeComputationPreview.jsx` → `notifyGradePosted`, `notifyGradeChanged` |
| 6. Corrections | Make-up scores replace the `0`s; **Update MR** (later TFR/SG) re-posts with the new values. Posted-term cells can be corrected but never cleared. | Same pages; posted-term null-protection trigger |

The database posting function accepts **any subset of students** and re-posts existing rows (`ON CONFLICT … DO UPDATE`). It does not block a second MR posting.

## 2. Gaps found

| ID | Gap | Effect |
|---|---|---|
| LJ-1 | **The faculty isn't told when a student joins late.** Joining with a code is instant and silent. | The faculty finds out only when the grade sheet refuses to save. Until zeros are entered, the late joiner shows **no risk**: a temporary false negative, which is what the zero decision is meant to prevent. |
| LJ-2 | **"Update MR" re-posts the whole class.** Every student's MR row is re-written, and its `posted_at` time is refreshed, even when the values are unchanged. | Unchanged students aren't re-notified (deduplicated). But a refreshed `posted_at` can make an intervention follow-up show as **due** (the follow-up rule looks for a milestone posted after the plan was published), even though nothing changed for that student. |
| LJ-3 | **The blocking message is generic.** The grade sheet says a posted-term cell "cannot be empty", and the posting screen names "missing components". | The faculty may not know the expected action is "enter 0 for missing work, replace after make-up". |
| LJ-4 *(related)* | **A student can't rejoin a subject they were enrolled in before.** `submitJoinRequest` blocks any existing enrollment in the same **subject**, regardless of term or section. | A student retaking a subject in a later term may be told "You are already enrolled". This isn't strictly a late-join issue; verify it before acting. |

> **Update 2026-10-10:** class-code joins now require faculty approval (`docs/03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md`). **LJ-1 is resolved for code joins:** the faculty is notified of each request and sees a late-join hint on the request card when the class has a posted milestone. **LJ-A is partly done:** the notification and hint exist, but the roster badge ("Joined after MR") does not. Students added through admin enrollment still bypass this queue. LJ-B, LJ-C, and LJ-D remain open.

## 3. Planned improvements

| ID | Improvement | Fixes | Files (expected) | Migration |
|---|---|---|---|---|
| LJ-A | **Notify the faculty and flag the student.** When a student joins a class that already has a posted milestone, notify the class's faculty, and show a roster badge: *"Joined after MR: enter missing scores"*. | LJ-1 | `classRoomService.js` (`submitJoinRequest`), `notificationDispatcher.js`, roster UI (`StudentRisk.jsx`, `ScoreInput.jsx`) | No (uses existing notifications) |
| LJ-B | **Post only for students who need it.** On Update MR, send only students who are **new** (no posted row) or whose grade **changed**, so unchanged students keep their original `posted_at`. The database function already accepts subsets. | LJ-2 | `GradeComputationPreview.jsx` (build `postRows` from new/changed students only) | No |
| LJ-C | **Clearer guidance.** Grade sheet: *"\<Name\> joined after the Midterm Rating was posted. Enter 0 for missing work and replace it when make-up work is completed."* Posting screen: the same hint when a late joiner blocks posting. | LJ-3 | `ScoreInput.jsx` (posted-term notice), `GradeComputationPreview.jsx` (posting alert) | No |
| LJ-D | **Term-aware duplicate check (verify first).** Block a duplicate only for an enrollment in the same subject **and the same active term/section**. | LJ-4 | `classRoomService.js` (`submitJoinRequest`, `resolveJoinRequest`) | Maybe |

**Unchanged by all of these:** the zero rule itself, the posted-term protection, and acceptance of irregular and late students.

## 4. Tests (when implemented)
- A student joins a class with a posted MR: the faculty gets a notification, and the roster shows the "joined after MR" badge (LJ-A).
- Entering `0` for missing posted-term work: the student's risk rises, and they appear in *Needs evaluation* (existing behavior).
- Update MR after a late joiner: only the late joiner's row is written; other students' `posted_at` is unchanged; no follow-up becomes due for unchanged students (LJ-B).
- The blocking messages name the late joiner and say "enter 0 … replace after make-up" (LJ-C).
- A student who completed a subject in an earlier term can join the same subject in a new term (LJ-D, after verification).

## 5. Current QA cases (no change needed)
These belong to the current system and are already listed in the decision record:
- Late joiner after MR: saving is blocked until their posted-term cells have numbers; `0` → risk rises.
- Replace a `0` with a make-up score → grade and risk update.
- **Update MR** posts the late joiner's MR (confirm it works on the deployed system).
