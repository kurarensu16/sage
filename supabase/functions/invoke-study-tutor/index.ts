import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// AI Study Tutor — the tutoring backend.
//
// Separate from invoke-advisor on purpose, and invoke-advisor is not touched.
// The advisor explains standing, grades, risk and policy. This teaches: it
// explains concepts, builds study plans, and sets practice. The two never share
// a prompt, a context payload or a boundary statement.
//
// THE PRIVACY BOUNDARY
// Nothing here reads student_risk_evaluations, posted grades, GWA, standing,
// remarks, or any faculty-authored advising plan. The only evidence used is the
// student's own activity scores and the topic tags faculty put on those
// activities. That is deliberate and is half of a two-way wall; the other half
// is in the migration, where the tutor tables are owner-only with no faculty,
// dean or admin read path.
//
// WHY THE HELPERS ARE DUPLICATED FROM invoke-advisor
// Extracting them to _shared would mean editing invoke-advisor to use them, and
// the plan is explicit that the advisor does not change in this phase. A
// "shared" module with one consumer would also be misleading. The duplication
// is the smaller cost, and matches what generate-intervention-draft already
// does.
//
// PROVIDER
// OpenRouter today, because the model decision is still open. Every provider
// detail is confined to callModel() below: switching to a direct Gemini or
// DeepSeek API is a change to that one function plus environment variables.
// Nothing else in this file knows who serves the model.

const BOUNDARY_STATEMENT =
  'This is practice guidance for self-study, not an official grade or faculty decision.'

// PROVIDER
// Both DeepSeek and OpenRouter speak the OpenAI chat-completions shape, so the
// provider is a base URL and a key rather than a code path. Switching back is
// two environment variables.
//
// WEB SEARCH IS NOT AVAILABLE ON THE FLASH MODEL. DeepSeek documents the
// web_search tool as supported on deepseek-v4-pro only; Flash accepts the
// request and IGNORES the tool, which means a search that never happens looks
// exactly like a search that found nothing. Do not add a tools or web_search
// parameter here expecting it to work. Links reach students only from
// faculty-attached resources and from search URLs this system builds out of the
// admin-curated search_destinations table.
const API_BASE = (Deno.env.get('TUTOR_API_BASE') || 'https://api.deepseek.com').replace(/\/+$/, '')
const API_KEY_NAME = Deno.env.get('TUTOR_API_KEY') ? 'TUTOR_API_KEY' : 'OPENROUTER_API_KEY'

const PRIMARY_MODEL = Deno.env.get('TUTOR_MODEL')
  || Deno.env.get('OPENROUTER_MODEL')
  || 'DeepSeek-V4.1-Flash-1017'
const DEFAULT_FALLBACK_MODEL = ''

// Effort costs money, so it is spent where it changes the answer. Writing five
// multiple-choice questions with plausible WRONG answers is the only genuinely
// hard task here -- weak distractors make practice worthless. Explaining a
// concept and listing four study steps are not reasoning problems.
//
// Sent only when TUTOR_EFFORT_PARAM names the provider's parameter, so an
// incorrect guess at the parameter name cannot break every call.
const EFFORT_PARAM = Deno.env.get('TUTOR_EFFORT_PARAM') || ''
const EFFORT_BY_ACTION: Record<string, string> = {
  practice: 'high',
  explain: 'low',
  plan: 'low',
  resources: 'low'
}

const PROVIDER_FAILOVER_STATUSES = new Set([400, 402, 404, 408, 409, 429, 500, 502, 503, 504])
const PROVIDER_TIMEOUT_MS = 25_000
const TOTAL_TIME_BUDGET_MS = 60_000
const MAX_PROVIDER_TOKENS = 1800
const MAX_BODY_BYTES = 48_000

// Burst limit, per running instance. The daily cap below is the real control;
// this only stops a tight loop.
const REQUEST_WINDOW_MS = 60_000
const REQUESTS_PER_WINDOW = 10

// Fallbacks only. The real limits live in system_settings so an administrator
// can change them without a redeploy -- which matters mid-presentation, when
// redeploying is not an option. These apply only if that row cannot be read.
//
// There are TWO ceilings and they answer different questions. The per-student
// daily cap answers "is one student abusing this". The global budget answers
// "can we still afford to answer anyone" -- and only the second one protects a
// prepaid balance, because a per-user limit multiplied by the number of users
// is not a bound on anything.
const FALLBACK_DAILY_CAP = 25
const FALLBACK_CALL_BUDGET = 1500

const MAX_ACTIVITIES = 60
const PRACTICE_QUESTIONS = 5
const PRACTICE_SET_TTL_HOURS = 24

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
}

const ACTIONS = ['explain', 'plan', 'practice', 'practice_submit', 'resources']
const HORIZONS = ['this_week', 'until_next_assessment']

