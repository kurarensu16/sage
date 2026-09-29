import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const BOUNDARY_STATEMENT = 'This guidance is advisory and does not alter your official institutional grade.'
const MODEL = Deno.env.get('OPENROUTER_MODEL') || 'poolside/laguna-s-2.1:free'
const MAX_BODY_BYTES = 48_000
const REQUEST_WINDOW_MS = 60_000
const REQUESTS_PER_WINDOW = 12

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
}

type AdvisorAction = { id?: string; title?: string; description?: string }
type AdvisorEvidence = { id?: string; label?: string; value?: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string }

type AdvisorResponse = {
  message: string
  actions: string[]
  consultation_recommended: boolean
  boundary_statement: typeof BOUNDARY_STATEMENT
}

const requestWindows = new Map<string, { count: number; startedAt: number }>()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

function text(value: unknown, maxLength = 1200) {
  return String(value || '').trim().slice(0, maxLength)
}

function enforceRateLimit(userId: string) {
  const now = Date.now()
  const current = requestWindows.get(userId)
  if (!current || now - current.startedAt >= REQUEST_WINDOW_MS) {
    requestWindows.set(userId, { count: 1, startedAt: now })
    return true
  }
  if (current.count >= REQUESTS_PER_WINDOW) return false
  current.count += 1
  return true
}

function sanitizeActions(actions: unknown): AdvisorAction[] {
  if (!Array.isArray(actions)) return []
  return actions.slice(0, 3).map(action => ({
    id: text(action?.id, 80),
    title: text(action?.title, 160),
    description: text(action?.description, 320)
  })).filter(action => action.title || action.description)
}

function sanitizeEvidence(evidence: unknown): AdvisorEvidence[] {
  if (!Array.isArray(evidence)) return []
  return evidence.slice(0, 12).map(item => ({
    id: text(item?.id, 80),
    label: text(item?.label, 160),
    value: text(item?.value, 240)
  })).filter(item =>
    item.label &&
    item.value &&
    !/\b(risk|classification|tier|faculty-only|restricted)\b/i.test(item.label)
  )
}

function sanitizeContext(input: any) {
  const advisor = input?.deterministicAdvisor || {}
  return {
    student: { firstName: text(input?.student?.firstName, 80) || 'Student' },
    scope: input?.scope === 'course' ? 'course' : 'overall',
    periodLabel: text(input?.periodLabel, 120),
    officialStanding: {
      gwa: typeof input?.officialStanding?.gwa === 'number' ? input.officialStanding.gwa : null,
      standing: text(input?.officialStanding?.standing, 160),
      trajectory: text(input?.officialStanding?.trajectory, 160),
      attendanceRate: Number.isFinite(input?.officialStanding?.attendanceRate) ? input.officialStanding.attendanceRate : null,
      absenceCount: Number.isFinite(input?.officialStanding?.absenceCount) ? input.officialStanding.absenceCount : null,
      fdaAdvisory: Boolean(input?.officialStanding?.fdaAdvisory)
    },
    subject: input?.subject ? {
      code: text(input.subject.code, 40),
      name: text(input.subject.name, 160),
      instructor: text(input.subject.instructor, 160),
      runningGwa: text(input.subject.runningGwa, 20),
      selectedPeriod: input.subject.selectedPeriod || null,
      sharedAcademicFeedback: text(input.subject.sharedAcademicFeedback, 1000),
      activities: Array.isArray(input.subject.activities)
        ? input.subject.activities.slice(0, 20).map((activity: any) => ({
            title: text(activity?.title, 160),
            topicTag: text(activity?.topicTag, 100),
            term: text(activity?.term, 40),
            score: Number.isFinite(activity?.score) ? activity.score : null,
            maxScore: Number.isFinite(activity?.maxScore) ? activity.maxScore : null,
            percentage: Number.isFinite(activity?.percentage) ? activity.percentage : null
          }))
        : []
    } : null,
    courses: Array.isArray(input?.courses)
      ? input.courses.slice(0, 20).map((course: any) => ({
          code: text(course?.code, 40),
          name: text(course?.name, 160),
          runningGwa: text(course?.runningGwa, 20),
          classStandingAverage: Number.isFinite(course?.classStandingAverage) ? course.classStandingAverage : null,
          examAverage: Number.isFinite(course?.examAverage) ? course.examAverage : null
        }))
      : [],
    evidence: sanitizeEvidence(input?.evidence),
    deterministicAdvisor: {
      state: text(advisor.state, 80),
      signalType: text(advisor.signalType, 80),
      severity: text(advisor.severity, 40),
      headline: text(advisor.headline, 200),
      summary: text(advisor.summary, 600),
      evidence: sanitizeEvidence(advisor.evidence),
      actions: sanitizeActions(advisor.actions),
      reviewTrigger: text(advisor.reviewTrigger, 120),
      consultationRecommended: Boolean(advisor.consultationRecommended)
    }
  }
}

