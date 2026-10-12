# Scalability and Data Handling Enhancement Plan

**Status:** Proposed (documentation only; nothing in this plan is implemented yet)
**Date:** 2026-10-10
**Scope:** How ASPIRE reads, saves, caches, and syncs data per user, and what must change for 1,000+ people to use it at the same time.
**Basis:** Read-only code audit of the `ghost` branch on 2026-10-10. No load test was run; live table sizes and the Supabase plan tier were not checked. Numbers marked "estimate" come from reading the code.

---

## 1. Summary

ASPIRE works correctly at **pilot scale** (small classes, few users at once). Before **department-wide or institution-wide use**, two kinds of problems must be addressed:

1. **Data correctness as records grow (P0).** Several pages read data in a single request. The data API returns at most **1,000 rows per request**, so larger results are silently cut off. Pages then compute grades and risk from incomplete data, and the grade sheet can **delete or overwrite scores it did not load**. This can happen with a **single user** in one class of about 40 students late in the semester. For an early-warning system, this is the most serious issue, because at-risk students can be missed without anyone noticing.
2. **Load from many users at once (P1).** Notification polling every 4 seconds per user, realtime connection limits, the email sending cap, and the AI provider quota would each be exceeded well before 1,000 active users.

Every enhancement here improves an **existing** flow. None adds a new feature to the documented system.

### Adoption readiness
- **Research prototype (now):** complete for its scope. It runs on free tiers (Supabase Free, Vercel Hobby, Gmail SMTP, free AI models) and is demonstrated with **synthetic data and dummy accounts**, which keeps real students' grades out of the research in line with RA 10173.
- **Institutional adoption (if the school adopts ASPIRE):** requires the P0–P1 enhancements below, paid hosting tiers sized for the school, and a passing load test (E-15). See [`scalability/HOSTING_TIERS_AND_COST.md`](scalability/HOSTING_TIERS_AND_COST.md).
- **Implementation specs** (files, functions, migrations, tests) are in [`scalability/`](scalability/README.md), one per roadmap item.

## 2. How data flows today

| Concern | Current design | Where |
|---|---|---|
| Data access | The browser calls Supabase directly (PostgREST queries and RPCs). Most grade, roster, and risk calculations run **in the browser**. | `src/lib/*Service.js`, page components |
| Row limit | API `max_rows = 1000` (also the hosted default). Requests return at most 1,000 rows, **without an error**. | `supabase/config.toml` (`[api] max_rows`) |
| Pagination | Only the Evaluated Students list pages its results (`.range()`). Everything else loads in one request. | `src/lib/evaluationService.js:55` |
| Client cache | Two tiers: an in-memory map plus `sessionStorage`, 2-minute TTL, keys scoped by user ID, cleared on sign-out. Used for notification lists and a few student pages. | `src/lib/dataCache.js` |
| Grade-sheet drafts | Per-student drafts in `localStorage` (`sage_scores_<class>_<student>`), seeded from the database on load. | `src/pages/faculty/ScoreInput.jsx`, `src/components/StudentRow.jsx` |
| Notifications | A 4-second poll **and** a realtime `postgres_changes` channel per logged-in user. | `src/lib/AuthContext.jsx:262-316` |
| Email | Database queue, claimed in batches of 25 by the `send-email` Edge Function every minute (pg_cron + pg_net), sent through Gmail SMTP. | `supabase/functions/send-email/index.ts`, migration `20261002090000` |
| AI Study Tutor | Edge Function `invoke-advisor`; results cached in the device's `localStorage`; in-memory rate limit per function instance. | `src/pages/student/AcademicInsights.jsx`, `supabase/functions/invoke-advisor/index.ts` |
| App delivery | Vercel static hosting (CDN). One JavaScript bundle of about 4.5 MB (uncompressed); no route-level code splitting. A service worker caches same-origin files only. | `vercel.json`, `src/App.jsx`, `public/sw.js` |

