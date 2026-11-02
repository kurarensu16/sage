# Development now clears a service worker left by an earlier production build

**Date:** 2026-10-31 18:08 (Philippine time)
**AI tool:** Claude Code (Opus 5)
**Approved by (device owner):** ghostbyte1014 <ghostbyte1014@gmail.com>
**Type:** Fix

## Files changed

- `src/lib/registerServiceWorker.js`

## The bug

`registerServiceWorker()` returned early outside production, so development
never registered a worker. It never **un**registered one either.

A worker installed by an earlier production build — the installed desktop app, a
`vite preview`, a deploy — stays registered against the origin and keeps serving
its cached `index.html` and assets. The pruning that removes superseded
`sage-app-*` caches lives in the worker's own `activate` handler, which can only
run when a **new** worker installs. In development none ever does, so the old
cache has no path to being cleared.

The symptom is a development session quietly running the last production bundle:
code that no longer exists in `src/` still on screen, and every change invisible.

## How it surfaced

During QA of the user importer. The import refused a row with:

> Invalid role: "professor". Valid values: admin, dean, faculty, student, **office**

`office` appears nowhere in `src/` or `supabase/` — it was the discarded College
Office portal, removed before the admin/registrar role split. The current source
says `admin, registrar, dean, faculty, student`.

That one string proved the browser was executing code older than the repository.
It also explained three other things that had looked like product bugs: the
preview reporting 5 Ready instead of 1, a blank-section row being accepted, a
year/section mismatch being accepted, and the user form offering a college the
database rejects. All of it was one stale bundle.

The owner identified the cause: caching was added after earlier testing had
already registered a worker, and that old registration was never cleared.

## The fix

The development branch now calls `getRegistrations()`, unregisters whatever it
finds, deletes every `sage-app-*` cache, and reloads once.

It cannot loop: the reload only happens when `unregister()` actually removed
something, and after the reload there is nothing left to remove. Failures from
either API are swallowed, since a browser refusing them in development is not
worth failing startup over.

## Why it mattered beyond one screen

A stale bundle silently invalidates a QA pass. Every box ticked against it
certifies code that is not in the repository. This is the kind of defect that
makes a whole run worthless rather than producing one wrong result, which is why
it was worth fixing at the source rather than telling the developer to hard
refresh.

## Verification

`npx eslint` on the changed file: clean. `npm run build`: passes. CRLF preserved.
Confirmed in use: after the fix the importer preview reported the expected
1 Ready / 3 Existing / 9 Errors.
