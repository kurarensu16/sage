import { supabase } from './supabase';

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
