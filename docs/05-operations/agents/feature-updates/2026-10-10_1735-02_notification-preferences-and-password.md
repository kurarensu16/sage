# Notification preferences and password policy

- **Date:** 2026-10-10 17:35 (Philippine time) · back-filled: the 11 records numbered 1735-01 to 1735-11 were written together at 17:35 for work done earlier that day, in the order shown
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (final update before the freeze)
- **Migration:** None (preferences table already existed; grants are in `20261010120000`)

## Files changed
- `src/lib/notificationPreferences.js`
- `src/components/settings/NotificationPreferences.jsx`
- `src/lib/AuthContext.jsx`
- `src/lib/passwordPolicy.js`
- `src/components/auth/PasswordRequirements.jsx`
- `src/pages/public/ResetPassword.jsx`
- `src/pages/public/ForceChangePassword.jsx`
- `supabase/config.toml`
- `src/pages/shared/Settings.jsx`

## What changed and why
Persisted notification preferences (in-app, device alert, email); password policy of 8+ characters with upper, lower, number, and symbol; reset password with an optional "sign out of other devices".

## How to verify
NP, PW in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`.
