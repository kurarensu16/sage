# ASPIRE — Dev Handoff: Database & Email Pipeline Setup (2026-10-03)

> **Who this is for:** whoever has (or can get) Supabase CLI access to project `ettnwknyhdhehoclrwwh`.
> **What this covers:** (A) applying 3 pending migrations and standing up the Gmail SMTP email
> pipeline (student + guardian notification emails), (B) verifying the Faculty Reports module's
> database connectivity (`posted_grades`/`attendance_records` → the Class Performance page's
> Official Grade/Absences columns and the Pivot panel) — Section 11, and (C) a full account of
> the one item from `IMPLEMENTATION.md` still genuinely not built anywhere (Phase 9 scholarship/
> streak tracking) — Section 12. Together, Sections 0–12 are the complete list of what's left
> from `docs/update_plan/IMPLEMENTATION.md`; everything not mentioned here is already done.
> **Nothing in Sections 0–7 has been run against the live database yet.** Code exists in the repo;
> that is not the same as the feature working. Every step below needs to actually be executed and
> its result checked before this can be considered done. Sections 11–12 **have** already been
> verified/researched directly against the live project (read-only, via the anon key already in
> `.env`) — they document what was found, not a pending task to execute.
>
> **Security rule:** the two values filled in just below are real credentials, by the site owner's
> own choice, directly in this file. **This file is NOT currently committed to git** (confirm with
> `git status --short docs/update_plan/DEV_HANDOFF_SQL_SETUP_2026-10-03.md` — it should show `??`,
> meaning untracked). Keep it that way: do not `git add`/`git commit`/`git push` this file while
> these values are filled in, and never paste its contents into chat with any AI assistant
> (including this one) after the fields below are filled in. The worker secret in Section 3 is
> different — your dev generates that one themselves; nothing to fill in for it here.

## Credentials for your dev — fill in, then hand off

**Gmail address to send from:**
`                                                              `

