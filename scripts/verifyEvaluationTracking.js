import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { countMissingActivities, manilaDate, needsEvaluation, referralEligibility, scoreOrNull, taskState } from '../src/lib/evaluationTracking.js';
import { calculateAcademicRisk, computeTentativeGradeDetails } from '../src/lib/riskEngine.js';
import { RISK_TIERS, resolveOfficialGwa } from '../src/lib/academicPolicy.js';
import { resolveGradingFormula } from '../src/lib/gradingMath.js';
import { findMostAdvancedPostedGrade, getCanonicalGradePeriod } from '../src/lib/gradeMilestones.js';

const cols = { Prelim: { act1: 20, act2: 20, act3: 0, act4: 20, act5: 20, act6: 20 } };
assert.equal(countMissingActivities([{ term: 'Prelim', act1: 0, act2: 0, act3: 0, act4: 0, act5: 0, act6: 0 }], cols), 5);
assert.equal(countMissingActivities([{ term: 'Prelim', act1: null, act2: '', act4: undefined }], cols), 0);
assert.equal(countMissingActivities([{ term: 'Prelim', act1: 0, act2: 12, act3: 0, act4: null, act5: '0' }], cols), 2);
const activities = [{ activity_id: 'a', term: 'Prelim', max_score: 20 }, { activity_id: 'b', term: 'Prelim', max_score: 0 }];
assert.equal(countMissingActivities([{ term: 'Prelim', act1: 0, act2: 0 }], cols, activities,
  [{ activity_id: 'a', score: 0 }, { activity_id: 'b', score: 0 }]), 1, 'Dynamic and legacy slots must not double count');
assert.equal(countMissingActivities([], cols, activities, [{ activity_id: 'a', score: null }]), 0);
assert.equal(scoreOrNull(''), null);
assert.equal(scoreOrNull(null), null);
assert.equal(scoreOrNull(0), 0);
assert.equal(scoreOrNull('  '), null);
assert.equal(scoreOrNull(false), null);
const blankRisk = calculateAcademicRisk({ currentGwa: null, zeroSubmissionsCount: 0 });
const ghostRisk = calculateAcademicRisk({ currentGwa: null, zeroSubmissionsCount: 5 });
assert.ok(ghostRisk.composite_score > blankRisk.composite_score, 'Explicit activity zeros must contribute to real risk calculation');

assert.equal(manilaDate(new Date('2026-10-05T15:59:59Z')), '2026-10-05');
assert.equal(manilaDate(new Date('2026-10-05T16:00:00Z')), '2026-10-06');
assert.equal(taskState({ due_date: '2026-10-05', completed: false }, '2026-10-06'), 'Overdue');
assert.equal(taskState({ due_date: '2026-10-06', completed: false }, '2026-10-06'), 'Pending');
assert.equal(taskState({ due_date: '2026-02-30', completed: false }, '2026-10-06'), 'Pending');
assert.equal(taskState({ due_date: '', completed: false }), 'Pending');
assert.equal(taskState({ due_date: '2026-10-05', completed: true }, '2026-10-06'), 'Reported complete');
const student = { user_id: 's', risk_score: RISK_TIERS.MODERATE.min };
assert.equal(needsEvaluation(student, [{ student_id: 's', term: 'Prelim' }], 'Midterm', RISK_TIERS.MODERATE.min), true);
assert.equal(needsEvaluation(student, [{ student_id: 's', term: 'Midterm' }], 'Midterm', RISK_TIERS.MODERATE.min), false);
assert.equal(needsEvaluation(student, [], '', RISK_TIERS.MODERATE.min), false);
assert.equal(referralEligibility({ status: 'submitted' }, { faculty_id: 'f', status: 'active' }, 'f'), '');
assert.equal(referralEligibility({ status: 'draft' }, { faculty_id: 'f', status: 'active' }, 'f'), 'Publish the evaluation first');
assert.equal(referralEligibility({ status: 'submitted' }, { faculty_id: 'f', status: 'active' }, 'f', true), 'History is read-only');