### Already done well
- Indexes for the main lookups: notifications (unread and visible per recipient), evaluations, attendance, activity and component scores, posted grades by class, consultations.
- Atomic grade posting through database functions; duplicate protection on notifications (`dedupe_key`).
- The email queue never blocks the user interface.
- The cache is per-user and per-tab, and cleared on sign-out.
- The service worker never caches Supabase API data, so users never see stale grades from the offline cache.
- The CDN serves the app files to any number of users.

## 3. Findings

| ID | Severity | Finding | Evidence | Effect |
|---|---|---|---|---|
| F-01 | **Critical** | **The grade-sheet save can delete scores it didn't load.** Scores load in one request (cut off at 1,000 rows). Drafts are seeded for **every** student from that data, and Save writes every draft back. A score missing from the load is treated as blank, and blanks are **deleted**. | `ScoreInput.jsx:658-661` (load), `:739-784` (draft seeding), `:1176-1254` (save/delete) | A class with 40 students × 26 activities = 1,040 rows. Unposted-term scores past the cut-off are deleted on save. Posted terms are protected from blanking by a guard and a database trigger, but see F-02. |
| F-02 | **Critical** | **A cut-off score in a posted term can be overwritten with 0.** The posted-term guard requires a number in every empty cell (`ScoreInput.jsx:1124-1152`). A real score that didn't load shows as empty, so the faculty may type 0 over it, believing it is a late joiner's missing work. | `ScoreInput.jsx:1124-1152`, F-01 | A real score is silently replaced by 0. Related decision: [`LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md`](../02-thesis/decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md). |
| F-03 | **Critical** | **Risk, GWA, and reports are calculated from incomplete data.** The same 1,000-row cut-off applies to the class roster's risk calculation, the class analytics, and the Dean pages. The **Dean Dashboard fetches every user and every posted grade with no filter**. | `classRoomService.js:483-528`, `reportsService.js:113-160`, `dean/Dashboard.jsx:163-169`, `dean/AtRiskStudents.jsx:220-292` | Wrong risk badges, *Needs evaluation* counts, analytics, and at-risk matrix, with no error shown. |
| F-04 | **High** | **Long ID lists are sent in the request URL.** Dean pages pass every student ID (and every activity ID) in the college in `.in()` filters. | `dean/AtRiskStudents.jsx:239-292`, `dean/Dashboard.jsx` | Each UUID adds about 37 characters. Around 300–400 students exceeds common URL size limits, so the request is rejected and the page fails. |
| F-05 | **High** | **Notifications are polled every 4 seconds per user**, alongside realtime. The poll keeps running in background tabs and fetches full rows. | `AuthContext.jsx:262-286` | Estimate: 1,000 logged-in users make about **250 requests per second, constantly**. |
| F-06 | **High** | **Realtime connection limit.** One realtime connection per user (Deans have an extra channel). `postgres_changes` handles many subscribers less efficiently than Broadcast. | `AuthContext.jsx:298-316`, `dean/AtRiskStudents.jsx:570` | Supabase plans cap simultaneous realtime connections (roughly 200 on Free and 500 on Pro by default; verify the current plan). Users over the cap silently get no live updates. |
| F-07 | **High** | **Email sending cap.** Gmail SMTP, 25 emails per minute. | `send-email/index.ts:22,282`, migration `20261002090000` | Posting for 1,000 students plus guardians means 1,000–2,000 emails, above Gmail's daily sending limits (about 500 for a regular account, about 2,000 for Workspace; verify current limits). Emails fail or back up for days. |
| F-08 | **Medium** | **AI quota and caching.** AI Study Tutor results are cached only in device `localStorage`; the rate limit is in memory per Edge Function instance. | `AcademicInsights.jsx:59,226-239`, `invoke-advisor/index.ts:42-52` | Up to 1,000 AI calls in a short window. Results are regenerated on each new device, and the rate limit isn't shared across instances, so the provider's quota becomes the bottleneck. |
| F-09 | **Medium** | **Heavy calculation in the browser for Dean pages.** The whole college's scores, posted grades, and activities are downloaded, and risk is computed on the Dean's device on every visit. | `dean/Dashboard.jsx`, `dean/AtRiskStudents.jsx` | Slow pages, large downloads, repeated work. |
| F-10 | **Medium** | **A single 4.5 MB bundle.** All pages plus the Excel and PDF libraries load for every user. | `src/App.jsx` (no `React.lazy`), `dist/assets/index-*.js` | Slow first load on phones over mobile data. |
| F-11 | **Medium** | **Data left behind on shared computers.** Sign-out clears the session cache but not `localStorage` (grade-sheet drafts `sage_scores_*`, AI results `sage_ai_cache_*`). | `AuthContext.jsx:326-334` | On shared lab PCs, student scores remain readable after logout (data-privacy concern, RA 10173). |
| F-12 | **Medium** | **Hard-coded mock scores** are injected for one specific class ID when the grade sheet loads. | `ScoreInput.jsx:~681` ("Seed mock scores for Ocampo, Julia") | If that class is real, fake scores appear and can be auto-saved. |
| F-13 | **Low** | **Repeated profile loading.** The profile, unread count, and push setup reload on login and on every hourly token refresh. The service worker cache name never changes between releases. | `AuthContext.jsx:79-107,151-170`, `public/sw.js:1` | Extra queries per user; possible duplicate push listeners; users see the old version once more after a release. |

