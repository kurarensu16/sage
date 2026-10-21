const sameNumber = (left, right) => (
  Number.isFinite(Number(left))
  && Number.isFinite(Number(right))
  && Number(left) === Number(right)
);

const sameGradeValues = (left, right) => (
  sameNumber(left.computed_grade, right.computed_grade)
  && sameNumber(left.effective_grade, right.effective_grade)
  && String(left.remarks || '') === String(right.remarks || '')
);

const requestMatchesPostedGrade = (request, postedGrade) => (
  request?.status === 'approved'
  && Boolean(postedGrade?.posted_grade_id)
  && request.posted_grade_id === postedGrade.posted_grade_id
);

const hasExactProposal = (request) => (
  request?.proposed_computed_grade !== null
  && request?.proposed_computed_grade !== undefined
  && request?.proposed_effective_grade !== null
  && request?.proposed_effective_grade !== undefined
  && Boolean(request?.proposed_remark)
);

const applyProposal = (row, request) => ({
  ...row,
  computed_grade: Number(request.proposed_computed_grade),
  effective_grade: Number(request.proposed_effective_grade),
  remarks: request.proposed_remark,
  correction_request_id: request.request_id
});

/**
 * Builds the SG payload that can be safely sent to the atomic posting RPC.
 *
 * A dean approval is tied to one existing posted-grade ID. When that exact
 * request is approved, its exact proposed values replace client recomputation
 * for that student. Every other changed official SG remains a hard failure.
 */
export function planSgCorrectionPosting({
  candidateRows = [],
  existingPostedGrades = [],
  approvedRequests = [],
  studentNames = {}
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
  const postRows = candidateRows.map(candidate => {
    const existing = existingByStudent.get(candidate.student_id);
    if (!existing) return candidate;

    const request = requestByPostedGradeId.get(existing.posted_grade_id);
    const row = requestMatchesPostedGrade(request, existing) && hasExactProposal(request)
      ? applyProposal(candidate, request)
      : candidate;
    const changed = !sameGradeValues(existing, row);

    if (!changed) return row;

    changedStudentIds.push(candidate.student_id);
    if (requestMatchesPostedGrade(request, existing) && hasExactProposal(request)) {
      requestIds.push(request.request_id);
      return row;
    }

    violations.push({
      studentId: candidate.student_id,
      studentName: studentNames[candidate.student_id] || candidate.student_id,
      reason: request
        ? 'The approved correction does not contain exact final SG, GWA, and standing values.'
        : 'No approved, unused correction request matches this official SG.'
    });
    return row;
  });

  return {
    postRows,
    violations,
    changedStudentIds,
    requestIds
  };
}

export function requireAuthorizedSgCorrectionPlan(plan) {
  if (!plan?.violations?.length) return;
  const details = plan.violations
    .map(item => item.studentName + ': ' + item.reason)
    .join(' ');
  throw new Error('Official SG update blocked. ' + details);
}
