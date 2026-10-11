# Consultation request: list and send to the student's own class

- **Date:** 2026-10-11 21:31 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `src/pages/student/Consultations.jsx`

## What changed and why
"Request Direct Faculty Consultation" loaded classes by **subject only**. Every section's class of the student's subjects was listed, so ITC113 and ITP113 each appeared twice. The dropdown value was the subject code, and on submit the page used the **first** class with that code. A request could therefore be saved to another section's class, and go to that section's instructor when it was a different person.

Now:
- Classes are matched to the student's enrollments by subject **and** section, including a class joined by code from another section.
- The dropdown value is the class itself (`class_record_id`), so the request always goes to the selected class and its instructor.
- The section is shown in an option's label only when the same subject still appears more than once.

## How to verify
1. As a student in BSIT-1A, open Consultations → New Consultation. Each subject appears once with its own instructor.
2. Send a request. The faculty of that class (not another section's) sees it in Consultation Requests.
3. A student with a class joined by code from another section sees that class listed with its own instructor.
