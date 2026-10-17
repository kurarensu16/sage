# Supabase SMTP + OTP Reset Email Setup

- **Date:** 2026-10-14
- **Status:** both settings **applied on 2026-10-14**, end-to-end send not yet verified. Values in use are recorded in [`../agents/feature-updates/2026-10-14_1508_smtp-and-reset-template-applied.md`](../agents/feature-updates/2026-10-14_1508_smtp-and-reset-template-applied.md).
- **Why:** the forgot-password flow now sends a **one-time numeric code** instead of a recovery link (`src/pages/public/ForgotPassword.jsx`). Two dashboard settings are required or the code never arrives, and the screen will keep rejecting whatever the student types.

> **Before testing repeatedly:** two rate limits will make sends appear broken.
> **Minimum interval per user** (SMTP Settings, 60s by default) blocks a second email to the same address within a minute, so **Resend code** fails silently — lower it while testing. **Authentication → Rate Limits** caps auth emails per hour and is reachable within one QA session. Check **Authentication → Logs** before suspecting the app.

---

## 1. Enable custom SMTP

Supabase's built-in mailer only delivers to project team members and is rate-limited to a few messages an hour, so it cannot be used for real accounts.

**Dashboard → Authentication → Emails → SMTP Settings → enable custom SMTP:**

| Field | Value |
| --- | --- |
| Sender email | the Gmail address already used by the `send-email` function (`SMTP_FROM`) |
| Sender name | `ASPIRE` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the same Gmail address |
| Password | the Gmail **App Password** (16 characters) |

Notes:

- The password is a Google **App Password**, not the account password. Generate one at Google Account → Security → 2-Step Verification → App passwords.
- Supabase hides edge-function secret values after they are saved, so if `SMTP_PASS` is not written down elsewhere, generate a fresh App Password and use that in both places.
- If port `465` is refused, use `587`.
- Gmail allows roughly 500 messages a day, which is ample for a thesis deployment.

## 2. Set the Reset Password template

**Dashboard → Authentication → Emails → Templates → Reset Password.**

The body **must** contain `{{ .Token }}`. While it only contains `{{ .ConfirmationURL }}`, the email carries a link and no code, and the OTP screen has nothing valid to accept.

Paste the HTML in section 4.

## 3. Optional: shorten the code's lifetime

**Dashboard → Authentication → Providers → Email → Email OTP Expiration.** The default is 3600 seconds (1 hour); 600 seconds (10 minutes) is a reasonable tightening for a password-reset code.

---

## 4. The email template

Written for email clients, which is why it looks unlike the app's own code: a centred table layout, every style inline, no external stylesheet, no flexbox or grid, and no web fonts. Outlook in particular ignores most modern CSS, so the layout leans on tables and the code block is a styled table cell rather than a `div`.

Colours are the ASPIRE palette from `src/index.css`: `#1e3a8a` (sage-600) for the brand bar, `#09132b` (sage-900) for the code, `#edf2f9` (sage-50) for the code panel.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reset your ASPIRE password</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f1f5f9;">
    <!-- Preheader: the grey preview line in the inbox list. Hidden in the body. -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      Your ASPIRE verification code is {{ .Token }}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:#f1f5f9; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:520px; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0;">

            <tr>
              <td style="background-color:#1e3a8a; padding:24px 32px;">
                <p style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:20px; font-weight:700; color:#ffffff; letter-spacing:1px;">
                  ASPIRE
                </p>
                <p style="margin:4px 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; color:#b7cbe3; letter-spacing:2px; text-transform:uppercase;">
                  Academic Support Platform
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:19px; font-weight:700; color:#0f172a;">
                  Reset your password
                </h1>
                <p style="margin:0 0 24px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:1.6; color:#475569;">
                  We received a request to reset the password for <strong style="color:#0f172a;">{{ .Email }}</strong>.
                  Enter the verification code below to continue.
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center"
                        style="background-color:#edf2f9; border:1px solid #b7cbe3; border-radius:12px; padding:24px 16px;">
                      <p style="margin:0 0 8px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; color:#315d9b; letter-spacing:1.5px; text-transform:uppercase;">
                        Verification Code
                      </p>
                      <p style="margin:0; font-family:'Courier New',Courier,monospace; font-size:34px; font-weight:700; color:#09132b; letter-spacing:10px;">
                        {{ .Token }}
                      </p>
                    </td>
                  </tr>
                </table>

                <p style="margin:24px 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.6; color:#64748b;">
                  This code expires shortly. For your security, never share it with anyone —
                  including someone claiming to be from the school.
                </p>
                <p style="margin:12px 0 0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.6; color:#64748b;">
                  If you did not request a password reset, you can ignore this email. Your password stays unchanged.
                </p>
              </td>
            </tr>

            <tr>
              <td style="background-color:#f8fafc; border-top:1px solid #e2e8f0; padding:20px 32px;">
                <p style="margin:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:11px; line-height:1.6; color:#94a3b8;">
                  This is an automated message from ASPIRE. Please do not reply.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

### Variables available

| Variable | Meaning |
| --- | --- |
| `{{ .Token }}` | the numeric code — **required by this flow** |
| `{{ .Email }}` | the recipient's address |
| `{{ .SiteURL }}` | the project's configured site URL |
| `{{ .ConfirmationURL }}` | the magic link — **not** used by the OTP screen |

Leaving `{{ .ConfirmationURL }}` out is deliberate. Offering both a link and a code invites people to click the link, which bypasses the code screen the app expects.

---

## 5. Verify

1. Sign out → **Forgot Password** → enter a real account email.
2. The email should arrive with the code shown large and monospaced.
3. Enter it on the code screen → it should move to Create New Password.
4. Repeat with an unregistered email: the app shows the **same** confirmation screen and sends nothing. That is intended, so nobody can use the form to discover which addresses are registered.

If no email arrives, it is almost always section 1 or 2 rather than the app. Check **Authentication → Logs** in the dashboard for SMTP errors.
