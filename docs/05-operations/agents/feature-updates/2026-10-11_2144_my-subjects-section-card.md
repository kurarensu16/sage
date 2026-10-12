# My Subjects: "Assigned Section" card shows regular or irregular

- **Date:** 2026-10-11 21:44 (Philippine time)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `src/pages/student/MySubjects.jsx`

## What changed and why
The "Assigned Section" stat card at the top of My Subjects had two problems:
- For a student with no home section, it showed the section of whichever joined class loaded first.
- It always showed "Regular Academic Standing" in green. That was wrong for irregular students, and it mixed up enrollment type with academic standing (grades).

The card now shows enrollment type only, using the same per-class rule as the faculty "Irregular" badge (`getEnrollmentType`):

| Student | Value | Line below |
|---|---|---|
| Regular, all classes in the block section | block section (e.g., BSIT-1A) | Regular student |
| Regular with classes joined from other sections | block section | Regular · N class(es) from another section |
| No home section | Irregular | Classes joined by code (N) |

The block section is the student's home section. If the home section is not in the selected term (a past term), it is the section with most of the student's classes in that term. It is never a joined class's section. The subject list's section-name fallback uses the same block section. The loader now re-runs when the profile's section loads. Academic standing remains on the Grade Report and dashboard.

## How to verify
1. Joshua (BSIT-1A, no joined classes): the card reads "BSIT-1A", then "Regular student".
2. A BSIT-1A student with one approved class from BSIT-1B: "BSIT-1A", then "Regular · 1 class from another section".
3. A student with no home section and two joined classes: "Irregular", then "Classes joined by code (2)".
4. `npm run lint` (0 errors; no new warnings) and `npm run build` pass.
