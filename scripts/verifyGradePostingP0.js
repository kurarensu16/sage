import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveOfficialGradeState,
  toDisplayRemark
} from '../src/lib/academicPolicy.js';
import { planSgCorrectionPosting } from '../src/lib/sgCorrectionPosting.js';
import { getGradePeriodSequenceBlock } from '../src/lib/gradeMilestones.js';

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
const stagedCorrections = readFileSync(
  new URL('../supabase/migrations/20261023211000_staged_sg_score_corrections.sql', import.meta.url),
  'utf8'
);
const correctedMilestones = readFileSync(
  new URL('../supabase/migrations/20261024093000_cascade_corrected_grade_milestones.sql', import.meta.url),
  'utf8'
);
const gradingPeriodSequence = readFileSync(
  new URL('../supabase/migrations/20261025130000_grading_period_sequence_and_backfill.sql', import.meta.url),
  'utf8'
);
const verifiedLegacyPeriods = readFileSync(
  new URL('../supabase/migrations/20261025140500_reconstruct_verified_legacy_periods.sql', import.meta.url),
  'utf8'
);
const studentRow = readFileSync(new URL('../src/components/StudentRow.jsx', import.meta.url), 'utf8');
const gradeComputationPreview = readFileSync(new URL('../src/pages/faculty/GradeComputationPreview.jsx', import.meta.url), 'utf8');
const scoreInput = readFileSync(new URL('../src/pages/faculty/ScoreInput.jsx', import.meta.url), 'utf8');
const postedGradesView = readFileSync(new URL('../src/pages/faculty/PostedGradesView.jsx', import.meta.url), 'utf8');
const facultyNotifications = readFileSync(new URL('../src/pages/faculty/Notifications.jsx', import.meta.url), 'utf8');
const studentGradeDetail = readFileSync(new URL('../src/pages/student/MyGradesDetail.jsx', import.meta.url), 'utf8');
const deanCorrections = readFileSync(new URL('../src/pages/dean/GradeChangeRequests.jsx', import.meta.url), 'utf8');
// The admin/registrar role split moved grade override to the Registrar; the
// Admin portal is accounts and system maintenance only.
const adminOverride = readFileSync(new URL('../src/pages/registrar/GradeOverride.jsx', import.meta.url), 'utf8');

