# Admin portal — page checklists

**Narrowed by:** Phase 1 (Admin/Registrar Role Split), 2026-10-29. Admin's scope
is now accounts plus system maintenance; Academic Setup, Academic Terms, Section
Rosters, and Grade Override moved to the Registrar portal.

## Portal-wide gates (run first)

**ID:** `ADM-GATE` · **Last touched by:** Phase 1

- [ ] Sidebar shows exactly: Dashboard, User Accounts (Manage Users, Import
      Users), System Maintenance (Audit Logs, System Health, Storage Health (R2),
      Maintenance Mode, Classroom Provisioning). *(System Health, Storage Health,
      and Maintenance Mode added by Phase 2.)*
- [ ] **Gone from the sidebar:** Subjects, Grading Templates, Manage Sections,
      Section Rosters, Colleges & Departments, Academic Terms, Grade Override.
- [ ] Visiting a relocated URL directly (`/admin/subjectlist`,
      `/admin/termmanagement`, `/admin/gradeoverride`) does not render the page.
- [ ] Mobile bottom nav shows Dashboard / Users / Classes / System, and no tab
      points at a relocated page.
- [ ] Admin can still reach `/admin/settings` and `/admin/notifications`.
- [ ] **Database-level check:** Admin is refused at the RLS layer — not merely
      hidden — when writing `departments`, `sections`, `programs`, `subjects`,
      `grade_computations`, `academic_terms`, or `posted_grades`. Hiding nav
      without the policy change would leave Admin able to write via the console.

---

## Dashboard

**ID:** `ADM-DASH` · **Route:** `/admin/dashboard` · **File:** `src/pages/admin/Dashboard.jsx`
**Last touched by:** Phase 1 · **Expected to change in:** Phase 2 (repurposed to a system-health overview)

- [ ] Page renders without error.
- [ ] Hero action is **Manage Users** (it was Manage Terms, which moved).
- [ ] Stat tiles still show counts for Users, Colleges, Subjects, Sections.
- [ ] The three tiles for relocated areas (Colleges, Subjects, Sections) render as
      **non-navigable tiles** — no "View" affordance, no cursor-pointer, and
      clicking does nothing. Counts still inform Admin.
- [ ] The Users tile is still clickable and opens Manage Users.
- [ ] Quick actions contain only reachable targets: Add New User, Audit Logs,
      Classroom Provisioning.
- [ ] **No dead link anywhere on the page.** Click every link and confirm none
      bounces through NotFound back to the dashboard.

---

## Manage Users

**ID:** `ADM-USERS` · **Route:** `/admin/userlist` · **File:** `src/pages/admin/UserList.jsx`
**Last touched by:** Phase 1

- [ ] List renders and totals are correct.
- [ ] **Role filter includes Registrar** and filtering by it returns registrars.
- [ ] **Mobile role tabs include Registrars** with a correct count.
- [ ] Role counts across all tabs sum to the total.
- [ ] Search, status filter, and archived toggle all still work.
- [ ] Deactivate/reactivate and archive still work.
- [ ] **Import path:** a CSV row with role `registrar` is accepted — not
      rejected as an invalid role.
- [ ] An imported registrar with no college is **not** rejected for a missing
      college (registrar is institution-wide, like admin).
- [ ] An imported registrar with no ID number is assigned a `REG-YYYY-NNNNN`
      number — **not** a `DN-` dean number. The old prefix logic fell through to
      `DN-` for any unrecognised role.
- [ ] An employee ID typed as `REG-2026-00009` passes format validation.
- [ ] Export still produces a valid `.xlsx`.

---

## User Form

**ID:** `ADM-USERFORM` · **Route:** `/admin/userform` · **File:** `src/pages/admin/UserForm.jsx`
**Last touched by:** Phase 1

- [ ] **Role dropdown offers Registrar** (restart the dev server first — a stale
      server already caused a false negative here once).
- [ ] Creating a registrar does **not** require a college, and the college field
      is hidden for that role.
