import assert from 'node:assert/strict';
import {
  calculateSemestralGrade,
  calculateStoredTermRating,
  calculateWeightedTermRating,
  resolveGradingFormula,
  toEffectiveGradeForPosting,
  WEIGHT_TOLERANCE
} from '../src/lib/gradingMath.js';
import {
  computeStudentGwa,
  countAttendance,
  evaluateFdaDecision,
  getAttendanceFlags,
  getPersistentRemarkOverride,
  getHonorTier,
  getRemarks,
  resolveOfficialGwa,
  toDbRemark,
  toDisplayRemark,
  toGwaOrNull,
  buildTransmutationLadder,
  resolveAttendancePolicy,
  TRANSMUTATION_LADDER,
  ATTENDANCE
} from '../src/lib/academicPolicy.js';
import { calculateAcademicRisk } from '../src/lib/riskEngine.js';
import {
  GRADE_MILESTONES,
  collectPostedMilestoneCoverage,
  findMostAdvancedPostedGrade,
  findPostedTermGrade,
  getCanonicalGradePeriod,
  getGradePeriodSequenceBlock,
  getMilestonePostingPresentation,
  getPostedMilestoneCoverage,
  getRequiredTermsForPostingTarget,
  getUpdatedMilestoneLocks,
  isSummerClass,
  isTermCoveredByPostedMilestone
} from '../src/lib/gradeMilestones.js';
import { computeTentativeGradeDetails } from '../src/lib/riskEngine.js';
import { evaluateAcademicAdvising } from '../src/lib/advisingEngine.js';
import { collectBlankScoreReview, prepareReviewedBlankScores } from '../src/lib/gradeScoreReview.js';
import { OFFICIAL_DYCI_PRESETS } from '../src/lib/officialGradingPresets.js';
import { hasConsultationWindow, resolveMilestoneState } from '../src/lib/milestoneState.js';
import {
  REQUEST_STATUS, isOpenStatus, describeEvidenceFile, resolveFileType,
  evidenceObjectPath, correctionSignature, EVIDENCE_MAX_BYTES
} from '../src/lib/gradeChangeRules.js';

assert.equal(isTermCoveredByPostedMilestone('Prelim', ['Midterm Rating']), true);
assert.equal(isTermCoveredByPostedMilestone('Midterm', ['midterm_rating']), true);
assert.equal(isTermCoveredByPostedMilestone('Semi-Final', ['Tentative Final Rating']), true);
assert.equal(isTermCoveredByPostedMilestone('Final', ['tfr']), true);
assert.equal(isTermCoveredByPostedMilestone('Prelim', ['Tentative Final Rating']), false);
assert.equal(isTermCoveredByPostedMilestone('Final', ['Midterm Rating']), false);
assert.equal(isTermCoveredByPostedMilestone('Prelim', ['Semestral Grade']), true);
assert.equal(isTermCoveredByPostedMilestone('Final', ['sg']), true);
assert.equal(isSummerClass({ semester: 'Summer Term' }), true);
assert.equal(isSummerClass({ sections: { semester: 'summer' } }), true);
assert.equal(isSummerClass({ semester: '1st' }), false);
assert.deepEqual(getRequiredTermsForPostingTarget('semestral'), ['Prelim', 'Midterm', 'Semi-Final', 'Final']);
assert.deepEqual(getRequiredTermsForPostingTarget('semestral', { isSummer: true }), ['Midterm', 'Final']);
assert.equal(getMilestonePostingPresentation('tfr', { isSummer: true }).gradePeriod, GRADE_MILESTONES.TENTATIVE_FINAL_RATING);
assert.deepEqual(
  getUpdatedMilestoneLocks([], 'midterm', { isSummer: true }),
  ['Midterm', 'Midterm Rating'],
  'summer milestone locks must not introduce regular-semester periods'
);
assert.equal(getGradePeriodSequenceBlock('midterm', []), null);
assert.match(getGradePeriodSequenceBlock('tfr', []), /Midterm Rating/);
assert.match(getGradePeriodSequenceBlock('semestral', ['Midterm Rating']), /Tentative Final Rating/);
assert.equal(
  getGradePeriodSequenceBlock('semestral', ['Midterm Rating', 'Tentative Final Rating']),
  null,
  'SG must become available only after both prior grading periods are posted'
);

