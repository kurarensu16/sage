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
  getAttendanceFlags,
  getHonorTier,
  getRemarks,
  resolveOfficialGwa,
  toDbRemark,
  toDisplayRemark,
  toGwaOrNull
} from '../src/lib/academicPolicy.js';
import { calculateAcademicRisk } from '../src/lib/riskEngine.js';
import {
  GRADE_MILESTONES,
  findMostAdvancedPostedGrade,
  getCanonicalGradePeriod
} from '../src/lib/gradeMilestones.js';
import { computeTentativeGradeDetails } from '../src/lib/riskEngine.js';
import { OFFICIAL_DYCI_PRESETS } from '../src/lib/officialGradingPresets.js';

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
assert.equal(getRemarks({ gwa: 2, isComplete: false }), 'In Progress', 'incomplete must win over a passing gwa value');
assert.equal(getRemarks({ gwa: 3.00, isComplete: true }), 'Passed', 'the 3.00 passing cutoff is inclusive');
assert.equal(getRemarks({ gwa: 3.01, isComplete: true }), 'Failed');
assert.equal(toDbRemark('Passed'), 'passed');
assert.equal(toDisplayRemark('passed'), 'Passed');
assert.equal(toDisplayRemark('fda'), 'FDA');
assert.equal(toDisplayRemark('incomplete'), 'Incomplete (INC)');
assert.equal(toDisplayRemark('dropped'), 'Dropped');
assert.equal(toDisplayRemark('some_future_legacy_value'), 'some_future_legacy_value', 'unrecognized remarks must surface as-is, never collapse to Failed');

console.log(`Verified ${presets.length} grading presets, policy scale, attendance, honors, risk boundaries, milestone identity, and summer isolation.`);
