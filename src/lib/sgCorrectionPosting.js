const requestMatchesPostedGrade = (request, postedGrade) => (
  request?.status === 'approved'
  && Boolean(postedGrade?.posted_grade_id)
  && request.posted_grade_id === postedGrade.posted_grade_id
);

const linkProposal = (row, request) => ({
  ...row,
  correction_request_id: request.request_id
});

export const hasActiveAdminGradeOverride = (postedGrade) => {
  if (!postedGrade?.override_by) return false;
  const overrideAt = Date.parse(postedGrade.override_at || '');
  const remarksSetAt = Date.parse(postedGrade.remarks_set_at || '');
  if (!Number.isFinite(overrideAt) || !Number.isFinite(remarksSetAt)) return true;
  return overrideAt >= remarksSetAt;
};

/**
 * Builds the SG payload that can be safely sent to the atomic posting RPC.
 *
 * A Dean approval is tied to one existing posted-grade ID. This client helper
 * only links that identity for presentation. It never substitutes proposed
 * official values: the posting RPC recalculates the score basis, applies an
 * exact matching approval, and preserves every unapproved official SG.
 */
export function planSgCorrectionPosting({
  candidateRows = [],
  existingPostedGrades = [],
  approvedRequests = []
}) {
  const existingByStudent = new Map(
    existingPostedGrades.map(row => [row.student_id, row])
  );
  const requestByPostedGradeId = new Map(
    approvedRequests
      .filter(request => request?.status === 'approved')
      .map(request => [request.posted_grade_id, request])
  );

  const violations = [];
  const changedStudentIds = [];
  const requestIds = [];
  const preservedStudentIds = [];
  const postRows = candidateRows.flatMap(candidate => {
    const existing = existingByStudent.get(candidate.student_id);
    if (!existing) return [candidate];

    const request = requestByPostedGradeId.get(existing.posted_grade_id);
    if (requestMatchesPostedGrade(request, existing)) {
      const row = linkProposal(candidate, request);
      changedStudentIds.push(candidate.student_id);
      requestIds.push(request.request_id);
      return [row];
    }

    // The database preserves this row even if the live client preview drifted.
    // Keeping it in the payload also lets the database enforce full-roster
    // completion when repairing an older partial posting.
    if (hasActiveAdminGradeOverride(existing)) preservedStudentIds.push(candidate.student_id);
    return [candidate];
  });

  return {
    postRows,
    violations,
    changedStudentIds,
    requestIds,
    preservedStudentIds
  };
}

export function requireAuthorizedSgCorrectionPlan(plan) {
  if (!plan?.violations?.length) return;
  const details = plan.violations
    .map(item => item.studentName + ': ' + item.reason)
    .join(' ');
  throw new Error('Official SG update blocked. ' + details);
}
