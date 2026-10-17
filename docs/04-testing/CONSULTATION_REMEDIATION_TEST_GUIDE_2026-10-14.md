# Manual UI Test Guide: Consultation Remediation + Security Hardening + Caching

- **Date:** 2026-10-14
- **Covers:** Phases 0–6 of [`ASPIRE_CONSULTATION_IMPLEMENTATION_PLAN_2026-10-14.md`](../03-development/audits/ASPIRE_CONSULTATION_IMPLEMENTATION_PLAN_2026-10-14.md), plus the caching and deployment fixes in section 14
- **Why this exists:** the project has no test framework and no typecheck. `npm run lint`, `npm run build` and the `verify:*` scripts all pass, but **none of them exercise the UI**. Every case below was written because it cannot be checked any other way.
- **Nothing here has been browser-tested.** Treat each case as unverified until you run it.

---

## 0. Before you start

Run the migrations in filename order, oldest first:

```
20261011120000_restrict_destructive_deletes.sql
20261011130000_term_rollover_grace.sql
20261011140000_admin_batch3_atomic_saves.sql
20261011150000_unique_subjects.sql
20261014120000_harden_users_rls.sql
20261014130000_admin_grade_override_audited.sql
20261014140000_rls_live_tables.sql
20261014150000_drop_legacy_evaluation_tables.sql
20261014160000_protect_class_activities_from_deletion.sql
20261014170000_department_short_name.sql
20261014180000_program_abbreviations.sql
20261014190000_consultation_scheduling.sql
```

`20261011120000` must run before `…150000`, which drops `evaluation_windows`.

**Also required in the Supabase dashboard, or OTP password reset will fail silently:**

1. **Authentication → SMTP Settings** — enable custom SMTP (`smtp.gmail.com`, port 465, the `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` values already used by the `send-email` function).
2. **Authentication → Email Templates → Reset Password** — the body must contain `{{ .Token }}`. With only `{{ .ConfirmationURL }}`, the email carries a link and no code.

Start the app with `npm run dev` (port **5175**).

---

## 1. Login — do this first

RLS was enabled on `public.users`, the table every session reads. If this is broken, nothing else matters.

| # | Step | Expect |
|---|---|---|
| 1.1 | Sign in as admin, dean, faculty, and student in turn | All four reach their dashboard with their name and role shown |
| 1.2 | Check each portal's sidebar and dashboard cards load | No blank panels, no "profile not found" |
| 1.3 | Sign in as an inactive or archived account, if you have one | Still refused with the existing message, not a generic error |

**If any role cannot load its profile, stop.** The cause is `20261014120000_harden_users_rls.sql`; roll that one back and report which role failed.

---

## 2. Password reset by OTP (new flow)

| # | Step | Expect |
|---|---|---|
| 2.1 | Sign out → **Forgot Password** → enter a real account email → submit | Moves to a numeric code screen; an email arrives with a numeric code |
| 2.2 | Enter the code | Lands on Create New Password |
| 2.3 | Set a password meeting the policy, submit | Success; you can sign in with the new password |
| 2.4 | Repeat 2.1 with an email that is **not** registered | **Same** confirmation screen, no "account not found" — this is deliberate, it stops anyone probing which emails exist |
| 2.5 | Enter a wrong or expired code | Clear refusal, invites requesting a new code |
| 2.6 | Use **Resend code**, then the newest code | Works |

If no email arrives at all, the cause is almost certainly the two dashboard settings above, not the app.

---

## 3. Activity logs are now admin-only

| # | Step | Expect |
|---|---|---|
| 3.1 | As **admin**, open System → Activity Logs | Entries load and page through |
| 3.2 | As **faculty**, view the dashboard | The "Recent Activity Logs" panel is **gone** (removed deliberately) |
| 3.3 | As faculty, do something logged (save scores) → sign in as admin → Activity Logs | The faculty action **is** recorded. Writes still work for everyone; only reading is admin-only |

---

## 4. Grade Override is audited (Phase 0.2)