const periodDisplayRows = [
  { grade_period: 'midterm_rating', computed_grade: 63 },
  { grade_period: 'tentative_final_rating', computed_grade: 79 },
  { grade_period: 'semestral_grade', computed_grade: 81 },
  { grade_period: 'prelim', computed_grade: 74 },
  { grade_period: 'semi_final', computed_grade: 85 }
];
assert.equal(
  findPostedTermGrade(periodDisplayRows, 'Midterm'),
  null,
  'a posted MR must not replace the individual Midterm-period calculation'
);
assert.equal(
  findPostedTermGrade(periodDisplayRows, 'Final'),
  null,
  'a posted TFR or SG must not replace the individual Final-period calculation'
);
assert.equal(findPostedTermGrade(periodDisplayRows, 'Prelim')?.computed_grade, 74);
assert.equal(findPostedTermGrade(periodDisplayRows, 'Semi-Final')?.computed_grade, 85);

const blankReview = collectBlankScoreReview({
  targetMilestone: 'midterm',
  students: [{ id: 'student-1', name: 'Sample Student', student_id_number: 'S-001', periods: { Prelim: { quiz: null, exam: 30 } } }],
  requiredTerms: ['Prelim'],
  activities: { Prelim: [{ id: 'quiz', name: 'Quiz 1', max: 20 }] },
  hasCharacter: false,
  characterLabel: 'Character',
  examLabel: 'Exam',
  getScoreRecord: student => student.periods
});
assert.equal(blankReview.fieldCount, 1, 'blank-score review must distinguish NULL from a recorded zero');
const stagedReview = prepareReviewedBlankScores({
  review: blankReview,
  classRecordId: 'class-1',
  savedBy: 'faculty-1',
  activities: { Prelim: [{ id: 'quiz', name: 'Quiz 1', max: 20 }] },
  getScoreRecord: () => ({ Prelim: { quiz: null, exam: 30 } })
});
assert.equal(stagedReview.stagedRecords['student-1'].Prelim.quiz, 0);
assert.equal(stagedReview.termRows[0].act1, 0);

const pendingAdvisor = evaluateAcademicAdvising({
  courses: [{
    code: 'SAGE101',
    name: 'Sample Course',
    activities: [{ activity_id: 'activity-1', name: 'Quiz 1', term: 'Prelim', score: null, evidenceStatus: 'pending' }]
  }]
});
assert.equal(pendingAdvisor.signalType, 'pending_activities');
assert.equal(pendingAdvisor.evidence[0].value, 'Pending');
assert.deepEqual(
  getPostedMilestoneCoverage({ grade_period: GRADE_MILESTONES.TENTATIVE_FINAL_RATING }),
  ['Semi-Final', 'Final', 'Tentative Final Rating']
);
assert.deepEqual(
  collectPostedMilestoneCoverage([
    { grade_period: GRADE_MILESTONES.MIDTERM_RATING, is_locked: true },
    { grade_period: GRADE_MILESTONES.TENTATIVE_FINAL_RATING, is_locked: false }
  ], { lockedOnly: true }),
  ['Prelim', 'Midterm', 'Midterm Rating']
);

// Presets are consumed directly from the same shared module the admin "Apply Preset"
// UI uses — no local duplicate of the institutional values, and no hardcoded
// key/isolatedKey/isolatedExpected test-only fields (IMPLEMENTATION_CORRECTIONS item
// (k)). The "isolated" component under test is simply each template's first
// component, resolved generically after resolveGradingFormula assigns real keys.
const presets = OFFICIAL_DYCI_PRESETS;

presets.forEach(preset => {
  const formula = resolveGradingFormula(preset.components, { formulaAssigned: true });
  assert.equal(formula.ok, true, `${preset.name} should resolve`);

  const perfectScores = Object.fromEntries(formula.components.map(component => [
    component.key,
    component.isMultiple
      ? [{ score: component.maxScore, maxScore: component.maxScore }]
      : { score: component.maxScore, maxScore: component.maxScore }
  ]));
  assert.equal(
    calculateWeightedTermRating({ formula, componentScores: perfectScores }).rating,
    100,
    `${preset.name} should produce 100 for perfect scores`
  );

  const isolatedComponent = formula.components[0];
  const isolatedResult = calculateWeightedTermRating({
    formula,
    componentScores: {
      [isolatedComponent.key]: isolatedComponent.isMultiple
        ? [{ score: isolatedComponent.maxScore, maxScore: isolatedComponent.maxScore }]
        : { score: isolatedComponent.maxScore, maxScore: isolatedComponent.maxScore }
    }
  });
  assert.equal(
    isolatedResult.rating,
    isolatedComponent.weight,
    `${preset.name} should honor its configured component weight`
  );
  assert.equal(
    isolatedResult.encodedWeight,
    isolatedComponent.weight,
    `${preset.name} encodedWeight should match component weight`
  );
  assert.equal(
    isolatedResult.ratingOnEncoded,
    100,
    `${preset.name} ratingOnEncoded should be 100 for fully earned single component`
  );
  assert.equal(
    isolatedResult.isComplete,
    false,
    `${preset.name} single component should be incomplete`
  );

  if (formula.components.filter(component => component.isMultiple).length === 1) {
    const repeatable = formula.components.find(component => component.isMultiple);
    const character = formula.components.find(component => /character/i.test(component.name));
    const single = formula.components.find(component => !component.isMultiple && component !== character);
    const storedResult = calculateStoredTermRating({
      formula,
      activities: [{ id: `${repeatable.key}-activity`, name: 'Configured Activity', max: repeatable.maxScore }],
      termScores: {
        [`${repeatable.key}-activity`]: repeatable.maxScore,
        ...(character ? { char: character.maxScore } : {}),
        ...(single ? { exam: single.maxScore } : {})
      },
      maxItems: {
        ...(character ? { char: character.maxScore } : {}),
        ...(single ? { exam: single.maxScore } : {})
      }
    });
    assert.equal(storedResult.ok, true);
    assert.equal(storedResult.rating, 100, `${preset.name} should map current score-sheet storage correctly`);
  }
});

