# SMTP and reset-password template applied

- **Date:** 2026-10-14 15:08 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** New feature (approved outside the documented flow)
- **Migration:** None (Supabase dashboard configuration)

## Files changed
- None. This records a configuration change made in the Supabase dashboard.

## What changed and why

Follow-up to [`2026-10-14_1443-08_otp-password-reset-email-delivery.md`](2026-10-14_1443-08_otp-password-reset-email-delivery.md), which recorded the OTP reset code as complete while the two dashboard settings were still outstanding. Both are now applied.

**Custom SMTP** (Authentication → Emails → SMTP Settings), enabled 2026-10-14:

| Setting | Value |
| --- | --- |
| Sender email | `noreply.aspire.edu@gmail.com` |
| Sender name | `ASPIRE Academic Support System` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `noreply.aspire.edu@gmail.com` |
| Password | Gmail App Password (not recorded here) |
| Minimum interval per user | 60 seconds |

**Reset password template** replaced with the HTML in
[`../../setup/SUPABASE_SMTP_AND_OTP_EMAIL_2026-10-14.md`](../../setup/SUPABASE_SMTP_AND_OTP_EMAIL_2026-10-14.md) §4, carrying `{{ .Token }}` and deliberately no `{{ .ConfirmationURL }}`.

Only the **Reset password** template was changed. ASPIRE's other auth templates are unused: there is no public signup, no magic-link sign-in, and email changes are admin-only.

## Status

Configured but **not yet verified end to end** — no real reset has been run through it as of this record. The earlier record's "not yet applied" status line is superseded by this one.

## How to verify
`docs/04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md` §2.

Two settings will interfere with repeated testing and are worth checking first if sends appear to stop:
- **Minimum interval per user (60s)** — the same address cannot be emailed twice within a minute, so a quick **Resend code** silently fails. Lower it temporarily for testing.
- **Authentication → Rate Limits** — a separate hourly cap on auth emails, reachable within one QA session.

If nothing arrives, check **Authentication → Logs** before suspecting the application: SMTP failures surface there, not in the app.
