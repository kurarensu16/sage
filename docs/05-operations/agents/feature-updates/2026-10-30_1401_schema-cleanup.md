# Schema cleanup — dead tables, orphaned functions, one missing table

- **Date:** 2026-10-30 14:01 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish
- **Migration (not yet applied):** `20261030140129_schema_cleanup.sql`
- **Owner took a full backup before approving this.**

## Files changed

**New**
- `supabase/migrations/20261030140129_schema_cleanup.sql`
- `docs/03-development/audits/SCHEMA_NORMALIZATION_AUDIT_2026-10-30.md`

**Changed**
- `src/lib/classRoomService.js` — `generateJoinCode()`, `getOrCreateJoinCode()`
  and the provisioning call removed
- `src/lib/auditLogPresentation.js` — labels for the two dropped join tables
- `src/lib/facultyLoadingService.js` — stale comment about the return shape

## What is dropped

| Object | Evidence it is dead |
|---|---|
| `class_join_requests` | Retired 2026-10-30; its 3 RPCs were its only references |
| `class_room_join_codes` | Same; its single function reference was `request_class_join` |
| `student_component_scores` | 0 rows, 0 FKs, 0 function refs, 0 code refs. Only mentions are its own CREATE/constraints/indexes |
| `request_class_join`, `dismiss_class_join_request`, `resolve_class_join_request` | No caller after the retirement |
| `registrar_bulk_set_student_records` | Superseded by the singular `registrar_set_student_records`; never called |
| `aspire_assert_sg_basis_mutable` | REVOKEd from PUBLIC, anon and authenticated and never granted — nothing could call it |

## What is created

**`user_push_tokens`.** The inverse problem: `AuthContext.jsx` upserts to it when
a device registers for push, but the table did not exist. Its migration is
`20260829_user_push_tokens.sql` — the only one in the project whose filename
omits the time component, which is almost certainly why it was never applied in
order. The write is inside a `try/catch` and only runs on the APK, so it failed
silently and push tokens were discarded.

Created here rather than by renaming that file, so the fix is one migration
applied in the normal order.

**It is created with row level security, which the original did not have.** A
push token is a routing address for a person's phone; without RLS every device
token in the system would be readable by any signed-in account. Four owner-only
policies, including UPDATE because a device re-registering upserts the same
token with a new timestamp.

## The near-miss worth recording

A first pass flagged about a dozen candidate orphans. **Six of them were live**:
`post_grade_milestone_v3`, `post_grade_milestone_atomic`,
`apply_approved_sg_correction_v2`, `apply_admin_grade_override`, its `_v3`
variant, and `apply_approved_milestone_correction`. They are called from the
application through variables rather than string literals, so a grep for
`.rpc('name')` missed every one. Dropping `post_grade_milestone_v3` would have
broken grade posting entirely.

Each object below was therefore checked by name against the code, not inferred
from a pattern. The migration's verification block also asserts that two of the
live functions still exist after it runs, so a future cleanup that removes them
fails loudly.

Two other traps avoided:

- **`used_in_functions = 0` does not mean unused.** It only counts Postgres
  functions. `student_tutor_log`, `student_tutor_practice_attempts`,
  `activity_resources` and `search_destinations` all read 0 because they are
  used by the edge function. Taking that column at face value would have deleted
  all of Phase 7.
- **`student_evaluation_referral_requests` looked dead** — no application
  reference at all — but a function body uses it, and the app calls that
  function. Dropping it would have broken dean referrals.

## Not included, deliberately

**`student_term_scores` keeps its `act1..act6` repeating group.** It is a real
1NF violation, it is why a term is capped at six activities, and the same score
is written twice (once flat, once per-activity) from the browser without a
transaction, so the two can diverge silently. But it is live in six call sites
and four functions, and restructuring grade storage days before a defense is not
a cleanup. Written up in full, with three options, in
`docs/03-development/audits/SCHEMA_NORMALIZATION_AUDIT_2026-10-30.md`.

**`public.audit_logs` needs no fix.** It looked like a live bug — functions
writing to a table that does not exist — but `20261029230608` already patched
the live definition and asserts the old reference is gone. The remaining
mentions are in superseded migration text.

## Known limitations

- **One-time `DO` blocks still name dropped tables.** The audit-trigger
  installer in `20261007160000_system_wide_activity_audit.sql` lists them, along
  with a dozen tables that never existed. Every entry is guarded by
  `TO_REGCLASS(...) IS NOT NULL`, so re-running it is harmless.
- **A function referenced by another function counts as reachable**, even if
  nothing calls the outer one. The orphan analysis is one level deep, so a
  cluster of functions that only call each other would still read as used.

## How to verify

Re-run the inventory query from the audit. Expect 54 tables rather than 56, with
`user_push_tokens` present and the three dropped tables gone. The migration's own
verification block checks all of this and refuses to commit otherwise.

Then confirm the app still works where it touched code: **finalize a class** in
Faculty Loading & Provisioning — that path called `getOrCreateJoinCode()` and no
longer does.

`npm run lint` 0 errors / 48 warnings (unchanged) · `npm run build` clean.
