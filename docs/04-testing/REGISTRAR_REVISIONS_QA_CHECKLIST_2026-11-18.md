# QA Checklist: Registrar Revisions (2026-11-18)

Run this after migrations #4 (`20261118153739_sg_approval_by_the_dean.sql`), #5 (`20261118183828_a_class_does_not_conflict_with_itself.sql`), #6 (`20261118184937_class_changes_notify_students_and_faculty.sql`) #7 (`20261118192713_a_returned_sg_reopens_its_scores.sql`) and #8 (`20261118194508_an_approved_sg_reaches_every_student.sql`) succeed.

**How to use:** go top to bottom. Each step says which account to sign in as; sign out before the next step. Some accounts come up more than once because the SG approval passes back and forth.

All demo accounts use the password `DemoPassword123!`.

| Role      | Account                        |
| --------- | ------------------------------ |
| Registrar | `registrar@sage.edu.ph`      |
| Dean      | `c.valdes@sage.edu.ph`       |
| Faculty   | `a.rivera@sage.edu.ph`       |
| Student   | `s.jenkins@student.sage.edu` |

**Test class:** pick one class taught by `a.rivera` that has **MR and TFR posted but no SG yet**, with `s.jenkins` on its roster. Use the same class in every SG step. Write it here: ______________

---

## Step 1: Registrar (`registrar@sage.edu.ph`)

Faculty Loading is gone

- [X] The sidebar has no "Faculty Loading". The group reads **Enrollment** (Enrollment Management, Section Rosters).
- [X] Typing `/registrar/facultyloading` in the address bar lands on the Dashboard.

Student Records (People › Student Records)

- [X] The list of students opens.
- [X] Choosing a College narrows the Program list; Program and Year Level narrow the students.
- [X] Searching a name or ID finds the student.
- [X] Opening a student shows the header card (college, program, year, section).
- [X] **Enrolled Subjects** tab: shows this term's subjects; switching the term changes them.
- [X] **Grade History** tab: shows MR / TFR / SG by term; **Export to Excel** downloads a file.
- [X] **Back** returns to the list with the filters still set.
- [X] Clicking a student's name in View Users, Section Rosters, or Grade Override opens their Student Record.

Class Grade Sheets (Grade Records › Class Grade Sheets)

- [X] It opens on the current term.
- [X] Term → College → Program → Year Level → Section filters each narrow the list.
- [X] Opening a class shows the roster with MR, TFR, SG and remark.
- [X] **Excel** downloads the sheet; **Print** opens the print dialog.

## Step 2: Dean (`c.valdes@sage.edu.ph`)

- [X] Faculty Loading opens for the Dean's college.
- [X] You can draft a load, finalize it, and add an irregular student to a class.
- [X] Booking a slot that clashes with another class is refused.
- [X] Grade Submission Status and Grade Distribution still open.

