import assert from 'node:assert/strict';
import {
  planSgCorrectionPosting,
  requireAuthorizedSgCorrectionPlan
} from '../src/lib/sgCorrectionPosting.js';

const maritimeStudent = 'maritime-student';
const itStudent = 'it-student';

const existingMaritime = {
  posted_grade_id: 'posted-maritime',
  student_id: maritimeStudent,
  computed_grade: 75,
  effective_grade: 5,
  remarks: 'failed'
};
const existingIt = {
  posted_grade_id: 'posted-it',
  student_id: itStudent,
  computed_grade: 67,
  effective_grade: 5,
  remarks: 'failed'
};

const candidate = (studentId, postedGradeId, computedGrade, effectiveGrade, remarks) => ({
  posted_grade_id: postedGradeId,
  class_record_id: 'class-' + studentId,
  student_id: studentId,
  grade_period: 'semestral_grade',
  computed_grade: computedGrade,
  effective_grade: effectiveGrade,
  remarks
});

const approved = (postedGradeId, studentId, values) => ({
  request_id: 'request-' + postedGradeId,
  posted_grade_id: postedGradeId,
  student_id: studentId,
  status: 'approved',
  ...values
});

// Maritime: the client links the approval but never substitutes official
// values. The authoritative RPC recalculates and applies the proposal.
const maritimePlan = planSgCorrectionPosting({
  candidateRows: [candidate(maritimeStudent, 'posted-maritime', 75, 5, 'failed')],
  existingPostedGrades: [existingMaritime],
  approvedRequests: [approved('posted-maritime', maritimeStudent, {
    proposed_computed_grade: 80,
    proposed_effective_grade: 2.5,
    proposed_remark: 'passed'
  })],
  studentNames: { [maritimeStudent]: 'Abad, Joshua' }
});
assert.deepEqual(maritimePlan.violations, []);
assert.equal(maritimePlan.postRows[0].computed_grade, 75);
assert.equal(maritimePlan.postRows[0].effective_grade, 5);
assert.equal(maritimePlan.postRows[0].remarks, 'failed');
assert.equal(maritimePlan.postRows[0].correction_request_id, 'request-posted-maritime');
assert.deepEqual(maritimePlan.requestIds, ['request-posted-maritime']);

// IT: the same department-agnostic contract permits another exact approval.
const itPlan = planSgCorrectionPosting({
  candidateRows: [candidate(itStudent, 'posted-it', 67, 5, 'failed')],
  existingPostedGrades: [existingIt],
  approvedRequests: [approved('posted-it', itStudent, {
    proposed_computed_grade: 80,
    proposed_effective_grade: 2.5,
    proposed_remark: 'passed'
  })],
  studentNames: { [itStudent]: 'Rivera, Tristan' }
});
assert.deepEqual(itPlan.violations, []);
assert.equal(itPlan.postRows[0].computed_grade, 67);

// No approved request: the row stays in the roster payload and the database
// preserves the existing official SG even when the client preview drifted.
const noRequestPlan = planSgCorrectionPosting({
  candidateRows: [candidate(maritimeStudent, 'posted-maritime', 80, 2.5, 'passed')],
  existingPostedGrades: [existingMaritime],
  approvedRequests: [],
  studentNames: { [maritimeStudent]: 'Abad, Joshua' }
});
assert.equal(noRequestPlan.violations.length, 0);
assert.equal(noRequestPlan.postRows.length, 1);

// Already applied is not an unused approval and cannot be reused.
const usedRequestPlan = planSgCorrectionPosting({
  candidateRows: [candidate(maritimeStudent, 'posted-maritime', 80, 2.5, 'passed')],
  existingPostedGrades: [existingMaritime],
  approvedRequests: [{
    ...approved('posted-maritime', maritimeStudent, {
      proposed_computed_grade: 80,
      proposed_effective_grade: 2.5,
      proposed_remark: 'passed'
    }),
    status: 'applied'
  }],
  studentNames: { [maritimeStudent]: 'Abad, Joshua' }
});
assert.equal(usedRequestPlan.violations.length, 0);
assert.equal(usedRequestPlan.postRows.length, 1);

