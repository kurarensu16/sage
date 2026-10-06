// Drains the email delivery queue (notification_deliveries, channel='email') and
// sends via SMTP. Invoked every minute by the 'drain-email-queue' pg_cron job
// (see supabase/migrations/20261002090000_email_notification_delivery.sql).
//
// Scope: grade_posted, grade_changed, and authorized Dean referral events.
//
// Privacy rule for the STUDENT's own copy (docs/update_plan/NOTIFICATION_DELIVERY_ARCHITECTURE.md
// §6): the email body NEVER contains the grade value, remark, or pass/fail status — only an
// event notice and a link into the authenticated portal. Mail sits in a mailbox indefinitely and
// may be synced to shared/family devices; a grade or "Failed" status does not belong there. Do
// not add payload.remark (or any other grade-bearing field) to renderStudentTemplate() below.
//
// Guardian copy (product decision, 2026-10-03, job.guardian_id IS NOT NULL): deliberately the
// OPPOSITE privacy posture, by explicit request — there is no guardian portal, so this email is
// the only place a guardian will ever see this. It includes the actual term grade/GWA and a
// conservative honors-pace insight. Never reuse renderGuardianTemplate's content for the
// student's own copy, and never add this detail to renderStudentTemplate.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const BATCH_SIZE = 25

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-worker-secret, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type EmailJob = {
  delivery_id: string
  notification_id: string
  target_address: string
  notification_type: string
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
  guardian_id: string | null
  guardian_name: string | null
  guardian_relationship: string | null
  honors_pace: boolean | null
}

function renderDeanReferralTemplate(payload: Record<string, unknown>) {
  const evaluationId = String(payload.evaluation_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(evaluationId)) throw new Error('Referral delivery has no valid evaluation identity.')
  const portalUrl = `https://aspire-dyci.vercel.app/dean/atriskstudents?tab=discussion_queue&evaluation_id=${encodeURIComponent(evaluationId)}`
  const message = 'A faculty evaluation requires your review. Sign in to the authorized Dean discussion queue for details.'
  return {
    subject: '[ASPIRE] Faculty evaluation requires Dean review',
    text: `${message}\n\n${portalUrl}`,
    html: getBaseHtmlTemplate(`<p>${message}</p><p><a href="${escapeHtml(portalUrl)}">Open Dean discussion queue</a></p>`)
  }
}

