import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveOfficialGradeState,
  toDisplayRemark
} from '../src/lib/academicPolicy.js';
import { planSgCorrectionPosting } from '../src/lib/sgCorrectionPosting.js';

const foundation = readFileSync(
  new URL('../supabase/migrations/20261022120000_grade_posting_p0_foundation.sql', import.meta.url),
  'utf8'
);
const transaction = readFileSync(
  new URL('../supabase/migrations/20261022121000_server_authoritative_grade_posting.sql', import.meta.url),
  'utf8'
);
const sgBasisLock = readFileSync(
  new URL('../supabase/migrations/20261023073500_enforce_sg_basis_lock.sql', import.meta.url),
  'utf8'
);
const studentRow = readFileSync(new URL('../src/components/StudentRow.jsx', import.meta.url), 'utf8');
const scoreInput = readFileSync(new URL('../src/pages/faculty/ScoreInput.jsx', import.meta.url), 'utf8');

const assertPlpgsqlVariablesDeclared = (source, label) => {
  source.split(/(?=CREATE OR REPLACE FUNCTION)/g).forEach(block => {
    const functionName = block.match(/^CREATE OR REPLACE FUNCTION\s+([^\s(]+)/im)?.[1];
    if (!functionName) return;
    const declarationBlock = block.match(/\bDECLARE\b([\s\S]*?)\bBEGIN\b/i)?.[1] || '';
    const declared = new Set(declarationBlock.match(/\bv_[a-zA-Z0-9_]+\b/g) || []);
    const referenced = new Set(block.match(/\bv_[a-zA-Z0-9_]+\b/g) || []);
    const missing = [...referenced].filter(variable => !declared.has(variable));
    assert.deepEqual(missing, [], `${label} ${functionName} has undeclared PL/pgSQL variables`);
  });
};

assertPlpgsqlVariablesDeclared(foundation, 'foundation');
assertPlpgsqlVariablesDeclared(transaction, 'transaction');
assertPlpgsqlVariablesDeclared(sgBasisLock, 'SG basis lock');
assert.doesNotMatch(
  transaction,
  /\bIS\s+DISTINCT\s+FROM\s+CASE\b/i,
  'Parenthesize or precompute CASE expressions used with IS DISTINCT FROM in PL/pgSQL IF conditions.'
);

// Official exceptional remarks are never collapsed back to numeric pass/fail.
assert.equal(toDisplayRemark('incomplete'), 'Incomplete (INC)');
assert.deepEqual(
  ['passed', 'failed', 'incomplete', 'fda', 'dropped'].map(remarks => {
    const state = resolveOfficialGradeState({ computed_grade: 86, effective_grade: 2, remarks });
    return [remarks, state.displayRemark, state.isPassing, state.isFailing];
  }),
  [
    ['passed', 'Passed', true, false],
    ['failed', 'Failed', false, true],
    ['incomplete', 'Incomplete (INC)', false, false],
    ['fda', 'FDA', false, true],
    ['dropped', 'Dropped', false, false]
  ]
);

// A drifted preview cannot overwrite unrelated official SG rows. The client
// keeps a full roster; the server preserves rows without their own approval.
const preserved = planSgCorrectionPosting({
  candidateRows: [{
    class_record_id: 'class-1', student_id: 'student-1', grade_period: 'semestral_grade',
    computed_grade: 90, effective_grade: 1.5, remarks: 'passed'
  }],
  existingPostedGrades: [{
    posted_grade_id: 'posted-1', student_id: 'student-1',
    computed_grade: 80, effective_grade: 2.5, remarks: 'passed'
  }],
  approvedRequests: []
});
assert.equal(preserved.violations.length, 0);
assert.equal(preserved.postRows.length, 1);

// Static release-contract checks make accidental removal of a P0 boundary fail
// in CI even when a local PostgreSQL instance is unavailable.
[
  'CREATE TABLE IF NOT EXISTS public.posted_grade_revisions',
  'CREATE TABLE IF NOT EXISTS public.admin_grade_override_operations',
  'CREATE OR REPLACE FUNCTION public.advance_posted_grade_revision',
  'CREATE OR REPLACE FUNCTION public.aspire_calculate_student_grade',
  'MR and TFR intentionally remain faculty-revisable',
  'CREATE TRIGGER trg_protect_locked_sg_term_scores',
  'CREATE TRIGGER trg_protect_locked_sg_activity_scores',
  'CREATE TRIGGER trg_protect_locked_sg_attendance',
  'CREATE TRIGGER trg_protect_posted_class_grade_identity'
].forEach(fragment => assert.ok(foundation.includes(fragment), `Missing P0 foundation: ${fragment}`));

[
  'CREATE OR REPLACE FUNCTION public.post_grade_milestone_v2',
  'CREATE OR REPLACE FUNCTION public.reject_unstaged_sg_score_correction',
  'Posting is blocked until the payload contains the complete active roster.',
  'Deliberately leave posted_grades.is_locked = TRUE.',
  'Official SG score inputs are locked.',
  'MR and TFR are final once the official SG is posted.',
  "calculation_engine_version', 'server-v1'",
  'INSERT INTO public.grade_posting_operations',
  'request_hash',
  'projection_hash',
  'CREATE OR REPLACE FUNCTION public.apply_admin_grade_override_v2',
  'INSERT INTO public.admin_grade_override_operations',
  'INSERT INTO public.notifications',
  'Select a grade from the institutional transmutation ladder.',
  'a browser payload from granting a grace pass or suppressing FDA'
].forEach(fragment => assert.ok(transaction.includes(fragment), `Missing P0 transaction boundary: ${fragment}`));

assert.ok(!transaction.includes('SET is_locked = FALSE'), 'Dean approval must not unlock an official SG row.');
assert.ok(
  sgBasisLock.includes("grade.grade_period::TEXT = 'semestral_grade'")
    && !sgBasisLock.includes('AND COALESCE(grade.is_locked, TRUE)'),
  'An official SG must lock its score basis regardless of a legacy is_locked flag.'
);
assert.ok(
  studentRow.includes('if (isLocked) {')
    && studentRow.includes('editVersionRef.current === savedVersionRef.current'),
  'Locked or unchanged student rows must not issue score autosaves.'
);
assert.ok(
  scoreInput.includes('locksMap[row.student_id] = true')
    && scoreInput.includes('const useDbData = hasOfficialSg ||')
    && scoreInput.includes("const isLocked = postedMilestones.includes('Semestral Grade')")
    && scoreInput.includes('if (archivedReadOnly || isLocked)')
    && scoreInput.includes('disabled={savingScores || students.length === 0 || isLocked}'),
  'Official SG rows must be read-only, ignore stale drafts, and block bulk score saves.'
);

console.log('Verified P0 grade-posting boundaries, official remark preservation, and correction isolation.');
