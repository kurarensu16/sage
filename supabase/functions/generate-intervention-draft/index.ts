import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const PRIMARY_MODEL = Deno.env.get('INTERVENTION_MODEL') || Deno.env.get('OPENROUTER_MODEL') || 'poolside/laguna-s-2.1:free'
const DEFAULT_FALLBACK_MODEL = 'openrouter/free'
const PROMPT_VERSION = 'faculty-intervention-v1'
const TERM_ORDER = ['Prelim', 'Midterm', 'Semi-Final', 'Final'] as const
const TERMS = new Set(TERM_ORDER)
const ACTION_TYPES = new Set([
  'complete_missing_work', 'correct_failed_work', 'targeted_review', 'practice_assessment',
  'faculty_consultation', 'attendance_recovery', 'study_plan', 'performance_maintenance'
])
const PRIORITIES = new Set(['immediate', 'developmental', 'follow_up'])
const PROHIBITED = /\b(lazy|unmotivated|irresponsible|disorder|diagnos|punish|penalty|guarantee(?:d)? pass|will pass|retake|special exam)\b/i
const ACTION_START = /^(complete|correct|review|practice|prepare|create|attend|schedule|summarize|solve|revise|organize|develop|demonstrate|submit|present|explain)\b/i
const MAX_BODY_BYTES = 8_000
const REQUESTS_PER_WINDOW = 8
const REQUEST_WINDOW_MS = 60_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
}

const requestWindows = new Map<string, { count: number; startedAt: number }>()

function interventionModels() {
  const configured = Deno.env.get('INTERVENTION_FALLBACK_MODELS')
    || Deno.env.get('OPENROUTER_FALLBACK_MODELS')
    || DEFAULT_FALLBACK_MODEL
  return [...new Set([
    PRIMARY_MODEL,
    ...configured.split(',').map(model => model.trim()).filter(Boolean)
  ])]
}

const PROVIDER_FAILOVER_STATUSES = new Set([402, 404, 408, 409, 429, 500, 502, 503, 504])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

function clean(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function namedKey(variable: string) {
  const raw = Deno.env.get(variable)
  if (!raw) return ''
  try {
    const keys = JSON.parse(raw)
    return clean(keys?.default, 1000)
  } catch {
    return ''
  }
}

function allowed(userId: string) {
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

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function extractJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  return JSON.parse((fenced || content).trim())
}

function wordSet(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(word => word.length > 3))
}

function overlap(left: string, right: string) {
  const a = wordSet(left), b = wordSet(right)
  if (!a.size || !b.size) return 0
  const shared = [...a].filter(word => b.has(word)).length
  return shared / Math.min(a.size, b.size)
}

function validateModelDraft(value: any, basisCodes: Set<string>, term: string, draftId: string) {
  const summary = clean(value?.summary, 1200)
  if (!summary || !Array.isArray(value?.tasks) || value.tasks.length !== 3) {
    throw new Error('The model did not return exactly three tasks and a summary.')
  }
  const tasks = value.tasks.map((task: any) => {
    const description = clean(task?.description, 300)
    const deliverable = clean(task?.deliverable, 300)
    const actionType = clean(task?.action_type, 60)
    const priority = clean(task?.priority, 30)
    const codes = Array.isArray(task?.basis_codes)
      ? [...new Set(task.basis_codes.map((code: unknown) => clean(code, 160)).filter((code: string) => basisCodes.has(code)))].slice(0, 6)
      : []
    if (description.length < 40 || !deliverable || codes.length === 0) throw new Error('A generated task lacked an actionable description, deliverable, or valid evidence.')
    if (!ACTION_START.test(description)) throw new Error('A generated task did not begin with a clear student action.')
    if (!ACTION_TYPES.has(actionType) || !PRIORITIES.has(priority)) throw new Error('A generated task used an unsupported action type or priority.')
    if (PROHIBITED.test(`${description} ${deliverable}`)) throw new Error('A generated task contained prohibited language.')
    const suggested = task?.suggested_due_date == null ? null : clean(task.suggested_due_date, 10)
    if (suggested) throw new Error('The model invented a deadline without academic-calendar evidence.')
    return {
      task_id: crypto.randomUUID(),
      description,
      deliverable,
      action_type: actionType,
      priority,
      target_term: term,
      due_date: suggested,
      completed: false,
      completed_at: null,
      basis_codes: codes,
      source: 'ai_assisted',
      faculty_edited: false,
      draft_id: draftId
    }
  })
  for (let left = 0; left < tasks.length; left += 1) {
    for (let right = left + 1; right < tasks.length; right += 1) {
      if (overlap(tasks[left].description, tasks[right].description) >= 0.7) throw new Error('Generated tasks were substantially duplicated.')
    }
  }
  for (const limited of ['faculty_consultation', 'attendance_recovery', 'study_plan']) {
    if (tasks.filter(task => task.action_type === limited).length > 1) throw new Error(`Generated too many ${limited} tasks.`)
  }
  const expectedPriorities = ['immediate', 'developmental', 'follow_up']
  if (tasks.some((task, index) => task.priority !== expectedPriorities[index])) throw new Error('Generated tasks were not sequenced correctly.')
  const evidenceUsed = new Set(tasks.flatMap(task => task.basis_codes))
  if (basisCodes.size > 1 && evidenceUsed.size < 2) throw new Error('The generated set did not use sufficiently diverse evidence.')
  return { summary, tasks }
}