- [ ] A created registrar receives a `REG-YYYY-NNNNN` employee ID.
- [ ] The new registrar can sign in and lands on `/registrar/dashboard`.
- [ ] **Regression that matters most:** open an existing registrar in edit mode
      and save. The role must remain `registrar`. Before Phase 1's fix, the role
      was validated against a list that omitted it, so editing a registrar
      silently reset them to `student` — data loss, not a cosmetic bug.
- [ ] Editing a dean, faculty, or student still requires a college.
- [ ] Editing an admin still requires no college.
- [ ] Student creation still requires program, year level, and section.

---

## Audit Logs

**ID:** `ADM-AUDIT` · **Route:** `/admin/auditlog` · **File:** `src/pages/admin/AuditLog.jsx`
**Last touched by:** unchanged by Phase 1 (verify it still works, since its RLS was reviewed)

- [ ] Logs render and paginate.
- [ ] `activity_logs_select_admin` still admits Admin — this policy was
      deliberately left admin-gated and the migration asserts it.
- [ ] A registrar cannot read audit logs (no nav entry, and the policy refuses).
- [ ] Registrar actions appear here: a program created, a student record set, a
      report exported.
- [ ] CSV export still works.

---

## Classroom Provisioning

**ID:** `ADM-PROV` · **Route:** `/admin/classrooms` · **File:** `src/pages/admin/ClassroomProvisioning.jsx`
**Last touched by:** Phase 1 (kept deliberately) · **Expected to change in:** Phase 4 (removed; replaced by Faculty Loading & Provisioning)

- [ ] Still reachable by Admin from both the sidebar and the mobile nav.
- [ ] Provisioning a class still works end to end.
- [ ] **Why this is still here:** Phase 4 moves provisioning to Registrar and
      Dean. Removing it in Phase 1 would have left nobody able to open a class in
      the interim. Do not "tidy" it away before Phase 4 lands its replacement.

---

## Notifications

**ID:** `ADM-NOTIF` · **Route:** `/admin/notifications` · **File:** `src/pages/admin/Notifications.jsx`
**Last touched by:** Phase 1 (recipients reviewed, page unchanged)

- [ ] Page renders; delivery-queue monitoring still works.
- [ ] Admin **still** receives: account status changes, system/security alerts,
      and the no-active-dean escalation for SG corrections.
- [ ] Admin **no longer** receives roster-import notices — those now go to
      registrars.
- [ ] The no-active-dean escalation still makes sense for Admin, because
      assigning a dean (`assign_department_dean`) remains an Admin action.

---

---

## Maintenance Mode

**ID:** `ADM-MAINT` · **Route:** `/admin/maintenance` · **File:** `src/pages/admin/MaintenanceMode.jsx`
**Last touched by:** Phase 2 · **Requires:** migration `20261029052220`

- [ ] Page shows the current state correctly (off by default after migration).
- [ ] "Start maintenance" is **disabled until a message is written** — the server
      rejects an empty message too, so check both.
- [ ] Starting maintenance asks for confirmation and quotes the message back.
- [ ] After starting, the page shows ON, plus who changed it and when.
- [ ] The message persists in the textarea after ending maintenance, so a repeat
      window does not need retyping.
- [ ] Ending maintenance returns the state to off.
- [ ] Both actions write an Audit Logs entry.
- [ ] **Non-admin cannot do this:** call `set_maintenance_mode` as faculty,
      student, dean, or **registrar** and confirm `42501`. Maintenance is Admin's
      remit, not Registrar's.
- [ ] **No direct write path:** attempt an `UPDATE` on `system_settings` from a
      client session and confirm it is refused. The table has a SELECT policy
      only; writes exist solely through the RPC.

### The soft cutover — the behaviour that actually matters

Run with **two browsers** (or a normal and a private window): one admin, one
student.

- [ ] Student signed in and working. Admin turns maintenance on.
      → Student sees a **one-time dismissible toast** *and* a **persistent top
      banner**. They are **not** signed out and can keep navigating.
- [ ] Student dismisses the toast → the toast goes, the **banner stays**.
- [ ] Student navigates between pages → banner persists, toast does not return.
- [ ] Admin turns maintenance **off** while the student is still active →
      the banner disappears **silently**. No "maintenance ended" notice — that
      was a deliberate decision.