const legacy = resolveGradingFormula(null, { formulaAssigned: false });
assert.equal(legacy.ok, false);
assert.equal(legacy.source, 'invalid');
assert.match(legacy.error, /No grading template/i);

const invalidAssignedFormula = resolveGradingFormula([], { formulaAssigned: true });
assert.equal(invalidAssignedFormula.ok, false);
assert.equal(invalidAssignedFormula.source, 'invalid');

const healthTheory = resolveGradingFormula(presets[1].components, { formulaAssigned: true });
const halfPointFormula = resolveGradingFormula(presets[0].components, { formulaAssigned: true });
const halfPointTerm = calculateWeightedTermRating({
  formula: halfPointFormula,
  componentScores: {
    class_standing_formative: [{ score: 51, maxScore: 60 }],
    character_rating: { score: 90, maxScore: 100 },
    major_examination: { score: 35, maxScore: 40 }
  }
});
assert.equal(halfPointTerm.rawRating, 86.5, 'the shared component total must retain decimal precision');
assert.equal(halfPointTerm.rating, 87, 'the official term rating must round the shared total once');
const uuidActivityResult = calculateStoredTermRating({
  formula: healthTheory,
  activities: [{ id: 'activity-uuid', dbId: 'activity-uuid', name: 'Case Analysis', max: 20 }],
  termScores: { 'activity-uuid': 20 },
  maxItems: { exam: 100, char: 100 }
});
assert.equal(uuidActivityResult.ok, true);
assert.equal(uuidActivityResult.rating, 30, 'UUID-keyed activities must feed the configured Class Standing weight');

const rleFormula = resolveGradingFormula(presets[2].components.map((component, index) => ({
  ...component,
  component_id: `rle-component-${index + 1}`
})), { formulaAssigned: true });
const uncategorizedRle = calculateStoredTermRating({
  formula: rleFormula,
  activities: [{ id: 'rle-activity', name: 'Clinical Checklist', max: 100 }],
  termScores: { 'rle-activity': 90 },
  maxItems: { exam: 100 }
});
assert.equal(uncategorizedRle.ok, false, 'Uncategorized RLE activities must block calculation');

const categorizedRleActivities = rleFormula.components
  .filter(component => component.isMultiple)
  .map(component => ({
    id: `${component.key}-activity`,
    name: component.name,
    max: component.maxScore,
    componentId: component.componentId
  }));
const categorizedRle = calculateStoredTermRating({
  formula: rleFormula,
  activities: categorizedRleActivities,
  termScores: {
    ...Object.fromEntries(categorizedRleActivities.map(activity => [activity.id, activity.max])),
    exam: 100
  },
  maxItems: { exam: 100 }
});
assert.equal(categorizedRle.ok, true);
assert.equal(categorizedRle.rating, 100, 'Fully categorized RLE activities should calculate through the generic adapter');

const summer = calculateSemestralGrade({
  prelim: 50,
  midterm: 80,
  semiFinal: 40,
  final: 90,
  isSummer: true
});
assert.equal(summer.sg, 85, 'Summer calculation must ignore stray Prelim and Semi-Final values');

const correctedMilestoneExample = calculateSemestralGrade({
  prelim: 74,
  midterm: 71,
  semiFinal: 85,
  final: 90
});
assert.deepEqual(
  { mr: correctedMilestoneExample.mr, tfr: correctedMilestoneExample.tfr, sg: correctedMilestoneExample.sg },
  { mr: 73, tfr: 88, sg: 81 },
  'A corrected score row must cascade coherently through MR, TFR, and SG'
);
assert.equal(toGwaOrNull(correctedMilestoneExample.sg), 2.5, 'Corrected SG 81 must transmute to 2.50');

