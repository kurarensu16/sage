# Phase 6c — Fixes from the Phase 6 static audit

- **Date:** 2026-10-30 11:23 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration (not yet applied):** `20261030112300_evidence_retention_cleanup.sql`

Phase 6's database has no grades in it after the hard reset, so the owner asked
for a static audit of the chain instead of a click-through. These are its
findings, all five applied.

## Files changed

**New**
- `supabase/migrations/20261030112300_evidence_retention_cleanup.sql`
- `docs/05-operations/agents/feature-updates/2026-10-30_1123_phase-6c-audit-fixes.md`

**Changed**
- `src/lib/gradeChangeRequestService.js`
- `src/pages/admin/StorageHealth.jsx`
- `src/components/layout/BottomNav.jsx`
- `src/pages/faculty/Dashboard.jsx`
- `docs/04-testing/page-checklists/ADMIN_PORTAL.md`
- `docs/04-testing/page-checklists/GRADE_CHANGE_REQUESTS.md`

## What the audit checked and found clean

RPC names and parameter names on all 12 call sites · every column named in the
request `.select()` · the evidence RLS chain · all four notification deep links
against `App.jsx` · role guards on the four new routes · imports of deleted
pages · all 28 user-facing SQL messages against `toUserMessage`'s technical
markers · the ASPPV preview rollback · the milestone term-scope comparison.

One of those was nearly a finding and is worth recording as a non-bug:
`aspire_milestone_terms()` returns `'Prelim'`/`'Midterm'` capitalised, which
looked like it could never match a stored term. `class_activities.term` is
`CHECK (term IN ('Prelim','Midterm','Semi-Final','Final'))`, so it matches
exactly. The lowercase `prelim`/`semi_final` tokens elsewhere in the migrations
belong to different columns.

## The five fixes

### 1. Evidence retention was never wired up

`aspire_expired_evidence()` identified expired evidence. Nothing called it, and
nothing could have finished the job if it had:

- `authenticated` has `DELETE` revoked on `grade_change_evidence`, so the rows
  could not be removed from the browser;
- `grade_evidence_student_delete` is scoped to the uploader's own prefix, so an
  administrator could not remove another student's file from the bucket.

Evidence is **required** on every dispute, so this was one to three files per
dispute accumulating permanently against a free tier measured in gigabytes.

Added: `aspire_is_expired_evidence_path()` (one definition of "expired", shaped
like the existing `aspire_is_orphan_storage_path()`), `aspire_purge_evidence()`,
a fourth storage policy `grade_evidence_retention_delete`, a service pair in
`gradeChangeRequestService.js`, and a panel in Storage Health beside the
existing orphan cleanup.

**The order is load-bearing.** Files are deleted from the bucket *first* and the
rows only afterwards, because the row is what identifies a file as expired.
Dropping rows first would strand bytes nothing could ever name again. In this
order an interrupted run leaves the rows untouched and the next run retries
them — there is no half-cleared state to repair by hand.

`aspire_purge_evidence()` re-checks every id it is given against the same
predicate the policy uses, so a caller cannot widen the deletion by passing
extra ids. The verification block asserts that re-check is present.

It runs from Storage Health rather than on a schedule: this project has no cron,
and a destructive sweep nobody watches is worse than one somebody chooses to
run.

### 2. A status token reached users

`apply_approved_milestone_correction` built a message as
`'... This one is ' || v_req.status || '.'`, rendering as *"This one is
pending_dean_review."* `STATUS_PRESENTATION` exists so nobody sees those tokens;
this message went around it. Replaced with a `CASE` naming who still has to act,
which is both plain English and more useful.

Patched from the live definition with `pg_get_functiondef` rather than restating
two hundred lines, with the substitution asserted — a patch that matched nothing
would otherwise `COMMIT` silently and look like it worked.

### 3. A false success in the faculty dashboard

Resolving a consultation wrote to `localStorage` and reported **success** when
the database write failed. The instructor believed a consultation was resolved
that was never recorded. The modal now stays open, reports the real error
through `toUserMessage`, and leaves the record untouched.

The read path's `localStorage` fallback went too: it could show stale
consultations as though they were live. Both were leftovers of the mockDb era,
which `AGENTS.md` records as gone.

### 4. The Registrar's mobile tab missed the new page

`BottomNav.jsx` was updated for student, faculty and dean when Phase 6 added
Grade Change Requests; the registrar's "Records" tab was not. On mobile,
`/registrar/lategradechanges` highlighted no tab. Added to that tab's `match`,
beside `termmanagement` and `gradeoverride`.

### 5. A stale docblock

`gradeChangeRequestService.js` opened with *"Evidence is optional: storage is not
configured yet"*, directly contradicting the shipped rule, with the correct
docblock immediately below it. Removed.

## Known limitations

- **R2 evidence is skipped by the purge.** Rows marked `storage = 'r2'` are left
  alone rather than having their row removed while the object stays in a bucket
  this cannot reach. Nothing writes `'r2'` yet; it becomes real work when R2 is
  set up after Phase 7.
- **The retention sweep is manual.** No cron exists in this project. If the
  owner later wants it automatic, `pg_cron` plus an edge function would be the
  route, and the Storage API call means it cannot be pure SQL.
- **The storage policy may not install.** Like the Phase 6 policies, it is
  wrapped: `storage.objects` is owned by `supabase_storage_admin`. A refusal is
  a `WARNING`, and the verification block reports it, because without it the
  rows clear but the bytes stay.

## How to verify

`docs/04-testing/page-checklists/ADMIN_PORTAL.md` → `ADM-STORAGE` → *Grade
change evidence panel*, and `GCR-RETENTION` in
`docs/04-testing/page-checklists/GRADE_CHANGE_REQUESTS.md`.

The two cases that matter most:

- **Nothing live is ever listed.** An open request's evidence, and a resolved
  request whose term has not yet rolled over, must both stay at zero.
- **Rows never outlive their files.** Revoke the retention policy and clear: the
  rows must stay and the panel must say what could not be removed.

`npm run lint` 0 errors / 48 warnings (unchanged) · `npm run build` clean ·
`npm run verify:grading` passes.
