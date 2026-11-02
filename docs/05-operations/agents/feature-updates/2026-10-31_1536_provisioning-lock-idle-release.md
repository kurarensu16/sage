# Faculty loading — idle release and automatic reclaim of the college lock

**Date:** 2026-10-31 15:36 (Philippine time)
**AI tool:** Claude Code (Opus 5)
**Approved by (device owner):** ghostbyte1014 <ghostbyte1014@gmail.com>
**Type:** New feature (approved outside the documented flow)

## Files changed

- `src/components/provisioning/FacultyLoadingWorkspace.jsx`
- `scripts/verifyGradePostingP0.js` (separate concern, same session — see the
  2026-10-31_1459 record)

No migration. No service-layer change: the existing
`acquire_provisioning_lock`, `touch_provisioning_lock` and
`release_provisioning_lock` RPCs are enough, and the 3-minute server TTL is
untouched.

## What it does

The college lock is now given back after **2 minutes without input**, and taken
again automatically on the next input or when the tab is looked at.

- `IDLE_RELEASE_MS = 120000` — deliberately shorter than the server's 3-minute
  TTL. An explicit release frees a waiting colleague immediately; letting the
  lock lapse would make them sit out the remainder.
- `IDLE_SWEEP_MS = 15000` — how often the watchdog compares the clock against
  the last input.
- A fourth lock status, **`idle`**, separate from `theirs`. Nobody else is
  involved in an idle release, and reporting a colleague would send the
  registrar looking for a person who is not there.
- Reclaim **re-reads the catalog and the load state** rather than trusting them.
  Whoever held the college meanwhile may have assigned, finalized or reassigned,
  and a stale catalog would offer sections that are now taken.
- A quiet slate banner while idle, in plain English: editing paused, click
  anywhere to carry on, what you typed is still here. Form state is local React
  state, so it genuinely survives.
- On reclaim failure the status stays `idle`, so editing stays disabled and the
  next input tries again. Flipping to `theirs` on a request that never answered
  would name a colleague on no evidence.

## The background-tab problem this also fixes

Browsers throttle timers in hidden tabs. The heartbeat is a 60s `setInterval`
against a 3-minute TTL, so a throttled tab can miss enough beats to lapse a lock
the page still believes it holds — and the failure then surfaces as *"Someone
else is editing this college right now"* on the next add, naming nobody.

This matters specifically for the defense demo, which runs **one browser window
per role**, so the provisioning page spends most of its time hidden. A
`visibilitychange` handler now re-checks the lock the moment the tab is looked at
again: `touchLock` if the page thinks it still holds the college, `reclaim` if
the touch comes back unheld.

## Order of operations in the sweep

The heartbeat interval is cleared **before** the release, so a beat cannot land
between the decision to give up the lock and the release itself and re-take a
lock the page has just decided to drop.

## Correction to an earlier statement in this session

While writing the QA checklist I told the developer that idling on the
provisioning page loses the lock and the page must be reopened before adding.
That was wrong: the heartbeat is time-based and does not depend on user
activity, so the lock survives an idle page indefinitely. The real exposure was
the hidden-tab throttling described above. The behaviour the developer asked for
is now actually implemented rather than merely assumed.

## Verification

- `npx eslint` on the changed file: clean.
- `npm run lint`: **0 errors, 48 warnings** — the exact prior baseline.
- `npm run build`: passes.
- One lint finding was caught and fixed during the work: `useRef(Date.now())`
  reads the clock during render, which `react-hooks/purity` rejects. The ref is
  now seeded at 0 and stamped in both acquire paths, which is also more correct
  — before the college is held there is nothing to idle out of.

Manual test guide: `docs/04-testing/PROVISIONING_LOCK_IDLE_TEST_2026-10-31.md`.