- [ ] With maintenance on, the student signs out and signs back in →
      now they get the **MaintenanceScreen**, not the portal. This is the
      active-session versus new-login distinction; both states come from the same
      flag, so if both show the same thing the latch logic is broken.
- [ ] On the MaintenanceScreen: the admin's exact message is shown, "Check again"
      re-reads the flag, and "Sign out" works.
- [ ] Admin signs out and back in with maintenance on → **admin still gets the
      portal**, never the screen. If admin were blocked they could not reach the
      toggle to end the window.
- [ ] Turn Realtime off (or block the websocket) and repeat the flip → the notice
      still arrives within ~4 seconds via the polling fallback.
- [ ] A failed read of `system_settings` (for example a wrong anon key) does
      **not** lock anyone out — an unreachable database must not be mistaken for
      an assertion of maintenance.

---

## System Health

**ID:** `ADM-HEALTH` · **Route:** `/admin/systemhealth` · **File:** `src/pages/admin/SystemHealth.jsx`
**Last touched by:** Phase 2

- [ ] First probe runs on load and a latency figure appears.
- [ ] Status chip is green under 500ms, amber under 2s, red beyond or on error.
- [ ] Probes repeat every 10s; Pause stops them and Resume restarts.
- [ ] Latest / Average / Slowest / Failures tiles are consistent with the sample
      list.
- [ ] Recent-checks bars render, newest at the bottom, with readable timestamps.
- [ ] **Induce a real failure** (briefly use a wrong anon key, or go offline):
      status goes red, the error text is shown, and the Failures count rises.
- [ ] Recovering returns the status to green without a reload.
- [ ] Leaving the page stops the interval (no probing continues in the
      background).
- [ ] The disclaimer that this measures *this browser's* connection, not
      Supabase's platform status, is present — during an incident that
      distinction decides whether someone escalates to the right place.

---

## Storage Health (R2)

**ID:** `ADM-STORAGE` · **Route:** `/admin/storagehealth` · **File:** `src/pages/admin/StorageHealth.jsx`
**Last touched by:** Phase 6c, 2026-10-30 (evidence retention panel) · **Requires:** `supabase functions deploy r2-storage`; migration `20261029215500_backup_and_restore.sql` for the Supabase Storage panel; migration `20261030112300_evidence_retention_cleanup.sql` for the evidence panel

The page now covers **two** storage systems. Supabase Storage comes first
because it is the one actually in use; R2 is still unused until Phase 6's
evidence uploads. The page title is **Storage Health**, no longer "(R2)".

### Capacity panel

- [ ] Opens already on **Free** — 1 GiB file storage, 500 MiB database — with no
      setup. Both meters render with a percentage. **Nothing is typed.**
- [ ] **Change plan** lists Free, Pro, Team and Custom, each showing its limits,
      with the current one marked.
- [ ] Choosing a different tier applies its limits immediately: the figures and
      both bars change, with no separate Save step.
- [ ] Choosing **Custom** (no limits recorded) shows the amber "no limits
      recorded" line and the meters fall back to usage without a bar — it must
      not silently keep the previous tier's numbers.
- [ ] Re-applying the migration does **not** reset a tier changed here.
      (The seed uses `COALESCE`.)
- [ ] Calling `set_hosting_plan` with an unknown tier is refused.
- [ ] The database figure exceeds the sum of the backed-up tables, because it
      includes indexes and the sign-in accounts. That is expected, not a bug.
- [ ] Set a limit just below current usage: the bar turns red at 90% and the line
      advises freeing space.
- [ ] Set a limit so usage lands between 75% and 90%: amber, with the milder note.
- [ ] **Security:** a non-admin calling `aspire_capacity_report` or
      `set_hosting_plan` is refused.

### Supabase Storage panel

- [ ] Reports the `avatars` bucket with a file count and a total size.
- [ ] Totals change after someone uploads or replaces a profile photo and the
      page is re-checked.
- [ ] With no files stored at all, says so plainly rather than showing zeroes
      with no explanation.
