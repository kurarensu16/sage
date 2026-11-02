# Phase 6 — Grade Change Requests

- **Date:** 2026-10-30 11:00 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migrations (apply in this order, none applied yet):**
  1. `20261030102815_coalesce_repeat_grade_change_emails.sql`
  2. `20261030104405_grade_change_requests_chain.sql`
  3. `20261030105114_milestone_corrections.sql`

Order is not optional: 6b calls `aspire_request_participants()` and
`aspire_notify_request_step()`, which 6a creates.

## Files changed

**New**
- `src/lib/gradeChangeRules.js`, `src/lib/gradeChangeRequestService.js`
- `src/lib/imageDownscale.js`
- `src/components/grades/EvidenceGallery.jsx`
- `src/pages/student/SubmitGradeChangeRequest.jsx`, `MyGradeChangeRequests.jsx`
- `src/pages/faculty/GradeChangeRequests.jsx`, `ApplyMilestoneCorrection.jsx`
- `src/pages/dean/GradeChangeRequests.jsx`
- `src/pages/registrar/LateGradeChanges.jsx`
- `docs/04-testing/page-checklists/GRADE_CHANGE_REQUESTS.md`

**Changed**
- `src/App.jsx`, `src/components/layout/Sidebar.jsx`, `BottomNav.jsx`
- `src/pages/faculty/PostedGradesView.jsx` (entry point retired only)
- `src/pages/faculty/Dashboard.jsx`, `src/pages/admin/StorageHealth.jsx`,
  `src/pages/admin/BackupAndRestore.jsx` (`logActivity` signature)
- `scripts/verifyGradingMath.js`
- `docs/04-testing/page-checklists/README.md`, `REGISTRAR_PORTAL.md`

**Deleted**
- `src/pages/dean/RemarkOverrideRequests.jsx` (556 lines, superseded)

## The chain

```
pending_faculty_review  -> pending_dean_review      (instructor forwards)
                        -> rejected                 (not applicable)
pending_dean_review     -> approved                 (Dean approves, in window)
                        -> pending_registrar_review (Dean approves, window closed)
pending_registrar_review-> approved / rejected
approved                -> applied                  (instructor corrects)
```

## Decisions recorded during the build

| Decision | Date | Outcome |
|---|---|---|
| Student visibility | 10-29 | Own requests at any stage; faculty-raised ones only once resolved |
| Dispute window | 10-30 | **30 school days** (weekdays) from `academic_terms.ended_at` |
| Late requests | 10-30 | Fourth step: Registrar authorises reopening a closed term |
| Evidence | 10-30 | **Required**, 1–3 files, cleared at the *next* rollover when resolved |
| Apply MR/TFR | 10-30 | Dedicated editor; semestral keeps the existing one |
| Old Dean page | 10-30 | Retired; its URL redirects |
| Notifications | 10-29 | Everyone, every step — **in-app only**, see below |

## Deviations from the plan, and why

**A separate submission RPC.** The plan's decision #1 was to extend
`submit_sg_correction_request` with a grade period. That function takes a
proposed remark, a proposed effective grade and proposed score changes — a
student must never be able to supply any of those. A separate function makes
that refusal the *signature* rather than a branch someone can later forget to
guard. Extending it would also have created an overload rather than a
replacement, the same "function is not unique" failure this project hit with
`aspire_transmute_grade`.

**No `verify:grading` isolation fixture.** The plan asked for one proving an
MR-only correction leaves TFR and SG untouched. That property lives entirely in
SQL — `aspire_milestone_terms()` and a single-period `WHERE` clause — and
`verifyGradingMath.js` has no database. A JavaScript test asserting it would
prove nothing. It is covered by the migration's own verification block
(which asserts both the term mapping and the scoped `UPDATE`) and by `GCR-APPLY`
in the checklist. The fixtures that *were* added cover the pure rules.

**The apply step reuses the existing editor for semestral grades.** The plan
implied building one consolidated editor. On reading `PostedGradesView.jsx` the
deep link already existed — it has read `?request=` and auto-opened the
correction editor since an earlier phase. So consolidation cost a link and a
deletion rather than extracting ~400 lines of preview/signature logic. Only the
duplicate *entry point* was retired; the editor is untouched.

## Problems found while building

**The existing correction editor is semestral-only.** `getCorrectionTargets()`
iterates every term and the apply path demands a remark and cascades.
Deep-linking an approved midterm request there would have shown all four terms,
asked an irrelevant question, and then cascaded — the exact opposite of the
isolation rule. Hence the dedicated MR/TFR editor.

**`logActivity` was being called with an object** in four places, including two
of mine from this session. Its signature is positional, and it only
`console.warn`s on failure, so those audit writes failed silently. Fixed.

**iPhone photos would have been rejected.** HEIC is the default iPhone format
and no browser decodes it; a student photographing their paper would have been
told to "attach a photo". Now converted to JPEG in the browser — possible
without a library because HEIC only comes from Apple devices, which can decode
it. The size guard had to be made conditional: HEIC compresses better than JPEG,
so the converted file is often *larger*, and a naive "never make it bigger"
check would have silently returned the unreadable original.

**A repeated correction sent repeated emails.** Each re-post increments the
revision, giving a new dedupe key and a new email — three fixes in one sitting
meant three emails to the student and three to the guardian. Now coalesced to
one per class and period per 15 minutes, in the fan-out trigger. In-app records
are never coalesced: a channel may be muted, the record may not.

**One of my own test assertions was wrong.** The fixture checking that a crafted
file name cannot escape the student's prefix asserted the absence of `..`. File
names legitimately contain dots, and the sanitiser strips separators, so
`../../etc/passwd` becomes `.._.._etc_passwd` — contained, but failing my test.
The assertion now checks the real invariant: exactly two path segments, the
first being the uploader's id.

## Known limitations

- **Chain notifications are in-app only.** Email fan-out is scoped to
  `grade_posted` / `grade_changed`. Widening it increases Gmail SMTP volume
  against a real daily cap, so it is a deliberate separate decision.
- **School days means weekdays.** There is no academic calendar, so a public
  holiday or semestral break counts as a school day. An unmaintained holiday
  table would have been worse than this.
- **Storage is load-bearing.** Evidence is required, so if the
  `grade-evidence` policies fail to install, no student can file a dispute at
  all. 6a reports this as a `WARNING` rather than failing, and `GCR-SETUP`
  checks it first.
- **`notifyGradePosted()` / `notifyGradeChanged()` remain dead code** in
  `notificationDispatcher.js` — no callers, and misleading to read, since those
  notifications are generated in SQL. Unrelated to Phase 6, so left alone.

## How to verify

`docs/04-testing/page-checklists/GRADE_CHANGE_REQUESTS.md`, in order:
`GCR-SETUP` first (the storage policies gate everything), then `GCR-STUDENT`,
`GCR-FACULTY`, `GCR-DEAN`, `REG-LATE`, `GCR-APPLY`, `GCR-NOTIFY`, `GCR-WINDOW`.

The two cases that matter most:

- **`GCR-APPLY` isolation.** Note TFR and SG before applying a midterm
  correction; both must be unchanged afterwards.
- **`GCR-SETUP` storage policies.** If they are missing, nothing else in Phase 6
  can be tested.

`npm run lint` 0 errors / 48 warnings · `npm run build` clean ·
`npm run verify:grading` passes, now including the grade change request rules.
