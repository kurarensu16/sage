import { supabase } from './supabase';
import { summarizeTopics } from './studyTutorRules';

// AI Study Tutor: data access.
//
// The pure rules live in studyTutorRules.js so the verify scripts can load them
// without a browser. Re-exported here so each page keeps one import.
export * from './studyTutorRules';

const FUNCTION_NAME = 'invoke-study-tutor';

// --- The menu --------------------------------------------------------------

/**
 * Everything the wizard needs: the student's subjects and their topics.
 *
 * Read straight from the tables rather than through an RPC, because RLS already
 * scopes both of them to this student -- class_activities is readable only for
 * classes they are enrolled in, and student_activity_scores only for their own
 * records. Re-deriving enrolment here would be a second copy of a rule that
 * already exists in SQL.
 */
export async function fetchTutorMenu() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in again.');

  const [{ data: activities, error: actError }, { data: scores, error: scoreError }] =
    await Promise.all([
      supabase
        .from('class_activities')
        .select(`
          activity_id, class_record_id, name, description, topic_tag, max_score, term,
          class_records:class_record_id (
            subject_id,
            subjects:subject_id ( code, name )
          )
        `),
      supabase
        .from('student_activity_scores')
        .select('activity_id, score')
        .eq('student_id', user.id)
    ]);

  if (actError) throw actError;
  if (scoreError) throw scoreError;

  const flattened = (activities || []).map((a) => ({
    activity_id: a.activity_id,
    name: a.name,
    description: a.description,
    topic_tag: a.topic_tag,
    max_score: a.max_score,
    term: a.term,
    subjectId: a.class_records?.subject_id || null,
    subjectCode: a.class_records?.subjects?.code || '',
    subjectName: a.class_records?.subjects?.name || ''
  }));

  const scoresByActivityId = Object.fromEntries(
    (scores || []).map((s) => [s.activity_id, Number(s.score)])
  );

  // One entry per subject the student actually has activities in. A subject
  // with no activities yet has nothing to tutor on, so offering it would lead
  // to an empty second step.
  const subjects = [];
  const seen = new Set();
  for (const a of flattened) {
    if (!a.subjectId || seen.has(a.subjectId)) continue;
    seen.add(a.subjectId);
    subjects.push({ subjectId: a.subjectId, code: a.subjectCode, name: a.subjectName });
  }
  subjects.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

  return {
    subjects,
    topics: summarizeTopics(flattened, scoresByActivityId),
    hasAnyScore: Object.keys(scoresByActivityId).length > 0
  };
}

// --- Asking the tutor ------------------------------------------------------

/**
 * One call for every AI action. The server decides what is allowed, what it
 * costs, and what gets persisted; this only carries the request.
 *
 * Errors from the function arrive in the response body rather than as a thrown
 * network error, so they are turned into real errors here. Otherwise a refusal
 * -- a daily limit, an expired set -- would look like a successful reply with
 * nothing in it.
 */
async function invokeTutor(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

  if (error) {
    // The function's own message is written for students; the generic one is
    // the fallback when the function could not be reached at all.
    let detail;
    try {
      detail = (await error.context?.json())?.error || '';
    } catch {
      detail = '';
    }
    throw new Error(detail || 'The study tutor could not be reached. Please try again in a moment.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function explainTopic({ subjectId, topic, topicTag, question }) {
  return invokeTutor({
    action: 'explain', subject_id: subjectId || null, topic, topic_tag: topicTag || null, question
  });
}

export function buildStudyPlan({ subjectId, topic, topicTag, horizon, replace = false }) {
  return invokeTutor({
    action: 'plan', subject_id: subjectId || null, topic,
    topic_tag: topicTag || null, horizon, replace
  });
}

export function generatePractice({ subjectId, topic, topicTag, difficulty }) {
  return invokeTutor({
    action: 'practice', subject_id: subjectId || null, topic,
    topic_tag: topicTag || null, difficulty
  });
}

/** Answers are checked on the server; the browser never held the correct ones. */
export function submitPractice({ setId, answers }) {
  return invokeTutor({ action: 'practice_submit', set_id: setId, answers });
}

export function fetchTopicResources({ subjectId, topicTag }) {
  return invokeTutor({ action: 'resources', subject_id: subjectId || null, topic_tag: topicTag || null });
}

// --- Plans -----------------------------------------------------------------

export async function fetchMyPlans() {
  const { data, error } = await supabase
    .from('student_tutor_plans')
    .select(`
      plan_id, subject_id, topic, topic_tag, horizon, items, status,
      deadline_at, stale_since, created_at, updated_at,
      subjects:subject_id ( code, name )
    `)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((p) => ({
    ...p,
    subjectCode: p.subjects?.code || '',
    subjectName: p.subjects?.name || ''
  }));
}

/**
 * Tick an item off, or un-tick it.
 *
 * The whole array is rewritten because `items` is a single jsonb column. The
 * caller passes the plan it is looking at, so two tabs editing the same plan
 * will have the later write win -- acceptable for a personal checklist, and the
 * alternative (per-item rows) is a table nobody needs.
 */
export async function setPlanItemDone(plan, index, done) {
  const items = (Array.isArray(plan?.items) ? plan.items : []).map((item, i) =>
    i === index ? { ...item, done } : item
  );

  const { data, error } = await supabase
    .from('student_tutor_plans')
    .update({ items, updated_at: new Date().toISOString() })
    .eq('plan_id', plan.plan_id)
    .select('plan_id, items, status')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mark a plan finished, or discard it.
 *
 * Discarding is a status change, never a delete: there is no DELETE policy on
 * the table, so history is kept. Freeing the scope key is the point -- an
 * active plan blocks a new one for that subject.
 */
export async function setPlanStatus(planId, status) {
  const { data, error } = await supabase
    .from('student_tutor_plans')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('plan_id', planId)
    .select('plan_id, status')
    .single();

  if (error) throw error;
  return data;
}

/** Clear the "may be out of date" flag once the student has looked. */
export async function acknowledgePlanStaleness(planId) {
  const { error } = await supabase
    .from('student_tutor_plans')
    .update({ stale_since: null, updated_at: new Date().toISOString() })
    .eq('plan_id', planId);

  if (error) throw error;
}
