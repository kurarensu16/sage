# Faculty portal — page checklists

**First page checklisted:** Phase 5 (Grade Lifecycle and Consultation Log), 2026-10-29

Only the pages the post-defense phases created or changed are listed here. The
Faculty portal's pre-existing pages (Dashboard, Class Records, Evaluated
Students, Enrollment Requests) are covered by the main runbook,
[`../SYSTEM_TEST_CHECKLIST_2026-10-10.md`](../SYSTEM_TEST_CHECKLIST_2026-10-10.md).

> **Before running anything:** restart the dev server (`npm run dev`, port
> **5175**).
> **Prerequisite:** migration `20261029104037_grade_consultation_windows.sql`
> applied.

---

## Grade Consultation Log

**ID:** `FAC-CONSULT` · **Route:** `/faculty/consultations` · **File:** `src/pages/faculty/GradeConsultationLog.jsx`
**Last touched by:** Phase 5 · **Replaces:** the retired `ConsultationRequests.jsx` inbox

This page is a **record**, not an inbox. Students cannot request anything here;
the faculty records who actually reached out about a posted progress grade. The
window opens by itself when Midterm Rating or Tentative Final Rating is posted,
and closes when the faculty clicks Finalize.

### Window opening

- [ ] Posting a **Midterm Rating** makes that class appear here with an open
      window, without anyone opening a window by hand.
- [ ] Posting a **Tentative Final Rating** adds a second, separate window for the
      same class.
- [ ] Posting a **Semestral Grade** adds **nothing** here. SG has no window by
      design — it is the summary of MR and TFR and locks on posting.
- [ ] Re-posting the same milestone does not create a duplicate window.
- [ ] Only the signed-in faculty member's own active classes appear.

### Logging a consultation

- [ ] The student picker lists the class roster, not all students.
- [ ] A note saves and appears immediately, newest first, with the student's name
      and ID number.
- [ ] Several notes can be recorded for the same student.
- [ ] An empty note is refused.
- [ ] **Zero notes is a valid outcome.** A window with no notes can still be
      finalized, and the log shows it as finalized with no consultations. This is
      the point of the record: it is evidence either way.

### Correcting scores while the window is open

- [ ] With the MR window **open**, changing a Prelim or Midterm score succeeds and
      the MR updates through the normal flow.
- [ ] With the TFR window **open**, changing a Semi-Final or Final score succeeds.
- [ ] Changing a score behind SG is refused whether or not any window is open —
      SG is stricter and always frozen once posted.

### Finalizing

- [ ] Finalize asks for confirmation and names the milestone and class.
- [ ] After finalizing, the window shows as finalized with the count of notes
      recorded.
- [ ] After finalizing MR, changing a Prelim or Midterm score is **refused**, in
      plain English, naming no table or function.
- [ ] Finalizing MR does **not** freeze the TFR window.
- [ ] A finalized window cannot be finalized again, and cannot be re-opened from
      this page.
- [ ] A new note cannot be added to a finalized window.
- [ ] Finalizing writes an audit log entry naming the faculty member, the
      milestone, the class, and the number of consultations.
- [ ] **Security:** a faculty member calling `finalize_grade_milestone` for a
      class they do not teach is refused.
- [ ] **Security:** a faculty member calling `log_grade_consultation` with a
      student who is not on that roster is refused.

### Retired predecessor

- [ ] `/faculty/consultations` no longer renders the old request inbox. There is
      no approve/decline/schedule control anywhere on the page.
- [ ] The sidebar label reads **Grade Consultation Log**, not "Consultations".
- [ ] **Known gap, not a failure:** the Faculty **Dashboard** still shows a
      consultation-resolution panel reading the old `student_consultation_requests`
      table. Students can no longer create those requests, so the panel shows only
      historical rows. Flagged for a decision rather than removed, so old records
      stay visible. Note it here if it confuses a tester.