const requestWindows = new Map<string, { count: number; startedAt: number }>()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

function text(value: unknown, maxLength = 1200) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Same redaction as the advisor. The tutor sends less identifying data in the
// first place, but free text from the student can still carry a name or an
// email, and it must not reach the provider.
function redactDirectIdentifiers(value: unknown, identityValues: unknown[] = []) {
  let redacted = String(value || '')
  const knownValues = [...new Set(identityValues
    .map(item => String(item || '').trim())
    .filter(item => item.length >= 2))]
    .sort((a, b) => b.length - a.length)

  knownValues.forEach(identity => {
    redacted = redacted.replace(new RegExp(escapeRegExp(identity), 'gi'), '[redacted]')
  })

  return redacted
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/\b\d{4}-\d{4,8}\b/g, '[redacted student ID]')
    .replace(/\b(?:\+?63|0)9\d{9}\b/g, '[redacted phone]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted identifier]')
}

// Anything that looks like a link, removed from model output.
//
// The system prompt already says never to invent web links, but a prompt is a
// request and this is the enforcement. It matters most because the Flash model
// CANNOT search: any URL it produces is recalled from training, so it is
// unverifiable by construction -- frequently dead, occasionally pointing
// somewhere other than it claims.
//
// Real links reach students by two routes only: a resource a faculty member
// attached, and a search URL this system builds from search_destinations.
// Neither passes through here.
function stripLinks(value: string) {
  return String(value || '')
    .replace(/\bhttps?:\/\/\S+/gi, '[link removed]')
    .replace(/\bwww\.\S+/gi, '[link removed]')
    // Bare domains in prose, e.g. "see khanacademy.org" -- deliberately narrow
    // so ordinary sentences and file names are not mangled.
    .replace(/\b[a-z0-9][a-z0-9-]{1,60}\.(?:com|org|net|edu|io|ph|co|ai)\b(?:\/\S*)?/gi, '[link removed]')
}

// Both ceilings, checked together, before anything is spent.
//
// Returns a plain refusal message or null. The two limits are deliberately
// phrased differently to the student: one resets tomorrow and is about them,
// the other is the system being out of budget and is not their fault.
async function checkBudgets(
  admin: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data: budget } = await admin.rpc('aspire_tutor_budget')

  const dailyCap = Number(budget?.daily_cap_per_student) || FALLBACK_DAILY_CAP
  const callBudget = Number.isFinite(Number(budget?.budget))
    ? Number(budget.budget)
    : FALLBACK_CALL_BUDGET
  const used = Number(budget?.used) || 0

  if (used >= callBudget) {
    return 'The study tutor has used up its allowance for now. Your saved plans, past answers and your instructors’ materials are all still here — only new AI answers are paused. Your administrator can restore it.'
  }

  const { count: usedToday } = await admin
    .from('student_tutor_log')
    .select('log_id', { count: 'exact', head: true })
    .eq('student_id', userId)
    .eq('used_ai', true)
    .gte('created_at', philippineDayStartISO())

  if ((usedToday || 0) >= dailyCap) {
    return `You have reached today’s limit of ${dailyCap} tutor requests. Your saved plans and past answers are still available, and the limit resets tomorrow.`
  }

  return null
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

// Philippine time has no daylight saving, so the day boundary is a fixed
// +08:00 shift. Doing it arithmetically avoids depending on the container's
// timezone, which is UTC.
function philippineDayStartISO() {
  const now = new Date()
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const midnightShifted = Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()
  )
  return new Date(midnightShifted - 8 * 60 * 60 * 1000).toISOString()
}

function tutorModels() {
  const configured = Deno.env.get('TUTOR_FALLBACK_MODELS')
    || Deno.env.get('OPENROUTER_FALLBACK_MODELS')
    || DEFAULT_FALLBACK_MODEL
  return [...new Set([
    PRIMARY_MODEL,
    ...configured.split(',').map(model => model.trim()).filter(Boolean)
  ])]
}