- [ ] With no orphans, shows the reassuring line, not an empty warning box.
- [ ] **Orphan detection:** delete a user who has a profile photo, then re-check.
      That file is counted as belonging to an account that no longer exists, with
      its size.
- [ ] **Remove them** asks for confirmation naming the count and total size.
- [ ] After removal the count drops to zero and the removal appears in the
      Backup & Restore history as a **Cleanup** entry.
- [ ] **The files are really gone, not just the rows.** After removal, confirm in
      the Supabase Storage browser that the objects are absent. Deleting
      `storage.objects` rows alone would leave the images in the bucket forever,
      which is why removal goes through the Storage API.
- [ ] **A current user's photo is never removable.** With a live user's avatar
      present, it must not be counted as an orphan, and calling
      `storage.remove()` on its path as the admin must be refused by the
      `avatars_admin_delete_orphans` policy.
- [ ] **Security:** a registrar, dean, faculty member, or student calling
      `aspire_storage_usage` or `aspire_list_orphan_storage_objects` is refused.
- [ ] **Independence:** with `r2-storage` undeployed, the Supabase Storage panel
      still renders. One system being unavailable must not blank the other.

### Grade change evidence panel

Added 2026-10-30 (Phase 6c). Requires migration
`20261030112300_evidence_retention_cleanup.sql`. Evidence is **required** on
every dispute, so without this panel the bucket only ever grows.

- [ ] **Before** the migration is applied: the panel explains it cannot check
      yet, in plain words, rather than showing a red fault.
- [ ] With nothing expired, shows the reassuring line, not an empty warning box.
- [ ] **Nothing live is ever listed.** With an open request that has evidence,
      and with a resolved request whose term has **not** yet rolled over, the
      count stays at zero. This is the rule the whole panel rests on.
- [ ] A resolved request (`applied`, `rejected` or `cancelled`) whose term ended
      **and** which has a later ended term after it is counted.
- [ ] **Clear them** asks for confirmation naming the count.
- [ ] **The files are really gone, not just the rows.** After clearing, confirm
      in the Supabase Storage browser that the objects are absent from
      `grade-evidence`.
- [ ] **Order of operations.** The files are removed before the rows. Simulate a
      failure (revoke the retention policy, then clear): the rows must **stay**,
      the panel must report what could not be removed, and re-running it must
      pick the same files up again. There must be no state where a row is gone
      but the file remains.
- [ ] **Security:** a dean, faculty member or student calling
      `aspire_expired_evidence` or `aspire_purge_evidence` is refused. A
      registrar is allowed, as is an admin.
- [ ] **Ids are not trusted.** Calling `aspire_purge_evidence` with the id of a
      *live* request's evidence removes nothing — the function re-checks expiry
      itself rather than believing the caller.

### Cloudflare R2 panel

- [ ] **Before** R2 env vars are set: reports **Not configured**, and says so as
      an expected state rather than an error. (R2's first consumer arrives in
      Phase 6.)
- [ ] **Before** the function is deployed: reports that `r2-storage` is not
      deployed — distinguished from a storage fault, because they need different
      fixes.
- [ ] After setup per [`R2_SETUP.md`](../../05-operations/storage/R2_SETUP.md):
      reports **Reachable** with a HeadBucket latency.
- [ ] With a deliberately wrong bucket name or token: reports **Unreachable**
      with the underlying error text.
- [ ] Re-check re-runs the probe.
- [ ] **A non-admin calling `r2-storage` with `action: "health"` gets `403`** — including registrar.
- [ ] **Credential containment:** no R2 key appears in the network tab, the page
      source, or the built bundle. Grep `dist/` for the access key id after a
      build; it must not be there. This is the whole reason the check is an edge
      function.
- [ ] The page states that avatars stay on Supabase Storage and R2 is only for
      grade-change evidence.

---

## Backup & Restore

**ID:** `ADM-BACKUP` · **Route:** `/admin/backup` · **File:** `src/pages/admin/BackupAndRestore.jsx`
**Last touched by:** the 2026-10-29 backup/restore addition
**Requires:** migration `20261029215500_backup_and_restore.sql`

