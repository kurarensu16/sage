# Class-Code Join Approval: Implementation Report

**Date:** 2026-10-10
**Implemented by:** Claude Code (Opus 5.5), approved by ghostbyte1014 (ghostbyte1014@gmail.com)
**Migrations:** `supabase/migrations/20261010150000_class_join_approval.sql`, then `20261010160000_section_enrollment_sync_and_notice.sql` (the owner runs them in the SQL editor, in this order)
**Status:** Implemented in code; pending migrations and QA (test cases EJ-01 to EJ-14 and EN-01 to EN-08 in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`)

---

## 1. Why
The thesis (Chapters 1–2, Faculty Portal) documents **Enrollment Requests** as a *"Queue for approving or rejecting students who joined by code before they are added to the roster and gradebook"*. Figures 2.3 and 2.9 also show the approval step.

The system skipped it. `submitJoinRequest` enrolled the student **immediately** and stored the request as already approved, so the faculty queue never received code joins. Consequences:
- **Wrong codes:** a mistyped or shared code put a student into the wrong class.
- **Privacy:** anyone with a code became a class member at once, seeing class information, and their data entered the class's gradebook.
- **Late joiners:** the faculty wasn't aware of students joining after a milestone was posted (gap LJ-1 in `06-future-enhancements/LATE_JOINER_HANDLING_2026-10-10.md`).

## 2. What changed

### Flow
```
Student enters code ──► request_class_join ──► PENDING request
                                               ├─ faculty notified (in-app: class_join_request)
                                               └─ student sees a locked "Waiting for approval" card
Faculty: Enrollment Requests ──► resolve_class_join_request
   ├─ Approve ─► request approved + enrollment created (one transaction)
   │             └─ student notified (class_enrolled); class appears normally
   └─ Reject  ─► request rejected
                 └─ student notified (class_join_declined); "Not approved" card with Dismiss
Student may enter the code again after a rejection → new pending request
```

### Database: `20261010150000_class_join_approval.sql`
| Object | Purpose |
|---|---|
| `class_join_requests` new columns: `requested_at`, `decided_at`, `decided_by`, `student_dismissed_at` | Track request and decision times, who decided, and dismissed cards; `requested_at` is back-filled from `created_at`. |
| Indexes `(class_record_id, status)` and `(student_id)` | Faculty queue and student cards. |
| `request_class_join(p_join_code)` | Active students only. Validates an **active code for an active class**. Keeps the existing "already enrolled in this subject" rule. Rejects a duplicate pending request. Creates or re-opens the request as **pending**, and notifies the class's faculty. Serialized with an advisory lock against double submits. |
| `resolve_class_join_request(p_request_id, p_decision)` | Only the **active faculty assigned to the active class** (the same rule as grade posting). The request must be pending. **Approve** = enroll (if not already) + mark approved, in one transaction; refuses if the student is enrolled in the subject in **another section**. **Reject** = mark rejected. Notifies the student either way. |
| `dismiss_class_join_request(p_request_id)` | The student hides their own rejected request card. |

Notifications are inserted directly by these functions with deduplication keys. The general notification-dispatch rules were **not** loosened, since a not-yet-enrolled student can't be messaged through them. **No email** is queued for these types; the email trigger only covers grade posting and Dean referrals.

### Application
| File | Change |
|---|---|
| `src/lib/classRoomService.js` | `submitJoinRequest` → `request_class_join` (returns "request sent"). `resolveJoinRequest` → `resolve_class_join_request`. New `getMyJoinRequests` and `dismissJoinRequest`. The pending queue is ordered by `requested_at`. |
| `src/pages/student/MySubjects.jsx` | "Request sent…" message. A **Join requests** section with locked cards: *Waiting for approval*, or *Not approved* with **Dismiss**. Updated join-modal text. |
| `src/pages/student/MyGradesList.jsx` | "Request sent… Track it on My Subjects." |
| `src/pages/faculty/EnrollmentRequests.jsx` | Uses the new approve/reject function. Shows success and error messages (errors were previously only logged). **Late-join hint** when the class already has a posted MR/TFR/SG: enter 0 for missing posted-term work after approving, per the late-joiner decision. |
| `src/lib/notificationDispatcher.js` | Titles for `class_join_request` and `class_join_declined`. |
| `src/lib/notificationPreferences.js` | Student "Class enrollment" covers `class_enrolled` + `class_join_declined`; new faculty "Enrollment requests" category (`class_join_request`). No email option. |
| `src/pages/student/Notifications.jsx`, `src/pages/faculty/Notifications.jsx` | Titles and icons for the new types. |

### Unchanged
- Students already enrolled, and old approved requests.
- The rule that a student can be enrolled in a subject only once.
- The **Irregular** label: still computed per class (home section ≠ class section). An approved irregular student shows the badge as before.
- Admin enrollment paths still bypass the approval queue: the admin is the authority for block sections. See §8 for how they now enroll and notify.

## 3. Privacy and security notes
- The faculty notification carries **no student name**, so device lock-screen alerts don't expose identities; the name is shown inside the app.
- Approval is enforced in the database (assigned faculty only), not just by which page the faculty can open.
- Every request change is captured by the existing system-wide activity audit on `class_join_requests`.

## 4. Classification under the change freeze
| Part | Type |
|---|---|
| Approval required, one-step faculty-only approval, late-join hint, locked request cards | Fix / Polish (restores and supports the documented flow) |
| Request and decision notifications | **New feature, approved outside the documented flow** (2026-10-10) |

Change records: `docs/05-operations/agents/feature-updates/2026-10-10_2135-01_class-join-approval.md` and `2026-10-10_2135-02_class-join-notifications.md`.

## 5. Paper impact
- No change is needed for the approval itself; the thesis already describes it.
- **Optional** (because of the new notifications): add to the Enrollment Requests description, *"The instructor is notified of new requests, and the student is notified of the decision."*

## 6. Verification done
- `npm run lint`: 0 errors (existing warnings only).
- `npm run build`: succeeds.
- The database functions are **not yet run**. Apply the migration, then execute EJ-01 to EJ-14.

## 8. Block-section enrollment and roster notices (migration `20261010160000`)

**Before:** an admin assigning a student to a section (Manage Users / CSV import) only set `users.section_id`. Enrollment into the section's existing classes happened later in the browser: on class provisioning, or when a professor opened **My Class Records** (auto-sync). A professor going straight to Log Class Scores wouldn't see the student, and nobody was told.

**After:**
| Part | Behavior |
|---|---|
| `sync_student_section_enrollments` (trigger on `users`) | When a student's section is set or changed (and the account is active), they are enrolled **immediately** in every active class of that section. Same rule as before: one enrollment per subject. |
| One-time back-fill | Block students missing from their section's active classes are enrolled when the migration runs. No notices are sent for the back-fill. |
| `notify_class_roster_additions` (statement trigger on `enrollments`) | For every enrollment batch from section enrollment, the class's faculty gets **one** *Class Roster Update* notice with the **number** of students added; for a class created in the last 10 minutes it reads "set up with N students". Additions within 10 minutes merge into the same unread notice (CSV imports). No names; no email. |
| Approved join requests | Marked by `resolve_class_join_request` (`aspire.enrollment_source = join_approval`), so they don't trigger the roster notice. |

The browser auto-sync (`ClassRecordsList.jsx`) and class provisioning stay as they were, as a backstop. Any missing enrollment they add also produces the notice.

**Known limitation (future):** moving a student to another section doesn't remove their old section's class enrollments. See `docs/06-future-enhancements/SECTION_TRANSFER_ENROLLMENTS_2026-10-10.md`.

**Classification:** immediate enrollment + back-fill = **Fix** (makes the documented roster setup reliable). Roster notice = **New feature (approved by the owner)**.

## 7. Rollback
Restore the previous `submitJoinRequest`/`resolveJoinRequest` from git, then:
```sql
DROP FUNCTION IF EXISTS public.request_class_join(TEXT);
DROP FUNCTION IF EXISTS public.resolve_class_join_request(UUID, TEXT);
DROP FUNCTION IF EXISTS public.dismiss_class_join_request(UUID);
-- The added columns and indexes are harmless to keep.
DROP TRIGGER IF EXISTS trg_notify_class_roster_additions ON public.enrollments;
DROP FUNCTION IF EXISTS public.notify_class_roster_additions();
DROP TRIGGER IF EXISTS trg_sync_student_section_enrollments ON public.users;
DROP FUNCTION IF EXISTS public.sync_student_section_enrollments();
-- Back-filled enrollments are valid section enrollments and are kept.
```
