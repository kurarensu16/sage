# OTP password reset: email delivery and template

- **Date:** 2026-10-14 14:43 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** None (Supabase dashboard configuration)

## Files changed
- `docs/05-operations/setup/SUPABASE_SMTP_AND_OTP_EMAIL_2026-10-14.md` (new)
- `src/pages/public/ForgotPassword.jsx` (code change recorded in `2026-10-14_1443-01_security-hardening-rls-and-grade-override.md`)
- `src/pages/public/ResetPassword.jsx` (same)

## What changed and why

Password reset was a Supabase recovery **link**. It is now a **6-digit one-time code** emailed to the account address, entered on a dedicated screen.

Flow: `resetPasswordForEmail` sends the code → the student enters it → `verifyOtp({ type: 'recovery' })` establishes a recovery session → the existing Create New Password screen sets the password. `ResetPassword.jsx` needed no logic change, because `verifyOtp` produces the same kind of session the link used to.

Two supporting decisions:

- **The account lookup before sending was removed.** It read `public.users` while logged out, which RLS now forbids, and confirming whether an email was registered let anyone enumerate accounts from the form. An unregistered address now gets the same confirmation screen and no email.
- **The request is not written to `activity_logs`.** That call ran unauthenticated and the ledger only accepts inserts from a signed-in user. Supabase Auth records the recovery request itself, and the completed reset is still logged from `/resetpassword`.

**Email delivery** requires two Supabase dashboard settings, documented in full with the HTML template at
[`docs/05-operations/setup/SUPABASE_SMTP_AND_OTP_EMAIL_2026-10-14.md`](../../setup/SUPABASE_SMTP_AND_OTP_EMAIL_2026-10-14.md):

1. **Custom SMTP** — Gmail (`smtp.gmail.com`, port 465) using the same credentials as the `send-email` edge function. Supabase's built-in mailer only delivers to project team members and is rate-limited, so it cannot serve real accounts.
2. **Reset Password template** — must contain `{{ .Token }}`. The default template carries only `{{ .ConfirmationURL }}`, which sends a link and no code, and the OTP screen then has nothing valid to accept. `{{ .ConfirmationURL }}` is deliberately omitted from the new template: offering both tempts the recipient to click the link and skip the code screen.

The template is written for email clients — centred table layout, all styles inline, no stylesheet, no flexbox or grid, no web fonts — and uses the ASPIRE palette (`#1e3a8a`, `#09132b`, `#edf2f9`) so it needs no hosted image. It includes a hidden preheader so the inbox preview reads "Your ASPIRE verification code is …".

## Status

The application code is complete and deployed. **The two dashboard settings are not yet applied** at the time of this record: the project sits under another account's Supabase organization and editing templates requires the Owner or Administrator role, which was granted on 2026-10-14. Until both are set, the reset screen asks for a code that no email contains.

This is recorded plainly because a future reader debugging a failed reset should check the dashboard first rather than the code.

## How to verify
`docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md` §2, including §2.4 — an unregistered email must produce the same confirmation screen, with no indication that the address is unknown.