| # | Step | Expect |
|---|---|---|
| 4.1 | Admin → Grade Override → search a student with a posted SG | All matches listed with ID number, college, section |
| 4.2 | Override the SG: pick a DYCI grade step, type a reason, save | Saves; student and instructor are notified |
| 4.3 | Try to save with the reason blank | Refused |
| 4.4 | Try to override an MR or TFR row | Refused — only the Semestral Grade can be overridden |
| 4.5 | Have me run a read-only check of `grade_correction_history` afterwards | A new row exists for the override, with the reason. **This is the point of the change** — overrides used to leave no trace |
| 4.6 | If a faculty SG correction request is already pending/approved for that grade, try to override | Refused, telling you to resolve that request first |

Also confirm a normal faculty-initiated, dean-approved SG correction still works end to end — that path was not meant to change.

---

## 5. Deleting a grading column (Phase 1)

| # | Step | Expect |
|---|---|---|
| 5.1 | Faculty → Score Input → open an activity column's ⚙️ Configure | A red **Delete Column** button appears (only for a saved column) |
| 5.2 | On a column where **no** student has a score, delete it | Confirmation names the column and says it is irreversible; after confirming, the column disappears |
| 5.3 | On a column where **at least one** student has a score, try to delete | Refused, naming how many scores block it |
| 5.4 | Enter **0** as a score for one student, then try to delete that column | **Refused.** A recorded zero is a real score, not a blank |
| 5.5 | Open an archived class's Score Input | No Delete Column button |
| 5.6 | As admin, check Activity Logs after 5.2 | A `Grading Column Deletion` entry naming the column |
| 5.7 | Delete a middle column, then reload the page | Remaining columns and their max scores are still correct and correctly ordered |

---

## 6. Wording and label fixes (Phase 2)

| # | Step | Expect |
|---|---|---|
| 6.1 | Faculty dashboard → Pending Posts card | Sublabel reads **"Current Grading Period"**, not "Ongoing terms" |
| 6.2 | As a student with a **failing** grade in a period that is *not* itself posted but is covered by a posted MR/TFR | Reads **"Below passing so far"** — not "At-Risk". This was the reported bug |
| 6.3 | As a student with a genuinely **posted** failing grade | Still reads **"At-Risk"** — unchanged on purpose |
| 6.4 | Student with no scores yet | "Awaiting scores" |

---

## 7. No hard-coded colleges or programs (Phase 2.2)