> **This is the most destructive page in ASPIRE.** Run every restore case against
> a database you are willing to lose, or immediately after taking a backup you
> have verified. The restore itself is one transaction — it completes or changes
> nothing — but a *successful* restore of the wrong file is not recoverable.

### Backup

- [ ] The page lists every table with a record count, and the counts match the
      database.
- [ ] The table list is discovered automatically: it includes tables added by the
      Phase 4 and Phase 5 migrations (`faculty_load_drafts`,
      `grade_consultation_windows`, `grade_consultation_notes`) without anyone
      adding them to a list in code.
- [ ] The table list **excludes** `system_settings`, `backup_runs`, and
      `provisioning_locks`, and the page explains why.
- [ ] The passphrase fields refuse to enable **Create Backup** until both match.
- [ ] The strength advice changes from weak to strong as the passphrase grows.
      It is advice only: a short passphrase must still be accepted.
- [ ] **Create Backup** downloads a file named `aspire-backup_YYYY-MM-DD_HHMM.json`.
- [ ] Opening that file shows `aspire_backup_file: 2`, `encrypted: true`, a
      `header` with `taken_at` and `schema_fingerprint`, and a `ciphertext`.
- [ ] **The records are not readable.** Search the file for a student's surname,
      for `@student.sage.edu`, and for `encrypted_password`. All must be absent:
      everything but the header is ciphertext.
- [ ] The clear-text `header` contains table names and row counts but no personal
      data — no names, no emails, no grades.
- [ ] A reminder typed into the optional field appears in the file as `hint`, in
      the clear. (Intended: it must be readable without the passphrase.)
- [ ] After a successful backup the passphrase fields are cleared.
- [ ] **Over plain http on a non-localhost address**, the page says encryption is
      unavailable and to use https, rather than failing with a script error.
      (Web Crypto is absent outside a secure context.)
- [ ] The backup appears in History as a **Backup** entry naming the admin.
- [ ] **Security:** a registrar, dean, faculty member, or student calling
      `aspire_export_backup` is refused.
- [ ] **Security:** a non-admin selecting from `backup_runs` gets nothing.

### Restore — the gates

- [ ] With maintenance mode **off**, the restore section explains that it must be
      turned on first and the file picker is disabled.
- [ ] With maintenance mode **on**, the picker is enabled.
- [ ] **Server-side gate, not just the UI:** with maintenance mode off, calling
      `aspire_restore_backup` directly is refused. A disabled button is not the
      protection; this is.
- [ ] Choosing a file that is not JSON is refused in plain English.
- [ ] Choosing valid JSON that is not an ASPIRE backup is refused.
- [ ] Choosing a file with a different `aspire_backup_file` version is refused.
- [ ] A chosen file shows its `taken_at`, record count, table count, account
      count, and photo count **before** the passphrase is asked for. This is the
      point of the clear-text header: an incompatible file must be identifiable
      without opening it.
- [ ] When the file's record count differs from the live count, the page says how
      many records the restore would discard.
- [ ] A saved reminder is shown beside the passphrase field.
- [ ] **A wrong passphrase** says so and says the file is unchanged. It must not
      be confused with an incompatible backup.
- [ ] **A tampered file** — edit one character of the `ciphertext` — is refused.
      AES-GCM authenticates, so this must fail rather than produce nonsense.
- [ ] A correct passphrase opens the file and immediately reports intact /
      restorable / differences.
- [ ] The restore button stays disabled until **RESTORE** is typed exactly.
- [ ] Clearing the file resets the passphrase, the check, and the typed phrase.
- [ ] Confirming shows a modal naming the record count and the backup's timestamp.

### Restore — the checks

- [ ] **Integrity:** hand-edit a backup so its header claims more records than it
      holds, re-encrypt is not needed — instead truncate the `tables` array of a
      freshly decrypted file via a rehearsal of the same shape, or simply confirm
      the case with a deliberately damaged file. The page must say the file is
      damaged and refuse, naming both counts.