Live-class changes (needs migrations #5 and #6). Use a live class (badge **Open**) of `a.rivera` that `s.jenkins` is enrolled in.

- [X] The time picker opens fully above the card (Period, Hour, Minutes all visible).
- [X] A live class has **no Remove (trash) button**; only drafts do. A draft's Remove asks to confirm, and the button says **Remove**.
- [X] **Edit** a live class's days (e.g., Wednesday only) and Save: a confirmation shows **From** (old schedule) → **To** (new), and says the students and the faculty will be notified.
- [X] **Change and notify** saves without the "already teaches another class" error; the message says students and faculty were notified.
- [X] Saving a live class **without changing anything** saves with no confirmation (and sends no notice).
- [X] Editing a **draft's** time saves with no confirmation.
- [X] **Reassign** a live class to another faculty member (tick the box): the dialog says students, the new and the previous faculty are notified. Afterwards transfer it back to `a.rivera` so the SG steps below still work.

## Step 3: Faculty (`a.rivera@sage.edu.ph`), submit the SG

- [X] Notifications: **Class Schedule Changed** (with old → new schedule) from Step 2, plus **Class Transferred** and, after the transfer back, **Class Assigned to You**.
- [X] On the test class, the SG button reads **Submit SG to Dean**.
- [X] The confirmation says students see the SG only after the Dean approves. Submit it.
- [X] The button now reads **With the Dean**, and the badge says "Awaiting Dean approval".
- [X] Posting an MR or TFR on another class still works as before (optional).

## Step 4: Student (`s.jenkins@student.sage.edu`), SG is hidden

- [X] Notifications: **Class Schedule Changed** (old → new schedule) and **Class Instructor Changed** from Step 2, each with a calendar icon.
- [X] Notification Settings has a **Class schedule changes** switch.
- [X] Grade Report shows the test class's SG as **Pending · Awaiting Dean** (no number).
- [X] No "grade posted" email or notification for that SG.
- [X] Older classes whose SG was posted before this update still show their SG.

## Step 5: Registrar (`registrar@sage.edu.ph`), SG is pending

- [X] Class Grade Sheets: the test class shows **Awaiting Dean**.
- [X] Grade Override: trying to override that student's SG is refused ("still waiting for the Dean's approval").

## Step 6: Dean (`c.valdes@sage.edu.ph`), return the SG

- [X] Notification "SG Submitted for Approval" is there, and it opens the review page.
- [X] Grades › **SG Approvals** lists the test class under "Awaiting your approval".
- [X] The review page shows the grade sheet and the Passed / Failed / INC counts.
- [X] **Return to instructor** with a reason under 10 characters is refused.
- [X] Return with a proper reason works; the class moves to "Decided in the last 30 days" as **Returned**.

## Step 7: Faculty (`a.rivera@sage.edu.ph`), resubmit

- [X] Notification "SG Returned by the Dean" shows the reason.
- [X] The SG step shows the Dean's reason, and the button reads **Resubmit SG**.
- [X] Change one remark (e.g., INC, with a reason) and resubmit.
- [X] The button reads **With the Dean** again.
- [X] *(Needs migration #7.)* Have the Dean return it once more. In the **Scorebook**, the cells can be edited again, including a Prelim or Midterm score. Change one Prelim score of the student you'll log in as in Step 9, note their MR before and after, and resubmit.
- [X] After resubmitting, the Scorebook cells lock again.

## Step 8: Dean (`c.valdes@sage.edu.ph`), approve

- [X] SG Approvals lists the test class again, marked **Resubmitted**.
- [X] Open it, click **Approve SG**, and confirm; a success message appears.
- [X] The approved SG can no longer be returned.

## Step 9: Student (`s.jenkins@student.sage.edu`), SG is visible

- [X] Grade Report now shows the test class's SG number and remark.
- [X] One "Official Grade Posted" notification (and email) arrived for it, and the guardian's email arrived too. *(Failed in the first run: after a return and resubmit, nothing reached the student or guardian. Fixed by migration #8, whose backfill sends the missing notice for the class already approved. Re-checked after #8: 14 of 14 students notified and emailed, 5 guardian emails, all sent.)*
- [X] *(If you changed a score in Step 7.)* The MR shows the new value, and a "Progress Grade Updated" notification says it was corrected together with the SG.

## Step 10: Faculty (`a.rivera@sage.edu.ph`), approved

- [X] Notification "SG Approved" is there.
- [X] The SG button reads **SG Approved**.

## Step 11: Registrar (`registrar@sage.edu.ph`), SG received

- [X] Notification "Approved SG Received" opens the class's grade sheet.
- [X] Class Grade Sheets shows the test class as **SG approved**, with the date.
- [X] The student's Grade History shows the SG and counts it in the term GWA.
- [X] Grade Override now works on this SG (you may cancel before saving).

## Step 12: Phone-width check (any account, optional)

- [X] Narrow the browser to phone width. The Registrar's Enrolment and Grades tabs highlight on the new pages, and the Dean's Grades tab highlights on SG Approvals.

---

## Result

| Step | Account   | Pass / Fail | Notes |
| ---- | --------- | ----------- | ----- |
| 1    | Registrar | Pass |       |
| 2    | Dean | Pass |       |
| 3    | Faculty | Pass |       |
| 4    | Student | Pass |       |
| 5    | Registrar | Pass |       |
| 6    | Dean | Pass |       |
| 7    | Faculty | Pass |       |
| 8    | Dean | Pass |       |
| 9    | Student   | Pass  | First run failed (no student or guardian notice after a return and resubmit). Fixed by #8; re-checked: 14/14 students, 5 guardians, all sent. |
| 10    | Faculty | Pass |       |
| 11    | Registrar | Pass |       |
| 12    | Any | Pass |       |

Tested by: ghostbyte1014  Date: 2026-11-18
