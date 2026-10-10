# Section transfers keep old class enrollments

- **Status:** Proposed (documentation only; nothing here is implemented)
- **Priority:** P2
- **Written:** 2026-10-10
- **Last revalidated:** never (cross-check against `feature-updates/` and the current code before implementing; same rule as the [scalability specs](scalability/README.md))
- **Related:** [`03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md`](../03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md) §8 (block-section enrollment)

## 1. Current behavior
When an administrator moves a student from one section to another (e.g., BSIT-1A → BSIT-1B):
- The student is **enrolled** in the new section's active classes immediately (trigger `sync_student_section_enrollments`, 2026-10-10), and the new professors receive a *Class Roster Update* notice.
- The student's **old enrollments are not removed or ended.** They stay on the old section's rosters, grade sheets, attendance lists, and risk lists, and keep any scores, posted grades, and evaluations there.
- Because a student can be enrolled in a subject only once, a subject that both sections offer is **not** re-enrolled in the new section. The student stays in the old section's class for that subject.

## 2. Why it matters
- Professors of the old section keep seeing a student who has left (wrong counts, "Needs evaluation" noise).
- For shared subjects, the student never joins the new section's class.
- Risk and reports may count the student in both sections.

## 3. Things to decide before building
1. **History must be kept.** Scores, posted grades, attendance, and evaluations from the old class are academic records and must not be deleted.
2. **Mid-term transfers:** whether a transferred student's existing scores move with them, or the student starts fresh in the new class (likely the registrar's rule).
3. **Who decides:** an automatic rule, or an admin confirmation listing the affected classes.

## 4. Proposed approach
| Step | Change |
|---|---|
| A | On a section change, mark old-section enrollments **without posted grades or scores** as ended (`status = 'transferred'`, plus a date) instead of deleting them. Classes where the student already has records stay active, and an admin is asked to resolve them. |
| B | For subjects the new section also offers, move the enrollment to the new class only when the old one was ended in step A. |
| C | Rosters, grade sheets, attendance, risk, and reports exclude `transferred` enrollments. |
| D | Notify the old section's professors: *"A student was transferred out of ITP113 (BSIT-1A)."* (No name, matching the other roster notices.) |
| E | An admin view of transfers with unresolved records. |

**Expected files:** a migration (enrollment status value, transfer function and trigger update); `classRoomService.js` and the roster/report queries (exclude transferred); admin user edit (confirmation); notification wiring.

## 5. Tests (when implemented)
- Move a student with no scores: old enrollments ended, new ones created, both sets of professors notified.
- Move a student with scores in the old class: that enrollment stays active and is flagged for the admin; no records lost.
- Shared subject: the enrollment moves only after the old one is ended.
- Rosters, risk, and reports no longer list the student in the old section.
