import { supabase } from './supabase';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const operationStorageKey = (classRecordId, gradePeriod) => (
  `aspire_grade_posting_operation:${classRecordId}:${gradePeriod}`
);

const createOperationId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.random() * 16 | 0;
    return (character === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
  });
};

const stableFingerprint = (value) => {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const getOrCreateOperationId = (classRecordId, gradePeriod) => {
  const key = operationStorageKey(classRecordId, gradePeriod);
  const storage = typeof localStorage === 'undefined' ? null : localStorage;
  const existing = storage?.getItem(key);
  if (existing) return { key, operationId: existing };
  const operationId = createOperationId();
  storage?.setItem(key, operationId);
  return { key, operationId };
};

/**
 * Commits reviewed score substitutions and one roster grading period atomically.
 * Client-computed values are previews only: the v2 RPC recalculates official
 * values from the frozen class COG and persisted score basis.
 */
export async function postGradeMilestoneAtomic({
  classRecordId,
  gradePeriod,
  gradingFormulaSnapshot,
  termScoreRows = [],
  activityScoreRows = [],
  postedGradeRows
}) {
  if (!classRecordId) throw new Error('A class record is required to post grades.');
  if (!gradePeriod) throw new Error('A grading period is required to post grades.');
  // Retained in the signature while callers migrate; the server intentionally
  // ignores caller snapshots and requires the frozen class snapshot instead.
  void gradingFormulaSnapshot;
  if (!Array.isArray(postedGradeRows) || postedGradeRows.length === 0) {
    throw new Error('At least one computed student grade is required for posting.');
  }

  const { key, operationId } = getOrCreateOperationId(classRecordId, gradePeriod);
  const { data, error } = await supabase.rpc('post_grade_milestone_v3', {
    p_operation_id: operationId,
    p_class_record_id: classRecordId,
    p_grade_period: gradePeriod,
    p_term_score_rows: ensureArray(termScoreRows),
    p_activity_score_rows: ensureArray(activityScoreRows),
    p_posted_grade_rows: postedGradeRows
  });

  if (error) throw error;
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  return data;
}

export async function getClassGradeProjection({ classRecordId, studentIds = null }) {
  if (!classRecordId) throw new Error('A class record is required to calculate grades.');
  const { data, error } = await supabase.rpc('get_class_grade_projection', {
    p_class_record_id: classRecordId,
    p_student_ids: Array.isArray(studentIds) && studentIds.length > 0 ? studentIds : null
  });
  if (error) throw error;
  return data;
}

export async function preflightSgCorrectionPosting({ classRecordId, postedGradeRows }) {
  if (!classRecordId) throw new Error('A class record is required to preflight SG corrections.');
  const { data, error } = await supabase.rpc('preflight_sg_correction_posting', {
    p_class_record_id: classRecordId,
    p_posted_grade_rows: ensureArray(postedGradeRows)
  });
  if (error) throw error;
  return data;
}

export async function applyAdminGradeOverride({
  postedGradeId,
  newComputedGrade,
  newEffectiveGrade,
  newRemarks,
  reason
}) {
  if (!postedGradeId) throw new Error('A posted SG is required for an administrative override.');
  const requestFingerprint = stableFingerprint({
    newComputedGrade: Number(newComputedGrade),
    newEffectiveGrade: Number(newEffectiveGrade),
    newRemarks: String(newRemarks || '').trim().toLowerCase(),
    reason: String(reason || '').trim()
  });
  const { key, operationId } = getOrCreateOperationId(
    postedGradeId,
    `admin_override:${requestFingerprint}`
  );
  const { data, error } = await supabase.rpc('apply_admin_grade_override_v3', {
    p_operation_id: operationId,
    p_posted_grade_id: postedGradeId,
    p_new_computed_grade: newComputedGrade,
    p_new_effective_grade: newEffectiveGrade,
    p_new_remarks: newRemarks,
    p_reason: reason
  });
  if (error) throw error;
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  return data;
}

// --- Dean acknowledgement of a Registrar override --------------------------
//
// The override takes effect immediately and the Dean cannot reverse it. What
// they can do is put their name on it, or refuse to. See
// 20261102123111_dean_acknowledges_registrar_overrides.sql for why that is a
// record rather than a gate.

/**
 * Overrides awaiting, or carrying, a Dean's decision.
 *
 * RLS decides the scope: a Dean sees their own college's, the Registrar sees
 * the ones they applied. The same call therefore serves both screens, which is
 * what keeps the two from reporting different numbers.
 */
export async function fetchGradeOverridesForReview({ pendingOnly = false } = {}) {
  let query = supabase
    .from('admin_grade_override_operations')
    .select(`
      operation_id,
      posted_grade_id,
      actor_id,
      result,
      committed_at,
      acknowledgement_state,
      acknowledged_by,
      acknowledged_at,
      acknowledgement_note,
      posted_grades (
        posted_grade_id,
        student_id,
        class_record_id,
        computed_grade,
        effective_grade,
        remarks,
        class_records ( sections (name), subjects (code, name) ),
        users:student_id ( first_name, last_name, user_number )
      )
    `)
    .order('committed_at', { ascending: false });

  if (pendingOnly) query = query.eq('acknowledgement_state', 'pending');

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const grade = row.posted_grades || {};
    const student = grade.users || {};
    const klass = grade.class_records || {};
    return {
      operationId: row.operation_id,
      postedGradeId: row.posted_grade_id,
      actorId: row.actor_id,
      committedAt: row.committed_at,
      state: row.acknowledgement_state,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
      note: row.acknowledgement_note || '',
      studentName: [student.last_name, student.first_name].filter(Boolean).join(', '),
      studentNumber: student.user_number || '',
      subjectCode: klass.subjects?.code || '',
      subjectName: klass.subjects?.name || '',
      sectionName: klass.sections?.name || '',
      classRecordId: grade.class_record_id || null,
      // The before/after the Dean is actually being asked to judge. Written by
      // the RPC at override time, so it reflects what was replaced rather than
      // whatever the row holds now.
      previous: {
        computed: row.result?.previous_computed_grade ?? null,
        effective: row.result?.previous_effective_grade ?? null,
        remark: row.result?.previous_remark ?? null
      },
      next: {
        computed: row.result?.new_computed_grade ?? null,
        effective: row.result?.new_effective_grade ?? null,
        remark: row.result?.new_remark ?? null
      }
    };
  });
}

/** How many overrides in the caller's scope still have nobody's name on them. */
export async function countUnacknowledgedOverrides() {
  const { count, error } = await supabase
    .from('admin_grade_override_operations')
    .select('operation_id', { count: 'exact', head: true })
    .eq('acknowledgement_state', 'pending');
  if (error) throw error;
  return count || 0;
}

/**
 * Record the Dean's decision. `state` is 'acknowledged' or 'queried'; a query
 * needs a note, and the database refuses one without it.
 */
export async function acknowledgeGradeOverride({ operationId, state, note = '' }) {
  const { data, error } = await supabase.rpc('acknowledge_grade_override', {
    p_operation_id: operationId,
    p_state: state,
    p_note: note || null
  });
  if (error) throw new Error(error.message || 'That decision could not be saved.');
  return data;
}