const tentativeHealth = computeTentativeGradeDetails({
  Prelim: { act1: 20, char_rating: 100, exam: 100 },
  Midterm: { act1: 20, char_rating: 100, exam: 100 }
}, {
  Prelim: { act1: 20, char: 100, exam: 100 },
  Midterm: { act1: 20, char: 100, exam: 100 }
}, {
  formula: healthTheory
});
assert.equal(tentativeHealth.termRatings.Prelim, 100, 'Risk analytics must honor configured formula weights');
assert.equal(tentativeHealth.gwa, 1, 'Risk analytics should transmute the shared semestral result');

const legacyFinal = {
  grade_period: 'final',
  locked_milestones: ['Tentative Final Rating']
};
assert.equal(
  getCanonicalGradePeriod(legacyFinal),
  GRADE_MILESTONES.TENTATIVE_FINAL_RATING,
  'Legacy final rows must use their lock metadata'
);
const advanced = findMostAdvancedPostedGrade([
  { grade_period: 'midterm_rating', computed_grade: 82 },
  { grade_period: 'tentative_final_rating', computed_grade: 84 },
  { grade_period: 'semestral_grade', computed_grade: 83 }
]);
assert.equal(advanced.grade_period, 'semestral_grade', 'Analytics must select one most-advanced grade per class');

assert.equal(toGwaOrNull(null), null, 'missing values must not become a failing GWA in write paths');
assert.equal(toEffectiveGradeForPosting(null), null, 'posting helper must preserve missing ratings');
assert.equal(resolveOfficialGwa({ computed_grade: 84 }).gwa, 2.25, 'raw stored ratings must be transmuted before use');
assert.equal(resolveOfficialGwa({ effective_grade: null, computed_grade: null }).gwa, null, 'missing grade rows must stay missing');
assert.equal(computeStudentGwa([{ gwa: 1 }, { gwa: 3, units: 9 }]).gwa, 2, 'official GWA is an unweighted subject mean');
assert.equal(getHonorTier(1.5, { subjectGrades: [2], units: 18 }).tier, 'Excellentia');
assert.equal(getHonorTier(1.5, { subjectGrades: [2.25], units: 18 }).isEligible, false);
assert.equal(getHonorTier(1.5, { subjectGrades: [2], units: 15 }).isEligible, false);
assert.deepEqual(countAttendance([{ status: 'Present' }, { status: 'Late' }, { status: 'Excused' }, { status: 'Absent' }]), { total: 4, absences: 1, attendanceRate: 75 });
assert.equal(getAttendanceFlags(4).isFda, true);
assert.equal(getAttendanceFlags(3).isFda, false);
assert.equal(calculateAcademicRisk({ currentGwa: 2.25 }).composite_score, 28, 'GWA 2.25 must reach the moderate risk band');
assert.equal(calculateAcademicRisk({ currentGwa: 4 }).composite_score, 55, 'failing GWA must be high risk without other factors');

// ── GWA risk step-discontinuity curve: full boundary pin set (Unify-Academic-Rules Step 10) ──
assert.equal(calculateAcademicRisk({ currentGwa: 2.00 }).composite_score, 0, 'GWA 2.00 sits at the honors-safe boundary (LOW)');
assert.equal(calculateAcademicRisk({ currentGwa: 2.01 }).composite_score, 25, 'crossing 2.00 is categorical: band opens at 25 (MODERATE)');
assert.equal(calculateAcademicRisk({ currentGwa: 2.50 }).composite_score, 30, 'GWA 2.50 mid-watch-zone pin');
assert.equal(calculateAcademicRisk({ currentGwa: 3.00 }).composite_score, 35, 'GWA 3.00 is the top of the watch zone (still MODERATE)');
assert.equal(calculateAcademicRisk({ currentGwa: 3.01 }).composite_score, 50, 'crossing 3.00 opens the failing zone at 50 (HIGH)');
assert.equal(calculateAcademicRisk({ currentGwa: 5.00 }).composite_score, 60, 'GWA 5.00 is the worst-case GWA-only score');