## 4. Target design

### 4.1 Reading data
- **Class-scope pages** (grade sheet, roster, class reports): read in **pages of 1,000 rows** with a **fixed sort order** (primary key), looping until a page returns fewer than 1,000 rows. Without a fixed order, rows can repeat or be skipped between pages.
- **ID lists:** never send more than **about 100 IDs** in one `.in()` filter; split larger lists into batches and merge the results.
- **Department-scope pages** (Dean): replace multi-step client queries with **database functions** that filter by `department_id`/`section_id` inside the database and return per-student totals. The risk formula stays in `src/lib/riskEngine.js`, its single source of truth. The database returns the inputs (totals, counts, posted grades); the app computes risk.
- **Completeness check:** after loading, compare the number of rows received with an exact count. If they differ, show "Data incomplete; refresh" and block saving.

### 4.2 Saving data
- The grade sheet tracks **edited cells** and saves only those.
- A delete is sent only when the faculty **cleared a cell that had a loaded value**.
- Cells that were never loaded are never written.
- Existing protections stay: the posted-term guard, the database trigger against nulls, and atomic posting functions.

### 4.3 Pre-computed per-student summaries
- A summary table per student and class (current tentative GWA, posted milestone grades, pending count, recorded-zero count, absences, last updated) is **refreshed by the database** when scores are saved, attendance is recorded, or grades are posted.
- Dashboards and rosters read **one small row per student** instead of every score.
- Detail pages (grade sheet, score breakdown) still read the raw data.

### 4.4 Live updates and notifications
- **Remove the 4-second poll.**
- Keep one realtime channel per user, connected **only while the app is visible**, and refresh the unread count when the tab regains focus or realtime reconnects.
- Fall back to polling **every 60 seconds** only while realtime is disconnected.
- Evaluate **Supabase Broadcast** for notification delivery, and size the plan's realtime connection limit for peak use.

### 4.5 Caching
- Keep the per-user, per-tab cache, and extend it to rosters and summaries with **invalidation on save** (stale-while-revalidate).
- Store AI Study Tutor results **in the database** (per student, keyed by the evidence fingerprint already computed by `insightFreshness.js`) so every device reuses them.
- Enforce **one shared rate limit** in the database.
- On sign-out, also clear `sage_scores_*` and `sage_ai_cache_*` from `localStorage`.

### 4.6 Email
- Move to a **transactional email provider**, or at minimum Google Workspace limits.
- Combine a student's notices into **one email per posting**, and match the queue's drain rate to the provider's limits.

### 4.7 App delivery
- **Route-level code splitting** with `React.lazy`, one chunk group per portal.
- Load the Excel and PDF libraries only when exporting.
- Version the service worker cache name per build.

