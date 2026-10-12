# Correct student account CSV identities

- **Date:** 2026-10-11 16:45 (Philippine time)
- **AI tool:** Codex (GPT-5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migration:** None

## Files changed
- `C:\Users\JC Gabriel\Downloads\aspire_students_40_original_emails.csv`

## What changed and why
Replaced the 40 obsolete Auth-only UUIDs and `@student.sage.edu` addresses in the student account CSV with the canonical UUIDs and `@dyci.edu.ph` addresses from the current `public.users` export. Student numbers, names, and the existing password fields were preserved. This fixes the CSV so it identifies the active student accounts used by the documented 2026–2027 test-year seed.

## How to verify
Import the CSV and confirm it contains 40 rows, 40 unique UUIDs, 40 unique student numbers, and 40 `@dyci.edu.ph` addresses. Compare every UUID and email to `public.users` by `user_number`; there should be no mismatches and no `@student.sage.edu` addresses.