// -----------------------------------------------------------------------------
// The provider. Everything provider-specific lives here.
// -----------------------------------------------------------------------------
async function callModel(apiKey: string, system: string, user: string, action = 'explain') {
  const startedAt = Date.now()
  let lastError: Error | null = null

  for (const model of tutorModels()) {
    if (Date.now() - startedAt > TOTAL_TIME_BUDGET_MS) break

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        max_tokens: MAX_PROVIDER_TOKENS,
        temperature: 0.4,
        response_format: { type: 'json_object' }
      }
      if (EFFORT_PARAM && EFFORT_BY_ACTION[action]) {
        body[EFFORT_PARAM] = EFFORT_BY_ACTION[action]
      }

      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        // A wrong model name is a CONFIGURATION fault, not an outage, and the
        // two need different fixes. Model ids differ between the provider's own
        // API and the gateways that resell it, so this is a real way to be
        // wrong -- and without this branch it would surface to a student as
        // "the tutor could not be reached", which sends you looking in the
        // wrong place entirely.
        const detail = await response.text().catch(() => '')
        if (response.status === 400 || response.status === 404) {
          if (/model/i.test(detail)) {
            console.error('invoke-study-tutor model_not_recognised', {
              model, base: API_BASE, status: response.status,
              detail: detail.slice(0, 300)
            })
            return { ok: false as const, error: 'model_not_recognised', detail }
          }
        }
        if (PROVIDER_FAILOVER_STATUSES.has(response.status)) {
          console.warn('invoke-study-tutor provider_model_failed', {
            model, status: response.status, detail: detail.slice(0, 200)
          })
          continue
        }
        return { ok: false as const, error: `provider_status_${response.status}` }
      }

      const payload = await response.json()
      const content = payload?.choices?.[0]?.message?.content
      if (!content) {
        console.warn('invoke-study-tutor empty_completion', { model })
        continue
      }

      try {
        return {
          ok: true as const,
          data: JSON.parse(content),
          // What was ASKED for.
          model,
          // What the provider says actually ANSWERED. A model name is often an
          // alias that gets repointed at a newer snapshot without notice, so
          // for a thesis "which model produced this" should come from the
          // response, not from a configuration value that may since have moved.
          modelServed: typeof payload?.model === 'string' ? payload.model : model,
          usage: {
            prompt: Number(payload?.usage?.prompt_tokens) || null,
            completion: Number(payload?.usage?.completion_tokens) || null
          }
        }
      } catch {
        console.warn('invoke-study-tutor model_output_invalid', { model })
        continue
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn('invoke-study-tutor provider_connection_failed', { model, message: lastError.message })
    } finally {
      clearTimeout(timer)
    }
  }

  return { ok: false as const, error: lastError?.message || 'no_model_available' }
}

// -----------------------------------------------------------------------------
// Grounding
// -----------------------------------------------------------------------------
// The single place that decides what the model is told about a student. When a
// provider that reads documents is adopted, resource extracts join the payload
// here and nowhere else.
//
// What it deliberately does NOT include: computed grades, GWA, standing,
// remarks, risk tier, FDA, or anything a faculty member wrote about the
// student. Raw activity scores are in, because they ARE the topic-level
// evidence this feature exists to use.
async function buildGroundingContext(
  admin: ReturnType<typeof createClient>,
  studentId: string,
  subjectId: string | null,
  topicTag: string | null
) {
  const { data: enrollments } = await admin
    .from('enrollments')
    .select('section_id, subject_id, status')
    .eq('student_id', studentId)

  const active = (enrollments || []).filter(e => (e.status ?? 'active') === 'active')
  if (!active.length) return { subjects: [], topics: [], resources: [], hasEvidence: false }

  const sectionIds = [...new Set(active.map(e => e.section_id).filter(Boolean))]
  const subjectIds = [...new Set(active.map(e => e.subject_id).filter(Boolean))]
  if (!sectionIds.length || !subjectIds.length) {
    return { subjects: [], topics: [], resources: [], hasEvidence: false }
  }

  const { data: classRecords } = await admin
    .from('class_records')
    .select('class_record_id, subject_id, section_id, subjects:subject_id (code, name)')
    .in('section_id', sectionIds)
    .in('subject_id', subjectIds)

  // The two .in() filters above are a superset: they would also match a class
  // in one of the student's sections for a subject they take in a DIFFERENT
  // section. Pairing them back up here is what keeps it to the real enrolments.
  const enrolledPairs = new Set(active.map(e => `${e.section_id}:${e.subject_id}`))
  let classes = (classRecords || [])
    .filter(c => enrolledPairs.has(`${c.section_id}:${c.subject_id}`))

  if (subjectId) classes = classes.filter(c => c.subject_id === subjectId)
  if (!classes.length) return { subjects: [], topics: [], resources: [], hasEvidence: false }

  const classIds = classes.map(c => c.class_record_id)

  let activityQuery = admin
    .from('class_activities')
    .select('activity_id, class_record_id, name, description, topic_tag, max_score, term')
    .in('class_record_id', classIds)
    .limit(MAX_ACTIVITIES)
  if (topicTag) activityQuery = activityQuery.eq('topic_tag', topicTag)

  const { data: activities } = await activityQuery
  const activityIds = (activities || []).map(a => a.activity_id)

  const [{ data: scores }, { data: resources }] = await Promise.all([
    activityIds.length
      ? admin.from('student_activity_scores')
          .select('activity_id, score')
          .eq('student_id', studentId)
          .in('activity_id', activityIds)
      : Promise.resolve({ data: [] as Array<{ activity_id: string; score: number }> }),
    activityIds.length
      ? admin.from('activity_resources')
          .select('resource_id, activity_id, label, url, note, kind')
          .in('activity_id', activityIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> })
  ])

  const scoreByActivity = new Map((scores || []).map(s => [s.activity_id, Number(s.score)]))
  const subjectByClass = new Map(classes.map(c => [
    c.class_record_id,
    { code: c.subjects?.code || '', name: c.subjects?.name || '', subject_id: c.subject_id }
  ]))

  const topics = new Map<string, {
    topic: string
    subject: string
    items: Array<{ activity: string; about: string; score: number | null; max: number }>
  }>()

  for (const a of activities || []) {
    const tag = a.topic_tag || 'Untagged'
    const subject = subjectByClass.get(a.class_record_id)
    const key = `${subject?.code || ''}::${tag}`
    if (!topics.has(key)) {
      topics.set(key, { topic: tag, subject: subject?.code || '', items: [] })
    }
    topics.get(key)!.items.push({
      activity: text(a.name, 120),
      about: text(a.description, 240),
      score: scoreByActivity.has(a.activity_id) ? scoreByActivity.get(a.activity_id)! : null,
      max: Number(a.max_score) || 0
    })
  }

  const hasEvidence = [...topics.values()].some(t => t.items.some(i => i.score !== null))

  return {
    subjects: [...new Set(classes.map(c => c.subjects?.code).filter(Boolean))],
    topics: [...topics.values()],
    // Listed, never read. Today the model is told these exist and what they
    // cover, so it can point a student at them; it is never given their
    // contents, which is what keeps this affordable on any model.
    resources: (resources || []).map(r => ({
      label: text(r.label, 150),
      note: text(r.note, 300),
      kind: r.kind
    })),
    hasEvidence
  }
}

