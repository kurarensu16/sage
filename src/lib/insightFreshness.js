const normalizeEvidence = (value) => {
  if (Array.isArray(value)) {
    return value
      .map(normalizeEvidence)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((normalized, key) => {
        normalized[key] = normalizeEvidence(value[key]);
        return normalized;
      }, {});
  }

  return value ?? null;
};

/**
 * Create a stable, versioned fingerprint for the evidence used by an AI insight.
 * This is a cache-invalidation key, not a security or integrity signature.
 */
export function createInsightEvidenceFingerprint(evidence) {
  const serialized = JSON.stringify(normalizeEvidence(evidence));
  let hash = 2166136261;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `insight-evidence-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildStudentInsightEvidence({
  postedGrades = [],
  attendance = [],
  activities = [],
  activityScores = [],
  termScores = [],
  gradingColumns = [],
  evaluations = [],
} = {}) {
  return {
    postedGrades: postedGrades.map(item => ({
      id: item.posted_grade_id,
      classRecordId: item.class_record_id,
      gradePeriod: item.grade_period,
      gradeMilestone: item.grade_milestone,
      computedGrade: item.computed_grade,
      effectiveGrade: item.effective_grade,
      remarks: item.remarks,
      postedAt: item.posted_at,
      correctionRequestId: item.last_correction_request_id,
      formulaSnapshot: item.grading_formula_snapshot,
    })),
    attendance: attendance.map(item => ({
      id: item.attendance_id,
      classRecordId: item.class_record_id,
      date: item.date,
      status: item.status,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    activities: activities.map(item => ({
      id: item.activity_id,
      classRecordId: item.class_record_id,
      term: item.term,
      maxScore: item.max_score,
      status: item.status,
      releaseStatus: item.release_status,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    activityScores: activityScores.map(item => ({
      id: item.score_id,
      activityId: item.activity_id,
      score: item.score,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    termScores,
    gradingColumns,
    evaluations: evaluations.map(item => ({
      id: item.evaluation_id,
      classRecordId: item.class_record_id,
      term: item.term,
      status: item.status,
      sharedAcademicFeedback: item.shared_academic_feedback,
      advisingPlan: item.advising_plan,
      baselineSnapshot: item.baseline_snapshot,
      followupSnapshot: item.followup_snapshot,
      publishedAt: item.published_to_student_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
  };
}

export function getFreshInsightText(entry, evidenceFingerprint) {
  if (!entry || !evidenceFingerprint || typeof entry === 'string') return null;
  return entry.evidenceFingerprint === evidenceFingerprint && typeof entry.text === 'string'
    ? entry.text
    : null;
}