- [ ] **Compatibility, blocking:** take a backup, then apply a migration that adds
      a `NOT NULL` column with no default, then try that backup. The page must
      name the table and column and refuse. Nothing may be deleted.
- [ ] **Compatibility, non-blocking:** a backup containing a table that has since
      been dropped is reported as losing those records, but is still restorable.
- [ ] **Rehearsal:** **Test this backup** reports how many records would be
      restored and that it was rolled back. Immediately afterwards, confirm the
      live record counts are **unchanged** — this is the case that proves the
      rollback works.
- [ ] A rehearsal appears in History as a **Test** entry.
- [ ] A rehearsal with maintenance mode off is refused server-side, not only by a
      disabled button.
- [ ] **Concurrency:** start a restore in one browser and a second in another
      while the first runs. The second must be refused with a plain message about
      another restore running, **not** queue up and overwrite the first.
- [ ] **Partial-restore guard:** this cannot be triggered by hand easily; confirm
      instead that the code path exists by reading the count check in
      `aspire_restore_backup`. Any table whose restored count differs from the
      file's must roll the whole restore back.

### Restore — the outcome

- [ ] A restore of a backup taken moments earlier leaves the database unchanged,
      and reports the record and table counts restored.
- [ ] Create a class, post a grade, then restore a backup taken **before** them:
      both are gone afterwards.
- [ ] Posting triggers do not re-fire: a restore of posted MR/TFR rows does **not**
      create duplicate consultation windows or send notifications.
- [ ] Immutability triggers do not block it: posted grades and
      `grading_formula_snapshot` rows restore without raising.
- [ ] Delete a user, then restore a backup from before the deletion. Their profile
      row is **not** restored, and the page reports how many were skipped for a
      missing sign-in account. (Deleting a login is an audited Admin action; a
      restore must not silently undo it.)
- [ ] **Signing in still works after a restore.** Sign in as a student whose
      profile the backup contained, using their existing password. A restore
      touches only the `public` schema, so `auth` records — and therefore
      passwords — are untouched. If this ever fails, the restore is reaching
      somewhere it must not.
- [ ] **An account created after the backup** keeps its login but loses its
      profile row. Confirm the person can authenticate and that the system then
      reports no profile, rather than silently granting a default role.
- [ ] **Editing locks are cleared.** Hold a Faculty Loading lock on a college,
      then restore. The lock is gone afterwards and the college is editable —
      a restore ends every editing session by definition.
- [ ] **Who performed past backups survives.** The History entries keep their
      actor names after a restore, for everyone the backup still contains.
- [ ] The restore appears in History as a **Restore** entry, with the backup's
      original timestamp, and that entry **survives** a later restore.
- [ ] Maintenance mode is still **on** after the restore — the admin turns it off
      deliberately, having checked the result.
- [ ] **Security:** a non-admin calling `aspire_restore_backup` is refused even
      with maintenance mode on.

### Restore — failure behaviour

- [ ] Hand-edit a backup file to remove a required value, then restore: it fails,
      says the backup does not fit the current database, and **nothing changes**.
      Re-check the record counts to confirm the rollback.
- [ ] No error message anywhere on this page names a table, column, constraint,
      or function.

### Backup freshness and schema drift

This is what replaces "remember to take a backup after every migration".

- [ ] With no backup ever taken, the page shows **There is no backup yet**.
- [ ] After a backup, that warning is gone.
- [ ] **The drift case:** take a backup, apply any migration that changes a table
      or column, reload the page. The banner must read *Your most recent backup
      can no longer be restored*, naming when it was taken.
- [ ] After taking a fresh backup, the banner clears.
- [ ] A backup older than 7 days whose structure still matches shows the milder
      age note, not the red drift warning. The two must not be confused: one
      means "incomplete", the other means "unusable".
- [ ] **Automatic table discovery:** after a migration that adds a table, that
      table appears in the backup's table list with no code change. Confirm with
      the Phase 4 and Phase 5 tables (`faculty_load_drafts`,
      `grade_consultation_windows`, `grade_consultation_notes`).
- [ ] **Security:** a non-admin calling `aspire_backup_status` is refused.
