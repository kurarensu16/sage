import { supabase } from './supabase';

// Dean approval of the Semestral Grade (pre-final defense revision, 2026-11-18;
// plan: docs/02-thesis/defense/REGISTRAR_REVISIONS_PLAN_2026-11-18.md, Phase 3;
// database: 20261118153739_sg_approval_by_the_dean.sql).
//
//   submitted  faculty posted the SG; the Dean has not decided. Students do not
//              see it and nobody has been emailed.
//   approved   released: students see it, they and their guardians are
//              emailed, and the Registrar receives it.
//   returned   the Dean sent it back with a reason; the faculty re-posts it,
//              which makes it submitted again.
//
// Every write goes through decide_sg_approval(); the table is read-only to
// clients, and RLS limits reads to the class's faculty, its college's Dean,
// the Registrar and Admin.

export const SG_APPROVAL_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  RETURNED: 'returned'
});

export const SG_APPROVAL_LABEL = Object.freeze({
  submitted: 'Awaiting Dean',
  approved: 'Approved',
  returned: 'Returned'
});

const APPROVAL_COLUMNS =
  'class_record_id, status, submitted_at, submission_count, decided_at, return_reason, approved_before_workflow, submitter:users!submitted_by(first_name, last_name), decider:users!decided_by(first_name, last_name)';

const personName = (p) => (p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '');

function shape(row) {
  if (!row) return null;
  return {
    classRecordId: row.class_record_id,
    status: row.status,
    submittedAt: row.submitted_at,
    submittedBy: personName(row.submitter),
    submissionCount: row.submission_count,
    decidedAt: row.decided_at,
    decidedBy: personName(row.decider),
    returnReason: row.return_reason || '',
    approvedBeforeWorkflow: Boolean(row.approved_before_workflow)
  };
}

// A missing table (migration not yet applied) reads as "no approval record",
// so every screen keeps working before the owner runs the batch.
const isMissingRelation = (error) =>
  error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || ''));

export async function fetchSgApproval(classRecordId) {
  if (!classRecordId) return null;
  const { data, error } = await supabase
    .from('sg_approvals')
    .select(APPROVAL_COLUMNS)
    .eq('class_record_id', classRecordId)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  return shape(data);
}

/** Map of class_record_id -> approval, for the classes the caller may read. */
export async function fetchSgApprovalsFor(classRecordIds = []) {
  const ids = [...new Set(classRecordIds.filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from('sg_approvals')
      .select(APPROVAL_COLUMNS)
      .in('class_record_id', ids.slice(i, i + 150));
    if (error) {
      if (isMissingRelation(error)) return map;
      throw error;
    }
    for (const row of data || []) map.set(row.class_record_id, shape(row));
  }
  return map;
}

/**
 * The Dean's queue: SGs waiting for a decision, plus what was decided in the
 * last 30 days. RLS already limits the rows to the Dean's own college.
 */
export async function fetchDeanSgQueue() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const select = `${APPROVAL_COLUMNS}, class_records:class_record_id(class_record_id, class_type, school_year, semester, subjects:subject_id(code, name), sections:section_id(name), faculty:users!faculty_id(first_name, last_name))`;
  const [pending, recent] = await Promise.all([
    supabase.from('sg_approvals').select(select).eq('status', 'submitted').order('submitted_at', { ascending: true }),
    supabase
      .from('sg_approvals')
      .select(select)
      .in('status', ['approved', 'returned'])
      .eq('approved_before_workflow', false)
      .gte('decided_at', since)
      .order('decided_at', { ascending: false })
      .limit(50)
  ]);
  for (const res of [pending, recent]) {
    if (res.error) {
      if (isMissingRelation(res.error)) return { pending: [], recent: [], unavailable: true };
      throw res.error;
    }
  }
  const withClass = (row) => ({
    ...shape(row),
    subjectCode: row.class_records?.subjects?.code || '',
    subjectName: row.class_records?.subjects?.name || '',
    sectionName: row.class_records?.sections?.name || '',
    classType: row.class_records?.class_type || null,
    termLabel: [row.class_records?.school_year, row.class_records?.semester].filter(Boolean).join(' · '),
    instructor: personName(row.class_records?.faculty)
  });
  return { pending: (pending.data || []).map(withClass), recent: (recent.data || []).map(withClass), unavailable: false };
}

export async function decideSgApproval(classRecordId, decision, reason = null) {
  const { data, error } = await supabase.rpc('decide_sg_approval', {
    p_class_record_id: classRecordId,
    p_decision: decision,
    p_reason: reason
  });
  if (error) throw error;
  return data;
}

/**
 * For a student's own Grade Report: class_record_id -> 'pending' | 'released'
 * | 'none'. Never the Dean's reason. Empty map if the function is not deployed.
 */
export async function fetchSgReleaseStates(classRecordIds = []) {
  const ids = [...new Set(classRecordIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.rpc('get_sg_release_states', { p_class_record_ids: ids });
  if (error) return new Map();
  return new Map((data || []).map((row) => [row.class_record_id, row.state]));
}
