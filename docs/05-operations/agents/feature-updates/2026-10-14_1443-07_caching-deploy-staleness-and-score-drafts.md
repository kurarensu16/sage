# Caching: deploy staleness, score drafts, and sign-out

- **Date:** 2026-10-14 14:43 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `public/sw.js`
- `vite.config.js`
- `vercel.json`
- `index.html`
- `src/main.jsx`
- `src/lib/registerServiceWorker.js` (new)
- `src/lib/dataCache.js`
- `src/lib/AuthContext.jsx`
- `src/components/StudentRow.jsx`
- `src/pages/faculty/ScoreInput.jsx`

## What changed and why

Reported symptom: a new version deployed to GitHub and Vercel was ignored by browsers, which kept serving the previous build until the cache was cleared by hand. Investigation found the service worker was the cause, plus three further caching defects in the data layer.

**1. Deploys were invisible to the browser.** `public/sw.js` is copied verbatim, so its bytes were identical on every deploy — and a browser only installs a new worker when the bytes differ. `install`, `skipWaiting()` and `activate` never ran again. A Vite plugin now stamps a per-build `BUILD_ID` into `dist/sw.js`. Verified: two consecutive builds produce different IDs.

**2. Old caches were never deleted.** `CACHE_NAME` was the constant `sage-app-v1`, so the cleanup in `activate` compared against a name that never changed and had nothing to match. It now deletes every `sage-app-*` cache that is not the current build's.

**3. Navigation was cache-first.** The cached `index.html` was served immediately, and it referenced the previous build's hashed bundles, which were cached alongside it — producing a complete, internally consistent *old* app. Navigation is now network-first with a cache fallback for offline.

Also: cross-origin requests are skipped entirely, so Supabase responses are never cached — caching an authenticated API response could serve one user's data to the next. Registration moved out of `index.html` into `registerServiceWorker.js` and is **production-only**; in development the worker cached Vite assets and served stale modules over hot reload. On `controllerchange` the page reloads once so a tab cannot keep running the old build's JavaScript. `vercel.json` adds `must-revalidate` for `/sw.js` and `/index.html`.

**4. A local score draft could overwrite fresher saved grades.** `ScoreInput` decided between draft and database by comparing `draftPayload.savedAt` (**browser** clock) against `dbData.dbSavedAt` (**server** clock). On a machine whose clock ran even slightly fast, a stale draft outranked scores saved later — including from another device — and silently overwrote them. Replaced with a `pendingSync` flag set when an edit is written locally and cleared once Supabase confirms the write, so the question is "is there unsaved work here?" rather than "whose clock is ahead?". The merged draft carries the flag forward when the draft wins; without that, a second reload would discard the faculty's unsaved work.

**5. Sign-out left working data behind.** `invalidateCache()` cleared RAM and sessionStorage only, so `sage_scores_*`, `sage_att_*`, `sage_activities_*` and others survived — and several of those keys are scoped by class and student but not by the faculty who typed them, so the next person on a shared browser read the previous user's drafts. Sign-out now clears the workspace, and `syncActiveUser` clears it when a *different* account signs in, which covers the more common case of closing the tab without signing out.

Entries whose save never reached Supabase are **kept** on sign-out (`keepUnsynced: true`): discarding them would destroy the only copy. A different user signing in removes them before that person sees anything.

**6. Sign-out could hang.** `await supabase.auth.signOut()` had no error handling, so an unreachable Supabase meant `setLoading(false)` never ran — local session already cleared, leaving the user neither signed in nor able to proceed. Now wrapped in `try/catch/finally`.

**7. Cached objects could outlive their shape.** The sessionStorage prefix is now `sage_cache_<buildId>_`, and entries from earlier builds are purged on load.

## How to verify
`docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md` §14, which exists because none of these surface from ordinary feature testing. §14a (deploy over deploy), §14c.10 (clock set forward by an hour), §14d.15 (close the tab without signing out), §14d.18 (sign out while offline).