// ── Attendance / FDA risk factor zones (0-50 pts) ───────────────────────────────────────────
assert.equal(calculateAcademicRisk({ absenceCount: 0 }).composite_score, 0, '0 absences contributes no attendance risk');
assert.equal(calculateAcademicRisk({ absenceCount: 2 }).composite_score, 10, '2 absences is the early-warning zone (10 pts)');
assert.equal(calculateAcademicRisk({ absenceCount: 3 }).composite_score, 25, '3 absences approaches the FDA threshold (25 pts)');
assert.equal(calculateAcademicRisk({ absenceCount: 4 }).composite_score, 50, '4 absences triggers the FDA recommendation (50 pts, HIGH)');
assert.equal(getAttendanceFlags(4).isFda, true, 'FDA threshold is >= 4 unexcused absences');
assert.equal(getAttendanceFlags(2).isWarning, true, '2 absences crosses the early-warning flag');
assert.deepEqual(
  evaluateFdaDecision({ absences: 4, selected: false }),
  { ok: true, recommended: true, selected: false, effectiveGrade: null, error: null },
  'four absences must remain a recommendation until faculty explicitly selects FDA'
);
assert.equal(evaluateFdaDecision({ absences: 3, selected: true, reason: 'Reviewed' }).ok, false, 'FDA cannot be selected below the threshold');
assert.equal(evaluateFdaDecision({ absences: 4, selected: true, reason: '' }).ok, false, 'FDA requires a faculty reason');
assert.deepEqual(
  evaluateFdaDecision({ absences: 4, selected: true, reason: 'Attendance reviewed with the student.' }),
  { ok: true, recommended: true, selected: true, effectiveGrade: 5, error: null },
  'an attendance-supported, documented faculty decision may produce FDA'
);

// ── calculateWeightedTermRating: missingComponents field (completeness, not just isComplete) ──
{
  const partial = resolveGradingFormula(presets[0].components, { formulaAssigned: true });
  const examOnly = calculateWeightedTermRating({
    formula: partial,
    componentScores: { major_examination: { score: 40, maxScore: 40 } }
  });
  assert.equal(examOnly.isComplete, false, 'a formula with only one encoded component must be incomplete');
  assert.deepEqual(
    examOnly.missingComponents,
    ['Class Standing (Formative)', 'Character Rating'],
    'missingComponents must name every component with no encoded data'
  );
}

// ── calculateSemestralGrade: regular 4-term completeness & 'In Progress' remark ────────────
{
  const completeRegular = calculateSemestralGrade({ prelim: 90, midterm: 90, semiFinal: 90, final: 90 });
  assert.equal(completeRegular.termsExpected, 4, 'regular semester expects 4 terms');
  assert.equal(completeRegular.termsEncoded, 4);
  assert.equal(completeRegular.isComplete, true);
  assert.notEqual(completeRegular.remarks, 'In Progress', 'a fully-encoded semester must not read as In Progress');

  const incompleteRegular = calculateSemestralGrade({ prelim: 90, midterm: 90, semiFinal: 90, final: null });
  assert.equal(incompleteRegular.termsEncoded, 3);
  assert.equal(incompleteRegular.isComplete, false);
  assert.equal(incompleteRegular.remarks, 'In Progress', 'a missing Final must yield In Progress, never Passed/Failed');
}

// ── calculateSemestralGrade: summer 2-term completeness & 'In Progress' remark ─────────────
{
  const completeSummer = calculateSemestralGrade({ midterm: 90, final: 90, isSummer: true });
  assert.equal(completeSummer.termsExpected, 2, 'summer term expects only 2 terms');
  assert.equal(completeSummer.termsEncoded, 2);
  assert.equal(completeSummer.isComplete, true);

  const incompleteSummer = calculateSemestralGrade({ midterm: 90, final: null, isSummer: true });
  assert.equal(incompleteSummer.termsEncoded, 1);
  assert.equal(incompleteSummer.isComplete, false);
  assert.equal(incompleteSummer.remarks, 'In Progress', 'a missing summer Final must yield In Progress');
}

// ── WEIGHT_TOLERANCE: floating-point-safe total-weight validation ──────────────────────────
assert.equal(WEIGHT_TOLERANCE, 0.01);
{
  // 41.9 + 48.3 + 9.8 sums to 99.99999999999999 under IEEE 754 — must still resolve.
  const floatSafe = resolveGradingFormula([
    { name: 'A', weight: 41.9, max_score: 100 },
    { name: 'B', weight: 48.3, max_score: 100 },
    { name: 'C', weight: 9.8, max_score: 100 }
  ], { formulaAssigned: true });
  assert.equal(floatSafe.ok, true, 'a formula within WEIGHT_TOLERANCE of 100% must resolve despite float rounding');

  const genuinelyInvalid = resolveGradingFormula([
    { name: 'A', weight: 50, max_score: 100 },
    { name: 'B', weight: 40, max_score: 100 }
  ], { formulaAssigned: true });
  assert.equal(genuinelyInvalid.ok, false, 'a formula genuinely off by more than WEIGHT_TOLERANCE must still fail closed');
}

// ── President's List 18-unit floor applies unconditionally (no irregular-student exemption) ──
assert.equal(getHonorTier(1.5, { subjectGrades: [2], units: 18 }).isEligible, true, 'exactly 18 units must satisfy the floor');
assert.equal(getHonorTier(1.5, { subjectGrades: [2], units: 17 }).isEligible, false, '17 units must fail the floor regardless of enrollment type');

