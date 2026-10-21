import assert from 'node:assert/strict';
import XLSX from 'xlsx-js-style';
import { resolveGradingFormula } from '../src/lib/gradingMath.js';
import { buildRecordSheet, buildReportOfGrades } from '../src/lib/excelExport.js';

const formula = resolveGradingFormula([
  { name: 'Class Standing', weight: 50, max_score: 20, isMultiple: true, component_id: 'class-standing' },
  { name: 'Character', weight: 10, max_score: 100, semanticType: 'character' },
  { name: 'Term Exam', weight: 40, max_score: 40 }
]);

const gradingOptions = {
  formula,
  maxItems: Object.fromEntries(['Prelim', 'Midterm', 'Semi-Final', 'Final'].map(term => [term, {
    act1: 20, char: 100, exam: 40
  }])),
  activities: Object.fromEntries(['Prelim', 'Midterm', 'Semi-Final', 'Final'].map(term => [term, [
    { name: 'Activity 1', max: 20, component_id: 'class-standing' }
  ]]))
};

const scores = {
  Prelim: { act1: 18, char: 95, exam: 35 },
  Midterm: { act1: 19, char: 96, exam: 36 },
  'Semi-Final': { act1: 17, char: 94, exam: 34 },
  Final: { act1: 18, char: 95, exam: 35 }
};

const postedStudent = {
  id: 'posted', studentNo: '2026-0001', name: 'Posted, Student', periods: scores,
  postedSemestralGrade: { computed_grade: 93, effective_grade: 1.5, remarks: 'passed' }
};
const unpostedStudent = {
  id: 'unposted', studentNo: '2026-0002', name: 'Unposted, Student', periods: scores
};
const emptyStudent = {
  id: 'empty', studentNo: '2026-0003', name: 'Empty, Student', periods: {}
};
const metadata = { college: 'College of Maritime Education', course: 'BSMARE', section: 'BSMARE-1A' };

const record = XLSX.utils.aoa_to_sheet([]);
buildRecordSheet(record, metadata, [postedStudent, unpostedStudent, emptyStudent], true, gradingOptions);

assert.equal(record.BB9.v, 93, 'Posted SG must be written from posted_grades.');
assert.equal(record.BC9.v, 1.5, 'Posted GWA must be written from posted_grades.');
assert.equal(record.BD9.v, 'Passed', 'Posted remark must be written from posted_grades.');
assert.equal(record.BB10.v, '', 'An unposted student must have a blank SG.');
assert.equal(record.BC10.v, '', 'An unposted student must have a blank GWA.');
assert.equal(record.BD10.v, '', 'An unposted student must have blank remarks.');
assert.equal(record.AB10.v === '' || record.AB10.v > 0, true, 'An unposted student may retain a progress MR.');
assert.equal(record.BA10.v === '' || record.BA10.v > 0, true, 'An unposted student may retain a progress TFR.');
assert.equal(record.BB9.f, undefined, 'The official SG must not be an Excel formula.');
assert.equal(record.BC9.f, undefined, 'The official GWA must not be an Excel formula.');
assert.equal(record.AB11.v, '', 'A student with no scores must have a blank MR.');
assert.equal(record.BA11.v, '', 'A student with no scores must have a blank TFR.');
assert.equal(record.BB11.v, '', 'A student with no scores must have a blank SG.');
assert.equal(record.BC11.v, '', 'A student with no scores must have a blank GWA.');
assert.equal(record.BD11.v, '', 'A student with no scores must have blank remarks.');

const report = XLSX.utils.aoa_to_sheet([]);
buildReportOfGrades(report, metadata, [postedStudent], false, gradingOptions);
assert.equal(report.G18.f.includes("'Record Sheet'!BB9"), true, 'The Report of Grades SG column must reference the Record Sheet SG.');

console.log('Excel grade export verification passed.');
