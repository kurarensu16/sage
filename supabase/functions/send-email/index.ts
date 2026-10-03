// Drains the email delivery queue (notification_deliveries, channel='email') and
// sends via SMTP. Invoked every minute by the 'drain-email-queue' pg_cron job
// (see supabase/migrations/20261002090000_email_notification_delivery.sql).
//
// Scope (2026-10-02): grade_posted and grade_changed only.
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

function renderStudentTemplate(notificationType: string, payload: Record<string, unknown>) {
  const subjectCode = String(payload?.subject_code ?? '').trim()
  const subjectName = String(payload?.subject_name ?? 'your class').trim()
  const term = String(payload?.term ?? '').trim()
  const portalUrl = Deno.env.get('PORTAL_URL') || 'https://aspire.dyci.edu.ph'
  const label = subjectCode ? `${subjectName} (${subjectCode})` : subjectName
  const termLabel = term ? `, ${term} term` : ''

  const isChange = notificationType === 'grade_changed'
  const headline = isChange ? 'A grade has been updated' : 'A new grade has been posted';
  const subjectLine = isChange
    ? `[ASPIRE] Grade updated — ${subjectCode || subjectName}`
    : `[ASPIRE] New grade posted — ${subjectCode || subjectName}`

  return {
    subject: subjectLine,
    text: `${headline} for ${label}${termLabel}.\n\nSign in to ASPIRE to view it: ${portalUrl}\n\nThis is an automated message — please do not reply to this email.`,
    html: `<p>${headline} for <strong>${escapeHtml(label)}</strong>${escapeHtml(termLabel)}.</p>` +
          `<p><a href="${portalUrl}">Sign in to ASPIRE to view it</a></p>` +
          `<p style="color:#888;font-size:12px;">This is an automated message — please do not reply to this email.</p>`
  }
}

// Formal guardian-facing template. See the file header for why this carries real grade detail
// that renderStudentTemplate() deliberately never does.
function renderGuardianTemplate(notificationType: string, payload: Record<string, unknown>, job: EmailJob) {
  const subjectCode = String(payload?.subject_code ?? '').trim()
  const subjectName = String(payload?.subject_name ?? 'their class').trim()
  const term = String(payload?.term ?? 'this').trim()
  const studentName = String(payload?.student_name ?? 'the student').trim()
  const remark = String(payload?.remark ?? '').trim()
  const rating = payload?.rating
  const gwa = payload?.gwa
  const label = subjectCode ? `${subjectName} (${subjectCode})` : subjectName
  const isChange = notificationType === 'grade_changed'
  const action = isChange ? 'updated' : 'posted'
  const portalUrl = Deno.env.get('PORTAL_URL') || 'https://aspire.dyci.edu.ph'

  const salutation = job.guardian_relationship
    ? `Dear ${job.guardian_relationship} of ${studentName}`
    : `Dear Parent/Guardian of ${studentName}`

  const gradeLine = (typeof rating === 'number' && typeof gwa === 'number')
    ? `Term Rating: ${rating}% (General Weighted Average: ${gwa.toFixed(2)})`
    : null
  const standingLine = remark ? `Current Standing: ${remark}` : null

  const honorsLine = job.honors_pace
    ? `Based on ${studentName}'s performance across their other enrolled subjects this term, ` +
      `they are currently on pace to meet the General Weighted Average standard for the ` +
      `President's List (1.75 or better), provided this standing is maintained across all ` +
      `enrolled subjects for the remainder of the term.`
    : null

  const bodyLines = [
    `This is to formally inform you that a grade has been ${action} for ${studentName} in ${label}, ${term} term.`,
    standingLine,
    gradeLine,
    honorsLine,
    `Should you have any questions regarding ${studentName}'s academic standing, we encourage you to coordinate with the College through official channels.`
  ].filter(Boolean) as string[]

  return {
    subject: `[ASPIRE] Academic Update for ${studentName} — ${subjectCode || subjectName}`,
    text: `${salutation},\n\n${bodyLines.join('\n\n')}\n\nThis is an automated message from the ASPIRE Academic Information System (${portalUrl}). Please do not reply to this email.`,
    html: `<p>${escapeHtml(salutation)},</p>` +
          bodyLines.map(line => `<p>${escapeHtml(line)}</p>`).join('') +
          `<p style="color:#888;font-size:12px;">This is an automated message from the ASPIRE Academic Information System. Please do not reply to this email.</p>`
  }
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
  const SMTP_PORT = 587

  const smtpUser = Deno.env.get('SMTP_USER')
  const smtpPass = Deno.env.get('SMTP_PASS')
  const smtpFrom = Deno.env.get('SMTP_FROM') || smtpUser
  if (!smtpUser || !smtpPass) {
    return json({ error: 'Edge Function is missing SMTP_USER / SMTP_PASS secrets' }, 500)
  }

  const smtp = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: false, // STARTTLS negotiated on 587; set true only for implicit TLS on 465
      auth: { username: smtpUser, password: smtpPass }
    }
  })

  let sent = 0
  let failed = 0

  for (const job of jobs as EmailJob[]) {
    try {
      if (!job.target_address) throw new Error('Delivery has no target_address.')

      const { subject, text, html } = job.guardian_id
        ? renderGuardianTemplate(job.notification_type, job.payload || {}, job)
        : renderStudentTemplate(job.notification_type, job.payload || {})

      await smtp.send({
        from: smtpFrom!,
        to: job.target_address,
        subject,
        content: text,
        html
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
    }
  }

  try { await smtp.close() } catch { /* already closed or never opened */ }

  return json({ claimed: jobs.length, sent, failed })
})