function buildConcernProfile(evidence: Array<Record<string, any>>) {
  const concerns: Array<Record<string, unknown>> = []
  const missing = evidence.filter(item => item.type === 'activity' && item.missing)
  const weakActivities = evidence.filter(item => item.type === 'activity' && !item.missing
    && Number(item.maximum) > 0 && Number(item.score) / Number(item.maximum) < 0.75)
  const weakExams = evidence.filter(item => item.type === 'exam' && Number(item.maximum) > 0
    && Number(item.score) / Number(item.maximum) < 0.75)
  const weakCharacter = evidence.filter(item => item.type === 'character' && Number(item.score) < 75)
  const attendance = evidence.find(item => item.type === 'attendance' && Number(item.absence_count) >= 2)
  if (missing.length) concerns.push({ type: 'missing_work', severity: 'high', evidence_codes: missing.map(item => item.code) })
  if (weakExams.length) concerns.push({ type: 'weak_exam_performance', severity: 'high', evidence_codes: weakExams.map(item => item.code) })
  if (weakActivities.length) concerns.push({ type: 'low_scoring_work', severity: 'moderate', evidence_codes: weakActivities.map(item => item.code) })
  if (weakCharacter.length) concerns.push({ type: 'character_rating_concern', severity: 'moderate', evidence_codes: weakCharacter.map(item => item.code) })
  if (attendance) concerns.push({ type: 'attendance_disruption', severity: 'moderate', evidence_codes: [attendance.code] })
  if (!concerns.length) concerns.push({ type: 'performance_maintenance', severity: 'low', evidence_codes: evidence.map(item => item.code).slice(0, 6) })
  const specificEvidence = evidence.filter(item => ['activity', 'exam', 'character'].includes(item.type)).length
  return { concerns, evidence_sufficiency: specificEvidence >= 2 ? 'strong' : evidence.length ? 'partial' : 'insufficient' }
}

