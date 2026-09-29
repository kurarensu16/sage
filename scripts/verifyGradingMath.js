import assert from 'node:assert/strict';
import {
  calculateSemestralGrade,
  calculateStoredTermRating,
  calculateWeightedTermRating,
  resolveGradingFormula
} from '../src/lib/gradingMath.js';
import {
  GRADE_MILESTONES,
  findMostAdvancedPostedGrade,
  getCanonicalGradePeriod
} from '../src/lib/gradeMilestones.js';
import { computeTentativeGradeDetails } from '../src/lib/riskEngine.js';

const presets = [
  {
    name: 'General Education Core',
    isolatedKey: 'class_standing',
    isolatedExpected: 50,
    components: [
      { key: 'class_standing', name: 'Class Standing (Formative)', weight: 50, max_score: 20, is_multiple: true },
      { key: 'major_examination', name: 'Major Examination', weight: 40, max_score: 40, is_multiple: false },
      { key: 'character_rating', name: 'Character Rating', weight: 10, max_score: 100, is_multiple: false }
    ]
  },
  {
    name: 'Health Sciences (Theory)',
    isolatedKey: 'class_standing',
    isolatedExpected: 30,
    components: [
      { key: 'class_standing', name: 'Class Standing (Formative)', weight: 30, max_score: 20, is_multiple: true },
      { key: 'major_examination', name: 'Major Examination', weight: 60, max_score: 100, is_multiple: false },
      { key: 'character_rating', name: 'Character Rating', weight: 10, max_score: 100, is_multiple: false }
    ]
  },
  {
    name: 'Health Sciences (RLE / Clinical Practicum)',
    isolatedKey: 'checklist_rating',
    isolatedExpected: 50,
    components: [
      { key: 'checklist_rating', name: 'Checklist Rating', weight: 50, max_score: 100, is_multiple: true },
      { key: 'nursing_care_plan', name: 'Nursing Care Plan & Case Study', weight: 20, max_score: 100, is_multiple: true },
      { key: 'rubric_assessment', name: 'Rubric Assessment', weight: 20, max_score: 100, is_multiple: false },
      { key: 'quizzes', name: 'Quizzes & Written Outputs', weight: 10, max_score: 50, is_multiple: true }
    ]
  },
  {
    name: 'Maritime Studies (Lecture)',
    isolatedKey: 'class_standing',
    isolatedExpected: 60,
    components: [
      { key: 'class_standing', name: 'Class Standing', weight: 60, max_score: 100, is_multiple: true },
      { key: 'major_examination', name: 'Major Examination', weight: 40, max_score: 100, is_multiple: false }
    ]
  },
  {
    name: 'Maritime Studies (Laboratory / Simulator)',
    isolatedKey: 'systematic_exercises',
    isolatedExpected: 40,
    components: [
      { key: 'systematic_exercises', name: 'Systematic Exercises', weight: 40, max_score: 100, is_multiple: true },
      { key: 'demonstration', name: 'Demonstration of Competence', weight: 60, max_score: 100, is_multiple: false }
    ]
  }
];

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

  const isolatedComponent = formula.components.find(component => component.key === preset.isolatedKey);
  const isolatedResult = calculateWeightedTermRating({
    formula,
    componentScores: {
      [preset.isolatedKey]: isolatedComponent.isMultiple
        ? [{ score: isolatedComponent.maxScore, maxScore: isolatedComponent.maxScore }]
        : { score: isolatedComponent.maxScore, maxScore: isolatedComponent.maxScore }
    }
  });
  assert.equal(
    isolatedResult.rating,
    preset.isolatedExpected,
    `${preset.name} should honor its configured component weight`
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
assert.equal(legacy.ok, true);
assert.equal(legacy.source, 'legacy');
assert.equal(legacy.totalWeight, 100);

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

console.log(`Verified ${presets.length} grading presets, storage mapping, RLE safeguards, milestone identity, analytics reuse, legacy fallback, and summer isolation.`);
