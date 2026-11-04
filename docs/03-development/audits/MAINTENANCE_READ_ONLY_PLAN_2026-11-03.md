# Read-only during maintenance, with an announced countdown — implementation plan

**Date:** 2026-11-03 · **Status:** Plan, not implemented
**Order:** After Phases 5 and 6 of [`PRE_ROLLOVER_FEATURES_PLAN_2026-11-03.md`](PRE_ROLLOVER_FEATURES_PLAN_2026-11-03.md). Does **not** block Pass B or the rollover.

## Why this exists

Maintenance mode today is a **sign on an unlocked door.**

A user arriving during the window is stopped ([`MainLayout.jsx:46`](../../../src/components/layout/MainLayout.jsx#L46)
renders `MaintenanceScreen`). Everyone *already signed in* keeps full write
access — they get a banner and nothing else. The code says so deliberately:

> "Nothing here blocks: the session keeps working throughout. Being told is the
> whole intervention." — [`MaintenanceNotice.jsx:14`](../../../src/components/layout/MaintenanceNotice.jsx#L14)

That was a considered decision (a "soft cutover"), and for a ten-minute config
change it is the right one. It stops being right the moment maintenance exists
to protect a **restore**.

### The hole, precisely

`aspire_restore_backup()` refuses to run unless maintenance is active
([`20261029235313:143`](../../../supabase/migrations/20261029235313_restore_skipped_table_references.sql#L143)).
So maintenance is the interlock. But maintenance being on does nothing to stop
writes, so the interlock protects only one side.

A faculty member already signed in clicks Save while the restore runs. The
restore empties and refills tables inside one transaction, so their write blocks
on the exclusive lock, then applies **against the restored data**:

1. the row references a `class_record_id` or `student_id` the snapshot does not
   contain → foreign-key violation surfaced as a raw error, or
2. it fits, and silently contaminates a snapshot believed to be clean.

`is_maintenance_active()` has exactly **two** callers today —
`aspire_maintenance_state()` (the read the UI polls) and the restore gate. No
write RPC, no trigger and no RLS policy consults it.

---

## The shape being built

| Time until maintenance | Writes | Sign-in | Banner |
| ---------------------- | ------ | ------- | ------ |
| 30 → 15 min | **allowed** | allowed | grey, dismissible, minutes |
| 15 → 3 min | **allowed** | allowed | amber, dismissible (returns at 3), minutes |
| 3 → 0 min | **allowed** | allowed | red, **not** dismissible, **ticking seconds** |
| **Active** | **refused** | allowed → see open decision | amber read-only notice |
| Restore executing | refused | — | full screen |

**The countdown window is fully writable.** Nothing changes functionally until
the moment maintenance activates. The three banners are information, not
enforcement — they exist so nobody *starts* something they cannot finish.

### Why no flush-on-activation

Saving everyone's in-flight work the instant maintenance begins was considered
and rejected on three grounds.

**It is already done, continuously.** The two heavyweight editors autosave:

| Editor | Interval | Survives a refused write? |
| ------ | -------- | ------------------------- |
| Scorebook ([`StudentRow.jsx:79-248`](../../../src/components/StudentRow.jsx#L79-L248)) | 1200 ms | **Yes** — a localStorage draft is written with `pendingSync: true` *before* the network call (line 107) and flipped to `false` only on success (line 228). A `pendingSync: true` draft outranks the database on reload. |
| Advising plan ([`StudentRiskEvaluationModal.jsx:191`](../../../src/pages/faculty/StudentRiskEvaluationModal.jsx#L191)) | 700 ms, plus flush-on-unmount (line 208) | **No** — the draft goes to the database with no local fallback. See Part 2d. |

Maximum unsaved work in the system is roughly **one second**.

**It would aim a write storm at the window it is protecting.** The restore gate
requires maintenance on *before* a restore can start, so the sequence becomes:
flip maintenance → every signed-in session fires its flush simultaneously →
admin clicks Restore. That synchronises every client in the system to write at
the same instant, immediately before a `TRUNCATE`, and gives the admin no signal
for when the flush finished. Scattered idle sessions are safer than a
starting gun.

**It is a promise the architecture cannot keep.** The flush requires the client
to hear the flip. A backgrounded tab has its timers throttled by the browser; a
sleeping laptop, a locked phone and an offline tab hear nothing. A banner saying
"your work was saved" would be false for exactly the users who most need the
truth.

The announced countdown does the same job better: people save naturally, spread
out, because they were told in advance.

---

## Open decision

**What does a fresh sign-in during active maintenance get?**

| | Behaviour | Cost |
| - | --------- | ---- |
| **A — assumed** | `MaintenanceScreen`, as today | No change. Keeps the `blocking` latch. |
| B | The portal, read-only | Deletes the `blocking` latch and its whole bug class. One rule for everyone. |

This plan is written for **A**, because it changes least. Verified either way:
**signing in is safe during maintenance.** The only write in
[`AuthContext.jsx:28`](../../../src/lib/AuthContext.jsx#L28) is a push-token
upsert on the mobile app, and Supabase's own auth writes live in the `auth`
schema, which this guard does not touch.

If B is chosen instead, delete rather than extend the latch at
[`MaintenanceContext.jsx:21-30`](../../../src/lib/MaintenanceContext.jsx#L21-L30).
It exists only to tell "already working" from "just arrived"; under B that
distinction stops existing, and it is the subtlest code in the file.

---

## Part 1 — The lock (database)

**One new migration.** The client layer is courtesy; this is enforcement. A
stale tab, a slow connection or a user who never received the flag must still be
refused, and only the database can do that.

### 1a. The guard

```
public.aspire_require_system_open()  -- VOID, SECURITY DEFINER
```

Raises `42501` carrying the composed maintenance message, so the user reads
*"Maintenance is active. Expected back by 9:30 PM."* rather than a constraint
name. Returns silently when `is_maintenance_active()` is false, and when
`is_active_admin()` is true.

Reuses `is_maintenance_active()` rather than reading `system_settings` directly,
so the lock and the banner can never disagree about whether a scheduled window
counts — the same reasoning as the restore gate.

### 1b. Where it is called

> **Critical constraint.** [`20261029040940`](../../../supabase/migrations/20261029040940_registrar_role_authorization.sql)
> rewrites function bodies **in place**, so this repo's copy of an RPC is not
> necessarily what the database is running. Every RPC here must be patched from
> its **deployed** definition via `pg_get_functiondef`, with an assertion that
> the anchor was found exactly once — the technique in
> [`20261103093355`](../../../supabase/migrations/20261103093355_a_dispute_window_a_student_can_actually_use.sql#L84-L117).
> Re-declaring from repo source would silently revert the registrar split.

First cut — the write paths a restore can actually corrupt:

| Area | RPCs |
| ---- | ---- |
| Grade posting | `post_grade_milestone_v3`, `post_grade_milestone_v2`, `post_grade_milestone_atomic` |
| Corrections | `apply_approved_milestone_correction`, `apply_approved_sg_correction_v2`, `record_applied_sg_correction`, `submit_sg_correction_request` |
| Override chain | `apply_admin_grade_override_v3`, `acknowledge_grade_override` |
| Dispute chain | `submit_grade_change_request`, `dean_review_grade_change_request` |
| Evaluations | `submit_student_risk_evaluation`, `save_faculty_intervention_working_draft`, `verify_intervention_task`, `record_intervention_followup`, `set_advising_task_completion_with_evidence`, `refer_student_evaluation_to_dean`, `acknowledge_student_evaluation` |
| Academic setup | `save_grade_template`, `update_class_schedule`, `delete_class_record`, `perform_semester_transition` |

`perform_semester_transition` matters more than it looks: a rollover firing
during a restore would run three notification triggers against half-restored
tables.

**Deliberately left open**, or the feature deadlocks itself:

- `set_maintenance_window`, `set_maintenance_mode` — else the admin cannot turn
  maintenance off
- `aspire_restore_backup` — else the restore refuses itself
- notification `is_read` flips, session/auth writes, the audit log — harmless,
  and blocking them makes the UI look broken

Not in the first cut: the remaining ~38 write RPCs. Diminishing returns against
a large surface on which to get an exemption wrong.

### 1c. Direct table writes

The Scorebook does not go through an RPC — it upserts
`student_term_scores` and `student_activity_scores` directly
([`StudentRow.jsx:174-224`](../../../src/components/StudentRow.jsx#L174-L224)).
That is the highest-volume write in the system and the one with a real restore
collision, so it needs a `WITH CHECK (NOT public.is_maintenance_active() OR public.is_active_admin())`
arm on its write policies.

Sweep the other ~110 direct `insert`/`update`/`upsert`/`delete` calls across 42
files during implementation and gate any that touch restored business tables.

### 1d. Server clock

`aspire_maintenance_state()` returns `starts_at` and `ends_at` but **not the
server's own time**. Add `server_now`. Without it the countdown runs on the
device clock, and device clocks drift:

- 3 minutes fast → the countdown hits zero while the system is still open; the
  banner looks broken
- 3 minutes slow → writes are refused while the banner still reads "03:00
  remaining"; the system looks like it lied

---

## Part 2 — The announcement (client)

### 2a. `src/lib/MaintenanceContext.jsx`

- Compute `serverOffsetMs` once from `server_now` and run all countdown
  arithmetic against the corrected clock.
- Derive `stage` from **time remaining**, not from a sequence: `informational`
  (30–15), `warning` (15–3), `imminent` (3–0), `active`, `open`. A window
  scheduled 10 minutes out therefore starts at amber, and 2 minutes out starts
  at red — correct, and it means "Close the system now" needs no special case.
- Expose `readOnly = active && !isAdmin`.
- **At zero, re-read — do not decide.** The database is the authority. If the
  read says not yet active, show "starting shortly". A drifting clock can then
  never lock someone out or wave them through.

### 2b. Transport (worth doing alone)

`POLL_MS = 4000` ([line 42](../../../src/lib/MaintenanceContext.jsx#L42)) is
~900 RPCs/hour/tab — about 7,200 per tab per 8-hour day — each doing ~4 table
reads, to answer a question whose answer changes about once a month.

The poll exists because an automatic window activates from the clock with no row
change, so Realtime never fires (lines 99–101). But the client already receives
`starts_at` and `ends_at`, so it can schedule timers instead of polling blindly:

| | Now | After |
| - | --- | ----- |
| Manual flip | Realtime + 4 s poll | Realtime only |
| Scheduled window | 4 s poll | one timer per stage boundary |
| Backstop | — | 5-minute poll |
| Hidden tab | polls anyway | nothing; re-reads on `visibilitychange` |
| **Steady state** | **~900 req/hr/tab** | **~12 req/hr/tab** |

**The guard is what buys this.** Today the client is the only thing between a
user and a bad write, so it must be fast. Once the database refuses writes
itself, client timing governs only presentation.

The visibility gating also fixes a real defect: a backgrounded tab's 4 s timer
is throttled by the browser, so it can sit minutes stale with no indication.

### 2c. `src/components/layout/MaintenanceNotice.jsx`

Four states. Each **wraps** the server-composed reason message rather than
replacing it — otherwise the admin picks a reason and nobody ever sees it.

| Stage | Copy |
| ----- | ---- |
| Grey | **Scheduled maintenance in 24 minutes.** `{reason}` You can keep working and saving normally until it starts. |
| Amber | **Maintenance starts in 11 minutes.** Save your work now — once it begins you'll still be able to view records, but changes can't be saved. |
| Red | **Maintenance starts in 02:47.** Saving is about to be turned off. |
| Active | **Maintenance is active — you're on read-only.** `{reason}` You can view everything; changes can't be saved until it's finished. Expected back by 9:30 PM. |

Dismissal: grey and amber yes, red and active no. Amber dismissed at minute 15
returns as red at minute 3. An undismissable bar for twelve minutes eats real
viewport on a phone; the final three minutes are what must land.

Icons `lucide-react` only, `sage-*` tokens only, no `dark:` — per the design
system.

### 2d. Save-path courtesy, and one real fix

Raw `42501` errors reaching users would read as a crash. Translate them to the
maintenance message wherever a write can fail.

- **`StudentRow.jsx`** — skip the autosave while read-only and surface a
  distinct status, so the header never paints a refused save green. (That exact
  failure was bug B-10.)
- **`StudentRiskEvaluationModal.jsx`** — **the one genuine gap.** Its draft goes
  to the database with no local fallback, so under the guard every autosave
  fails and a faculty member can compose a five-task plan that is lost on close,
  with only `setDraftSaveState('error')` to show it. Either mirror the
  Scorebook's localStorage-draft pattern, or have the modal decline to open for
  editing once read-only. **Mirroring is preferred** — it also fixes the
  ordinary network-failure case, which exists today.
- **Forms with explicit Save buttons** — disable with a tooltip naming the
  reason.
- **Pages that write on load** — sweep for them. Marking notifications read on
  open is already exempt; find the others before they throw for an arriving
  user.

---

## Part 3 — Admin (`src/pages/admin/MaintenanceMode.jsx`)

Two actions, because a 30-minute lead-in is right for planned work and useless
in an emergency:

- **Schedule maintenance** — 30-minute lead-in, all four stages. Needs no new
  RPC: [`set_maintenance_window`](../../../supabase/migrations/20261029230608_scheduled_maintenance_windows.sql#L324)
  already takes `p_auto`, `p_starts_at`, `p_ends_at`, and
  `is_maintenance_active()` stays false until `now() >= starts_at`. "Closing" is
  simply a window starting 30 minutes from now.
- **Close the system now** — straight to active, no countdown.

Also: a note (not a block) when scheduling less than 30 minutes ahead, since
people will get less warning than the banners imply. And update the page copy —
["open sessions keep working"](../../../src/pages/admin/MaintenanceMode.jsx#L522)
stops being true.

**Reads block during the restore itself.** Emptying and refilling a table takes
an exclusive lock, so a page reading it waits until the restore commits. For
those one to two minutes the app appears frozen rather than read-only, which is
the one case a full screen beats a banner. Accepted as a known limitation; the
admin flow should say so.

---

## Part 4 — Verification

- `scripts/verifyMaintenanceReadOnly.js`, matching the existing `verify:*`
  pattern: asserts the guard exists, that every RPC in 1b calls it, that the
  exempt set does **not**, and that `aspire_maintenance_state()` returns
  `server_now`.
- A click-through test guide in `docs/04-testing/` — there is no test
  framework, so this is the only regression net. Must cover: a drifting device
  clock, a tab backgrounded across the whole countdown, a scheduled window
  shorter than 30 minutes, the admin turning maintenance off from inside it, and
  a Scorebook save refused mid-autosave.
- A change record in `docs/05-operations/agents/feature-updates/`.

---

## Build order

| | Step | Depends on | Independent value |
| - | ---- | ---------- | ----------------- |
| A | Transport cleanup (2b) | — | **Yes** — ~98% less background chatter, fixes the stale hidden tab. Ship alone. |
| B | Migration: guard + policies + `server_now` (1) | — | Yes — closes the restore hole |
| C | Stage derivation and banners (2a, 2c) | B | No |
| D | Save-path courtesy and the advising-plan fix (2d) | B | The advising-plan draft fix: **yes** |
| E | Admin page (3) | B, C | No |
| F | Verify script and test guide (4) | all | — |

A and B are independent of each other. **A is the cheapest real win** if only
one thing gets done.

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Patching a deployed function body silently reverts the registrar split | `pg_get_functiondef` + assert the anchor appears exactly once, then verify against the catalog. Never re-declare from repo source. |
| A missed exemption locks the admin out of their own toggle | `is_active_admin()` exemption inside the guard itself, not per call site. Test `set_maintenance_window` first. |
| A page that writes on load throws for an arriving user | Sweep the ~110 direct writes; the notification read-flip is already exempt. |
| Device clock drift misaligns the countdown | `server_now` offset; at zero, re-read rather than decide. |
| Reads block during the restore | Known limitation, 1–2 minutes. Say so in the admin flow. |
| Reverses a documented decision | The soft-cutover copy in `MaintenanceNotice.jsx` and `MaintenanceMode.jsx:522` must change in the same batch, or the UI promises what the database refuses. |

## Files

**New:** one migration · `scripts/verifyMaintenanceReadOnly.js` · one test guide
· one change record

**Changed:** `src/lib/MaintenanceContext.jsx` ·
`src/components/layout/MaintenanceNotice.jsx` ·
`src/components/layout/MainLayout.jsx` (only if decision B) ·
`src/pages/admin/MaintenanceMode.jsx` · `src/lib/maintenanceService.js` ·
`src/components/StudentRow.jsx` ·
`src/pages/faculty/StudentRiskEvaluationModal.jsx` · `docs/README.md` · plus the
save-path and write-on-load files the sweep finds
