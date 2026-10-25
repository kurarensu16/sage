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
