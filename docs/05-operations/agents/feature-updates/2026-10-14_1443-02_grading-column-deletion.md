# Grading column deletion: delete guard and faculty action

- **Date:** 2026-10-14 14:43 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix, plus a new faculty action
- **Migration:** `20261014160000_protect_class_activities_from_deletion.sql` (applied 2026-10-14)

## Files changed
- `supabase/migrations/20261014160000_protect_class_activities_from_deletion.sql`
- `src/pages/faculty/ScoreInput.jsx`

## What changed and why

Phase 1 (ASPIRE-C07). `student_activity_scores.activity_id` is `ON DELETE CASCADE`, and faculty/admin credentials already carried DELETE on `class_activities` through the `FOR ALL` mutation policy and an explicit GRANT. Unlike the score tables, `class_activities` never received a delete guard, so a raw delete through the Supabase client destroyed every student's recorded score in that column. The only existing protection, `prevent_posted_activity_score_deletion`, blocks the cascade solely when the term is already posted.

A `BEFORE DELETE` trigger now refuses to delete a column while any `student_activity_scores` row exists for it, naming the blocking count. Because `score` is `NOT NULL`, a recorded **0 counts as a real score** and blocks deletion; only a column with no rows at all can be removed.

The faculty-facing action lives in the existing Configure Activity modal, shown only for a saved column on a non-archived class. It queries the live score count on click rather than trusting the loaded sheet, so a score saved on another device since page load is still caught, asks for confirmation, and writes a dedicated `Grading Column Deletion` audit entry. A trigger error is surfaced verbatim.

Remaining columns are renumbered in-session to match what the next page load produces, since `slotKey` is positional and re-derived from fetch order. Checked before relying on this: each activity's max score comes from its own `class_activities.max_score`, and scores are keyed by activity UUID, so no grade computation depends on `slotKey`.

## How to verify
`docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md` §5, including §5.4 (a recorded 0 must block deletion) and §5.7 (delete a middle column, reload, confirm max scores still align).
