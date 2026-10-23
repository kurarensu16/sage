# Grade Posting P0 Hardening - 2026-10-22

**Status:** Code complete locally; database migrations and live acceptance QA are still required before release.  
**Scope:** Official MR/TFR/SG posting, SG correction application, administrative override, immutable revision history, roster completeness, notification durability, and official remark consumers.

## Outcome

The official-grade boundary is now server-authoritative. Faculty clients may submit reviewed score writes and roster identities, but PostgreSQL recalculates the official milestone from the frozen class grading formula and persisted inputs. Client-supplied `computed_grade`, `effective_grade`, lock lists, and formula snapshots are no longer authoritative.

The reported correction failure is removed at its source: an SG repost no longer attempts to rewrite every existing official row from a live browser preview. Existing rows without their own approved correction are preserved. The one approved student is recalculated and validated against the approved proposal before the request is consumed.

## Implemented controls

- `post_grade_milestone_v2` owns authorization, advisory locking, idempotency, reviewed score writes, server calculation, full-roster first posting, official writes, correction consumption, and notification inserts in one transaction.
- A stable browser operation UUID makes a retry after an unknown network result return the committed result instead of posting twice.
- Dean approval leaves `posted_grades.is_locked = TRUE`; it authorizes one transaction and never unlocks live autosave.
- Score and grading-configuration triggers reject changes once an official SG exists, even if a stale legacy row incorrectly says `is_locked = false`.
- Locked/read-only score rows never start the browser autosave pipeline, and stale `pendingSync` drafts cannot outrank the database after SG posting.
- Unsupported score-delta SG correction JSON is explicitly rejected. The released correction workflow is remark/result correction against the locked, unchanged score basis; score-delta correction remains disabled until it has a staged review model.
- New `posted_grade_revisions` rows preserve every official result revision with provenance, engine version, input hash, actor, and correction link. Revision numbers are database-owned.
- New `grade_posting_operations` rows provide durable idempotency evidence.
- First or incomplete milestone posting must produce exactly one row for every active enrollee. Dean posting status now displays partial counts instead of treating one row as complete.
- MR and TFR remain revisable progress ratings: the assigned faculty can update scores and re-post them without a correction request, and changed students receive the normal durable grade-change notification. Posting SG is the boundary that freezes MR/TFR inputs and blocks further MR/TFR reposts.
- Notifications for posts, corrections, and administrative overrides are inserted in the same database transaction. Existing notification-delivery triggers remain responsible for asynchronous email/guardian delivery.
- Administrative overrides now enforce the institutional grade ladder and remark consistency in an idempotent v2 RPC.
- Posting operations bind a canonical request hash, resulting projection hash, and queued-notification count to the operation UUID. Retry-only fields such as browser timestamps and generated row IDs cannot cause a false idempotency collision.
- Student grade screens, faculty report aggregation, Dean distribution, and Dean summary reports preserve the stored official remark through `resolveOfficialGradeState`.

## Database migrations

Apply manually in filename order:

1. `supabase/migrations/20261022120000_grade_posting_p0_foundation.sql`
2. `supabase/migrations/20261022121000_server_authoritative_grade_posting.sql`
3. `supabase/migrations/20261023073500_enforce_sg_basis_lock.sql`

Do not release only the client changes. The client calls `post_grade_milestone_v2`, which does not exist until the first two migrations are applied; the third migration normalizes legacy SG locks and aligns the database guard with the final client boundary.

## Verification

Automated local gates:

```text
npm run verify:grading
npm run verify:sg-correction
npm run verify:grade-posting-p0
npm run verify:excel-export
npm run verify:csv
npm run lint
npm run build
```

`verify:grade-posting-p0` checks official exceptional-remark preservation, unapproved-row correction isolation, and the presence of every P0 database boundary. It is a source-level gate, not a substitute for executing the SQL against Supabase.

## Mandatory live release gate

After applying the migrations to a non-production database, record evidence for:

1. A full-roster MR, TFR, and SG post in regular and Summer classes.
2. MR and TFR score changes re-post successfully without an override request before SG, create a new official revision only when the result/basis changes, and queue the normal change notification.
3. After SG, direct MR/TFR score changes and MR/TFR repost attempts are rejected.
4. Opening or refreshing a class after SG produces no direct `student_term_scores` or `student_activity_scores` autosave request and ignores any stale browser `pendingSync` draft.
5. A deliberately partial first-post payload rejected with zero official rows committed.
6. A retry with the same operation UUID returning the original committed result and no duplicate notification.
7. Two concurrent posts for the same class/milestone producing one serialized result.
8. Dean approval leaving the SG and score cells locked.
9. A remark-only correction from `failed` to `passed` where the locked GWA is passing, with exactly one new official revision and one applied correction-history row.
10. An unrelated official/admin-overridden roster row remaining byte-for-byte unchanged during that correction.
11. A mismatched approved computed grade or effective GWA rolling back the entire correction.
12. Direct score/config/attendance writes after SG being rejected for UI and direct API callers.
13. Direct admin RPC calls rejecting non-ladder grades and contradictory remark/GWA combinations; retrying the same override operation produces no duplicate revision or notification.
14. INC, FDA, and Dropped appearing unchanged in student screens, reports, exports, and Dean analytics.
15. Student, guardian, faculty, and Dean notification rows/outbox deliveries existing after a committed operation.

Until this evidence is captured, the implementation is code complete but not production-certified.
