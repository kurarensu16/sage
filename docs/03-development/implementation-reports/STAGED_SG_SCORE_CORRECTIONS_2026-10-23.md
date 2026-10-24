# Staged SG Score Corrections - 2026-10-23

**Status:** Code complete; base migration manually applied; corrected-milestone migration and authenticated live QA pending  
**Migrations:** `supabase/migrations/20261023211000_staged_sg_score_corrections.sql`, `supabase/migrations/20261024093000_cascade_corrected_grade_milestones.sql`

## Implemented workflow

1. Faculty requests one correction permission for a specific student with an intended status, reason, and optional HTTPS evidence reference.
2. The authorized Dean approves or rejects the request. Approval does not unlock the live gradebook or modify the official SG.
3. Faculty opens **Edit Full Row & Apply** for the approved student. Activities, character rating, and examinations across the student's applicable terms are editable in the correction dialog; all other students stay locked.
4. A preview RPC temporarily applies the exact deltas inside a rolled-back PostgreSQL subtransaction and returns the server-calculated SG/GWA/status without persisting changes.
5. The one-use application RPC locks the request and official grade, verifies every original score and configured maximum, applies the deltas, recalculates the official result, creates a new official revision, records immutable correction history, queues notifications, consumes the approval, and keeps the SG locked in one transaction.

Ordinary score autosave remains blocked after SG. Score changes never pass through the regular gradebook editor after locking.

## Corrected milestone consistency

The follow-up corrected-milestone migration closes a consistency gap discovered during live QA: an applied full-row correction previously updated the score basis and official SG but left the earlier posted MR/TFR rows unchanged. The secured correction transaction now recalculates and revises MR, TFR, and SG together under the same one-use Dean approval.

- MR and TFR remain locked against ordinary faculty edits after SG.
- Only the dedicated approved `student_score_row` correction context may revise them.
- MR/TFR are written before SG; SG consumes the approval last so any failure rolls back the complete transaction.
- Every changed milestone receives an immutable official revision linked to the same correction request.
- Administrative SG overrides remain SG/GWA/status-only and do not rewrite the score basis or MR/TFR.
- Previously applied full-row corrections are repaired from their already-corrected locked score basis without replaying score deltas.
- Student summaries label corrected MR/TFR records as **Corrected**, while each individual period continues to show its own independently transmuted grade.

## Administrative override

The Admin override now replaces all parts of the official result together:

- SG percentage (`computed_grade`);
- effective GWA; and
- academic status/remark.

The database accepts only the institutional GWA ladder and rejects an SG/GWA/status combination that is internally inconsistent. The original and replacement values remain in the correction request, official revision, correction history, notification payload, and audit trail.

## Durable controls

- One unresolved request per posted SG.
- One idempotent operation per approved request.
- Exact original-value checks prevent stale or concurrent overwrites.
- Duplicate score targets, invalid terms/fields, and values outside configured maxima are rejected.
- A failed preview or application rolls back every score, official-grade, history, operation, and notification write.
- Request and Dean-decision notifications are committed in the same transaction as their workflow state, so closing the browser cannot leave an unannounced pending/approved request.
- Applied score deltas are copied into immutable `grade_correction_history.applied_score_changes`.
- The Dean-approved academic status cannot be substituted during application; changing that outcome requires a new request.
- Only the active assigned faculty may apply a Dean-approved correction; only an active authorized Dean may approve it.

## Required manual release order

Apply this migration only after the P0 posting migrations and the SG basis-lock migration already used by the project:

1. `20261022120000_grade_posting_p0_foundation.sql`
2. `20261022121000_server_authoritative_grade_posting.sql`
3. `20261023073500_enforce_sg_basis_lock.sql`
4. `20261023080500_activity_logs_philippine_time.sql`
5. `20261023083000_semantic_grade_audit_events.sql`
6. `20261023211000_staged_sg_score_corrections.sql`
7. `20261024093000_cascade_corrected_grade_milestones.sql`

The timezone and semantic-audit migrations are not prerequisites for grade arithmetic, but they are part of this release: they preserve absolute audit instants and present grade workflow events in PHT with human-readable action names.

Do not test against production records first. Use a QA class with a known posted SG and preserve database and UI evidence for the cases in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md` section A3.

## Verification

- `npm run verify:grade-posting-p0`
- `npm run verify:grading`
- `npm run verify:sg-correction`
- `npm run verify:insights`
- `npm run verify:audit-timezone`
- `npm run lint`
- `npm run build`

These are static/local release gates. Authenticated RPC, trigger, rollback, email-delivery, and concurrency behavior still require live Supabase QA after the migration is applied.
