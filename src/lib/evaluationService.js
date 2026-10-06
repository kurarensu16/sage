import { supabase } from './supabase';
import { getClassPriorityRoster } from './classRoomService';

export const CASE_PAGE_SIZE = 20;
const CLASS_FIELDS = 'class_record_id, faculty_id, status, term_id, school_year, semester, subjects(code,name), sections(name)';

export async function getEvaluationClasses(facultyId) {
  if (!facultyId) return { classes: [], periods: [] };
  const [classes, periods] = await Promise.all([
    supabase.from('class_records').select(CLASS_FIELDS).eq('faculty_id', facultyId).order('created_at', { ascending: false }),
    supabase.from('academic_terms').select('term_id,school_year,semester,is_active').order('school_year', { ascending: false })
  ]);
  if (classes.error) throw classes.error;
  if (periods.error) throw periods.error;
  return { classes: classes.data || [], periods: periods.data || [] };
}

export async function getTermEvaluations(classId, term) {
  if (!classId || !term) return [];
  const { data, error } = await supabase.from('student_risk_evaluations')
    .select('evaluation_id,student_id,term,status,refer_to_dean,risk_level,risk_score')
    .eq('class_record_id', classId).eq('term', term);
  if (error) throw error;
  return data || [];
}

export async function getEvaluationDetails(evaluationId) {
  const { data, error } = await supabase.from('student_risk_evaluations')
    .select('evaluation_id,evaluation_context,shared_academic_feedback,advising_plan,baseline_snapshot,status,refer_to_dean,private_notes:student_risk_private_notes(note_text,author_id)')
    .eq('evaluation_id', evaluationId).single();
  if (error) throw error;
  return data;
}

export async function getEvaluatedCases({ facultyId, classIds, history, periodId, classId, term, referral, search, page }) {
  if (!facultyId || (!history && !classIds.length)) return { cases: [], count: 0, standings: {} };
  let query = supabase.from('student_risk_evaluations').select(`
    evaluation_id,class_record_id,student_id,faculty_id,term,status,created_at,updated_at,
    risk_level,risk_score,advising_plan,baseline_snapshot,refer_to_dean,
    student:users!student_id!inner(first_name,last_name,user_number),
    class_record:class_records!inner(${CLASS_FIELDS}),
    referrals:student_evaluation_referrals(referral_id,state,legacy,referred_at,resolved_at)
  `, { count: 'exact' });
  query = history ? query.eq('faculty_id', facultyId) : query.in('class_record_id', classIds);
  if (periodId) query = query.eq('class_records.term_id', periodId);
  if (classId) query = query.eq('class_record_id', classId);
  if (term) query = query.eq('term', term);
  if (referral) query = query.eq('refer_to_dean', referral === 'pending');
  // Search the embedded student relation; strip PostgREST filter syntax.
  const needle = search.trim().replace(/[%_*(),.\\]/g, ' ').trim();
  if (needle) query = query.or(`first_name.ilike.%${needle}%,last_name.ilike.%${needle}%,user_number.ilike.%${needle}%`, { referencedTable: 'student' });
  const { data, count, error } = await query.order('created_at', { ascending: false })
    .order('evaluation_id', { ascending: false }).range(page * CASE_PAGE_SIZE, (page + 1) * CASE_PAGE_SIZE - 1);
  if (error) throw error;
  const cases = data || [];
  const standings = {};
  const currentClasses = [...new Set(cases.filter(item => item.class_record?.faculty_id === facultyId
    && item.class_record?.status === 'active').map(item => item.class_record_id))];
  await Promise.all(currentClasses.map(async id => {
    const roster = await getClassPriorityRoster(id, { throwOnError: true });
    standings[id] = Object.fromEntries(roster.map(student => [student.user_id, student]));
  }));
  return { cases, count: count || 0, standings };
}

export async function referEvaluation(evaluationId, reason, requestId) {
  const { data, error } = await supabase.rpc('refer_student_evaluation_to_dean', {
    p_evaluation_id: evaluationId, p_reason: reason.trim(), p_request_id: requestId
  });
  if (error) throw error;
  return data;
}

export async function getReferralHistory(evaluationId) {
  const { data, error } = await supabase.from('student_evaluation_referrals')
    .select('referral_id,state,legacy,actor_id,reason,referred_at,resolved_at,resolved_by,resolution_note,last_review_note,last_reviewed_at')
    .eq('evaluation_id', evaluationId).order('referred_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}
