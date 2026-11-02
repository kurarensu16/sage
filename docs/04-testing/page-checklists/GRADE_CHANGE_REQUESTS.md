# Grade Change Requests — cross-portal checklist

**Introduced by:** Phase 6, 2026-10-30
**Prerequisites:** these three migrations applied **in this order** —

```
20261030102815_coalesce_repeat_grade_change_emails.sql
20261030104405_grade_change_requests_chain.sql
20261030105114_milestone_corrections.sql
```

Order is not optional: 6b calls `aspire_request_participants()` and
`aspire_notify_request_step()`, which 6a creates.

> **Before running anything:** restart the dev server (`npm run dev`, port
> **5175**). You need four signed-in roles — student, faculty, dean, registrar —
> so use separate browser profiles rather than signing in and out.

The flow spans four portals, so it is checklisted once here rather than split
across four files. `REG-LATE` is the only section that is portal-specific
enough to also be referenced from `REGISTRAR_PORTAL.md`.

---

## Before anything else

**ID:** `GCR-SETUP` · **Last touched by:** Phase 6

- [ ] **The storage policies exist.** 6a wraps them because `storage.objects` is
      owned by `supabase_storage_admin` and the create may be refused. Confirm
      no `WARNING` appeared, or run:
      `SELECT policyname FROM pg_policies WHERE tablename='objects' AND policyname LIKE 'grade_evidence%';`
      Three rows expected. **If these are missing, no student can file a dispute
      at all** — evidence is required, so this is the one failure that stops
      Phase 6 dead.
- [ ] The `grade-evidence` bucket exists and is **private**.
- [ ] A finalized MR or TFR exists for a test student (Phase 5: post the
      milestone, then Finalize it from the Grade Consultation Log).

---

## Student — raising a dispute

**ID:** `GCR-STUDENT` · **Route:** `/student/graderequests/new`

### What can be disputed

- [ ] Only **finalized** milestones are listed. A posted-but-not-finalized MR
      must not appear — that is the consultation window's job, and the page says so.
- [ ] A semestral grade appears as soon as it is posted (SG has no window).
- [ ] A milestone with an open request shows as such and cannot be re-raised.
- [ ] **Window closed:** with a rolled-over term more than 30 school days old,
      nothing from that term is listed.

### The form

- [ ] All four reasons appear with their explanations.
- [ ] Submit stays disabled until a grade, a reason, 20+ characters of detail,
      **and at least one file** are present — and the button says which is missing.
- [ ] Attaching a 2nd and 3rd file works; a 4th is not offered.
- [ ] Removing a file clears its thumbnail and frees the slot.

### Evidence — the part most likely to misbehave

- [ ] **A large phone photo (4–8 MB) uploads without a size error.** It is
      shrunk in the browser first. If you see "larger than 5 MB", downscaling
      failed — that is a bug, not a user error.
- [ ] **An iPhone HEIC photo uploads and displays.** It is converted to JPEG.
      Test on an actual iPhone or Mac; this is the case the conversion exists for.
- [ ] A HEIC on **Windows/Chrome** is refused with the plain message about
      attaching it from the iPhone instead. (Expected: no browser there can decode it.)
- [ ] A portrait photo is **not sideways** after upload (EXIF rotation).
- [ ] A PDF attaches and opens; it is not rendered inline.
- [ ] A `.txt` or `.docx` is refused.
- [ ] **Security:** uploading to another student's path is refused by storage
      RLS. Try `supabase.storage.from('grade-evidence').upload('<other-uid>/x.jpg', f)`
      from the console.
- [ ] **Security:** calling `submit_grade_change_request` with an `evidence_keys`
      entry under another user's prefix is refused.
- [ ] **Security:** calling it with another student's `posted_grade_id` is refused.
- [ ] **Nothing half-filed.** Disconnect the network mid-submit: no request is
      created at all. Files upload before the request exists, so a failure
      leaves nothing behind.

### My Requests

**ID:** `GCR-MYREQ` · **Route:** `/student/graderequests`

- [ ] A submitted request appears under **Requests you sent** as *With your instructor*.
- [ ] Attachments render as thumbnails; clicking opens full size.
- [ ] "Add another file" appears while open, disappears at 3 files.
- [ ] Withdraw closes it, and the instructor's queue drops it.
- [ ] After withdrawing, the same grade can be disputed again.
- [ ] **Visibility rule:** a faculty-raised correction about this student is
      **invisible** while in progress, and appears under *Corrections raised by
      your instructor* only once approved, rejected or applied. This is the
      owner's decision of 2026-10-29 — verify both halves.

---

## Faculty — validating

**ID:** `GCR-FACULTY` · **Route:** `/faculty/graderequests`

- [ ] A new dispute appears under **To review** with a count, and an in-app
      notification arrived.
- [ ] Only disputes for classes this instructor teaches are visible.
- [ ] The student's reason and attachments are on screen together — attachments
      inline, not a new tab.
- [ ] **Pass to the Dean** moves it to *With the Dean*; the Dean and the student
      are both notified.
- [ ] **Not applicable** requires 10+ characters and the student reads it.
- [ ] Rejecting without a note is refused **server-side**, not only by the
      disabled button.
- [ ] **Security:** calling `faculty_review_grade_change_request` for another
      instructor's class is refused.

---

## Dean — deciding

**ID:** `GCR-DEAN` · **Route:** `/dean/graderequests`

- [ ] Forwarded requests appear under **Waiting on you**.
- [ ] Only this Dean's college is visible.
- [ ] A **Raised by student** / **Raised by instructor** chip distinguishes the
      two sources.
- [ ] Legacy faculty-raised SG corrections (status `pending`) also appear here —
      one page serves both chains.
