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
      selectedPeriodName: text(input.subject.selectedPeriodName, 40),
      milestoneStage: text(input.subject.milestoneStage, 80),
      isFinalized: Boolean(input.subject.isFinalized),
      gradingFormula: input.subject.gradingFormula || null,
      periods: input.subject.periods || null,
      diagnostics: input.subject.diagnostics || null,
      sharedAcademicFeedback: text(input.subject.sharedAcademicFeedback, 1000),
      activities: Array.isArray(input.subject.activities)
        ? input.subject.activities.slice(0, 20).map((activity: any) => ({
          title: text(activity?.title, 160),
          description: text(activity?.description, 320),
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
        milestoneStage: text(course?.milestoneStage, 80),
        gradingFormula: course?.gradingFormula || null,
        periods: course?.periods || null,
        diagnostics: course?.diagnostics || null,
        activities: Array.isArray(course?.activities) ? course.activities : []
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
    trajectoryVerdict: text(input?.trajectoryVerdict, 160),
    trajectoryType: text(input?.trajectoryType, 20),
    // Different professors post Prelim/MR/TFR/Semestral Grade on different schedules, so the
    // overall GWA is often a partial-term blend. completeness/dlEligibility carry that nuance
    // (e.g. "possible candidate based on current performance") so the model explains the
    // same provisional framing the student-facing UI already shows, rather than treating a
    // partial snapshot as a final result.
    dlEligibility: {
      awardCategory: text(input?.dlEligibility?.awardCategory, 60),
      message: text(input?.dlEligibility?.message, 500)
    },
    completeness: {
      totalSubjectCount: Number.isFinite(input?.completeness?.totalSubjectCount) ? input.completeness.totalSubjectCount : null,
      postedSubjectCount: Number.isFinite(input?.completeness?.postedSubjectCount) ? input.completeness.postedSubjectCount : null,
      finalizedSubjectCount: Number.isFinite(input?.completeness?.finalizedSubjectCount) ? input.completeness.finalizedSubjectCount : null,
      isFullyFinalized: Boolean(input?.completeness?.isFullyFinalized),
      note: text(input?.completeness?.note, 200)
    },
    subjectCode: text(input?.subjectCode, 40),
    subjectName: text(input?.subjectName, 160),
    periodLabel: text(input?.periodLabel, 120),
    rating: Number.isFinite(input?.rating) ? input.rating : null,
    status: text(input?.status, 40),
    diagnostics: input?.diagnostics || null,
    // Per-subject grading formula from the database — each subject may have different weights.
    // This allows Ask ASPIRE to reason about which component (CS, Exam, Character) had the
    // biggest mathematical impact on the student's term rating.
    gradingFormula: input?.gradingFormula || null,
    evidenceBoundary: 'Only faculty-posted official milestone values in this payload may be described as grades.'
  }
}

function parseStructuredResponse(content: string): AdvisorResponse {
  const match = content.match(/\{[\s\S]*\}/)
  const normalized = match ? match[0] : content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const parsed = JSON.parse(normalized)
  const message = text(parsed?.message, 1200)
  const actions = Array.isArray(parsed?.actions)
    ? parsed.actions.map((action: unknown) => text(action, 240)).filter(Boolean).slice(0, 3)
    : []

  if (!message) throw new Error('Provider returned an empty message')
  // boundary_statement is always force-injected from the constant below,
  // so we do NOT validate the model's copy — minor paraphrasing caused
  // unnecessary 502s on otherwise valid responses.

  return {
    message,
    actions,
    consultation_recommended: Boolean(parsed?.consultation_recommended),
    boundary_statement: BOUNDARY_STATEMENT
  }
}

function systemPrompt(mode: string, weightsStr?: string) {
  return `You are Ask ASPIRE, an academic advising explanation assistant at Dr. Yanga's Colleges, Inc. (DYCI).

The supplied deterministic advisor and official records are authoritative data. You do not calculate grades, risk scores, risk tiers, FDA decisions, or scholarship eligibility.

Rules:
1. Explain evidence present in the supplied context. For questions about DYCI policies (grading scale, attendance, President's List, INC), you MAY answer directly using the DYCI ACADEMIC POLICIES listed below — even if hypothetical. HOWEVER, your answer MUST still be placed inside the "message" field of the JSON object.
2. Never contradict the deterministic advising state, visible evidence, or actions.
3. Faculty shared academic feedback is approved student-visible context. You may explain it, but must not reinterpret it as a new grade, risk decision, or diagnosis.
4. Unencoded future terms are missing, not zero. Do not treat them as failures. ALWAYS use the student's ongoing performance (current Class Standing, Exam averages) and grading weights to provide proactive projections and strategic advice on what scores they need on upcoming activities or exams to maintain or achieve a better target grade.
5. Absences do not deduct grade points. Four or more absences per subject may support an FDA recommendation, but the faculty instructor makes the official decision.
6. If the student asks about missing activities or low scores and there are none recorded, explicitly state that there are no recorded missed activities or low scores. Do NOT say "I don't have enough information" for this case.
7. When context.completeness.isFullyFinalized is false, treat GWA, standing, and President's List eligibility as in-progress — use language like "based on your current performance" or "possible candidate." Never say a partial-term reading "confirms" or "finalizes" anything.
8. Grade components from later terms (e.g., Final or Semi-Final) do NOT retroactively affect earlier milestones (Midterm Rating or Prelim).
9. For questions you genuinely cannot answer from context or policy (e.g., specific exam dates, professor deadlines, syllabus content), set the "message" field of your JSON to a polite refusal (e.g., "That information is not available in ASPIRE. Please consult your instructor directly.") — do NOT hallucinate, and DO NOT output raw text outside the JSON format.
10. For simple greetings (e.g. "Hi", "Hello") or thanks, respond politely and briefly (under 20 words). You do not need to explain grades for these inputs.
11. You are an academic advisor, not a tutor or a student. Do NOT write code, solve assignments, or compose emails.
12. Return JSON only with exactly this shape:
{"message":"student-facing explanation","actions":["action"],"consultation_recommended":false,"boundary_statement":"${BOUNDARY_STATEMENT}"}

${weightsStr ? `SUBJECT GRADING WEIGHTS: ${weightsStr}\nApply these specific weights mathematically when explaining grade impact (e.g. a 20/100 on Character at 10% weight is mathematically less impactful than a 30/50 Class Standing at 50% weight).` : ''}

DYCI ACADEMIC POLICIES TO ENFORCE:
- Grading Scale: 98-100=1.0, 95-97=1.25, 92-94=1.5, 89-91=1.75, 86-88=2.0, 83-85=2.25, 80-82=2.5, 77-79=2.75, 75-76=3.0 (Passing), Below 75=5.0 (Failed).
- President's List (Honors): ALL four conditions must be met simultaneously: (1) minimum 18 enrolled units for the semester, (2) no individual subject grade below 2.0, (3) no INC grade in any subject, and (4) overall GWA <= 1.75. A student with only 15 units enrolled is NOT eligible regardless of GWA. Tiers: Sapientia (1.0-1.25), Excellentia (1.26-1.5), Virtus (1.51-1.75). When assessing eligibility, explicitly check all four conditions and state which ones pass or fail.
- Attendance: 4 absences per subject = Failure Due to Absences (FDA). The FDA threshold is per-subject, not combined across all subjects. Faculty makes the official FDA decision — Ask ASPIRE does not.
- INC (Incomplete): Issued when a student fails to complete required coursework. An INC disqualifies the student from President's List until it is resolved and replaced with a final grade.

CRITICAL FORMATTING INSTRUCTION: MAXIMUM 100 WORDS. OUTPUT ONLY THE RAW JSON OBJECT FROM RULE 12. NO MARKDOWN, NO REASONING BLOCKS, NO TEXT BEFORE OR AFTER THE { }.

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
        content: text(message?.content, 400)  // cap at 400 chars — chat turns are short
      })).filter((message: ChatMessage) => message.content)
      : []
    const question = mode === 'chat' ? text(body.question, 600) : 'Explain this official academic milestone and suggest practical next steps.'
    if (mode === 'chat' && !question) return json({ error: 'Question is required' }, 400)

    console.log("INVOKE-ADVISOR CONTEXT PAYLOAD:", JSON.stringify(context, null, 2));

    let weightsStr = ''
    // chat mode: formula is nested under context.subject.gradingFormula
    const subjectContext = (context as any)?.subject
    if (subjectContext?.gradingFormula?.components) {
      weightsStr = subjectContext.gradingFormula.components
        .map((c: any) => `${c.name}: ${c.weight}%`)
        .join(', ')
      // insight mode: formula is at the top level of context (subject type)
    } else if ((context as any)?.gradingFormula?.components) {
      weightsStr = (context as any).gradingFormula.components
        .map((c: any) => `${c.name}: ${c.weight}%`)
        .join(', ')
    }

    const messages = [
      { role: 'system', content: systemPrompt(mode, weightsStr) },
      { role: 'user', content: `AUTHORITATIVE STUDENT-VISIBLE CONTEXT:\n${JSON.stringify(context)}` },
      ...history,
      { role: 'user', content: question }
    ]

    // Attempt with 1 automatic retry on parse failure
    let response: AdvisorResponse | null = null
    let lastError: Error | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
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
            models: [MODEL, 'meta-llama/llama-3-8b-instruct:free'],
            messages,
            temperature: attempt === 0 ? 0.1 : 0.0, // lower temp on retry
            max_tokens: 600,
            response_format: { type: 'json_object' }
          })
        })

        if (!providerResponse.ok) {
          lastError = new Error(`Provider HTTP ${providerResponse.status}`)
          continue
        }
        const providerData = await providerResponse.json()
        const content = text(providerData?.choices?.[0]?.message?.content, 4000)
        try {
          response = parseStructuredResponse(content)
          break // success — stop retrying
        } catch (parseErr) {
          console.warn(`invoke-advisor parse error on attempt ${attempt + 1}. Raw content:`, content)
          throw parseErr
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.warn(`invoke-advisor attempt ${attempt + 1} failed:`, lastError.message)
      }
    }

    if (!response) throw lastError ?? new Error('All attempts failed')
    return json({ response })
  } catch (error) {
    console.error('invoke-advisor failed', error instanceof Error ? error.message : error)
    return json({ error: 'Ask ASPIRE could not produce a verified response' }, 502)
  }
})