**Gmail App Password** (generate one at https://myaccount.google.com/apppasswords — this is a
16-character app password, not the account's real login password):
`                                                              `

**Deployed portal URL** (what students/guardians land on from a notification email link):
`                                                              `

---

## 0. What you're about to apply — in plain terms

Three migrations are pending, in this order:

| # | File | What it does |
|---|---|---|
| 1 | `20261002080000_guardian_notification_columns.sql` | Adds two nullable columns (`guardian_id`, `honors_pace`) to the already-live `notification_deliveries` table. Safe, additive, no data risk. |
| 2 | `20261002090000_email_notification_delivery.sql` | Creates the email delivery queue machinery: a trigger that fans out `grade_posted`/`grade_changed` notifications into email delivery rows (one for the student, one for their guardian if on file), the `claim_email_deliveries()`/`complete_email_delivery()` worker functions, and two `pg_cron` jobs (drain every minute, reap stuck rows every 10 min). |
| 3 | `20261003110000_guardian_self_service.sql` | Lets a student read their own guardian record and lets them save it, via a validated RPC (`upsert_primary_guardian`) rather than a raw write policy. |

Plus one Edge Function to deploy: `supabase/functions/send-email` — the Deno worker that actually
connects to Gmail SMTP and sends the queued emails.

**Two audiences get email from this pipeline now:**
- The **student** gets a privacy-safe notice ("a grade was posted, sign in to view it") — never
  the grade value itself.
- Their **guardian** (if one is on file) gets a formal email with the actual subject, standing,
  term grade/GWA, and an honors-pace note. This is intentional and was an explicit product
  decision — guardians have no portal, so this email is the only place they'll ever see this.

---

## 1. Prerequisites

- Supabase CLI installed and linked to this project.
- The Gmail address + App Password this institution will send from — filled in at the top of this
  document, above Section 0.
- About 15–20 minutes, and a test student account you can post a grade to.

```bash
npm install -g supabase   # skip if already installed
supabase login
supabase link --project-ref ettnwknyhdhehoclrwwh
```

---

## 2. Apply the migrations

```bash
supabase db push
```

This applies all three files above, in order. Watch the output for errors.

**If `CREATE EXTENSION pg_cron` or `pg_net` fails:** these two extensions usually can't be enabled
by a plain migration on Supabase-hosted projects — they need `shared_preload_libraries`, which only
the Dashboard toggle sets correctly.
1. Go to **Dashboard → Database → Extensions**.
2. Enable `pg_cron` and `pg_net`.
3. Re-run `supabase db push`.

### Verify the migrations actually landed

Run these in the Supabase SQL Editor (or `psql`) after the push:

```sql
-- Should return 2 rows: guardian_id, honors_pace
SELECT column_name FROM information_schema.columns
WHERE table_name = 'notification_deliveries' AND column_name IN ('guardian_id', 'honors_pace');

-- Should return 2 rows: trg_fan_out_notification_deliveries trigger's function, plus the RPCs
SELECT proname FROM pg_proc
WHERE proname IN ('fan_out_notification_deliveries', 'claim_email_deliveries',
                   'complete_email_delivery', 'upsert_primary_guardian');

-- Should return 2 rows: drain-email-queue, reap-stuck-emails
SELECT jobname FROM cron.job WHERE jobname IN ('drain-email-queue', 'reap-stuck-emails');

-- Should return 1 row: guardians_student_select
SELECT policyname FROM pg_policies WHERE tablename = 'guardians';
```

If any of these come back empty, stop here and fix that before continuing — nothing downstream
will work otherwise.

---

## 3. Generate and set the worker secret

This is a shared secret between the cron job and the Edge Function — **you invent it, it is not a
real external credential.**

```bash
openssl rand -hex 32
```

Copy the output. You'll use this exact same value in steps 4 and 5 below — nowhere else, and never
in a file that gets committed.

---

## 4. Set the Edge Function secrets

Use the Gmail address and App Password filled in at the top of this document, plus the worker
secret from step 3, directly in this command, in your own terminal:

```bash
supabase secrets set \
  SMTP_USER=the-gmail-address \
  SMTP_PASS=the-app-password \
  WORKER_SECRET=<value-from-step-3> \
  PORTAL_URL=https://the-real-deployed-url
```

`SMTP_HOST`/`SMTP_PORT` are hardcoded in the function (Gmail, port 587) — not secrets, never set
these.

---

## 5. Set the matching database-side secret

**Supabase SQL Editor only — never a migration file**, since migrations are committed to git and
this value must not be:

```sql
ALTER DATABASE postgres SET app.worker_secret = '<the SAME value from step 3>';
```

---

## 6. Deploy the Edge Function

```bash
supabase functions deploy send-email
```

---

## 7. Test the pipeline end to end

This is the step that actually proves it works — don't skip it, and don't consider this done
until every checkbox below is confirmed.

### 7a. Student-only test (no guardian on file yet)

1. Post a grade (any milestone) for a test student who has **no** guardian record yet.
2. Run the drain manually instead of waiting for the 1-minute cron tick:
   ```bash
   curl -X POST https://ettnwknyhdhehoclrwwh.supabase.co/functions/v1/send-email \
     -H "x-worker-secret: <same value as step 3>" -H "Content-Type: application/json" -d '{}'
   ```
3. Confirm:
   - [ ] Response shows `"sent": 1` (or more).
   - [ ] The student receives an email with **no grade value or remark in the body** — only an
     event notice and a portal link.
   - [ ] In the DB: `SELECT status, sent_at FROM notification_deliveries WHERE channel = 'email' ORDER BY created_at DESC LIMIT 1;` shows `status = 'sent'` with a `sent_at` timestamp.

### 7b. Guardian test (the new part)

1. Log in as that same test student. You should immediately see the **required guardian contact
   modal** — it should block the rest of the portal until filled in.
2. Fill in a guardian name, relationship, and a real email address you can check, and save.
   - [ ] Confirm in the DB: `SELECT full_name, relationship, email, is_primary FROM guardians WHERE student_id = '<the student's user_id>';` shows your saved row with `is_primary = true`.
3. Post another grade (or re-post the same one) for that student.
4. Run the same curl command from step 7a again.
5. Confirm:
   - [ ] A **second** delivery row exists for this event: `SELECT target_address, guardian_id, honors_pace, status FROM notification_deliveries WHERE notification_id = (SELECT notification_id FROM notifications ORDER BY created_at DESC LIMIT 1);` — you should see **two** rows, one with `guardian_id IS NULL` (the student's own) and one with `guardian_id` set (the guardian's).
   - [ ] The guardian's email actually arrives, addressed to the guardian's relationship/name,
     and **does** contain the subject, standing, and term grade/GWA — this one is supposed to
     have detail the student's own email doesn't.
   - [ ] If the student's GWA happens to be ≤1.75 across their posted subjects, the guardian email
     includes the honors-pace sentence; if not, that sentence is simply absent (not an error).

### 7c. Reap/retry sanity check (optional, lower priority)

- [ ] `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;` shows the
  `drain-email-queue` job actually firing on its own every minute (not just via your manual curl).

---

## 8. What "done" looks like

Flip these from `[~]`/`[ ]` to `[x]` in `docs/update_plan/IMPLEMENTATION.md` and
`docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md` only once **all** of section 7's checkboxes are
confirmed — not when the migrations merely apply without error. Code existing in the repo and
code actually sending email to a real inbox are two different claims; this handoff is only
finished when the second one is true.

---

## 9. If something breaks

| Symptom | Likely cause | What to check |
|---|---|---|
| `supabase db push` fails on `CREATE EXTENSION` | `pg_cron`/`pg_net` need the Dashboard toggle | See step 2's note |
| curl test returns `403 forbidden` | Worker secret mismatch between Edge Function secret and `app.worker_secret` GUC | Re-run steps 3–5 with the exact same value |
| curl returns `500`, mentions `SMTP_USER`/`SMTP_PASS` | Edge Function secrets not set or typo'd | Re-run step 4; `supabase secrets list` to confirm they're present (values are hidden, but names will show) |
| Guardian modal never appears for a test student | `profile.role` isn't `'student'` for that account, or `guardians_student_select` policy didn't apply | Re-check step 2's policy verification query |
| Guardian email never queues even though a guardian is saved | `is_primary` wasn't set `true` on the guardian row, or the migration order got reversed somehow | `SELECT is_primary FROM guardians WHERE student_id = '...'`; re-check `ls supabase/migrations/` sort order matches section 0's table |
| Student's own email is missing (but guardian's arrived) | `notification_preferences` row for that user/type has `email = false` | `SELECT * FROM notification_preferences WHERE user_id = '...' AND notification_type IN ('grade_posted','grade_changed');` — this one legitimately can turn the student's own email off; it never affects the guardian copy, by design |

