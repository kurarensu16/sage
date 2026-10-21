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

// Maritime: approved correction wins over client recomputation and becomes
// the exact final payload that the DB trigger can consume.
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
assert.equal(maritimePlan.postRows[0].computed_grade, 80);
assert.equal(maritimePlan.postRows[0].effective_grade, 2.5);
assert.equal(maritimePlan.postRows[0].remarks, 'passed');
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
assert.equal(itPlan.postRows[0].computed_grade, 80);

// No approved request: a changed official SG stays blocked.
const noRequestPlan = planSgCorrectionPosting({
  candidateRows: [candidate(maritimeStudent, 'posted-maritime', 80, 2.5, 'passed')],
  existingPostedGrades: [existingMaritime],
  approvedRequests: [],
  studentNames: { [maritimeStudent]: 'Abad, Joshua' }
});
assert.equal(noRequestPlan.violations.length, 1);
assert.throws(() => requireAuthorizedSgCorrectionPlan(noRequestPlan), /Abad, Joshua/);

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
assert.equal(usedRequestPlan.violations.length, 1);

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
assert.equal(wrongClassOrTermPlan.violations.length, 1);

console.log('SG correction posting verification passed for Maritime and IT fixtures.');
