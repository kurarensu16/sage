# Session handoff — 2026-10-30

Written so the next session can resume cold. Everything described here is
**applied and verified** unless it says otherwise.

## Agreed order of work

1. **AI model provider** — switch the tutor off OpenRouter
2. **Cloudflare R2** — file uploads for grade change evidence and resources
3. **QA** — Phase 6 and Phase 7, end to end

**One caution on that order.** Phases 6 and 7 have never run against real data —
the database was hard-reset before either was built. Putting two more changes on
top before any testing means a later failure is ambiguous: it could be the new
provider, or something that never worked. A ten-minute smoke test of Phase 7
before switching providers would remove that ambiguity. Owner's call; the order
above is what was decided.

## State of the system

| | |
|---|---|
| Migrations | 100 files, all applied through `20261030141621` |
| Tables | 54, none dead, none orphaned |
| Edge functions | 7, including `invoke-study-tutor` (deployed) |
| `npm run lint` | 0 errors, 48 warnings (the long-standing baseline) |
| `npm run build` | clean |
| `npm run verify:grading` | passes |

## What was built this session

**Phase 6c — evidence retention.** `aspire_expired_evidence()` identified expired
evidence but nothing called it, and nothing could: `authenticated` had no DELETE
on the table and the bucket policy was scoped to the uploader's own prefix.
Added a purge RPC, a shared predicate, a fourth storage policy, and a Storage
Health panel. **Files are deleted before rows**, because the row is what
identifies a file as expired.

**Phase 7 — AI Study Advising.** Five tables, `invoke-study-tutor`, the student
wizard, faculty resource fields in Score Input, rollover archiving, and an
admin-curated `search_destinations` list.

**Navigation and naming.** Three student pages overlapped in name. Now
**Faculty Action Plans** / **Academic Insights** / **AI Study Advising**.
Internal names deliberately still say `tutor`.

**Retirements.** The class join code, both sides. Enrolment is Registrar and
Dean only.

**Schema cleanup.** Dropped 3 dead tables and 5 orphaned functions; created
`user_push_tokens`, which the code wrote to but the database never had.

Each has a change record in `feature-updates/`, dated the same day.

## Open decisions

**1. Model provider.** OpenRouter today. Everything provider-specific is in
`callModel()` in `supabase/functions/invoke-study-tutor/index.ts` — that one
function plus environment variables is the whole switch. `TUTOR_MODEL` and
`TUTOR_FALLBACK_MODELS` override; without them it inherits the advisor's.

Two things that matter to the choice:

- The thesis paper documents **Gemini 2.5 Flash**, and `AGENTS.md` says not to
  flag that as a gap. Choosing anything else means changing the paper.
- **DeepSeek's models are text-only** as far as is known. If reading PDFs is the
  reason for switching, DeepSeek does not deliver it without a separate text
  extraction step; Gemini has native document input. Verify at decision time.

**2. R2.** Deferred until after the provider switch. `activity_resources.kind`
already allows `'file'` and `content_extract` / `extracted_at` are reserved.
When documents become readable, extract **once at attach time** — never per
student request. Re-reading a 30-page PDF for every question is tens of
thousands of tokens each time.

**3. `COMMENT ON` for the data dictionary.** The schema has no column comments,
so the Description column generates empty. Either draft descriptions by hand or
add comments in a migration so the dictionary can never drift.

## Accepted debt

**`student_term_scores`** keeps its `act1..act6` repeating group. It is a real
1NF violation, it is why a term caps at six activities, and the same score is
written twice — flat and per-activity — from the browser with no transaction, so
the copies can diverge silently.

Not fixed on purpose: the six slots also exist in `class_grading_columns`, so
retiring one table would not lift the cap, and a trigger-based fix would have to
replicate slot-ordering logic that currently lives in client code. Full analysis
and three options in
[`../../03-development/audits/SCHEMA_NORMALIZATION_AUDIT_2026-10-30.md`](../../03-development/audits/SCHEMA_NORMALIZATION_AUDIT_2026-10-30.md).

**If Chapter 1 or 2 claims a dynamic, unlimited grading component model, the cap
contradicts the thesis and has to be fixed regardless of timing.** Worth
checking.

## In progress — database documentation

Word file of extraction queries at
`C:\Users\JC Gabriel\Downloads\ASPIRE_Schema_Extraction_Queries.docx`.
Nine runs; **run 1 is done**. The owner will produce `batch2.csv`–`batch7.csv`,
`run8.csv`, `run9.csv` in `Downloads`, to be read from disk.

Output rebuilds `docs/01-system/database/ASPIRE_DATABASE_SCHEMA.md`, which
`AGENTS.md` currently flags as needing an update.

## Traps worth remembering

**The project is on the Supabase free tier.** The SQL editor caps at 100 rows
**and so does CSV export**. Reshape queries to return one row with `jsonb_agg`;
do not paginate.

**`.eq()` against `null` silently matches nothing** in PostgREST. This caused two
real bugs in the tutor backend — use `.is()` for nullable columns.

**`used_in_functions = 0` does not mean unused.** It counts only Postgres
functions, not edge functions or app code. All four Phase 7 tables read 0.

**Six live RPCs are called through variables, not string literals** — including
`post_grade_milestone_v3`. A grep for `.rpc('name')` misses them. Dropping one
would break grade posting.

**A marker-based text cut must assert it removed something.** `indexOf('')`
returns the start position, so an empty end-marker produces a silent no-op that
reports success.

**`cat -A` and `sed` misreport line endings in this shell.** Use
`tr -cd '\r' | wc -c` against the raw bytes.

## Not started

QA for Phase 6 and Phase 7. Checklists are written and unrun:
`docs/04-testing/page-checklists/GRADE_CHANGE_REQUESTS.md` and
`AI_STUDY_TUTOR.md`.

The cheapest first test is **Give me resources** in AI Study Advising — no scores
needed, one model call, and it exercises auth, grounding, the model, the search
destinations table and the UI in one click.
