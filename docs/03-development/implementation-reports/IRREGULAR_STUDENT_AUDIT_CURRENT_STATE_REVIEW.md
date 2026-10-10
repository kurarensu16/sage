# Irregular Student Audit — Current-State Review and Implementation

**Reviewed:** September 29, 2026  
**Source:** `irregular_student_audit.md`

## Outcome

The audit correctly identified fragmented irregular-student visibility in faculty workflows. Its description of irregularity as only `users.section_id IS NULL`, however, was incomplete. The database attendance roster already applies a class-contextual rule:

- **Regular:** the student's home `section_id` equals the class record's `section_id`.
- **Irregular:** the student has no home section or is enrolled in a class outside their home block section.

This contextual rule is retained instead of adding a global `users.is_irregular` boolean, which would incorrectly classify cross-enrolled students as regular in every class or irregular in every class.

## Implemented Changes

1. Added `getEnrollmentType(studentSectionId, classSectionId)` to `classRoomService.js` as the shared frontend classifier matching `get_class_attendance_roster`.
2. Added the student's home `section_id`, `enrollment_type`, and `is_irregular` to the class priority roster.
3. Added a reusable amber `Irregular` badge to:
   - Faculty Score Input rows
   - Grade Computation Preview mobile cards
   - Grade Computation Preview desktop ledger
   - Student Risk and Evaluate Students rosters
4. Kept risk calculation policy-neutral. Irregular status is contextual information and does not add or subtract academic-risk points.

## Findings Not Implemented as Proposed

### Global `is_irregular` database flag

Not added. A global flag cannot represent a regular-block student taking one subject outside their home section. The existing relational data is sufficient when the classification is computed consistently.

### Scholarship underload rule

`getPresidentsListTier` contains an active irregular-underload rule; it is not commented out. No current application page calls this helper, so there is no existing scholarship decision path to repair safely. The new roster now exposes `is_irregular` for a future institution-approved honors or scholarship workflow. It remains intentionally separate from the general risk engine.

## Result

Irregular-student identification is now consistent across attendance, grading, computation preview, and faculty risk review without duplicating mutable status in the database or changing academic treatment.