const assertPlpgsqlVariablesDeclared = (source, label) => {
  source.split(/(?=CREATE OR REPLACE FUNCTION)/g).forEach(block => {
    const functionName = block.match(/^CREATE OR REPLACE FUNCTION\s+([^\s(]+)/im)?.[1];
    if (!functionName) return;
    // The final CREATE FUNCTION block can be followed by a DO migration block.
    // Limit variable analysis to the function's own dollar-quoted body so the
    // verifier does not attribute later DO-block variables to that function.
    const functionBlock = block.match(/^[\s\S]*?\$\$;/)?.[0] || block;
    const declarationBlock = functionBlock.match(/\bDECLARE\b([\s\S]*?)\bBEGIN\b/i)?.[1] || '';
    const declared = new Set(declarationBlock.match(/\bv_[a-zA-Z0-9_]+\b/g) || []);
    const referenced = new Set(functionBlock.match(/\bv_[a-zA-Z0-9_]+\b/g) || []);
    const missing = [...referenced].filter(variable => !declared.has(variable));
    assert.deepEqual(missing, [], `${label} ${functionName} has undeclared PL/pgSQL variables`);
  });
};

assertPlpgsqlVariablesDeclared(foundation, 'foundation');
assertPlpgsqlVariablesDeclared(transaction, 'transaction');
assertPlpgsqlVariablesDeclared(sgBasisLock, 'SG basis lock');
assertPlpgsqlVariablesDeclared(stagedCorrections, 'staged SG corrections');
assertPlpgsqlVariablesDeclared(correctedMilestones, 'corrected milestones');
assertPlpgsqlVariablesDeclared(gradingPeriodSequence, 'grading-period sequence');
assert.doesNotMatch(
  transaction,
  /\bIS\s+DISTINCT\s+FROM\s+CASE\b/i,
  'Parenthesize or precompute CASE expressions used with IS DISTINCT FROM in PL/pgSQL IF conditions.'
);

// MR has no predecessor. TFR requires MR, and SG requires both MR and TFR.
// Re-posting MR/TFR remains valid before SG because existing coverage does not
// block the same period; the official SG lock is enforced separately.
assert.equal(getGradePeriodSequenceBlock('midterm', []), null);
assert.match(getGradePeriodSequenceBlock('tfr', []), /Midterm Rating/);
assert.equal(getGradePeriodSequenceBlock('midterm', ['Midterm Rating']), null);
assert.equal(getGradePeriodSequenceBlock('tfr', ['Midterm Rating']), null);
assert.match(
  getGradePeriodSequenceBlock('semestral', ['Midterm Rating']),
  /Tentative Final Rating/
);
assert.equal(
  getGradePeriodSequenceBlock('semestral', ['Midterm Rating', 'Tentative Final Rating']),
  null
);

// These used to match the literal `disabled={...}` string, which made them fail
// the moment a NEW correct gate was added -- mrFinalized broke all four on
// 2026-10-31 while the behaviour they guard was fine. Anchored on the rule
// instead: each posting control must carry its own finalized gate, and the two
// later milestones must carry their sequence block. The spelling may change.
function postingControl(source, label, trigger) {
  const pattern = new RegExp(
    `disabled=\\{[^}]*\\}[\\s\\S]{0,400}?onClick=\\{\\(\\) => ${trigger}\\}`
  );
  const match = source.match(pattern);
  assert.ok(match, `${label}: the posting control was not found at all.`);
  return match[0];
}

const previewMr = postingControl(gradeComputationPreview, 'Grade preview MR', "computeChangedStudents\\('midterm'\\)");
assert.match(previewMr, /mrFinalized/, 'Grade preview must refuse MR once its consultation is finalized.');

const previewTfr = postingControl(gradeComputationPreview, 'Grade preview TFR', "computeChangedStudents\\('tfr'\\)");
assert.match(previewTfr, /tfrFinalized/, 'Grade preview must refuse TFR once its consultation is finalized.');
assert.match(previewTfr, /getGradePeriodSequenceBlock\('tfr', lockedMilestones\)/, 'Grade preview must require MR before TFR.');

// Posting the SG IS finalizing it: there is no consultation window to close, and
// post_grade_milestone_v2 preserves an existing SG row unless an approved
// request names it. The control must say so rather than offering "Update SG".
const previewSg = postingControl(gradeComputationPreview, 'Grade preview SG', "computeChangedStudents\\('semestral'\\)");
assert.match(previewSg, /sgFinalized/, 'Grade preview must refuse to re-post an official SG.');
assert.match(previewSg, /getGradePeriodSequenceBlock\('semestral', lockedMilestones\)/, 'Grade preview must require MR and TFR before SG.');
assert.doesNotMatch(gradeComputationPreview, /'Update SG'/, 'An official SG is final; the control must not offer to update it.');

const inputMr = postingControl(scoreInput, 'Score input MR', "setPendingPostMilestone\\('midterm'\\)");
assert.match(inputMr, /mrFinalized/, 'Score input must refuse MR once its consultation is finalized.');

const inputTfr = postingControl(scoreInput, 'Score input TFR', "setPendingPostMilestone\\('tfr'\\)");
assert.match(inputTfr, /tfrFinalized/, 'Score input must refuse TFR once its consultation is finalized.');
assert.match(inputTfr, /getGradePeriodSequenceBlock\('tfr', postedMilestones\)/, 'Score input must require MR before TFR.');

const inputSg = postingControl(scoreInput, 'Score input SG', "setPendingPostMilestone\\('semestral'\\)");
assert.match(inputSg, /sgFinalized/, 'Score input must refuse to re-post an official SG.');
assert.doesNotMatch(scoreInput, /'Update SG'/, 'An official SG is final; the control must not offer to update it.');

// Two doors, one rule. A gate on only one screen is the bug this pair exists for.
assert.match(
  scoreInput,
  /const sgFinalized = lockedMilestones\.includes\('Semestral Grade'\)/,
  'Score input must derive sgFinalized from the posted Semestral Grade.'
);
assert.match(
  gradeComputationPreview,
  /const sgFinalized = lockedMilestones\.includes\('Semestral Grade'\)/,
  'Grade preview must derive sgFinalized from the posted Semestral Grade.'
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

[
  'DROP TRIGGER IF EXISTS trg_reject_unstaged_sg_score_correction',
  'CREATE TABLE IF NOT EXISTS public.sg_correction_operations',
  "CHECK (correction_scope IN ('result_only', 'student_score_row', 'admin_override'))",
  'CREATE OR REPLACE FUNCTION public.aspire_apply_sg_score_changes',
  'CREATE OR REPLACE FUNCTION public.preview_sg_score_correction',
  'ASPIRE_SCORE_PREVIEW_ROLLBACK',
  'CREATE OR REPLACE FUNCTION public.apply_approved_sg_correction_v2',
  'ordinary SG reposting cannot consume it.',
  "set_config('aspire.sg_correction_request_id'",
  'applied_score_changes',
  'sg_correction_requested:',
  'sg_correction_reviewed:',
  'The final academic status must match the outcome reviewed and approved by the Dean.',
  'CREATE OR REPLACE FUNCTION public.apply_admin_grade_override_v3',
  'p_new_computed_grade NUMERIC',
  'The replacement SG, GWA, and academic status are not mutually consistent.'
].forEach(fragment => assert.ok(stagedCorrections.includes(fragment), `Missing staged correction control: ${fragment}`));

[
  'ADD COLUMN IF NOT EXISTS applied_milestone_changes',
  'CREATE OR REPLACE FUNCTION public.aspire_sync_corrected_progress_milestones',
  'v_mr_locks VARCHAR[]',
  "ARRAY['Prelim', 'Midterm', 'Midterm Rating']::VARCHAR[]",
  "ARRAY['Semi-Final', 'Final', 'Tentative Final Rating']::VARCHAR[]",
  "grade.grade_period::TEXT IN ('midterm_rating', 'tentative_final_rating', 'semestral_grade')",
  "NEW.grade_period::TEXT <> 'semestral_grade'",
  "set_config('aspire.sg_correction_milestone_changes'",
  "jsonb_build_array('midterm_rating', 'tentative_final_rating', 'semestral_grade')",
  "v_context = 'correction_repair'",
  "NEW.type = 'override_approved'",
  "COALESCE(NEW.link, '') LIKE '/faculty/%'",
  'never reapply scores'
].forEach(fragment => assert.ok(correctedMilestones.includes(fragment), `Missing corrected-milestone control: ${fragment}`));

[
  'CREATE OR REPLACE FUNCTION public.aspire_assert_grade_period_sequence',
  'Post the Midterm Rating (MR) for the complete active roster before posting TFR.',
  'Post MR and TFR for the complete active roster before finalizing SG.',
  "official_source IN ('faculty_post', 'dean_correction', 'admin_override', 'system_backfill')",
  'REVOKE EXECUTE ON FUNCTION public.post_grade_milestone_v2',
  'REVOKE EXECUTE ON FUNCTION public.post_grade_milestone_atomic',
  "v_sg.input_snapshot_hash IS DISTINCT FROM (v_projection->>'input_snapshot_hash')",
  "ARRAY['Prelim', 'Midterm', 'Midterm Rating']::VARCHAR[]",
  "ARRAY['Semi-Final', 'Final', 'Tentative Final Rating']::VARCHAR[]",
  "v_class.grading_formula_snapshot, 'system_backfill'",
  'CREATE TRIGGER trg_enforce_posted_grade_period_sequence',
  'Post-migration audit: this must return no rows'
].forEach(fragment => assert.ok(
  gradingPeriodSequence.includes(fragment),
  `Missing grading-period sequence control: ${fragment}`
));

[
  "v_class_id CONSTANT UUID := 'a44d7775-a0a2-429b-a5db-b3acd6440299'",
  "v_subject_code IS DISTINCT FROM 'NAV113'",
  "v_section_name IS DISTINCT FROM 'BSMARE-1B'",
  'v_sg_count <> CARDINALITY(v_student_ids)',
  "v_sg.input_snapshot_hash IS NOT NULL",
  "v_sg.computed_grade IS DISTINCT FROM NULLIF(v_projection->>'sg', '')::NUMERIC",
  "ARRAY['Prelim', 'Midterm', 'Midterm Rating']::VARCHAR[]",
  "ARRAY['Semi-Final', 'Final', 'Tentative Final Rating']::VARCHAR[]",
  "v_class.grading_formula_snapshot, 'system_backfill'",
  'NAV113 reconstruction did not produce a complete MR/TFR sequence',
  'Manual faculty/Dean review: stored SG differs from current score basis'
].forEach(fragment => assert.ok(
  verifiedLegacyPeriods.includes(fragment),
  `Missing verified legacy-period repair control: ${fragment}`
));

assert.doesNotMatch(
  correctedMilestones,
  /\|\|\s*[a-z_][a-z0-9_.]*->>/i,
  'Parenthesize JSON text extraction when concatenating URLs; otherwise PostgreSQL may select JSON concatenation.'
);

// Anchored on openApprovedCorrectionEditor rather than the button's label: the
// label has already been reworded once ("Edit Full Row & Apply" ->
// "Recalculate Official Result") and the function is the only way the editor
// opens, so it is what actually encodes the gate.
assert.ok(
  postedGradesView.includes('openApprovedCorrectionEditor')
    && postedGradesView.includes('{approvedCorrectionRequest && (')
    && postedGradesView.includes('handlePreviewApprovedCorrection')
    && postedGradesView.includes('handleApplyApprovedCorrection')
    && postedGradesView.includes('Recalculated MR %')
    && postedGradesView.includes('Recalculated TFR %')
    && postedGradesView.includes('Apply & Relock'),
  'Faculty must receive a student-scoped full-row editor only after Dean approval.'
);
// Phase 6 superseded RemarkOverrideRequests.jsx with dean/GradeChangeRequests.jsx.
// The scope wording moved into the confirmation dialog, so the anchors changed
// while the guarantee did not: the Dean is told whose grade, and which single
// milestone, the approval authorizes.
assert.ok(
  deanCorrections.includes('Approve this correction?')
    && deanCorrections.includes('will be able to correct '),
  'Dean review must describe the one-use student correction scope.'
);
assert.ok(
  adminOverride.includes('Replacement SG Percentage')
    && adminOverride.includes('Replacement Effective GWA')
    && adminOverride.includes('Replacement Academic Status'),
  'Administrative override must replace SG, GWA, and status together.'
);
assert.ok(
  facultyNotifications.includes('/faculty/postedgradesview?id=')
    && facultyNotifications.includes('payload: n.payload || {}'),
  'Dean approval notifications must retain their payload and deep-link to the exact faculty correction.'
);
// The per-milestone ternaries were refactored into the milestoneBadge() helper,
// so the anchors are now the helper and the two flags it is called with.
assert.ok(
  studentGradeDetail.includes('Included in corrected official SG')
    && studentGradeDetail.includes("if (isCorrected) return { text: 'Corrected'")
    && studentGradeDetail.includes('milestoneBadge(finalCalculations.mrIsCorrected')
    && studentGradeDetail.includes('milestoneBadge(finalCalculations.tfrIsCorrected'),
  'The student detail must distinguish corrected official milestones from their original posting.'
);

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