function renderStudentTemplate(notificationType: string, payload: Record<string, unknown>) {
  const subjectCode = String(payload?.subject_code ?? '').trim()
  const subjectName = String(payload?.subject_name ?? 'your class').trim()
  const term = String(payload?.term ?? '').trim()
  const rawStudentName = String(payload?.student_name ?? 'Student').trim()
  
  let firstName = rawStudentName
  if (rawStudentName.includes(',')) {
    const parts = rawStudentName.split(',')
    firstName = parts[1].trim().split(' ')[0]
  }

  const label = subjectCode ? `${subjectName} (${subjectCode})` : subjectName
  
  const cleanTerm = term.replace(/\b(Grade|term|Rating)\b/ig, '').trim()
  const termLabel = cleanTerm ? `, ${cleanTerm} Rating` : ''

  const isChange = notificationType === 'grade_changed'
  const action = isChange ? 'updated' : 'posted'
  const headline = isChange ? 'A grade has been updated' : 'A new grade has been posted';
  const subjectLine = isChange
    ? `[ASPIRE] Grade updated — ${subjectCode || subjectName}`
    : `[ASPIRE] New grade posted — ${subjectCode || subjectName}`

  const portalUrl = 'https://aspire-dyci.vercel.app/'

  const content = `<p style="margin-top: 0; font-weight: 500; color: #09132b;">Dear ${escapeHtml(firstName)},</p>` +
    `<p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">This is to formally inform you that a grade has been <strong>${action}</strong> in <span style="color: #1e3a8a; font-weight: 600;">${escapeHtml(label)}</span>${escapeHtml(termLabel)}.</p>` +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
      <tr>
        <td align="center">
          <a href="${portalUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #1e3a8a; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 8px;">View Official Grade in Portal</a>
        </td>
      </tr>
    </table>`

  return {
    subject: subjectLine,
    text: `Dear ${firstName},\n\n${headline} for ${label}${termLabel}.\n\nView your official grade securely by logging into the portal: ${portalUrl}\n\nThis is an automated message from the ASPIRE Academic Support System. Please do not reply to this email.`,
    html: getBaseHtmlTemplate(content)
  }
}

function renderGuardianTemplate(notificationType: string, payload: Record<string, unknown>, job: EmailJob) {
  const subjectCode = String(payload?.subject_code ?? '').trim()
  const subjectName = String(payload?.subject_name ?? 'their class').trim()
  const term = String(payload?.term ?? 'this').trim()
  const rawStudentName = String(payload?.student_name ?? 'the student').trim()
  
  let firstName = rawStudentName
  let formattedName = rawStudentName
  if (rawStudentName.includes(',')) {
    const parts = rawStudentName.split(',')
    const firstNames = parts[1].trim()
    firstName = firstNames.split(' ')[0]
    formattedName = `${firstNames} ${parts[0].trim()}`
  }

  const remark = String(payload?.remark ?? '').trim()
  const rawRating = payload?.rating
  const rawGwa = payload?.gwa
  const rating = (rawRating !== null && rawRating !== undefined && rawRating !== '') ? Number(rawRating) : NaN
  const gwa = (rawGwa !== null && rawGwa !== undefined && rawGwa !== '') ? Number(rawGwa) : NaN
  const label = subjectCode ? `${subjectName} (${subjectCode})` : subjectName
  const isChange = notificationType === 'grade_changed'
  const action = isChange ? 'updated' : 'posted'

  const cleanTerm = term.replace(/\b(Grade|term|Rating)\b/ig, '').trim()
  const termDisplay = cleanTerm ? `${cleanTerm} Rating` : 'this Rating'

  const salutation = job.guardian_relationship
    ? `Dear ${job.guardian_relationship} of ${formattedName},`
    : `Dear Parent/Guardian of ${formattedName},`

  const remarkColor = (remark || '').toLowerCase().includes('fail') ? '#ef4444' : '#10b981'

  const hasRatingAndGwa = !isNaN(rating) && !isNaN(gwa)

  let gradeCard = ''
  if (remark || hasRatingAndGwa) {
    gradeCard = `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
        <tr>
          <td style="padding: 24px; text-align: center;">`
    
    if (remark) {
      gradeCard += `<p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Current Standing</p>
            <p style="margin: 0 0 24px 0; font-size: 28px; color: ${remarkColor}; font-family: 'Sora', sans-serif; font-weight: 700;">${remark}</p>`
    }
            
    if (hasRatingAndGwa) {
      gradeCard += `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
              <tr>
                <td width="50%" align="center">
                  <p style="margin: 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Term Rating</p>
                  <p style="margin: 6px 0 0 0; font-size: 20px; color: #09132b; font-weight: 600;">${rating}%</p>
                </td>
                <td width="50%" align="center" style="border-left: 1px solid #e2e8f0;">
                  <p style="margin: 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">GWA</p>
                  <p style="margin: 6px 0 0 0; font-size: 20px; color: #09132b; font-weight: 600;">${gwa.toFixed(2)}</p>
                </td>
              </tr>
            </table>`
    }
    
    gradeCard += `</td>
        </tr>
      </table>`
  }

  const honorsLine = job.honors_pace
    ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px; background: linear-gradient(to right, #ecfdf5, #f0fdf4); border-left: 4px solid #10b981; border-radius: 0 8px 8px 0;">
        <tr>
          <td style="padding: 20px;">
            <p style="margin: 0 0 6px 0; color: #065f46; font-family: 'Sora', sans-serif; font-weight: 600; font-size: 16px;">On Pace for Honors</p>
            <p style="margin: 0; color: #064e3b; font-size: 14px; line-height: 1.5;">Based on ${escapeHtml(firstName)}'s performance across their other enrolled subjects this term, they are currently on pace to meet the General Weighted Average standard for the <strong>President's List (1.75 or better)</strong>.</p>
          </td>
        </tr>
      </table>`
    : ''

  const content = `<p style="margin-top: 0; font-weight: 500; color: #09132b;">${escapeHtml(salutation)}</p>` +
    `<p>This is to formally inform you that a grade has been <strong>${action}</strong> for ${escapeHtml(firstName)} in <span style="color: #1e3a8a; font-weight: 600;">${escapeHtml(label)}</span>, ${escapeHtml(termDisplay)}.</p>` +
    gradeCard +
    honorsLine +
    `<p style="margin-bottom: 0;">Should you have any questions regarding ${escapeHtml(firstName)}'s academic standing, we encourage you to coordinate with the College through official channels.</p>`

  const plainTextLines = [
    `This is to formally inform you that a grade has been ${action} for ${firstName} in ${label}, ${termDisplay}.`,
    remark ? `Current Standing: ${remark}` : null,
    hasRatingAndGwa ? `Term Rating: ${rating}% (General Weighted Average: ${gwa.toFixed(2)})` : null,
    job.honors_pace ? `Based on ${firstName}'s performance across their other enrolled subjects this term, they are currently on pace to meet the General Weighted Average standard for the President's List (1.75 or better)...` : null,
    `Should you have any questions regarding ${firstName}'s academic standing, we encourage you to coordinate with the College through official channels.`
  ].filter(Boolean) as string[]

  return {
    subject: `[ASPIRE] Academic Update for ${formattedName} — ${subjectCode || subjectName}`,
    text: `${salutation}\n\n${plainTextLines.join('\n\n')}\n\nThis is an automated message from the ASPIRE Academic Support System. Please do not reply to this email.`,
    html: getBaseHtmlTemplate(content)
  }
}