function postedGradeRank(period: unknown) {
  const value = clean(period, 80).toLowerCase().replace(/[_-]+/g, ' ')
  if (value.includes('semestral') || value.includes('tentative final') || value === 'final' || value.includes('final rating')) return 3
  if (value.includes('semi')) return 2
  if (value.includes('midterm')) return 1
  if (value.includes('prelim')) return 0
  return Number.POSITIVE_INFINITY
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ error: 'Request is too large.' }, 413)
    const input = JSON.parse(raw || '{}')
    const classRecordId = clean(input.class_record_id, 80)
    const studentId = clean(input.student_id, 80)
    const term = clean(input.term, 30)
    const requestId = clean(input.request_id, 80)
    if (!classRecordId || !studentId || !requestId || !TERMS.has(term)) {
      return json({ error: 'Class, student, valid term, and request identity are required.' }, 400)
    }
    const selectedTermIndex = TERM_ORDER.indexOf(term as typeof TERM_ORDER[number])
    const eligibleTerms = TERM_ORDER.slice(0, selectedTermIndex + 1)

    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = namedKey('SUPABASE_PUBLISHABLE_KEYS') || Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = namedKey('SUPABASE_SECRET_KEYS') || Deno.env.get('SERVICE_ROLE_KEY')
      || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = request.headers.get('Authorization') || ''
    if (!url || !anonKey || !serviceKey || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Service configuration or authentication is unavailable.' }, 401)
    }

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: authData, error: authError } = await authClient.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Authentication is required.' }, 401)
    const facultyId = authData.user.id
    if (!allowed(facultyId)) return json({ error: 'Too many generation requests. Please wait and retry.' }, 429)

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const [{ data: actor }, { data: classRecord, error: classError }] = await Promise.all([
      admin.from('users').select('user_id,role,status').eq('user_id', facultyId).single(),
      admin.from('class_records').select(`
        class_record_id,faculty_id,status,section_id,subject_id,term_id,school_year,semester,grading_formula_snapshot,
        subjects(code,name,computation_id),sections(name)
      `).eq('class_record_id', classRecordId).single()
    ])
    if (!actor || actor.role !== 'faculty' || actor.status !== 'active') return json({ error: 'An active faculty account is required.' }, 403)
    if (classError || !classRecord || classRecord.faculty_id !== facultyId || classRecord.status !== 'active') {
      return json({ error: 'Only the currently assigned faculty member may generate this draft.' }, 403)
    }

    const { data: enrollment } = await admin.from('enrollments').select('student_id')
      .eq('student_id', studentId).eq('section_id', classRecord.section_id).eq('subject_id', classRecord.subject_id)
      .eq('status', 'active').maybeSingle()
    if (!enrollment) return json({ error: 'The student is not enrolled in this class.' }, 403)

    let gradingFormula = classRecord.grading_formula_snapshot
    if (!gradingFormula) {
      const computationId = classRecord.subjects?.computation_id
      if (!computationId) {
        return json({ error: 'This subject has no assigned Computation of Grades (COG).' }, 422)
      }

      const { data: formulaComponents, error: formulaError } = await admin
        .from('grade_computation_components')
        .select('component_id,name,weight,max_score,is_multiple,semantic_type,display_order,is_required')
        .eq('computation_id', computationId)
        .order('display_order', { ascending: true })

      const components = (formulaComponents || []).map((component, index) => ({
        componentId: component.component_id,
        key: component.component_id,
        name: clean(component.name, 100),
        weight: Number(component.weight),
        maxScore: Number(component.max_score),
        isMultiple: Boolean(component.is_multiple),
        semanticType: component.semantic_type || null,
        displayOrder: Number(component.display_order ?? index),
        isRequired: component.is_required ?? true
      }))
      const totalWeight = components.reduce((sum, component) => sum + component.weight, 0)
      const invalidComponent = components.some(component =>
        !component.name || !Number.isFinite(component.weight) || component.weight <= 0
        || !Number.isFinite(component.maxScore) || component.maxScore <= 0
      )
      if (formulaError || !components.length || invalidComponent || Math.abs(totalWeight - 100) > 0.01) {
        return json({ error: 'The assigned COG is missing or invalid, so an intervention draft cannot be generated.' }, 422)
      }

      gradingFormula = {
        version: 1,
        computationId,
        source: 'configured',
        totalWeight,
        components
      }
    }

    const { data: existing } = await admin.from('faculty_intervention_drafts').select('*')
      .eq('faculty_id', facultyId).eq('request_id', requestId).maybeSingle()
    if (existing) {
      if (existing.class_record_id !== classRecordId || existing.student_id !== studentId || existing.term !== term) {
        return json({ error: 'Request identity was already used for a different evaluation context.' }, 409)
      }
      return json({
        draft_id: existing.draft_id, request_id: existing.request_id, summary: existing.summary,
        tasks: existing.generated_tasks, snapshot_hash: existing.snapshot_hash,
        generated_at: existing.created_at, model: existing.model, prompt_version: existing.prompt_version
      })
    }

    const [{ data: scores }, { data: columns }, { data: activities }, { data: posted }, { count: absenceCount }] = await Promise.all([
      admin.from('student_term_scores').select('term,act1,act2,act3,act4,act5,act6,char_rating,exam')
        .eq('class_record_id', classRecordId).eq('student_id', studentId).in('term', eligibleTerms),
      admin.from('class_grading_columns').select('term,act1_max,act2_max,act3_max,act4_max,act5_max,act6_max,exam_max')
        .eq('class_record_id', classRecordId).in('term', eligibleTerms),
      admin.from('class_activities').select('activity_id,term,name,title,description,max_score,activity_type,topic_tag')
        .eq('class_record_id', classRecordId).in('term', eligibleTerms),
      admin.from('posted_grades').select('grade_period,computed_grade,effective_grade,posted_at')
        .eq('class_record_id', classRecordId).eq('student_id', studentId),
      admin.from('attendance_records').select('attendance_id', { count: 'exact', head: true })
        .eq('class_record_id', classRecordId).eq('student_id', studentId).eq('status', 'Absent')
    ])

    const activityIds = (activities || []).map(activity => activity.activity_id)
    const { data: activityScores } = activityIds.length
      ? await admin.from('student_activity_scores').select('activity_id,score').eq('student_id', studentId).in('activity_id', activityIds)
      : { data: [] }
    const scoreMap = new Map((activityScores || []).map(row => [row.activity_id, row.score]))
    const evidence: Array<Record<string, unknown>> = []

    for (const activity of activities || []) {
      const score = scoreMap.has(activity.activity_id) ? Number(scoreMap.get(activity.activity_id)) : null
      const maximum = Number(activity.max_score || 0)
      const code = `activity:${activity.activity_id}`
      evidence.push({
        code, type: 'activity', term: activity.term, title: clean(activity.title || activity.name, 150),
        description: clean(activity.description, 500), topic: clean(activity.topic_tag, 100) || null,
        score, maximum, missing: score === null
      })
    }
    const columnsByTerm = new Map((columns || []).map(row => [row.term, row]))
    for (const row of scores || []) {
      const termColumns = columnsByTerm.get(row.term)
      if (row.exam != null) evidence.push({
        code: `exam:${row.term}`, type: 'exam', term: row.term,
        score: Number(row.exam), maximum: Number(termColumns?.exam_max || 0) || null
      })
      if (row.char_rating != null) evidence.push({
        code: `character:${row.term}`, type: 'character', term: row.term,
        score: Number(row.char_rating), maximum: 100
      })
    }
    if ((absenceCount || 0) > 0) evidence.push({ code: 'attendance:absences', type: 'attendance', absence_count: absenceCount })
    for (const grade of (posted || []).filter(row => postedGradeRank(row.grade_period) <= selectedTermIndex)) {
      evidence.push({
        code: `posted_grade:${grade.grade_period}`, type: 'posted_grade', milestone: grade.grade_period,
        computed_grade: grade.computed_grade, effective_grade: grade.effective_grade
      })
    }
    if (!evidence.length) return json({ error: 'There is not enough saved academic evidence to generate a responsible draft.' }, 422)

    const concernProfile = buildConcernProfile(evidence)
    if (concernProfile.evidence_sufficiency === 'insufficient') {
      return json({ error: 'There is not enough actionable academic evidence. Continue with a manual evaluation.' }, 422)
    }
    const snapshot = {
      subject: { code: classRecord.subjects?.code, name: classRecord.subjects?.name },
      section: classRecord.sections?.name,
      academic_period: { school_year: classRecord.school_year, semester: classRecord.semester, term },
      evidence_scope: { selected_term: term, included_terms: eligibleTerms, future_terms_excluded: true },
      grading_formula: gradingFormula,
      evidence,
      concern_profile: concernProfile,
      generation_rules: {
        due_dates_allowed: false,
        submission_policy_known: false,
        posted_grades_are_immutable: true,
        desired_sequence: ['immediate', 'developmental', 'follow_up']
      }
    }
    const snapshotHash = await sha256(snapshot)
    const draftId = crypto.randomUUID()
    const basisCodes = new Set(evidence.map(item => String(item.code)))
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterKey) return json({ error: 'AI generation is not configured.' }, 503)

    const systemPrompt = `You draft academic intervention tasks for faculty review. Use only the supplied academic snapshot and deterministic concern profile. The selected grading term is an absolute boundary: never mention, infer, or recommend work from a future term. Return JSON only with {"summary": string, "tasks": [{"description": string, "deliverable": string, "action_type": string, "priority": "immediate"|"developmental"|"follow_up", "suggested_due_date": null, "basis_codes": string[]}]}. Generate exactly three distinct, realistic, subject-specific tasks ordered as immediate, developmental, and follow_up. Allowed action_type values: ${[...ACTION_TYPES].join(', ')}. Each description must be 40-300 characters, begin with a clear student action, identify one principal action, and have an observable deliverable. Cite only supplied evidence codes and use at least two distinct codes across the set when available. At most one task may be faculty_consultation, attendance_recovery, or study_plan. For missing or possibly closed work, say complete or correct it for faculty review; never claim late submission is allowed. For posted grades, focus on learning recovery or the next eligible assessment. Do not invent scores, activities, topics, deadlines, diagnoses, motives, punishment, resources, retakes, or policy. Do not guarantee passing or imply that work can alter a locked or posted grade. Avoid busywork and excessive simultaneous workload.`
    let parsed: any = null
    let lastError: Error | null = null
    let usedModel = ''
    const models = interventionModels()
    modelLoop: for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model, temperature: attempt === 0 ? 0.2 : 0,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(snapshot) }
              ]
            })
          })
          if (!response.ok) {
            const providerMessage = clean(await response.text(), 500)
            lastError = new Error(`Provider request failed with status ${response.status}.`)
            console.warn('generate-intervention-draft provider_model_failed', {
              facultyId, requestId, model, status: response.status, providerMessage
            })
            if (PROVIDER_FAILOVER_STATUSES.has(response.status)) continue modelLoop
            break modelLoop
          }
          try {
            const provider = await response.json()
            parsed = validateModelDraft(extractJson(provider?.choices?.[0]?.message?.content || ''), basisCodes, term, draftId)
            usedModel = model
            break modelLoop
          } catch (error) {
            lastError = error instanceof Error ? error : new Error('Invalid provider response.')
            console.warn('generate-intervention-draft model_output_invalid', {
              facultyId, requestId, model, attempt: attempt + 1, message: lastError.message
            })
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Provider connection failed.')
          console.warn('generate-intervention-draft provider_connection_failed', {
            facultyId, requestId, model, message: lastError.message
          })
          continue modelLoop
        }
      }
    }
    if (!parsed) {
      console.warn('generate-intervention-draft all_models_failed', {
        facultyId, requestId, snapshotHash, attemptedModels: models, message: lastError?.message
      })
      return json({ error: 'A valid intervention draft could not be generated. Retry or continue manually.' }, 502)
    }

    const { data: saved, error: saveError } = await admin.from('faculty_intervention_drafts').insert({
      draft_id: draftId, request_id: requestId, faculty_id: facultyId, class_record_id: classRecordId, student_id: studentId, term,
      snapshot, snapshot_hash: snapshotHash, generated_tasks: parsed.tasks, summary: parsed.summary,
      model: usedModel, prompt_version: PROMPT_VERSION
    }).select('draft_id,request_id,summary,generated_tasks,snapshot_hash,created_at,model,prompt_version').single()
    if (saveError) throw saveError

    return json({
      draft_id: saved.draft_id, request_id: saved.request_id, summary: saved.summary,
      tasks: saved.generated_tasks, snapshot_hash: saved.snapshot_hash,
      generated_at: saved.created_at, model: saved.model, prompt_version: saved.prompt_version
    })
  } catch (error) {
    console.error('generate-intervention-draft failed', error instanceof Error ? error.message : 'Unknown error')
    return json({ error: 'The intervention draft could not be generated.' }, 500)
  }
})