### 4.8 Capacity
- Size the Supabase compute for peak load. The data API already pools database connections.
- Verify plan limits (realtime connections, Edge Function invocations, egress).
- **Load test** before institution-wide launch.

## 5. Roadmap

| ID | Priority | Enhancement | Fixes | Affected files (expected) | Migration |
|---|---|---|---|---|---|
| [E-01](scalability/E-01_PAGED_READ_HELPER.md) | **P0** | Shared paged-read helper (fixed order, 1,000-row pages, ID batches of about 100) | F-01, F-03, F-04 | new `src/lib/pagedQuery.js`; `ScoreInput.jsx`, `classRoomService.js`, `reportsService.js`, `PostedGradesView.jsx` | No |
| [E-02](scalability/E-02_GRADE_SHEET_SAFE_SAVE.md) | **P0** | Grade sheet: save edited cells only; never write unloaded cells; completeness check before saving | F-01, F-02 | `ScoreInput.jsx`, `StudentRow.jsx` | No |
| [E-03](scalability/E-03_REMOVE_MOCK_SCORE_SEED.md) | **P0** | Remove the hard-coded mock-score block | F-12 | `ScoreInput.jsx` | No |
| [E-04](scalability/E-04_DEAN_DEPARTMENT_DB_FUNCTIONS.md) | **P0** | Department-scoped database functions for Dean pages | F-03, F-04, F-09 | new migration; `dean/Dashboard.jsx`, `dean/AtRiskStudents.jsx`, `dean/SummaryReports.jsx` | **Yes** |
| E-05 | P1 | Remove the 4-second poll; visibility-aware realtime with 60-second fallback | F-05 | `AuthContext.jsx` | No |
| E-06 | P1 | Realtime sizing; evaluate Broadcast for notifications | F-06 | `AuthContext.jsx`, `dean/AtRiskStudents.jsx`; possibly a trigger migration | Maybe |
| E-07 | P1 | Load the profile once per login; no reload on token refresh; push listeners registered once | F-13 | `AuthContext.jsx` | No |
| E-08 | P1 | Index review with `EXPLAIN` / Supabase index advisor. Likely candidates: `posted_grades(student_id)`, `class_records(section_id, status)`, `class_records(faculty_id)`, `users(section_id, role)`, `enrollments(section_id)` | F-03, F-09 | new migration | **Yes** |
| E-09 | P2 | Pre-computed per-student summaries, refreshed by the database | F-09 | new migration (table + refresh logic); roster and Dean pages | **Yes** |
| E-10 | P2 | Transactional email provider and per-posting digest | F-07 | `send-email/index.ts`, email queue migration | Maybe |
| E-11 | P2 | AI results stored in the database; shared rate limit | F-08 | new migration; `AcademicInsights.jsx`, `invoke-advisor/index.ts` | **Yes** |
| E-12 | P2 | Route-level code splitting; lazy-load the export libraries | F-10 | `App.jsx`, export helpers | No |
| E-13 | P2 | Clear `localStorage` drafts and AI caches on sign-out | F-11 | `AuthContext.jsx` | No |
| E-14 | P2 | Versioned service worker cache per build | F-13 | `public/sw.js`, build config | No |
| E-15 ([hosting tiers](scalability/HOSTING_TIERS_AND_COST.md)) | P3 | Capacity sizing and a 1,000-user load test | All | test scripts (e.g., k6/Artillery), not app code | No |

**Order:** E-02 → E-01 → E-03 → E-04 (all P0), then E-05 → E-07 → E-06 → E-08, then P2, then E-15 before launch.

Linked IDs have a written implementation spec; the rest will be written in later batches (see [`scalability/README.md`](scalability/README.md)).

## 6. Acceptance criteria and tests

