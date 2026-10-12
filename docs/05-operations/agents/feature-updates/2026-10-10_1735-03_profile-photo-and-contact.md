# Profile photo and contact number

- **Date:** 2026-10-10 17:35 (Philippine time) · back-filled: the 11 records numbered 1735-01 to 1735-11 were written together at 17:35 for work done earlier that day, in the order shown
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (final update before the freeze)
- **Migration:** `20261010130000_profile_contact_and_photo.sql` (applied 2026-10-10)

## Files changed
- `supabase/migrations/20261010130000_profile_contact_and_photo.sql`
- `src/lib/profileService.js`
- `src/components/settings/ProfilePhotoAndContact.jsx`
- `src/components/layout/UserAvatar.jsx`
- `src/components/layout/Topbar.jsx`
- `src/pages/shared/Settings.jsx`

## What changed and why
Users can change their own profile photo and contact number; name, email, ID, and department stay admin-only.

## How to verify
PR in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`.