// Execute the actual roster against synthetic query results, using real grading
// and risk functions. This checks integration rather than repeating its logic.
const rosterFixtures = {
  class_records: [{ class_record_id: 'c', section_id: 'section', subject_id: 'subject', semester: 'First Semester' }],
  enrollments: ['ghost', 'blank'].map(user_id => ({ users: { user_id, section_id: 'section' } })),
  class_grading_columns: [{ term: 'Prelim', act1_max: 20, act2_max: 20, act3_max: 20, act4_max: 20, act5_max: 20, act6_max: 20, exam_max: 40 }],
  student_term_scores: [
    { student_id: 'ghost', term: 'Prelim', act1: 0, act2: 0, act3: 0, act4: 0, act5: 0, act6: 0, exam: 0 },
    { student_id: 'blank', term: 'Prelim', act1: null, act2: null, act3: null, act4: null, act5: null, act6: null, exam: null }
  ]
};
let failTable;
class RosterQuery {
  constructor(table) { this.table = table; }
  select() { return this; } eq() { return this; } in() { return this; }
  single() { this.one = true; return this; } maybeSingle() { return this.single(); }
  then(resolve, reject) {
    const rows = rosterFixtures[this.table] || [];
    return Promise.resolve({ data: this.one ? rows[0] : rows, error: this.table === failTable ? new Error('Synthetic roster read failure') : null }).then(resolve, reject);
  }
}
const rosterSource = fs.readFileSync(new URL('../src/lib/classRoomService.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '');
const actualRoster = vm.runInNewContext(`${rosterSource}; getClassPriorityRoster`, {
  supabase: { from: table => new RosterQuery(table) }, console: { error() {} },
  calculateAcademicRisk, computeTentativeGradeDetails, resolveGradingFormula,
  resolveOfficialGwa, findMostAdvancedPostedGrade, getCanonicalGradePeriod, countMissingActivities, scoreOrNull
});
let actual = await actualRoster('c', { throwOnError: true });
assert.equal(actual.find(row => row.user_id === 'ghost').risk_analysis.factors.missing_work.zero_submissions_count, 6);
assert.equal(actual.find(row => row.user_id === 'ghost').exam_average, 0);
assert.equal(actual.find(row => row.user_id === 'blank').risk_analysis.factors.missing_work.zero_submissions_count, 0);
assert.equal(actual.find(row => row.user_id === 'blank').current_gwa, null);
rosterFixtures.class_activities = [{ activity_id: 'a', term: 'Prelim', name: 'Configured activity', max_score: 20 }];
rosterFixtures.student_activity_scores = [{ student_id: 'ghost', activity_id: 'a', score: 0 }, { student_id: 'blank', activity_id: 'a', score: null }];
actual = await actualRoster('c', { throwOnError: true });
assert.equal(actual.find(row => row.user_id === 'ghost').risk_analysis.factors.missing_work.zero_submissions_count, 1);
assert.equal(actual.find(row => row.user_id === 'blank').current_gwa, null);
failTable = 'student_term_scores';
await assert.rejects(actualRoster('c', { throwOnError: true }), /Synthetic roster read failure/);

const emailSource = fs.readFileSync(new URL('../supabase/functions/send-email/index.ts', import.meta.url), 'utf8');
const emailJs = stripTypeScriptTypes(emailSource);
new vm.Script(emailJs.replace(/^import .*$/gm, ''));
const templateSource = emailJs.slice(emailJs.indexOf('function renderDeanReferralTemplate('), emailJs.indexOf('function renderStudentTemplate('));
const render = vm.runInNewContext(`${templateSource}; renderDeanReferralTemplate`, {
  escapeHtml: value => String(value).replace(/&/g, '&amp;'), getBaseHtmlTemplate: content => content
});
const mail = render({ evaluation_id: '00000000-0000-4000-8000-000000000001', reason: 'PRIVATE_REASON', student_name: 'PRIVATE_STUDENT', risk: 'PRIVATE_RISK' });
assert.ok(!JSON.stringify(mail).includes('PRIVATE_'));
assert.ok(mail.text.includes('/dean/atriskstudents?tab=discussion_queue&evaluation_id='));
console.log('Evaluation tracking checks passed: zeros/blanks, dynamic activity coverage, risk contribution, Manila dates, term coverage, eligibility, and referral email syntax/privacy.');
