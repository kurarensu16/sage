const UUID_PATTERN = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;

const AUDIT_ENTITY_LABELS = {
  posted_grades: 'posted grade',
  remark_override_requests: 'SG correction request',
  grade_change_requests: 'grade change request',
  grade_computations: 'grade computation',
  grade_computation_components: 'grade component',
  class_records: 'class record',
  class_activities: 'class activity',
  class_join_requests: 'class join request',
  class_room_join_codes: 'class join code',
  student_term_scores: 'student term score',
  student_activity_scores: 'student activity score',
  attendance_records: 'attendance record',
  student_risk_evaluations: 'student risk evaluation',
  student_consultation_requests: 'student consultation request',
  users: 'user account',
  profiles: 'user profile',
  academic_terms: 'academic term',
  departments: 'college or department',
  programs: 'academic program',
  subjects: 'subject',
  sections: 'section',
  enrollments: 'enrollment',
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function formatAuditEntityForDisplay(entityType) {
  if (!entityType) return '';
  const normalizedType = String(entityType).trim().toLowerCase();
  return AUDIT_ENTITY_LABELS[normalizedType] || normalizedType.replaceAll('_', ' ');
}

const replaceEntityTypeWithLabel = (value, entityType) => {
  if (!value || !entityType) return value ? String(value) : '';
  return String(value).replace(
    new RegExp(`\\b${escapeRegExp(entityType)}\\b`, 'gi'),
    formatAuditEntityForDisplay(entityType),
  );
};

export function formatAuditActionForDisplay(action, entityType, message = '') {
  const normalizedAction = String(action || '').trim().toLowerCase();
  const normalizedMessage = String(message || '').toLowerCase();

  if (normalizedAction === 'grade posting') {
    if (normalizedMessage.includes('midterm rating') || normalizedMessage.includes('midterm grade')) {
      return 'Posted Midterm Rating';
    }
    if (normalizedMessage.includes('tentative final rating') || normalizedMessage.includes('final grade (tfr)')) {
      return 'Posted Tentative Final Rating';
    }
    if (normalizedMessage.includes('semestral grade')) return 'Posted Semestral Grade';
  }
  if (normalizedAction === 'remark override request') return 'Submitted SG Correction Request';
  if (normalizedAction === 'remark override approved') return 'Approved SG Correction Request';
  if (normalizedAction === 'remark override rejected') return 'Rejected SG Correction Request';
  if (normalizedAction === 'grade override') return 'Applied Administrative Grade Override';

  if (String(entityType || '').toLowerCase() === 'posted_grades' && normalizedAction.startsWith('updated')) {
    if (/override_at|override_by/.test(normalizedMessage)) return 'Applied Administrative Grade Override';
    if (/last_correction_request_id|official_source/.test(normalizedMessage)) {
      return 'Applied Semestral Grade Correction';
    }
  }

  return replaceEntityTypeWithLabel(action, entityType).replaceAll('_', ' ');
}

/**
 * Keep internal record identifiers in the audit ledger while replacing them
 * with understandable target terms in ordinary UI presentation.
 */
export function formatAuditMessageForDisplay(message, entityType) {
  if (!message) return '';
  const normalizedMessage = String(message).toLowerCase();
  if (String(entityType || '').toLowerCase() === 'posted_grades') {
    if (/override_at|override_by/.test(normalizedMessage)) {
      return 'Applied an administrative override to an official Semestral Grade (SG).';
    }
    if (normalizedMessage.includes('last_correction_request_id')) {
      return 'Applied a Dean-approved correction to an official Semestral Grade (SG).';
    }
  }

  const entityLabel = formatAuditEntityForDisplay(entityType);
  return replaceEntityTypeWithLabel(message, entityType)
    .replace(/\brecord\s+[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, 'record')
    .replace(UUID_PATTERN, entityLabel ? `${entityLabel} record` : 'target record')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
