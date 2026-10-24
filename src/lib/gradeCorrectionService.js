import { supabase } from './supabase';

export async function fetchApprovedSgCorrections(classRecordId) {
  if (!classRecordId) return [];
  const { data, error } = await supabase
    .from('remark_override_requests')
    .select(`
      request_id,
      posted_grade_id,
      student_id,
      status,
      proposed_computed_grade,
      proposed_effective_grade,
      proposed_remark,
      proposed_score_changes,
      correction_scope
    `)
    .eq('class_record_id', classRecordId)
    .eq('status', 'approved')
    // Full-row approvals are deliberately consumable only by
    // apply_approved_sg_correction_v2, never by ordinary SG reposting.
    .eq('correction_scope', 'result_only');
  if (error) throw error;
  return data || [];
}

export async function previewSgScoreCorrection({ classRecordId, studentId, scoreChanges = [] }) {
  if (!classRecordId || !studentId) throw new Error('A class and student are required to preview an SG correction.');
  const { data, error } = await supabase.rpc('preview_sg_score_correction', {
    p_class_record_id: classRecordId,
    p_student_id: studentId,
    p_score_changes: scoreChanges
  });
  if (error) throw error;
  return data;
}

export async function applyApprovedSgCorrection({ requestId, scoreChanges = [], proposedRemark = null }) {
  if (!requestId) throw new Error('An approved SG correction request is required.');
  const storageKey = `aspire:sg-correction-operation:${requestId}`;
  let operationId = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
  if (!operationId) {
    operationId = crypto.randomUUID();
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, operationId);
  }
  const { data, error } = await supabase.rpc('apply_approved_sg_correction_v2', {
    p_operation_id: operationId,
    p_request_id: requestId,
    p_score_changes: scoreChanges,
    p_proposed_remark: proposedRemark
  });
  if (error) throw error;
  if (typeof localStorage !== 'undefined') localStorage.removeItem(storageKey);
  return data;
}

export async function submitSgCorrectionRequest({
  classRecordId,
  studentId,
  proposedRemark,
  reason,
  evidenceUrl = null,
  proposedComputedGrade = null,
  proposedEffectiveGrade = null,
  proposedScoreChanges = []
}) {
  const { data, error } = await supabase.rpc('submit_sg_correction_request', {
    p_class_record_id: classRecordId,
    p_student_id: studentId,
    p_proposed_remark: proposedRemark,
    p_reason: reason,
    p_evidence_url: evidenceUrl,
    p_proposed_computed_grade: proposedComputedGrade,
    p_proposed_effective_grade: proposedEffectiveGrade,
    p_proposed_score_changes: proposedScoreChanges
  });
  if (error) throw error;
  return data;
}

export async function reviewSgCorrectionRequest({ requestId, decision, deanNote = null }) {
  const { data, error } = await supabase.rpc('review_sg_correction_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_dean_note: deanNote
  });
  if (error) throw error;
  return data;
}

export async function cancelSgCorrectionRequest({ requestId }) {
  const { data, error } = await supabase.rpc('cancel_sg_correction_request', {
    p_request_id: requestId
  });
  if (error) throw error;
  return data;
}