// An approval linked to another posted-grade ID (therefore another class or
// term) cannot authorize this student's official SG.
const wrongClassOrTermPlan = planSgCorrectionPosting({
  candidateRows: [candidate(itStudent, 'posted-it', 80, 2.5, 'passed')],
  existingPostedGrades: [existingIt],
  approvedRequests: [approved('posted-other-class-or-term', itStudent, {
    proposed_computed_grade: 80,
    proposed_effective_grade: 2.5,
    proposed_remark: 'passed'
  })],
  studentNames: { [itStudent]: 'Rivera, Tristan' }
});
assert.equal(wrongClassOrTermPlan.violations.length, 0);

// An already-applied Admin Grade Override is an official audited snapshot. It
// stays in the full-roster payload but is identified as preserved. The server
// never recomputes it without its own approved request.
const adminOverriddenStudent = 'admin-overridden-student';
const adminOverriddenPostedGrade = {
  posted_grade_id: 'posted-admin-overridden',
  student_id: adminOverriddenStudent,
  computed_grade: 68,
  effective_grade: 3,
  remarks: 'passed',
  override_by: 'admin-user',
  override_at: '2026-10-22T10:00:00.000Z',
  remarks_set_at: '2026-10-21T10:00:00.000Z'
};
const adminOverridePlan = planSgCorrectionPosting({
  candidateRows: [
    candidate(itStudent, 'posted-it', 67, 5, 'failed'),
    candidate(adminOverriddenStudent, 'posted-admin-overridden', 68, 5, 'failed')
  ],
  existingPostedGrades: [existingIt, adminOverriddenPostedGrade],
  approvedRequests: [approved('posted-it', itStudent, {
    proposed_computed_grade: 80,
    proposed_effective_grade: 2.5,
    proposed_remark: 'passed'
  })],
  studentNames: {
    [itStudent]: 'Rivera, Tristan',
    [adminOverriddenStudent]: 'Pangan, Ramon'
  }
});
assert.deepEqual(adminOverridePlan.violations, []);
assert.deepEqual(adminOverridePlan.postRows.map(row => row.student_id), [itStudent, adminOverriddenStudent]);
assert.deepEqual(adminOverridePlan.preservedStudentIds, [adminOverriddenStudent]);

const approvedAdminOverrideRevision = planSgCorrectionPosting({
  candidateRows: [candidate(adminOverriddenStudent, 'posted-admin-overridden', 68, 5, 'failed')],
  existingPostedGrades: [adminOverriddenPostedGrade],
  approvedRequests: [approved('posted-admin-overridden', adminOverriddenStudent, {
    proposed_computed_grade: 80,
    proposed_effective_grade: 2.5,
    proposed_remark: 'passed'
  })]
});
assert.deepEqual(approvedAdminOverrideRevision.violations, []);
assert.equal(approvedAdminOverrideRevision.postRows[0].computed_grade, 68);
assert.deepEqual(approvedAdminOverrideRevision.preservedStudentIds, []);

const laterFacultyCorrection = planSgCorrectionPosting({
  candidateRows: [candidate(adminOverriddenStudent, 'posted-admin-overridden', 75, 3, 'passed')],
  existingPostedGrades: [{
    ...adminOverriddenPostedGrade,
    remarks_set_at: '2026-10-23T10:00:00.000Z'
  }],
  approvedRequests: []
});
assert.equal(laterFacultyCorrection.violations.length, 0);
assert.deepEqual(laterFacultyCorrection.preservedStudentIds, []);

assert.throws(() => requireAuthorizedSgCorrectionPlan({
  violations: [{ studentName: 'Fixture Student', reason: 'fixture violation' }]
}), /Fixture Student/);

console.log('SG correction posting verification passed for Maritime and IT fixtures.');