---

## 10. Reference — files involved, if you need to read the actual logic

- `supabase/migrations/20261002080000_guardian_notification_columns.sql`
- `supabase/migrations/20261002090000_email_notification_delivery.sql`
- `supabase/migrations/20261003110000_guardian_self_service.sql`
- `supabase/functions/send-email/index.ts`
- `src/components/student/GuardianInfoGate.jsx` (the login-blocking modal)
- `src/lib/notificationDispatcher.js` (`notifyGradePosted`/`notifyGradeChanged`)
- `src/pages/faculty/ScoreInput.jsx` and `src/pages/faculty/GradeComputationPreview.jsx` (where
  grades actually get posted and the above get called)
- Full design rationale and the independent audit trail: `docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md`

---

## 11. Faculty Reports — connecting Class Performance / Pivot to real grade & attendance data

**Status: already verified live, 2026-10-03, read-only, against the real project** — not a
pending task like Sections 0–7, but documented here so the next person doesn't have to
re-discover it. Verified using the anon key already present in `.env`
(`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — the same credentials the app itself uses), via a
throwaway Node script, no writes performed.

### What the Reports module needs from the database

`src/lib/reportsService.js`'s `fetchClassReportDataset()` joins these tables for one
`class_record_id`:

| Table | Used for | Confirmed live? |
|---|---|---|
| `class_records` | resolve `section_id`/`subject_id` for the class | ✅ readable, 12 rows total |
| `enrollments` | active roster for that section+subject | ✅ readable, 55 rows total |
| `class_activities` / `student_activity_scores` | per-activity scores feeding "Overall Average" | ✅ (pre-existing, unchanged this session) |
| `posted_grades` | real official GWA for "Official Grade (GWA)" column + Pivot | ✅ readable, 45 rows total |
| `attendance_records` | real absence count for "Absences" column + Pivot | ⚠️ readable, but **0 rows in the entire database** |

### The one real finding: `attendance_records` is empty, not broken

This is **not a bug** — the query, the join, and the column all work correctly; there is simply
no attendance data recorded anywhere in the project yet. The "Absences" column and the
`Absences` pivot field will correctly show `0` for every student until attendance actually gets
recorded through the faculty **Class Attendance** feature (`src/pages/faculty/ClassAttendance.jsx`,
writes to this same table). Nothing to fix in code — this is a data/usage gap, not a connectivity
one.

**Action for the dev:** either (a) have a faculty account actually take attendance for at least
one class before judging whether the "Absences" column works, or (b) if you want to verify the
column itself works without waiting on real usage, insert one test row:

```sql
INSERT INTO attendance_records (class_record_id, student_id, status)
VALUES ('<a real class_record_id>', '<a real student_id enrolled in it>', 'Absent');
```

then reload that class's Class Performance page and confirm "Absences" shows `1` for that student.
**Delete the test row afterward** if it's not real data (`DELETE FROM attendance_records WHERE class_record_id = '...' AND student_id = '...';`).

### `posted_grades` works end-to-end — verified, not assumed

Traced one real class (`class_record_id = 'a249551a-00ac-4fe6-a579-32c4c53b6ce2'`) all the way
through: its 5 posted `midterm_rating` rows match exactly to 5 active enrollments by
section+subject, and running the actual `resolveOfficialGwa()`/`findMostAdvancedPostedGrade()`
functions from `src/lib/academicPolicy.js`/`src/lib/gradeMilestones.js` against those real rows
correctly resolved `officialGwa: 5` (GWA 5.00) for all 5 students. This was the real app code run
against real data, not a reimplementation — if you want a known-good sanity check while testing
the UI, that class/those students are a confirmed-working reference point.

**Worth a human sanity check, not a bug report:** all 5 sampled students in that one class have
`effective_grade: 5` (failing) with raw `computed_grade` scores of 41–49%. That's real data
resolving correctly, not fabrication — but it's unusual for an entire sampled roster to be
uniformly failing, and worth a quick look to confirm it's genuine class performance and not
leftover seed/test data skewing what faculty see.

### Security note, out of scope for this handoff but worth flagging

`class_records` and `posted_grades` were both readable via the **anon key alone, with no
authentication at all**. This matches the project's original state documented in `AGENTS.md`
("All 21 tables have RLS disabled") and is a pre-existing condition, not something introduced
this session — but it means grade data is currently readable by anyone with the publishable anon
key (which ships in the client bundle), not just logged-in faculty/students. The notification
tables already had RLS re-enabled earlier this session (`20261001170000_secure_notification_access.sql`)
as a precedent for how to do this properly for a table. Doing the same for `posted_grades`,
`enrollments`, `class_records`, etc. is real, separate work — flagging it here since testing this
section is what surfaced it, not proposing it as part of this handoff's scope.

---

## 12. Everything else in `IMPLEMENTATION.md` that is NOT yet done

Sections 0–7 (email/guardian pipeline) and Section 11 (Reports connectivity) above cover every
item from `docs/update_plan/IMPLEMENTATION.md`'s Master Execution Checklist that was still open as
of 2026-10-03, **except one**: everything else in that checklist (Phases 1–3, items (a) through
(l)) is confirmed done and verified — see
`docs/update_plan/UPDATE_PLAN_AUDIT_2026-10-03.md` for the full record. The one remaining gap:

### Phase 9 / item 3.12 — Scholarship Standing & Streak Tracking (not built at all)

**Status: correctly deferred, confirmed still correctly deferred.** Checked live against the real
database while writing this handoff (read-only, same anon-key method as Section 11) — there is
**zero multi-term historical data to build this from yet**:

```
posted_grades by grade_period: { midterm_rating: 25, tentative_final_rating: 20 }
earliest posted_at: 2026-09-29T07:17  latest: 2026-09-30T05:01
```

Every single posted grade in the entire database is from a 22-hour window, in the current term,
and **no `semestral_grade` has been posted anywhere yet** — meaning not even the current term has
finished for any class, let alone a prior one to compare against. This isn't a "someone forgot to
migrate data" situation; there is no prior-term data anywhere in this project to migrate. Nothing
here can be built yet regardless of engineering effort — it needs at least one full term to close
first.

**What's actually specified** (`IMPLEMENTATION.md` Step 21 — this is the entire spec, it's
intentionally thin because the plan itself defers the design, not just the build):
- A `student_risk_history` table (schema not designed — see "What needs deciding" below).
- A `student_semester_summary` materialized view (schema not designed).
- `getScholarshipStanding(studentId)` and `getStreakLength(studentId)` functions (logic not
  designed — "streak" of what, counted how, is not defined anywhere in the plan).

**What needs deciding before any of this is buildable** (none of this is a SQL/ops task like
Sections 0–11 — it's a product/design decision first):
1. What counts as a "streak"? Consecutive terms at a GWA threshold? Consecutive terms with no
   failing subject? Something else? Not specified anywhere in the source planning docs.
2. What triggers a `student_risk_history` snapshot — once per term close, or more granular?
3. Does "scholarship standing" mean the existing President's List honors logic
   (`getHonorTier()` in `src/lib/academicPolicy.js`) evaluated historically across terms, or a
   separate scholarship-specific policy not yet documented anywhere in this codebase?

**Recommended next step, not a task to execute now:** revisit this once at least one full
academic term has closed (real `semestral_grade` rows exist for a full cohort) and the three
questions above have real answers from whoever owns this product decision. Trying to design the
table schema before that would mean guessing at a data shape for a concept ("streak") that isn't
defined yet — exactly the kind of fabricated-ahead-of-need design this whole audit has been
pushing back against everywhere else in the codebase.