| ID | Acceptance criteria | Test |
|---|---|---|
| E-01 | Pages load **all** rows when a class has more than 1,000 score rows; no duplicates or gaps. | Seed a test class with 50 students × 30 activities (1,500 rows). Compare the loaded count with `SELECT count(*)`. |
| E-02 | Saving after editing one cell writes only that cell. No score that wasn't loaded is ever deleted or zeroed. Saving is blocked when the load was incomplete. | Same seeded class: edit one cell, save, confirm the other 1,499 rows are unchanged. Simulate an incomplete load and confirm saving is blocked. |
| E-03 | No hard-coded class IDs or mock scores remain in the page code. | Search the code for the class ID and "mock"; open that class and confirm only real scores show. |
| E-04 | Dean pages load a 1,000-student college in one or two requests, with correct counts and no URL errors. | Seed 1,000 students across sections; compare dashboard totals with SQL counts. |
| E-05 | An idle logged-in user makes **no** periodic notification requests while realtime is connected; new notifications still appear within seconds. | Browser network tab over 5 minutes idle; send a test notification. |
| E-06 | The planned peak number of users can connect to realtime at the same time. | Connection test against the plan's limit. |
| E-07 | Exactly one profile request per login; none on token refresh. | Network tab during login and after a forced token refresh. |
| E-08 | The key Dean and roster queries use indexes (no sequential scans on large tables). | `EXPLAIN ANALYZE` on seeded data. |
| E-09 | Summaries match the full calculation for every student, and update within seconds of a score save or posting. | Compare summary rows with a full recalculation for the seeded data. |
| E-10 | A posting for 1,000 students delivers within provider limits, one digest per student. | Send to test inboxes; check queue drain time and failures. |
| E-11 | The AI Study Tutor reuses a stored result across devices when the evidence is unchanged; the rate limit holds across instances. | Two devices, same student; parallel requests over the limit. |
| E-12 | The first-load JavaScript is a fraction of today's 4.5 MB; export still works. | Compare build output; test Excel/PDF export. |
| E-13 | After sign-out, no `sage_scores_*` or `sage_ai_cache_*` keys remain. | Browser storage inspector after sign-out. |
| E-14 | After a release, users get the new version on their next load. | Deploy two builds; reload once. |
| E-15 | 1,000 simulated users (login, dashboard, grades, notifications) run with acceptable response times and no errors on the chosen plan. | k6/Artillery against a staging copy of the database. |

## 7. Capacity estimate (1,000 users at once, e.g., grade-posting day)

| Source | Today (estimate) | After P0–P1 (target) |
|---|---|---|
| Notification polling | about 250 requests/second, constant | 0 while realtime is connected |
| Opening Dashboard + Grades | about 20 requests per student, so a burst of about 20,000 | fewer, smaller requests (summaries, cached reads) |
| Realtime connections | 1,000, above default plan caps | sized to the plan; only visible tabs connected |
| Email | 1,000–2,000 messages, above Gmail's daily cap | provider limits; one digest per student |
| AI Study Tutor calls | up to 1,000 in a short window | reused stored results; shared rate limit |
| Dean page download | the whole college's raw scores per visit | per-student summaries from one database function |

## 8. Risks and how to manage them
- **Two versions of the risk formula.** Avoided by keeping the formula in `riskEngine.js` and having the database return only the inputs.
- **Stale summaries (E-09).** Refreshed by the database on every relevant write; detail pages still read raw data; acceptance test E-09.
- **More moving parts.** Each item ships separately, through the change-freeze process, with its own change record and checklist cases.
- **Migrations.** E-04, E-08, E-09, E-11 (and possibly E-06, E-10) need migrations that the owner runs manually. Each needs a rollback note.

## 9. Related documents
- Decision: [`02-thesis/decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md`](../02-thesis/decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md)
- Defense answers: [`02-thesis/defense/SCALABILITY_DEFENSE_QA_2026-10-10.md`](../02-thesis/defense/SCALABILITY_DEFENSE_QA_2026-10-10.md)
- Active test runbook: [`04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`](../04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md)
- Implementation specs: [`scalability/README.md`](scalability/README.md)
- Hosting tiers and cost: [`scalability/HOSTING_TIERS_AND_COST.md`](scalability/HOSTING_TIERS_AND_COST.md)
- Change process: [`05-operations/agents/CHANGE_FREEZE_GUIDE.md`](../05-operations/agents/CHANGE_FREEZE_GUIDE.md)