function getBaseHtmlTemplate(content: string) {
  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;500;600&family=Sora:wght@400;600;700&display=swap');
</style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);">
          <!-- Header with Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #09132b 0%, #1e3a8a 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-family: 'Sora', sans-serif; font-size: 32px; font-weight: 700; letter-spacing: -0.03em;">ASPIRE</h1>
              <p style="margin: 12px 0 0 0; color: #8ca9d0; font-size: 11px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.5;">Academic Support System</p>
            </td>
          </tr>
          <!-- Content Body -->
          <tr>
            <td style="padding: 40px 30px; color: #334155; font-size: 16px; line-height: 1.6;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                This is an automated message from the <strong>ASPIRE Academic Support System</strong>.<br>
                Please do not reply to this email.
              </p>
              <p style="margin: 15px 0 0 0; font-size: 12px; color: #94a3b8;">
                &copy; 2026 ASPIRE. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return html.replace(/\n\s*\n/g, '\n').replace(/ +\n/g, '\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Only pg_cron (via pg_net) and manual admin-triggered calls may invoke this.
  const workerSecret = Deno.env.get('WORKER_SECRET')
  if (!workerSecret || req.headers.get('x-worker-secret') !== workerSecret) {
    return json({ error: 'forbidden' }, 403)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Edge Function is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }
  const db = createClient(supabaseUrl, serviceRoleKey)

  const { data: jobs, error: claimError } = await db.rpc('claim_email_deliveries', { batch_size: BATCH_SIZE })
  if (claimError) return json({ error: claimError.message }, 500)
  if (!jobs || jobs.length === 0) return json({ claimed: 0, sent: 0, failed: 0 })

  // Fixed for Gmail — never need to change per-deployment, so these are not secrets.
  const SMTP_HOST = 'smtp.gmail.com'
  const SMTP_PORT = 465

  const smtpUser = Deno.env.get('SMTP_USER')
  const smtpPass = Deno.env.get('SMTP_PASS')
  const smtpFrom = Deno.env.get('SMTP_FROM') || smtpUser
  if (!smtpUser || !smtpPass) {
    return json({ error: 'Edge Function is missing SMTP_USER / SMTP_PASS secrets' }, 500)
  }

  let sent = 0
  let failed = 0

  for (const job of jobs as EmailJob[]) {
    // Instantiate fresh connection per email to avoid denomailer state corruption.
    const smtp = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true, // Use implicit TLS on 465 to bypass denomailer 1.6.0 STARTTLS bug
        auth: { username: smtpUser, password: smtpPass }
      }
    })

    try {
      if (!job.target_address) throw new Error('Delivery has no target_address.')

      const { subject, text, html } = job.notification_type === 'dean_referral'
        ? renderDeanReferralTemplate(job.payload || {})
        : job.guardian_id
        ? renderGuardianTemplate(job.notification_type, job.payload || {}, job)
        : renderStudentTemplate(job.notification_type, job.payload || {})

      await smtp.send({
        from: smtpFrom!,
        to: job.target_address,
        subject,
        content: text,
        html: html
      })

      await db.rpc('complete_email_delivery', {
        p_delivery_id: job.delivery_id,
        p_success: true
      })
      sent++
    } catch (e) {
      await db.rpc('complete_email_delivery', {
        p_delivery_id: job.delivery_id,
        p_success: false,
        p_error_message: String(e instanceof Error ? e.message : e).slice(0, 500)
      })
      failed++
    } finally {
      try { await smtp.close() } catch { /* ignore close errors */ }
    }
  }

  return json({ claimed: jobs.length, sent, failed })
})