| # | Step | Expect |
|---|---|---|
| 7.1 | Admin → Manage Users → filter by college | Shows the **TECH** abbreviation for Technology and Engineering College for Humanity, and the correct code for every other college |
| 7.2 | Confirm "CCS", "College of Computer Studies", "College of IT" and "College of CS" appear **nowhere** in the UI | They are not in your database and should never be shown |
| 7.3 | Faculty → Score Input → Export → preview a grade sheet | College and the signatory line show the **class's real college**, not a fixed one. Previously every export said "DEAN, CCS" |
| 7.4 | Export the Excel file for a class in a **non-computing** college and open it | College and Course cells show that class's real college/program |
| 7.5 | Admin → Manage Users → pick a college → open the Program filter | Lists that college's real programs |
| 7.6 | Create a student in a college, choose a program, then a section | Only sections of that program are offered (matched by the program's abbreviation) |
| 7.7 | Admin → Sections → Import → **Load sample** | The template uses a real college, program and term from your data, not an invented one |
| 7.8 | Dean → Summary Reports → College/School | Lists real colleges; a dean stays pinned to their own |

---

## 8. Consultation scheduling (Phase 3.1)

| # | Step | Expect |
|---|---|---|
| 8.1 | Student → Consultations → request a consultation | Submits as before |
| 8.2 | Faculty → Consultation Requests → Respond → choose **Scheduled** | Date/time picker and an Online / Face-to-Face choice appear; the student's preferred time is shown for reference |
| 8.3 | Try to save **Scheduled** with no date or no mode | Refused |
| 8.4 | Choose **Online**, add a meeting link, save | Saves; link is optional |
| 8.5 | Choose **Face-to-Face**, add a location, save | Saves; location is optional |
| 8.6 | Student reopens Consultations | A **Confirmed Schedule** card shows date, mode, and link or location |
| 8.7 | Student clicks **"I have seen this schedule"** | Changes to a confirmation line; faculty's inbox now shows "acknowledged by student" |
| 8.8 | Faculty **changes the date** after the student acknowledged | Acknowledgment resets to "awaiting student acknowledgment", and the student can acknowledge again. Without this the student would see "acknowledged" beside a date they never saw |
| 8.9 | Faculty dashboard → Consultation Inbox → Respond | Only **Completed** / **Declined**, plus a link to Consultation Requests for scheduling. Deliberate: this modal has no date field, so letting it set "Scheduled" would produce a scheduled meeting with no schedule |
| 8.10 | Mark a consultation Completed from the dashboard | Works; student notified |

---

## 9. Section Masterlist (Phase 3.2 — new page)

| # | Step | Expect |
|---|---|---|
| 9.1 | Admin → Academic Setup → **Section Masterlist** → pick a section | Numbered list of that section's **home-assigned** students with ID number, year level, status |
| 9.2 | Pick a section with no home students | Empty state pointing to Manage Users / Import Users |
| 9.3 | Have an irregular student (home section A) join a class under section B, then view section B | They appear under **Irregular Enrollees by Subject**, grouped by subject, showing home section A — and **not** in the official masterlist |
| 9.4 | Check faculty rosters for that class (Attendance, Score Input, Posted Grades) | The irregular student is **still listed**. This page is an extra report, never a filter on official records |
| 9.5 | Click **Print** | Printable output |

---

## 10. Grading formula frozen at class creation (Phase 4) — most important case

This is the regression test that did not exist before.

| # | Step | Expect |
|---|---|---|
| 10.1 | Admin → Classrooms → create a class for a subject whose COG you can edit | Created |
| 10.2 | Admin → Grading Formulas → change that template's component **weights** | Saves |
| 10.3 | Faculty → Score Input / Grade Computation Preview for the class from 10.1 | Still computes with the **original** weights. Before this change it would have silently picked up the edit mid-term |
| 10.4 | Create a **new** class for the same subject now | Uses the **edited** weights — the edit applies to the next class, as intended |
| 10.5 | Post a milestone on the class from 10.1 | Posts normally, **no** "The submitted COG differs from the class grading snapshot" error |
| 10.6 | Check a student's running GWA and the dean's At-Risk list for the 10.1 class | Also use the original weights — the freeze covers live/tentative grades, not just posted ones |
| 10.7 | A class created **before** these changes | Still behaves as before, snapshotting at its own first posting |

If 10.5 fails, tell me — it would mean the creation-time snapshot differs from the one the posting screen builds.

---

## 11. Intervention form (Phase 5)

| # | Step | Expect |
|---|---|---|
| 11.1 | Faculty → Student Risk → evaluate a student | Above the task list: **"Select the action(s) you intend to take."** |
| 11.2 | Click **Edit** on a task | Focuses and selects that task's text for revision |
| 11.3 | Add, edit and remove tasks; submit | Unchanged from before — 1–5 tasks, deadline required |
| 11.4 | Edit a plan after the student acknowledged it | Still allowed, and re-acknowledgment is requested — unchanged on purpose |

---

## 12. Type sizes and sidebar (Phase 6)

| # | Step | Expect |
|---|---|---|
| 12.1 | Look at dense screens — Score Input, Posted Grades, Academic Insights, Manage Users, Grade Computation Preview | No text smaller than 10px anywhere. 151 instances of 7–9px text were raised to a 10px floor |
| 12.2 | Check badges, table footnotes and stat captions | Still fit their containers; nothing clipped or overflowing |
| 12.3 | Sidebar, all four roles | Group headers (e.g. "ACADEMIC SETUP") are clearly **smaller** than the page links beneath them |
| 12.4 | Narrow the window / use a phone | Long page names truncate rather than wrap or overflow; no horizontal scroll |

---

## 13. Re-check after everything

| # | Step | Expect |
|---|---|---|
| 13.1 | Admin: create a user, a section, a subject, a classroom | All work under the new RLS policies |
| 13.2 | Faculty: enter scores, take attendance, post a milestone | All work |
| 13.3 | Student: My Subjects, My Grades, Score Breakdown, AI Study Tutor | All load |
| 13.4 | Dean: At-Risk Students, Grade Posting Status, Summary Reports, Grade Corrections | All load |
| 13.5 | Join a class by code as an irregular student, approve it as faculty | Works — join codes are now faculty/admin-only to read, and students go through the server-side RPC |

---

## 14. Caching and deployment

**Read this before testing section 14.** None of these cases surface from ordinary feature testing — a stale service worker is never found by testing grade entry. Each one has to be provoked deliberately.

### 14a. A new deploy actually reaches the browser

This is the bug that started this work: deploys used to be ignored until the browser cache was cleared by hand.

| # | Step | Expect |
|---|---|---|
| 14.1 | Build and serve: `npm run build` then `npm run preview`. Open the app and sign in | Loads normally |
| 14.2 | Leave that tab **open**. Make a visible change (e.g. edit a dashboard label), run `npm run build` again, then reload the tab | The change appears. Before this fix it would not, no matter how many times you reloaded |
| 14.3 | DevTools → Application → Service Workers | Exactly one worker is active, and its status is *activated* |
| 14.4 | DevTools → Application → Cache Storage | Only **one** `sage-app-<id>` cache. Older ones are deleted on activation |
| 14.5 | Repeat 14.2 a third time | Still updates. The fix is not a one-off |

If 14.2 fails, check that `dist/sw.js` contains a real build ID rather than the literal `__BUILD_ID__`.

### 14b. Offline behaviour

| # | Step | Expect |
|---|---|---|
| 14.6 | Load the app, then DevTools → Network → **Offline**, and reload | The shell still loads (served from cache) rather than a browser error page |
| 14.7 | While offline, open a page that needs data | Data fails to load, which is correct — Supabase responses are deliberately never cached |
| 14.8 | Go back online and reload | Normal operation resumes |

### 14c. Score drafts versus the database

The dangerous case. A local draft used to beat the database whenever the **browser clock** ran ahead of the server's.

| # | Step | Expect |
|---|---|---|
| 14.9 | As faculty, enter a score, wait for "saved", reload the page | The score persists, read back from the database |
| 14.10 | **Set the computer's clock forward by an hour.** Enter a score on device A, let it save, then open the same class on device B (or another browser) and change that score | Device B's newer value wins after reload on both. A fast clock no longer resurrects stale scores |
| 14.11 | Set the clock back to correct before continuing | — |
| 14.12 | Go **offline**, type a score (it cannot reach Supabase), then reload while still offline | The typed score is still there — it is unsynced work and must not be discarded |
| 14.13 | Go back online and reload | The value syncs and persists |

### 14d. Shared browser and sign-out

| # | Step | Expect |
|---|---|---|
| 14.14 | Sign in as faculty A, enter scores, sign out. Sign in as faculty B on the same browser | B sees **none** of A's drafts |
| 14.15 | Sign in as faculty A, enter scores, **close the tab without signing out**. Reopen and sign in as faculty B | B still sees none of A's drafts — this is the common shared-machine case |
| 14.16 | Sign in as A, go **offline**, type a score, then sign out and sign back in as **A** | A's unsaved score is still there. Unsynced work is deliberately preserved for the same user |
| 14.17 | Repeat 14.16 but sign back in as **B** | The draft is gone before B sees anything |
| 14.18 | Go offline, then sign out | Sign-out still completes and returns to the login page — it must not hang on a loading spinner waiting for Supabase |

### 14e. Cached objects cannot outlive a deploy

| # | Step | Expect |
|---|---|---|
| 14.19 | Sign in, visit a student page, then DevTools → Application → Session Storage | Keys look like `sage_cache_<buildid>_…` |
| 14.20 | Rebuild and reload the same tab | Old `sage_cache_*` entries from the previous build are gone, replaced by ones carrying the new build ID |

---

## Reporting back

For anything that fails, the most useful details are: the portal and page, the role you were signed in as, what you expected, what happened, and any red error text or browser console output. If a failure looks like a permissions problem ("not authorized", empty list that should have rows), say which migration you had reached — that usually points straight at the policy to fix.