- [ ] Approving and refusing both require 10+ characters.
- [ ] A semestral request shows the cascade warning; an MR/TFR one does not.
- [ ] **Inside the window:** approving moves it to *Approved*, and the
      instructor is notified to make the correction.
- [ ] **Outside the window:** approving moves it to **With the Registrar**, not
      Approved, and the Registrar is notified. This is the branch that is easy
      to get wrong — verify with a term whose rollover was over 30 school days ago.
- [ ] **Security:** another college's Dean cannot decide this request.
- [ ] The old `/dean/remarkoverriderequests` URL still resolves (the Dean
      dashboard links to it).

---

## Registrar — authorising a closed term

**ID:** `REG-LATE` · **Route:** `/registrar/lategradechanges`

- [ ] Only requests that reached the Registrar appear. Anything resolved inside
      the window must **not** show here.
- [ ] The full chain is visible: student's reason, instructor's note, Dean's
      approval, and the evidence.
- [ ] The violet banner states the term has closed and how many days ago the
      dispute was raised.
- [ ] **Authorise** moves it to *Approved* and notifies the instructor and student.
- [ ] **Do not authorise** closes it as rejected; the student reads the reason.
- [ ] Both require 10+ characters.
- [ ] **Security:** a dean or faculty member calling
      `registrar_review_grade_change_request` is refused.
- [ ] It sits beside Grade Override in the Records group — both are the
      Registrar's authority over settled records.

---

## Applying the correction

**ID:** `GCR-APPLY`

### Midterm / Tentative Final — the dedicated editor

**Route:** `/faculty/graderequests/:requestId/apply`

- [ ] **Make the correction** on an approved MR/TFR opens this editor, not the
      gradebook.
- [ ] **Only the feeding terms are shown** — Prelim and Midterm for an MR,
      Semi-Final and Final for a TFR. Seeing all four terms is a bug.
- [ ] No remark controls (a milestone has no remark of its own).
- [ ] The complaint, the Dean's reason and the evidence stay on screen.
- [ ] A score above its maximum is rejected.
- [ ] **Check the new rating** shows old → new.
- [ ] **The preview changes nothing.** After checking, confirm the student's
      score is still the original until Apply is pressed. The preview writes and
      rolls back; if a value persists, that rollback is broken.
- [ ] **The signature guard:** check, then edit a score. Apply is blocked until
      you check again.
- [ ] Apply writes the new rating, marks the request *Corrected*, and notifies
      the student and the Dean.
- [ ] **THE ISOLATION RULE.** Note TFR and SG before applying an MR correction.
      Afterwards, **both must be unchanged.** This is the single most important
      case on this page — if a midterm correction moves the tentative final or
      the semestral grade, stop and report it.
- [ ] **Security:** calling `apply_approved_milestone_correction` with a
      `semestral_grade` request is refused by name.
- [ ] **Security:** passing a score change for a Final-term activity on an
      **MR** request is refused — the approval does not cover that term.
- [ ] **Security:** applying a request that is not `approved` is refused.

### Semestral — the existing editor, unchanged

- [ ] **Make the correction** on an approved SG opens
      `/faculty/postedgradesview?id=…&request=…` and the correction editor
      **auto-opens**. If it does not, `correction_scope` is not
      `student_score_row` on the request.
- [ ] Its own preview, remark conflict check and signature guard all still work.
- [ ] Applying cascades MR → TFR → SG, as before.
- [ ] The gradebook's old **Edit Full Row & Apply** button is gone, replaced by
      a link to Grade Change Requests — one way in, with the justification attached.

---

## Notifications and email

**ID:** `GCR-NOTIFY`

- [ ] Every step notifies the right people in-app: submit → instructor;
      forward → Dean + student; decide → student (+ instructor); registrar →
      instructor + student; apply → student + Dean.
- [ ] **Chain notifications do not send email.** Expected: email fan-out is
      scoped to `grade_posted` / `grade_changed`. If you want email here, it is
      a deliberate change — say so.
- [ ] **Correction emails are coalesced.** With the window still open, correct
      one student's score three times in five minutes. Expect **three in-app**
      notifications and **one email** to the student, and one to the guardian.
- [ ] A correction in a **different subject** within those minutes still emails
      separately.
- [ ] A first posting always emails — it is never coalesced.

---

## The dispute window

**ID:** `GCR-WINDOW`

- [ ] While a term is active, there is no deadline — disputes are accepted.
- [ ] After rollover, the deadline is **30 school days**, not 30 calendar days.
      Confirm it lands roughly six weeks out, not four.
- [ ] A deadline never lands on a weekend.
- [ ] Past the deadline, new disputes are refused with a message pointing to the
      Registrar.
- [ ] **An open request is not killed by the deadline passing.** One filed on
      day 29 still proceeds — it routes to the Registrar at the Dean's approval
      rather than being closed.
- [ ] **Known limitation:** public holidays and semestral breaks count as school
      days, because this system has no academic calendar. Not a bug; note it if
      a tester queries the date.

## Evidence retention

**ID:** `GCR-RETENTION` · **Runs from:** Admin → Storage Health → *Grade change
evidence* · **Requires:** migration `20261030112300_evidence_retention_cleanup.sql`

Evidence is **required**, so every dispute adds one to three files permanently
unless they are cleared. The owner's rule: evidence goes at the rollover
**after** the term it belongs to, and only for requests that are resolved.

- [ ] An **open** request's evidence is never listed, whatever its age.
- [ ] A resolved request in the **current** term is not listed either — it takes
      a later term having ended before anything expires.
- [ ] Clearing removes the file from the bucket **and** the row, in that order.
- [ ] A reviewer opening an older, still-live request can still see its
      attachments. Clearing must never reach a request that is being worked on.
- [ ] The full case list is in `ADMIN_PORTAL.md` under `ADM-STORAGE`.