function sanitizeInsightContext(input: any) {
  return {
    type: input?.type === 'subject' ? 'subject' : 'overall',
    studentName: text(input?.studentName, 160),
    gwa: text(input?.gwa, 20),
    standing: text(input?.standing, 160),
    subjectCode: text(input?.subjectCode, 40),
    subjectName: text(input?.subjectName, 160),
    periodLabel: text(input?.periodLabel, 120),
    rating: Number.isFinite(input?.rating) ? input.rating : null,
    status: text(input?.status, 40),
    diagnostics: input?.diagnostics || null,
    evidenceBoundary: 'Only faculty-posted official milestone values in this payload may be described as grades.'
  }
}

function parseStructuredResponse(content: string): AdvisorResponse {
  const normalized = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const parsed = JSON.parse(normalized)
  const message = text(parsed?.message, 1200)
  const actions = Array.isArray(parsed?.actions)
    ? parsed.actions.map((action: unknown) => text(action, 240)).filter(Boolean).slice(0, 3)
    : []

  if (!message) throw new Error('Provider returned an empty message')
  if (parsed?.boundary_statement !== BOUNDARY_STATEMENT) throw new Error('Provider boundary validation failed')

  return {
    message,
    actions,
    consultation_recommended: Boolean(parsed?.consultation_recommended),
    boundary_statement: BOUNDARY_STATEMENT
  }
}

function systemPrompt(mode: string) {
  return `You are Ask ASPIRE, an academic advising explanation assistant at Dr. Yanga's Colleges, Inc. (DYCI).

The supplied deterministic advisor and official records are authoritative data. You do not calculate grades, risk scores, risk tiers, FDA decisions, or scholarship eligibility.

Rules:
1. Explain only evidence present in the supplied context. Never invent grades, causes, deadlines, policies, diagnoses, or faculty decisions.
2. Never contradict the deterministic advising state, visible evidence, or actions.
3. Faculty shared academic feedback is approved student-visible context. You may explain it, but must not reinterpret it as a new grade, risk decision, or diagnosis.
4. Unencoded future terms are missing, not zero. Do not treat them as failures.
5. Absences do not deduct grade points. Four or more absences may support an FDA recommendation, but faculty makes the official decision.
6. If records are insufficient, say: "The available course records do not provide enough information to confirm that."
7. Use no more than 120 words and at most three practical actions.
8. Return JSON only with exactly this shape:
{"message":"student-facing explanation","actions":["action"],"consultation_recommended":false,"boundary_statement":"${BOUNDARY_STATEMENT}"}

Request mode: ${mode}.`
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_BYTES) return json({ error: 'Request is too large' }, 413)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    const authHeader = req.headers.get('Authorization') || ''
    if (!supabaseUrl || !serviceRoleKey || !openRouterKey) return json({ error: 'Advisor service is not configured' }, 503)
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const token = authHeader.slice('Bearer '.length)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return json({ error: 'Authentication required' }, 401)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('user_id', user.id)
      .single()
    if (profileError || profile?.role !== 'student') return json({ error: 'Student access required' }, 403)
    if (!enforceRateLimit(user.id)) return json({ error: 'Too many advisor requests. Please try again shortly.' }, 429)

    const rawBody = await req.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: 'Request is too large' }, 413)
    const body = JSON.parse(rawBody)
    const mode = body?.mode === 'insight' ? 'insight' : body?.mode === 'chat' ? 'chat' : null
    if (!mode) return json({ error: 'Invalid advisor mode' }, 400)

    const context = mode === 'chat' ? sanitizeContext(body.context) : sanitizeInsightContext(body.context)
    const history: ChatMessage[] = mode === 'chat' && Array.isArray(body.history)
      ? body.history.slice(-6).map((message: any) => ({
          role: message?.role === 'assistant' ? 'assistant' : 'user',
          content: text(message?.content, 1200)
        })).filter((message: ChatMessage) => message.content)
      : []
    const question = mode === 'chat' ? text(body.question, 600) : 'Explain this official academic milestone and suggest practical next steps.'
    if (mode === 'chat' && !question) return json({ error: 'Question is required' }, 400)

    const providerResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': supabaseUrl,
        'X-Title': 'ASPIRE Academic Advisor'
      },
      body: JSON.stringify({
        model: MODEL,
        models: [MODEL, 'cohere/north-mini-code:free'],
        messages: [
          { role: 'system', content: systemPrompt(mode) },
          { role: 'user', content: `AUTHORITATIVE STUDENT-VISIBLE CONTEXT:\n${JSON.stringify(context)}` },
          ...history,
          { role: 'user', content: question }
        ],
        temperature: 0.1,
        max_tokens: 300
      })
    })

    if (!providerResponse.ok) return json({ error: 'Advisor provider is temporarily unavailable' }, 502)
    const providerData = await providerResponse.json()
    const content = text(providerData?.choices?.[0]?.message?.content, 4000)
    const response = parseStructuredResponse(content)
    return json({ response })
  } catch (error) {
    console.error('invoke-advisor failed', error instanceof Error ? error.message : error)
    return json({ error: 'Ask ASPIRE could not produce a verified response' }, 502)
  }
})