// ── Null-safe posting & remark vocabulary round-trips ───────────────────────────────────────
assert.equal(toEffectiveGradeForPosting(84), 2.25, 'a real rating must still transmute normally through the posting guard');
assert.equal(toEffectiveGradeForPosting(NaN), null, 'NaN must never be posted as a failing grade');
assert.equal(getPersistentRemarkOverride('passed'), '', 'ordinary pass remarks must be recalculated after score corrections');
assert.equal(getPersistentRemarkOverride('failed'), '', 'ordinary fail remarks must be recalculated after score corrections');
assert.equal(getPersistentRemarkOverride('incomplete'), 'INC', 'INC must remain an explicit exception');
assert.equal(getPersistentRemarkOverride('fda'), 'FDA', 'FDA must remain an explicit exception');
assert.equal(getRemarks({ gwa: 2, isComplete: false }), 'In Progress', 'incomplete must win over a passing gwa value');
assert.equal(getRemarks({ gwa: 3.00, isComplete: true }), 'Passed', 'the 3.00 passing cutoff is inclusive');
assert.equal(getRemarks({ gwa: 3.01, isComplete: true }), 'Failed');
assert.equal(toDbRemark('Passed'), 'passed');
assert.equal(toDisplayRemark('passed'), 'Passed');
assert.equal(toDisplayRemark('fda'), 'FDA');
assert.equal(toDisplayRemark('incomplete'), 'Incomplete (INC)');
assert.equal(toDisplayRemark('dropped'), 'Dropped');
assert.equal(toDisplayRemark('some_future_legacy_value'), 'some_future_legacy_value', 'unrecognized remarks must surface as-is, never collapse to Failed');

// ── Dynamic grading thresholds (Phase 3) ────────────────────────────────────
// The JS ladder must stay identical to aspire_transmute_grade(NUMERIC, NUMERIC)
// in 20261029054241_dynamic_grading_thresholds.sql. The SQL is transcribed here
// so a change to either side fails this script rather than silently diverging
// and mis-transmuting posted grades.
function sqlTransmuteTwin(rating, threshold) {
  if (rating === null) return null;
  if (threshold === null || threshold === 75) {
    if (rating >= 98) return 1.00;
    if (rating >= 95) return 1.25;
    if (rating >= 92) return 1.50;
    if (rating >= 89) return 1.75;
    if (rating >= 86) return 2.00;
    if (rating >= 83) return 2.25;
    if (rating >= 80) return 2.50;
    if (rating >= 77) return 2.75;
    if (rating >= 75) return 3.00;
    return 5.00;
  }
  const offsets = [23, 20, 17, 14, 11, 8, 5, 2, 0];
  const gwas = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
  for (let i = 0; i < offsets.length; i += 1) {
    if (rating >= threshold + (offsets[i] * (100 - threshold)) / 25) return gwas[i];
  }
  return 5.00;
}

// Regression guard: an unset threshold must be the institutional ladder, by
// identity rather than by value, so no second code path can drift from it.
assert.equal(buildTransmutationLadder(null), TRANSMUTATION_LADDER, 'a null threshold must reuse the institutional ladder');
assert.equal(buildTransmutationLadder(undefined), TRANSMUTATION_LADDER, 'an undefined threshold must reuse the institutional ladder');
assert.equal(buildTransmutationLadder(''), TRANSMUTATION_LADDER, 'an empty threshold must reuse the institutional ladder');
assert.equal(buildTransmutationLadder(75), TRANSMUTATION_LADDER, 'an explicit 75 must reuse the institutional ladder');

// Number(null) is 0, not NaN. If that ever slips past the guard, an unset
// template rescales to a 0% passing mark and every grade in the system is wrong
// -- so it is asserted explicitly rather than left to the sweep below.
assert.equal(toGwaOrNull(75, null), 3, 'a null threshold must not be read as a 0% passing mark');
assert.equal(toGwaOrNull(74.9, null), 5, 'a null threshold must still fail below 75');

// Full sweep: the JS and SQL ladders must agree at every quarter point, at the
// default and at both ends of the allowed 50..94 range.
let thresholdChecks = 0;
for (const threshold of [null, 75, 50, 69, 80, 85, 94]) {
  for (let rating = 0; rating <= 100; rating += 0.25) {
    assert.equal(
      toGwaOrNull(rating, threshold),
      sqlTransmuteTwin(rating, threshold),
      `JS and SQL transmutation disagree at rating ${rating} with threshold ${threshold}`
    );
    thresholdChecks += 1;
  }
  // And one-argument callers must be untouched by any of this.
  assert.equal(toGwaOrNull(97), 1.25, 'the legacy one-argument ladder must not change');
  assert.equal(toGwaOrNull(75), 3, 'the legacy one-argument ladder must not change');
}