// -----------------------------------------------------------------------------
// Prompts
// -----------------------------------------------------------------------------
function systemPrompt(action: string, hasEvidence: boolean) {
  const common = [
    'You are the ASPIRE AI Study Tutor for a Philippine college student.',
    'You TEACH. You never discuss grades, GWA, standing, risk levels, academic warnings, or faculty decisions — you do not have that information and must not speculate about it.',
    'If asked about standing or grades, say that Ask ASPIRE handles those and continue tutoring.',
    'Write in clear, plain English suitable for an undergraduate. Be concrete and practical.',
    'Never invent web links, domain names or site names. You have no web access. Mention a resource only if it appears in the provided context.',
    'If previously_told_this_student is present, continue from it rather than repeating it: acknowledge briefly what was already covered and build on it.',
    hasEvidence
      ? 'The context includes the student\'s own scores on specific activities. Use them to decide what to emphasise, without stating or implying any overall grade.'
      : 'The context has no recorded scores yet, so your help must be general to the topic. Say plainly, in one short sentence, that it is not personalised yet because no scores are recorded.',
    'Respond with STRICT JSON only. No prose outside the JSON.'
  ].join(' ')

  const shapes: Record<string, string> = {
    explain: 'Return {"message": string, "follow_ups": [string, string, string]}. message explains the concept in at most 220 words, in short paragraphs. follow_ups are three short suggested next questions.',
    plan: `Return {"message": string, "items": [{"topic": string, "action": string, "by": string}]}. Provide 3 to 5 items. action is one concrete study step. by is a short relative timeframe such as "in 2 days". message is a one-paragraph summary under 80 words.`,
    practice: `Return {"message": string, "questions": [{"question": string, "choices": [string, string, string, string], "answer": string, "explanation": string}]}. Provide exactly ${PRACTICE_QUESTIONS} multiple-choice questions. answer MUST be the exact text of the correct choice. explanation is one sentence. message is a one-line lead-in.`
  }

  return `${common} ${shapes[action] || shapes.explain}`
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_BYTES) return json({ error: 'Request is too large' }, 413)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    const authHeader = req.headers.get('Authorization') || ''

    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'The study tutor is not set up yet.' }, 503)
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Please sign in again.' }, 401)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const token = authHeader.slice('Bearer '.length)
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return json({ error: 'Please sign in again.' }, 401)

    const { data: profile, error: profileError } = await admin
      .from('users')
      .select('role, first_name, middle_name, last_name, email, user_number')
      .eq('user_id', user.id)
      .single()
    if (profileError || profile?.role !== 'student') {
      return json({ error: 'The study tutor is for students.' }, 403)
    }
    if (!enforceRateLimit(user.id)) {
      return json({ error: 'That was a lot of requests at once. Wait a moment and try again.' }, 429)
    }

    const identityValues = [
      [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' '),
      profile.first_name, profile.middle_name, profile.last_name,
      profile.email, profile.user_number
    ]

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')
    if (!ACTIONS.includes(action)) return json({ error: 'That request was not understood.' }, 400)

    const subjectId: string | null = body?.subject_id || null
    const topic = text(body?.topic, 150)
    const topicTag = text(body?.topic_tag, 100) || null

    // ---- practice_submit: the only path that reveals correct answers --------
    // Checked server-side because the answers were deliberately never sent to
    // the browser. The set is single use and expires, so a student cannot
    // resubmit for a better result.
    if (action === 'practice_submit') {
      const setId = String(body?.set_id || '')
      const answers: unknown[] = Array.isArray(body?.answers) ? body.answers : []
      if (!setId) return json({ error: 'That practice set was not found.' }, 400)

      const { data: set } = await admin
        .from('student_tutor_practice_sets')
        .select('set_id, student_id, subject_id, topic, questions, difficulty, expires_at, consumed_at')
        .eq('set_id', setId)
        .single()

      // Ownership is checked here rather than relied on from the client,
      // because this function holds the service role and bypasses RLS.
      if (!set || set.student_id !== user.id) {
        return json({ error: 'That practice set was not found.' }, 404)
      }
      if (set.consumed_at) {
        return json({ error: 'You have already submitted this set. Start a new one to practise again.' }, 409)
      }
      if (new Date(set.expires_at).getTime() < Date.now()) {
        return json({ error: 'This practice set has expired. Start a new one.' }, 410)
      }

      const questions = Array.isArray(set.questions) ? set.questions : []
      const results = questions.map((q: Record<string, unknown>, index: number) => {
        const chosen = text(answers[index], 400)
        const correct = text(q?.answer, 400)
        const isCorrect = chosen.length > 0 && chosen === correct
        return {
          question: text(q?.question, 600),
          choices: Array.isArray(q?.choices) ? q.choices.map((c: unknown) => text(c, 300)) : [],
          chosen_answer: chosen,
          correct_answer: correct,
          is_correct: isCorrect,
          explanation: text(q?.explanation, 400)
        }
      })

      // Marked consumed first: if the attempt writes fail, the set must not be
      // left open for a second submission.
      await admin.from('student_tutor_practice_sets')
        .update({ consumed_at: new Date().toISOString() })
        .eq('set_id', setId)

      if (results.length) {
        await admin.from('student_tutor_practice_attempts').insert(
          results.map(r => ({
            student_id: user.id,
            set_id: setId,
            subject_id: set.subject_id,
            topic: set.topic,
            question: r.question,
            chosen_answer: r.chosen_answer,
            correct_answer: r.correct_answer,
            is_correct: r.is_correct,
            difficulty: set.difficulty
          }))
        )
      }

      const score = results.filter(r => r.is_correct).length
      await admin.from('student_tutor_log').insert({
        student_id: user.id, subject_id: set.subject_id, topic: set.topic,
        action: 'practice', shape: 'submit', used_ai: false,
        request: { set_id: setId },
        response: { score, total: results.length }
      })

      return json({
        message: `You got ${score} of ${results.length} right.`,
        results,
        score,
        total: results.length,
        boundary_statement: BOUNDARY_STATEMENT
      })
    }

    // ---- resources ----------------------------------------------------------
    // Instructor materials first, free: a database lookup, no model involved.
    if (action === 'resources') {
      const context = await buildGroundingContext(admin, user.id, subjectId, topicTag)

      if (context.resources.length) {
        await admin.from('student_tutor_log').insert({
          student_id: user.id, subject_id: subjectId, topic,
          action: 'resources', shape: 'curated', used_ai: false,
          request: { subject_id: subjectId, topic_tag: topicTag },
          response: { count: context.resources.length }
        })
        return json({
          message: 'Your instructor attached these for this topic.',
          resources: context.resources,
          boundary_statement: BOUNDARY_STATEMENT
        })
      }

      // Nothing curated. Rather than a dead end, the student gets search terms.
      //
      // THE MODEL NEVER PRODUCES A URL. It returns keywords only, and the
      // search links are built from them in code below. A model without a
      // browsing tool -- which is every model this runs on today -- can only
      // produce links from memory, and those are routinely dead or point
      // somewhere other than they claim. A weak keyword merely gives weak
      // results the student can judge; a fabricated link looks authoritative
      // and is not. When a provider with real grounded search is adopted, this
      // branch returns verified URLs instead and the client renders them the
      // same way.
      if (!openRouterKey) {
        return json({
          message: 'Your instructor has not attached any materials for this topic yet.',
          resources: [],
          boundary_statement: BOUNDARY_STATEMENT
        })
      }

      // Suggestions cost a model call, so they answer to the same two
      // ceilings as everything else. Refused softly: the student still gets
      // the honest answer that nothing was attached.
      const searchRefusal = await checkBudgets(admin, user.id)
      if (searchRefusal) {
        return json({
          message: 'Your instructor has not attached any materials for this topic yet, and suggestions are unavailable right now.',
          resources: [],
          boundary_statement: BOUNDARY_STATEMENT
        })
      }

      const keywordResult = await callModel(
        openRouterKey,
        'You help a college student find study material. Return STRICT JSON only: {"keywords": [string, string, string], "message": string}. keywords are three short web-search phrases for the topic, each under 8 words. NEVER include a URL, a domain name, or a site name. message is one short sentence on what to look for.',
        redactDirectIdentifiers(JSON.stringify({
          topic: topic || 'general study skills',
          subject: context.subjects[0] || null
        }), identityValues),
        'resources'
      )

      const keywords = keywordResult.ok && Array.isArray((keywordResult.data as Record<string, unknown>)?.keywords)
        ? ((keywordResult.data as Record<string, unknown>).keywords as unknown[])
            .slice(0, 3)
            .map(k => text(k, 90))
            // Belt and braces: strip anything that still looks like a link, in
            // case a model ignores the instruction above.
            .filter(k => k && !/https?:\/\/|www\.|\.(com|org|net|edu|io|ph)\b/i.test(k))
        : []

      // The destinations are an institution-maintained list, not a constant in
      // this file: the school decides where students are sent, and changing it
      // is an INSERT rather than a deployment.
      //
      // Falling back to Google alone keeps the feature working if the
      // search_destinations migration has not been applied yet, or if every
      // row was deactivated.
      const { data: destinations } = await admin
        .from('search_destinations')
        .select('name, url_template, action_label')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      const templates = (destinations || []).length
        ? destinations!
        : [{ name: 'Google', url_template: 'https://www.google.com/search?q={q}', action_label: 'Search the web' }]

      // Built here, never by the model, so every one of these is a real,
      // working search page on an approved site.
      const searches = keywords.map(k => ({
        keyword: k,
        links: templates
          // Re-checked at use: a template is only as trustworthy as the row it
          // came from, and a row edited by hand could have lost its https or
          // its placeholder.
          .filter(d => /^https:\/\//i.test(d.url_template) && d.url_template.includes('{q}'))
          .map(d => ({
            name: d.name,
            label: d.action_label || 'Search',
            url: d.url_template.replace('{q}', encodeURIComponent(k))
          }))
      }))

      await admin.from('student_tutor_log').insert({
        student_id: user.id, subject_id: subjectId, topic,
        action: 'resources', shape: 'suggested', used_ai: keywordResult.ok,
        request: { subject_id: subjectId, topic_tag: topicTag },
        response: { keywords }
      })

      return json({
        message: 'Your instructor has not attached any materials for this topic yet.',
        resources: [],
        search_suggestions: searches,
        search_hint: keywordResult.ok
          ? text((keywordResult.data as Record<string, unknown>)?.message, 300)
          : '',
        boundary_statement: BOUNDARY_STATEMENT
      })
    }

    // ---- both ceilings, before anything that may call a model ---------------
    const refusal = await checkBudgets(admin, user.id)
    if (refusal) return json({ error: refusal }, 429)

    // ---- plan: may return an existing one without calling a model -----------
    if (action === 'plan') {
      const horizon = HORIZONS.includes(String(body?.horizon)) ? String(body.horizon) : 'this_week'
      const replace = body?.replace === true

      // The overall scope is stored as NULL, which needs .is() rather than
      // .eq() — PostgREST renders .eq(null) as a comparison that never matches,
      // so an overall plan would never be found and the cap would look broken.
      let planQuery = admin
        .from('student_tutor_plans')
        .select('plan_id, topic, items, horizon, status, stale_since, deadline_at, created_at')
        .eq('student_id', user.id)
        .eq('status', 'active')
      planQuery = subjectId
        ? planQuery.eq('subject_id', subjectId)
        : planQuery.is('subject_id', null)

      const { data: existing } = await planQuery.maybeSingle()

      const finished = existing
        && Array.isArray(existing.items)
        && existing.items.length > 0
        && existing.items.every((i: Record<string, unknown>) => i?.done === true)

      // An unfinished plan is returned as-is. No model call, no tokens, and the
      // student is asked whether to continue it or replace it -- a plan is
      // never silently overwritten or silently duplicated.
      if (existing && !finished && !replace) {
        await admin.from('student_tutor_log').insert({
          student_id: user.id, subject_id: subjectId, topic,
          action: 'plan', shape: horizon, used_ai: false,
          request: { subject_id: subjectId, horizon },
          response: { returned_existing: true, plan_id: existing.plan_id }
        })
        return json({
          message: 'You already have a plan in progress here.',
          existing_plan: existing,
          needs_choice: true,
          boundary_statement: BOUNDARY_STATEMENT
        })
      }

      if (existing && finished) {
        await admin.from('student_tutor_plans')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('plan_id', existing.plan_id)
      }
      if (existing && replace && !finished) {
        await admin.from('student_tutor_plans')
          .update({ status: 'superseded', updated_at: new Date().toISOString() })
          .eq('plan_id', existing.plan_id)
      }
    }

    // ---- everything below calls the model -----------------------------------
    if (!openRouterKey) return json({ error: 'The study tutor is not set up yet.' }, 503)

    const context = await buildGroundingContext(admin, user.id, subjectId, topicTag)

    let priorAttempts: Array<Record<string, unknown>> = []
    if (action === 'practice') {
      // What makes the next set different from the last: already-correct
      // questions are skipped and weak sub-skills are leaned into.
      let attemptQuery = admin
        .from('student_tutor_practice_attempts')
        .select('question, is_correct')
        .eq('student_id', user.id)
      // Same null trap as above: filter by topic only when there is one,
      // rather than asking PostgREST to compare against null.
      if (topic) attemptQuery = attemptQuery.eq('topic', topic)

      const { data } = await attemptQuery
        .order('created_at', { ascending: false })
        .limit(20)
      priorAttempts = data || []
    }

    // CONTINUITY — what this student was last told about THIS topic.
    //
    // Without it every request is stateless: a student who asks about a topic
    // twice gets two unrelated explanations, and the second ignores that they
    // then scored 3 out of 5 on practice. That is the difference between a
    // lookup and tutoring, and it is the part a general-purpose assistant
    // cannot reproduce -- it has no memory of what this student was taught.
    //
    // Deliberately ONE exchange, heavily truncated. It costs tokens on a
    // prepaid balance, so it buys continuity, not a transcript.
    let lastExchange: { asked: string; told: string } | null = null
    if (topic) {
      const { data: prior } = await admin
        .from('student_tutor_log')
        .select('action, response, created_at')
        .eq('student_id', user.id)
        .eq('topic', topic)
        .eq('used_ai', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Only the message is carried back, never the stored JSON wholesale: a
      // practice response holds correct answers, and feeding those into a later
      // prompt would risk the model repeating them to the student.
      const told = text((prior?.response as Record<string, unknown>)?.message, 400)
      if (told) lastExchange = { asked: String(prior?.action || ''), told }
    }

    const userPrompt = redactDirectIdentifiers(JSON.stringify({
      request: {
        action,
        topic: topic || 'general study skills',
        shape: text(body?.shape, 60) || null,
        difficulty: text(body?.difficulty, 20) || 'mixed',
        student_question: text(body?.question, 600) || null
      },
      evidence: context,
      previously_told_this_student: lastExchange,
      already_answered: priorAttempts.map(a => ({
        question: text(a.question, 200), was_correct: a.is_correct
      }))
    }), identityValues)

    const result = await callModel(
      openRouterKey,
      systemPrompt(action === 'practice_submit' ? 'practice' : action, context.hasEvidence),
      userPrompt,
      action
    )

    if (!result.ok) {
      console.error('invoke-study-tutor model_unavailable', { error: result.error })
      // Separated because the fixes are different: one is a setting, the other
      // is waiting. Model ids differ between a provider's own API and the
      // gateways that resell it, so a wrong one is a real way to be wrong.
      if (result.error === 'model_not_recognised') {
        return json({ error: 'The study tutor is not set up correctly. Please tell your administrator the AI model name needs checking.' }, 503)
      }
      return json({ error: 'The tutor could not be reached just now. Please try again in a moment.' }, 503)
    }

    const payload = result.data as Record<string, unknown>
    // Stripped on EVERY path, not just the keyword branch. The system prompt
    // asks the model not to invent links; this is what makes it so. The Flash
    // model cannot search, so any URL it produces is recalled from training and
    // unverifiable by construction.
    const message = stripLinks(text(payload?.message, 2000))

    // ---- practice: store answers server-side, return questions only ---------
    if (action === 'practice') {
      const raw = Array.isArray(payload?.questions) ? payload.questions : []
      const questions = raw.slice(0, PRACTICE_QUESTIONS).map((q: Record<string, unknown>) => ({
        question: stripLinks(text(q?.question, 600)),
        choices: Array.isArray(q?.choices) ? q.choices.slice(0, 6).map((c: unknown) => stripLinks(text(c, 300))) : [],
        answer: stripLinks(text(q?.answer, 400)),
        explanation: stripLinks(text(q?.explanation, 400))
      })).filter(q => q.question && q.choices.length >= 2 && q.answer)

      if (!questions.length) {
        return json({ error: 'The tutor could not prepare questions for that topic. Try another topic.' }, 502)
      }

      const expiresAt = new Date(Date.now() + PRACTICE_SET_TTL_HOURS * 3600 * 1000).toISOString()
      const { data: set, error: setError } = await admin
        .from('student_tutor_practice_sets')
        .insert({
          student_id: user.id,
          subject_id: subjectId,
          topic: topic || null,
          questions,
          difficulty: text(body?.difficulty, 20) || 'mixed',
          expires_at: expiresAt
        })
        .select('set_id')
        .single()

      if (setError || !set) {
        console.error('invoke-study-tutor practice_set_not_saved', setError)
        return json({ error: 'The questions could not be prepared. Please try again.' }, 500)
      }

      await admin.from('student_tutor_log').insert({
        student_id: user.id, subject_id: subjectId, topic,
        action: 'practice', shape: 'generate', used_ai: true,
        request: { subject_id: subjectId, topic_tag: topicTag },
        response: { set_id: set.set_id, count: questions.length, model: result.model },
        model_served: result.modelServed,
        prompt_tokens: result.usage?.prompt ?? null,
        completion_tokens: result.usage?.completion ?? null
      })

      // The answer is stripped here. This is the whole point of the separate
      // sets table: the browser never receives it.
      return json({
        message,
        set_id: set.set_id,
        expires_at: expiresAt,
        assessment: questions.map(q => ({ question: q.question, choices: q.choices })),
        personalized: context.hasEvidence,
        boundary_statement: BOUNDARY_STATEMENT
      })
    }

    // ---- plan: persist the new checklist ------------------------------------
    if (action === 'plan') {
      const horizon = HORIZONS.includes(String(body?.horizon)) ? String(body.horizon) : 'this_week'
      const rawItems = Array.isArray(payload?.items) ? payload.items : []
      const items = rawItems.slice(0, 6).map((i: Record<string, unknown>) => ({
        topic: stripLinks(text(i?.topic, 150)),
        action: stripLinks(text(i?.action, 300)),
        by: stripLinks(text(i?.by, 60)),
        done: false
      })).filter(i => i.action)

      if (!items.length) {
        return json({ error: 'The tutor could not build a plan for that topic. Try another topic.' }, 502)
      }

      // this_week gets a real date. until_next_assessment deliberately gets
      // none: no syllabus table knows when "next" is, and the staleness trigger
      // is what signals that the next assessment has actually arrived.
      const deadlineAt = horizon === 'this_week'
        ? new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
        : null

      const { data: currentTerm } = await admin
        .from('academic_terms')
        .select('term_id')
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data: plan, error: planError } = await admin
        .from('student_tutor_plans')
        .insert({
          student_id: user.id,
          subject_id: subjectId,
          term_id: currentTerm?.term_id || null,
          topic: topic || null,
          topic_tag: topicTag,
          horizon,
          items,
          status: 'active',
          deadline_at: deadlineAt
        })
        .select('plan_id, topic, items, horizon, deadline_at, created_at')
        .single()

      if (planError || !plan) {
        // The unique index is the cap. Hitting it means another tab created a
        // plan for this scope a moment ago, which is not an error worth
        // alarming anyone about.
        console.warn('invoke-study-tutor plan_not_saved', planError)
        return json({ error: 'You already have a plan in progress for this subject. Open it from My Study Plans.' }, 409)
      }

      await admin.from('student_tutor_log').insert({
        student_id: user.id, subject_id: subjectId, topic,
        action: 'plan', shape: horizon, used_ai: true,
        request: { subject_id: subjectId, horizon, topic_tag: topicTag },
        // The message is stored so a later request on the same topic can
        // continue from it. Truncated: this is continuity, not a transcript.
        response: { plan_id: plan.plan_id, items: items.length, model: result.model, message: text(message, 400) },
        model_served: result.modelServed,
        prompt_tokens: result.usage?.prompt ?? null,
        completion_tokens: result.usage?.completion ?? null
      })

      return json({
        message,
        study_plan: plan,
        personalized: context.hasEvidence,
        boundary_statement: BOUNDARY_STATEMENT
      })
    }

    // ---- explain ------------------------------------------------------------
    const followUps = Array.isArray(payload?.follow_ups)
      ? payload.follow_ups.slice(0, 3).map((f: unknown) => stripLinks(text(f, 120))).filter(Boolean)
      : []

    await admin.from('student_tutor_log').insert({
      student_id: user.id, subject_id: subjectId, topic,
      action: 'explain', shape: null, used_ai: true,
      request: { subject_id: subjectId, topic_tag: topicTag },
      response: { model: result.model, message: text(message, 400) },
      model_served: result.modelServed,
      prompt_tokens: result.usage?.prompt ?? null,
      completion_tokens: result.usage?.completion ?? null
    })

    return json({
      message,
      follow_ups: followUps,
      // Told about, never read. Lets an explanation point at the instructor's
      // own materials without the cost of ingesting them.
      resources: context.resources,
      personalized: context.hasEvidence,
      boundary_statement: BOUNDARY_STATEMENT
    })
  } catch (error) {
    console.error('invoke-study-tutor unhandled', error)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})
