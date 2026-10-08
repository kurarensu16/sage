import { supabase } from './supabase';

const CURRENT_INTERVENTION_PROMPT_VERSION = 'faculty-intervention-v3';

function parseTaskCollection(data) {
  const candidate = data?.tasks ?? data?.generated_tasks ?? data?.task ?? data?.data?.tasks;
  if (Array.isArray(candidate)) return candidate;
  if (candidate && typeof candidate === 'object') return [candidate];
  if (typeof candidate !== 'string') return [];
  try {
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : [];
  } catch {
    return [];
  }
}

async function invokeInterventionDraft({ mode, classRecordId, studentId, term, requestId, existingTasks = [] }) {
  const { data, error } = await supabase.functions.invoke('generate-intervention-draft', {
    body: {
      mode,
      class_record_id: classRecordId,
      student_id: studentId,
      term,
      request_id: requestId,
      existing_tasks: existingTasks
    }
  });
  if (error) {
    console.error('Intervention draft service error:', error);
    throw new Error(mode === 'additional_task'
      ? 'We could not suggest another task right now. Please try again, or add the task manually.'
      : 'We could not create the suggested intervention tasks right now. Please try again, or continue manually.');
  }
  const expectedCount = mode === 'additional_task' ? 1 : 3;
  const tasks = parseTaskCollection(data);
  if (!data || tasks.length !== expectedCount) {
    console.error('Intervention draft response was incomplete:', {
      mode,
      expectedCount,
      receivedCount: tasks.length,
      generationMode: data?.generation_mode,
      responseKeys: data && typeof data === 'object' ? Object.keys(data) : []
    });
    throw new Error(mode === 'additional_task'
      ? 'The additional suggestion was incomplete. Please try again, or add the task manually.'
      : 'The suggested tasks were incomplete. Please try again, or continue manually.');
  }
  return { ...data, tasks };
}

export function generateInterventionDraft(args) {
  return invokeInterventionDraft({ ...args, mode: 'initial_plan' });
}

export function generateAdditionalInterventionTask(args) {
  return invokeInterventionDraft({ ...args, mode: 'additional_task' });
}

export async function getFacultyInterventionWorkingDraft({ classRecordId, studentId, term }) {
  const { data, error } = await supabase.rpc('get_faculty_intervention_working_draft', {
    p_class_record_id: classRecordId,
    p_student_id: studentId,
    p_term: term
  });
  if (error) throw error;
  return data || null;
}

export async function saveFacultyInterventionWorkingDraft({
  classRecordId,
  studentId,
  term,
  evaluationContext,
  sharedAcademicFeedback,
  privateNote,
  tasks,
  planDeadline,
  referToDean,
  referralReason
}) {
  const { data, error } = await supabase.rpc('save_faculty_intervention_working_draft', {
    p_class_record_id: classRecordId,
    p_student_id: studentId,
    p_term: term,
    p_evaluation_context: evaluationContext,
    p_shared_academic_feedback: sharedAcademicFeedback,
    p_private_note: privateNote,
    p_tasks: tasks,
    p_plan_deadline: planDeadline || null,
    p_refer_to_dean: Boolean(referToDean),
    p_referral_reason: referralReason || ''
  });
  if (error) throw error;
  return data;
}

export async function getLatestGeneratedInterventionPlan({ classRecordId, studentId, term }) {
  const { data: initial, error: initialError } = await supabase
    .from('faculty_intervention_drafts')
    .select('draft_id,request_id,summary,generated_tasks,snapshot_hash,created_at,model,prompt_version,generation_mode')
    .eq('class_record_id', classRecordId)
    .eq('student_id', studentId)
    .eq('term', term)
    .eq('status', 'generated')
    .eq('generation_mode', 'initial_plan')
    .eq('prompt_version', CURRENT_INTERVENTION_PROMPT_VERSION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (initialError) throw initialError;
  if (!initial) return null;

  const { data: additions, error: additionsError } = await supabase
    .from('faculty_intervention_drafts')
    .select('draft_id,generated_tasks,created_at')
    .eq('class_record_id', classRecordId)
    .eq('student_id', studentId)
    .eq('term', term)
    .eq('status', 'generated')
    .eq('generation_mode', 'additional_task')
    .gt('created_at', initial.created_at)
    .order('created_at', { ascending: true });
  if (additionsError) throw additionsError;

  const tasks = [
    ...(Array.isArray(initial.generated_tasks) ? initial.generated_tasks : []),
    ...(additions || []).flatMap(item => Array.isArray(item.generated_tasks) ? item.generated_tasks : [])
  ].slice(0, 5);
  if (tasks.length !== 3 && tasks.length !== 4 && tasks.length !== 5) return null;

  return {
    draft_id: initial.draft_id,
    request_id: initial.request_id,
    summary: initial.summary,
    tasks,
    snapshot_hash: initial.snapshot_hash,
    generated_at: initial.created_at,
    model: initial.model,
    prompt_version: initial.prompt_version,
    generation_mode: initial.generation_mode,
    resumed: true
  };
}