// The rescaled ladder's own invariants, for every allowed threshold.
for (let threshold = 50; threshold <= 94; threshold += 0.5) {
  const ladder = buildTransmutationLadder(threshold);
  assert.equal(ladder.length, 9, 'a rescaled ladder must keep all nine bands');
  assert.ok(ladder[0].minRating <= 100, `a 1.00 must be reachable at threshold ${threshold}`);
  assert.equal(ladder[8].minRating, threshold, `the passing band must sit exactly at threshold ${threshold}`);
  for (let i = 1; i < ladder.length; i += 1) {
    assert.ok(ladder[i].minRating < ladder[i - 1].minRating, `the ladder must descend at threshold ${threshold}`);
  }
}

// A worked case that matters for the defense: the same raw score, opposite
// outcomes, because the two classes legitimately ran different passing policies.
assert.equal(toGwaOrNull(78, null), 2.75, 'a 78 passes under the institutional 75% policy');
assert.equal(toGwaOrNull(78, 80), 5, 'the same 78 fails under an 80% policy');

// Attendance tiers derive from one configured number; the status vocabulary does not.
const defaultAttendance = resolveAttendancePolicy(null);
assert.equal(defaultAttendance.fdaAbsences, ATTENDANCE.fdaAbsences, 'an unset FDA threshold must match the institutional default');
assert.equal(defaultAttendance.warningAbsences, ATTENDANCE.warningAbsences, 'an unset FDA threshold must match the institutional warning tier');
assert.equal(defaultAttendance.nearFdaAbsences, ATTENDANCE.nearFdaAbsences, 'an unset FDA threshold must match the institutional near-FDA tier');
assert.deepEqual(resolveAttendancePolicy(3), { warningAbsences: 1, nearFdaAbsences: 2, fdaAbsences: 3, statuses: ATTENDANCE.statuses }, 'FDA 3 must derive 1/2/3');
assert.deepEqual(resolveAttendancePolicy(6), { warningAbsences: 4, nearFdaAbsences: 5, fdaAbsences: 6, statuses: ATTENDANCE.statuses }, 'FDA 6 must derive 4/5/6');
assert.equal(resolveAttendancePolicy(undefined).fdaAbsences, 4, 'an undefined FDA threshold must fall back to 4');

// Consultation window states. The badge a student reads must agree with
// milestone_edits_frozen() in SQL, or the page offers a correction the database
// refuses -- or hides one it would allow.
{
  const open = { opened_at: '2026-10-29T01:00:00Z', finalized_at: null };
  const closed = { opened_at: '2026-10-29T01:00:00Z', finalized_at: '2026-10-30T01:00:00Z' };
  const state = (posted, win, period) => resolveMilestoneState({ posted, window: win, gradePeriod: period }).state;

  assert.ok(hasConsultationWindow(GRADE_MILESTONES.MIDTERM_RATING), 'MR must have a consultation window');
  assert.ok(hasConsultationWindow(GRADE_MILESTONES.TENTATIVE_FINAL_RATING), 'TFR must have a consultation window');
  assert.ok(!hasConsultationWindow(GRADE_MILESTONES.SEMESTRAL_GRADE), 'SG must have no consultation window');

  for (const period of [GRADE_MILESTONES.MIDTERM_RATING, GRADE_MILESTONES.TENTATIVE_FINAL_RATING]) {
    assert.equal(state(false, null, period), 'tentative', 'an unposted milestone is tentative');
    assert.equal(state(false, open, period), 'tentative', 'posting, not the window, makes a grade official');
    assert.equal(state(true, open, period), 'posted', 'an open window reads as not yet final');
    assert.equal(state(true, closed, period), 'finalized', 'a finalized window reads as final');
    // Matches milestone_edits_frozen()'s COALESCE(..., TRUE): a milestone posted
    // before windows existed is frozen, so it must not read as still open.
    assert.equal(state(true, null, period), 'finalized', 'a posted milestone with no window reads as final');
    assert.equal(state(true, undefined, period), 'finalized', 'a missing window and a null window must agree');
  }

  // SG locks on posting and never acquires a window, so it skips the middle state.
  assert.equal(state(false, null, GRADE_MILESTONES.SEMESTRAL_GRADE), 'tentative', 'an unposted SG is tentative');
  assert.equal(state(true, null, GRADE_MILESTONES.SEMESTRAL_GRADE), 'finalized', 'a posted SG is final at once');
  assert.equal(state(true, open, GRADE_MILESTONES.SEMESTRAL_GRADE), 'finalized', 'a stray window must not unlock SG');
}

