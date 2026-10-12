# Block-section students enrolled immediately on section assignment

- **Date:** 2026-10-10 21:44 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix (makes the documented in-system roster setup reliable)
- **Migration:** `20261010160000_section_enrollment_sync_and_notice.sql` (**to apply, after `20261010150000`**)

## Files changed
- `supabase/migrations/20261010160000_section_enrollment_sync_and_notice.sql`
- `supabase/migrations/20261010150000_class_join_approval.sql`
- `docs/03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md`
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`
- `docs/02-thesis/audits/THESIS_AUDIT_2026-10-10.md`
- `docs/06-future-enhancements/SECTION_TRANSFER_ENROLLMENTS_2026-10-10.md`
- `docs/06-future-enhancements/README.md`
- `docs/README.md`
- `AGENTS.md`

## What changed and why
The owner confirmed that block-section students are added by the admin directly, while irregular students join by code with approval. The audit found that a student assigned to a section after its classes existed was enrolled only when a professor happened to open **My Class Records** (a browser auto-sync). Until then they were missing from the grade sheet, attendance, and risk lists.

- **Trigger on `users`** (`sync_student_section_enrollments`): assigning or changing an active student's section enrolls them immediately in every active class of that section (one enrollment per subject, as before).
- **One-time back-fill** of block students missing from their section's active classes. It runs before the notice trigger exists, so it sends no notices.
- `20261010150000` (not yet applied): `resolve_class_join_request` marks approval-made enrollments (`aspire.enrollment_source = join_approval`), so the roster notice skips them.
- **Future enhancement recorded:** section transfers keep old enrollments (`06-future-enhancements/SECTION_TRANSFER_ENROLLMENTS_2026-10-10.md`).
- Docs: implementation report §8 and rollback; checklist EN-01 to EN-08 and the migration precondition; thesis audit; index; `AGENTS.md` migration count (52).

The roster notice itself is recorded separately: `2026-10-10_2144-02_class-roster-notice.md`.

## How to verify
Apply both migrations in order, then run EN-01, EN-06, EN-07 (and EJ-07 / EN-05 for approvals).