// Grade change requests. Only the pure rules are asserted here: whether a
// midterm correction stays isolated lives entirely in SQL, and a JavaScript
// test claiming to prove it would prove nothing. That one is covered by the
// migration's own verification block and by GCR-APPLY in the checklist.
{
  // Every waiting state must count as open. Missing one strands a student:
  // withdrawing and attaching are both gated on this, so a request sitting with
  // the Registrar would become uneditable and un-withdrawable.
  for (const open of [REQUEST_STATUS.PENDING_FACULTY, REQUEST_STATUS.PENDING_DEAN, REQUEST_STATUS.PENDING_REGISTRAR]) {
    assert.ok(isOpenStatus(open), `${open} must count as an open request`);
  }
  for (const closed of [REQUEST_STATUS.APPROVED, REQUEST_STATUS.APPLIED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED]) {
    assert.ok(!isOpenStatus(closed), `${closed} must not count as open`);
  }

  // The preview guard compares signatures. If order mattered, re-ordering the
  // same edits would invalidate a preview for no reason the instructor could
  // see -- and they would be told to check again having changed nothing.
  const a = [
    { target_key: 'activity:b', new_score: 18 },
    { target_key: 'activity:a', new_score: 12 }
  ];
  const b = [
    { target_key: 'activity:a', new_score: 12 },
    { target_key: 'activity:b', new_score: 18 }
  ];
  assert.equal(correctionSignature(a), correctionSignature(b),
    'the same edits in a different order must be the same correction');

  // ...but a changed score must change it, or Apply would proceed on a figure
  // nobody previewed.
  assert.notEqual(
    correctionSignature(a),
    correctionSignature([{ target_key: 'activity:a', new_score: 13 }, { target_key: 'activity:b', new_score: 18 }]),
    'changing a score must invalidate the preview'
  );
  assert.equal(correctionSignature([]), correctionSignature([]), 'an empty correction is stable');

  // The first path segment is the uploader's id. Both the storage policy and
  // submit_grade_change_request() check it, so a change to this shape would
  // silently refuse every submission.
  const uid = '11111111-2222-3333-4444-555555555555';
  assert.equal(evidenceObjectPath(uid, 'paper.jpg').split('/')[0], uid,
    'evidence must be stored under the uploading student');
  const crafted = evidenceObjectPath(uid, '../../etc/passwd');
  assert.equal(crafted.split('/').length, 2,
    'a crafted file name must not introduce another path segment');
  assert.equal(crafted.split('/')[0], uid,
    'a crafted file name must not escape the student prefix');
  assert.ok(evidenceObjectPath(uid, null).startsWith(uid + '/'),
    'a missing file name must still produce a scoped path');

  // A browser that reports no MIME type must not cost a student a valid photo.
  assert.equal(resolveFileType({ name: 'scan.JPG', type: '' }), 'image/jpeg');
  assert.equal(resolveFileType({ name: 'sheet.pdf', type: '' }), 'application/pdf');
  assert.equal(resolveFileType({ name: 'x.jpg', type: 'image/png' }), 'image/png',
    'a reported type wins over the extension');

  assert.ok(describeEvidenceFile({ name: 'a.jpg', type: 'image/jpeg', size: 1000 }).ok);
  assert.ok(describeEvidenceFile({ name: 'a.jpg', type: '', size: 1000 }).ok,
    'a JPG with no reported type must still be accepted');
  assert.ok(!describeEvidenceFile({ name: 'a.docx', type: '', size: 10 }).ok);
  assert.ok(!describeEvidenceFile(null).ok);
  assert.ok(!describeEvidenceFile({ name: 'a.jpg', type: 'image/jpeg', size: EVIDENCE_MAX_BYTES + 1 }).ok,
    'a file over the limit must be refused');

  // HEIC gets its own message. Reaching that branch means conversion failed, so
  // the advice must be about this browser, not about attaching a photo -- the
  // student already did attach a photo.
  const heic = describeEvidenceFile({ name: 'IMG_0001.HEIC', type: 'image/heic', size: 1000 });
  assert.ok(!heic.ok, 'HEIC must be refused once conversion has failed');
  assert.ok(/iPhone/i.test(heic.message), 'the HEIC message must name the cause');
  assert.ok(!/JPG, PNG or WebP/.test(heic.message),
    'HEIC must not fall through to the generic "attach a photo" message');
  assert.ok(!describeEvidenceFile({ name: 'IMG.heic', type: '' }).ok,
    'HEIC detected by extension alone must also be refused');
}

console.log(`Verified ${presets.length} grading presets, policy scale, attendance, honors, risk boundaries, milestone identity, summer isolation, consultation window states, grade change request rules, and ${thresholdChecks} dynamic-threshold transmutations against the SQL twin.`);
