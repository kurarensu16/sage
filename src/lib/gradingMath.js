// =============================================================================
// SAGE CENTRALIZED GRADING MATHEMATICS & TRANSMUTATION ENGINE
// Institution: Dr. Yanga's Colleges, Inc. (DYCI)
// =============================================================================

import { getHonorTier, toGwaOrNull, TRANSMUTATION_LADDER } from './academicPolicy.js';

export const WEIGHT_TOLERANCE = 0.01;

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const createComponentKey = (component, index) => {
  if (component.component_id || component.componentId) return component.component_id || component.componentId;
  if (component.key) return component.key;

  const nameKey = String(component.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return nameKey || `component_${index + 1}`;
};

/**
 * Validates and normalizes a grading formula without assigning storage slots.
 * Missing or invalid grading templates fail closed.
 *
 * @param {Array<Object>|null|undefined} components
 * @param {Object} [options]
 * @param {boolean} [options.formulaAssigned]
 * @returns {{ok: boolean, source: 'configured'|'legacy'|'invalid', components: Array<Object>, totalWeight: number, error: string|null}}
 */
export function resolveGradingFormula(components, { formulaAssigned = Array.isArray(components) && components.length > 0 } = {}) {
  if (!formulaAssigned) {
    return {
      ok: false,
      source: 'invalid',
      components: [],
      totalWeight: 0,
      error: 'No grading template assigned to this subject.'
    };
  }

  if (!Array.isArray(components) || components.length === 0) {
    return {
      ok: false,
      source: 'invalid',
      components: [],
      totalWeight: 0,
      error: 'The assigned grading formula has no components.'
    };
  }

  const normalized = [];
  const usedKeys = new Set();

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index] || {};
    const name = String(component.name || '').trim();
    const weight = toFiniteNumber(component.weight);
    const maxScore = toFiniteNumber(component.max_score ?? component.maxScore);
    const key = createComponentKey(component, index);

    if (!name) {
      return {
        ok: false,
        source: 'invalid',
        components: [],
        totalWeight: 0,
        error: `Grading component ${index + 1} has no name.`
      };
    }
    if (weight === null || weight <= 0) {
      return {
        ok: false,
        source: 'invalid',
        components: [],
        totalWeight: 0,
        error: `Grading component "${name}" has an invalid weight.`
      };
    }
    if (maxScore === null || maxScore <= 0) {
      return {
        ok: false,
        source: 'invalid',
        components: [],
        totalWeight: 0,
        error: `Grading component "${name}" has an invalid maximum score.`
      };
    }
    if (usedKeys.has(key)) {
      return {
        ok: false,
        source: 'invalid',
        components: [],
        totalWeight: 0,
        error: `Grading component key "${key}" is duplicated.`
      };
    }

    usedKeys.add(key);
    normalized.push({
      componentId: component.component_id || component.componentId || null,
      key,
      name,
      weight,
      maxScore,
      isMultiple: Boolean(component.is_multiple ?? component.isMultiple),
      semanticType: component.semantic_type || component.semanticType || null,
      displayOrder: Number(component.display_order ?? component.displayOrder ?? index),
      isRequired: component.is_required ?? component.isRequired ?? true
    });
  }

  const totalWeight = normalized.reduce((sum, component) => sum + component.weight, 0);
  if (Math.abs(totalWeight - 100) > WEIGHT_TOLERANCE) {
    return {
      ok: false,
      source: 'invalid',
      components: normalized,
      totalWeight,
      error: `The assigned grading formula totals ${totalWeight}% instead of 100%.`
    };
  }

  return {
    ok: true,
    source: 'configured',
    components: normalized,
    totalWeight,
    error: null
  };
}

const getStoredActivityScore = (termScores, activity, index, { allowLegacyFallback = true } = {}) => {
  const candidateKeys = [
    activity?.id,
    activity?.dbId,
    activity?.activity_id,
    ...(allowLegacyFallback ? [activity?.slotKey, `act${index + 1}`] : [])
  ].filter(Boolean);

  for (const key of candidateKeys) {
    if (termScores[key] !== undefined && termScores[key] !== null && termScores[key] !== '') {
      return termScores[key];
    }
  }
  return null;
};

/**
 * Compatibility adapter for the current score-sheet storage model. It maps
 * granular activities and the legacy char/exam slots into generic component
 * scores, then delegates the arithmetic to calculateWeightedTermRating.
 * Multi-bucket formulas require every activity to carry a component identity.
 */
export function calculateStoredTermRating({
  formula,
  termScores = {},
  maxItems = {},
  activities = []
}) {
  if (!formula?.ok) {
    return calculateWeightedTermRating({ formula, componentScores: {} });
  }

  const multipleComponents = formula.components.filter(component => component.isMultiple);
  const singleComponents = formula.components.filter(component => !component.isMultiple);
  const configuredActivities = (activities || []).filter(activity =>
    activity && (activity.dbId || activity.activity_id || activity.name)
  );
  const componentScores = {};

  if (multipleComponents.length > 1) {
    const componentIds = new Set(
      multipleComponents.map(component => component.componentId).filter(Boolean)
    );
    const uncategorized = configuredActivities.filter(activity => {
      const componentId = activity.componentId || activity.component_id;
      return !componentId || !componentIds.has(componentId);
    });

    if (
      multipleComponents.some(component => !component.componentId)
      || configuredActivities.length === 0
      || uncategorized.length > 0
    ) {
      return {
        ok: false,
        rating: null,
        rawRating: null,
        hasData: false,
        isComplete: false,
        contributions: [],
        missingComponents: [],
        error: 'This grading formula has multiple activity buckets. Categorize every activity before grades can be calculated or posted.'
      };
    }

    multipleComponents.forEach(component => {
      const matchingActivities = configuredActivities.filter(activity =>
        (activity.componentId || activity.component_id) === component.componentId
      );
      componentScores[component.key] = matchingActivities.map((activity, index) => ({
        score: getStoredActivityScore(termScores, activity, index, { allowLegacyFallback: false }),
        maxScore: activity.max ?? activity.max_score ?? component.maxScore
      }));
    });
    if (multipleComponents.some(component => componentScores[component.key].length === 0)) {
      return {
        ok: false,
        rating: null,
        rawRating: null,
        hasData: false,
        isComplete: false,
        contributions: [],
        missingComponents: [],
        error: 'Every repeatable grading component needs at least one categorized activity before grades can be posted.'
      };
    }
  } else if (multipleComponents.length === 1) {
    const component = multipleComponents[0];
    if (configuredActivities.length > 0) {
      componentScores[component.key] = configuredActivities.map((activity, index) => ({
        score: getStoredActivityScore(termScores, activity, index),
        maxScore: activity.max ?? activity.max_score ?? maxItems[`act${index + 1}`] ?? component.maxScore
      }));
    } else {
      componentScores[component.key] = [1, 2, 3, 4, 5, 6].map(index => ({
        score: termScores[`act${index}`],
        maxScore: maxItems[`act${index}`] ?? component.maxScore
      }));
    }
  }

  const characterComponents = singleComponents.filter(component =>
    component.semanticType === 'character' || (!component.semanticType && /character/i.test(component.name))
  );
  const remainingSingleComponents = singleComponents.filter(component => !characterComponents.includes(component));

  if (characterComponents.length > 1 || remainingSingleComponents.length > 1) {
    return {
      ok: false,
      rating: null,
      rawRating: null,
      hasData: false,
      isComplete: false,
      contributions: [],
      missingComponents: [],
      error: 'The current score sheet cannot map this formula’s non-repeatable components safely.'
    };
  }

  if (characterComponents.length === 1) {
    const component = characterComponents[0];
    componentScores[component.key] = {
      score: termScores.char ?? termScores.char_rating,
      maxScore: maxItems.char ?? component.maxScore
    };
  }

  if (remainingSingleComponents.length === 1) {
    const component = remainingSingleComponents[0];
    componentScores[component.key] = {
      score: termScores.exam,
      maxScore: maxItems.exam ?? component.maxScore
    };
  }

  return calculateWeightedTermRating({ formula, componentScores });
}

export function createGradingFormulaSnapshot(formula, { computationId = null } = {}) {
  if (!formula?.ok) return null;
  return {
    version: 1,
    computationId,
    source: formula.source,
    totalWeight: formula.totalWeight,
    components: formula.components.map(component => ({ ...component }))
  };
}

export function getGradingStoragePresentation(formula) {
  const components = formula?.ok ? formula.components : [];
  const repeatableComponents = components.filter(component => component.isMultiple);
  const characterComponent = components.find(component =>
    !component.isMultiple
    && (component.semanticType === 'character' || (!component.semanticType && /character/i.test(component.name)))
  );
  const primarySingleComponent = components.find(component => !component.isMultiple && component !== characterComponent);

  return {
    activityLabel: repeatableComponents.length === 1
      ? repeatableComponents[0].name
      : 'Categorized Activities',
    activityWeight: repeatableComponents.reduce((sum, component) => sum + component.weight, 0),
    hasMultipleActivityBuckets: repeatableComponents.length > 1,
    hasCharacter: Boolean(characterComponent),
    characterLabel: characterComponent?.name || 'Character Rating',
    characterWeight: characterComponent?.weight || 0,
    hasExam: Boolean(primarySingleComponent),
    examLabel: primarySingleComponent?.name || 'Examination',
    examWeight: primarySingleComponent?.weight || 0
  };
}

const normalizeScoreItems = (rawValue, component) => {
  if (Array.isArray(rawValue)) return rawValue;
  if (rawValue && typeof rawValue === 'object') {
    if (Array.isArray(rawValue.items)) return rawValue.items;
    return [rawValue];
  }
  if (rawValue === null || rawValue === undefined || rawValue === '') return [];
  return [{ score: rawValue, maxScore: component.maxScore }];
};

/**
 * Calculates one term rating from normalized formula components. Scores are
 * keyed by the resolved component key. A score can be a scalar, one
 * `{ score, maxScore }` object, or an array of those objects for repeatable
 * components.
 *
 * @param {Object} params
 * @param {ReturnType<typeof resolveGradingFormula>} params.formula
 * @param {Object<string, number|Object|Array<Object>>} params.componentScores
 * @returns {{ok: boolean, rating: number|null, rawRating: number|null, hasData: boolean, isComplete: boolean, contributions: Array<Object>, missingComponents: Array<string>, error: string|null}}
 */
export function calculateWeightedTermRating({ formula, componentScores = {} }) {
  if (!formula?.ok) {
    return {
      ok: false,
      rating: null,
      rawRating: null,
      hasData: false,
      isComplete: false,
      contributions: [],
      missingComponents: [],
      error: formula?.error || 'A valid grading formula is required.'
    };
  }

  const contributions = formula.components.map(component => {
    const items = normalizeScoreItems(componentScores[component.key], component);
    let earned = 0;
    let possible = 0;
    let enteredItemCount = 0;

    items.forEach(item => {
      const score = toFiniteNumber(item?.score ?? item?.earned ?? item?.value);
      const maxScore = toFiniteNumber(item?.maxScore ?? item?.max_score ?? component.maxScore);
      if (score === null || maxScore === null || maxScore <= 0) return;

      enteredItemCount += 1;
      earned += Math.max(0, score);
      possible += maxScore;
    });

    const hasData = enteredItemCount > 0;
    const expectedItemCount = items.length;
    const isComponentComplete = hasData
      && (!component.isMultiple || (expectedItemCount > 0 && enteredItemCount === expectedItemCount));

    const percentage = hasData && possible > 0
      ? Math.min(100, Math.max(0, (earned / possible) * 100))
      : 0;
    const contribution = (percentage / 100) * component.weight;

    return {
      ...component,
      earned,
      possible,
      percentage,
      contribution,
      hasData,
      enteredItemCount,
      expectedItemCount,
      isComplete: isComponentComplete
    };
  });

  const hasData = contributions.some(component => component.hasData);
  const missingComponents = contributions
    .filter(component => component.isRequired && !component.isComplete)
    .map(component => component.name);
  const rawRating = hasData
    ? contributions.reduce((sum, component) => sum + component.contribution, 0)
    : null;
  const encodedWeight = contributions
    .filter(component => component.hasData)
    .reduce((sum, component) => sum + (component.weight || 0), 0);
  const ratingOnEncoded = encodedWeight > 0
    ? Math.min(100, Math.max(0, Math.round((rawRating / encodedWeight) * 100)))
    : null;

  return {
    ok: true,
    rating: rawRating === null ? null : Math.min(100, Math.max(0, Math.round(rawRating))),
    rawRating,
    hasData,
    isComplete: missingComponents.length === 0,
    contributions,
    missingComponents,
    encodedWeight,
    ratingOnEncoded,
    error: null
  };
}

/**
 * Transmutes a 0-100 numerical rating to the official DYCI GWA scale (1.00 - 5.00).
 * @param {number|null} score - Raw or computed term/semestral score (0-100)
 * @returns {number} Transmuted GWA equivalent
 */
export const getTransmutedGrade = (score) => {
  if (score === null || score === undefined || isNaN(score) || score === '') return 5.00;
  return toGwaOrNull(score) ?? 5.00;
};

export { TRANSMUTATION_LADDER };
export const toEffectiveGradeForPosting = (rating) => toGwaOrNull(rating);

/**
 * Computes official term and semestral milestones supporting both 4-term regular semesters and 2-term summer terms.
 * @param {Object} params
 * @param {number|null} params.prelim
 * @param {number|null} params.midterm
 * @param {number|null} params.semiFinal
 * @param {number|null} params.final
 * @param {boolean} [params.isSummer=false]
 * @returns {{ mr: number|null, tfr: number|null, sg: number|null, gwa: string, remarks: string }}
 */
export const calculateSemestralGrade = ({ prelim = null, midterm = null, semiFinal = null, final = null, isSummer = false }) => {
  if (isSummer) {
    // Summer Term Compression: Midterm & Final only
    const mr = midterm !== null && !isNaN(midterm) ? Math.round(parseFloat(midterm)) : null;
    const finalRating = final !== null && !isNaN(final) ? Math.round(parseFloat(final)) : null;
    const sg = (mr !== null && finalRating !== null) ? Math.round((mr + finalRating) / 2) : (finalRating ?? mr);
    const gwa = sg !== null ? getTransmutedGrade(sg).toFixed(2) : '—';
    const termsEncoded = [mr, finalRating].filter(value => value !== null).length;
    const isComplete = termsEncoded === 2;
    const remarks = !isComplete ? 'In Progress' : (parseFloat(gwa) <= 3.00 ? 'Passed' : 'Failed');

    return { mr, tfr: finalRating, sg, gwa, remarks, termsExpected: 2, termsEncoded, isComplete };
  }

  // Regular 4-term progression: Prelim, Midterm, Semi-Final, Final
  const p = prelim !== null && !isNaN(prelim) ? parseFloat(prelim) : null;
  const m = midterm !== null && !isNaN(midterm) ? parseFloat(midterm) : null;
  const sf = semiFinal !== null && !isNaN(semiFinal) ? parseFloat(semiFinal) : null;
  const f = final !== null && !isNaN(final) ? parseFloat(final) : null;

  const mr = (p !== null && m !== null) ? Math.round((p + m) / 2) : (m ?? p);
  const tfr = (sf !== null && f !== null) ? Math.round((sf + f) / 2) : (f ?? sf);
  const sg = (mr !== null && tfr !== null) ? Math.round((mr + tfr) / 2) : (tfr ?? mr);

  const gwa = sg !== null ? getTransmutedGrade(sg).toFixed(2) : '—';
  const termsEncoded = [p, m, sf, f].filter(value => value !== null).length;
  const isComplete = termsEncoded === 4;
  const remarks = !isComplete ? 'In Progress' : (parseFloat(gwa) <= 3.00 ? 'Passed' : 'Failed');

  return { mr, tfr, sg, gwa, remarks, termsExpected: 4, termsEncoded, isComplete };
};

/**
 * Resolves President's List Tier classification according to DYCI Handbook Section 3.8 & 5.2.5.1
 * @param {number|string} gwa - General Weighted Average
 * @param {boolean} [hasGradeBelow200=false] - True if any individual subject grade exceeds 2.00
 * @param {boolean} [hasInc=false] - True if student has any Incomplete grades
 * @param {number} [units=18] - Enrolled course unit load
 * @param {boolean} [isIrregular=false] - True if student is irregular
 * @returns {{ tier: 'Sapientia'|'Excellentia'|'Virtus'|null, isEligible: boolean, disqualificationReason: string|null }}
 */
export const getPresidentsListTier = (gwa, hasGradeBelow200 = false, hasInc = false, units = 18, isIrregular = false) => {
  const result = getHonorTier(gwa, {
    subjectGrades: hasGradeBelow200 ? [2.25] : [],
    hasInc,
    units
  });
  return { tier: result.tier, isEligible: result.isEligible, disqualificationReason: result.unmetRequirements[0] || null };
};

/**
 * Official DYCI GWA threshold benchmarks for target simulation.
 */
export const GWA_TARGET_BENCHMARKS = [
  { gwa: '1.00', minRating: 98, label: "President's List (1.00)" },
  { gwa: '1.25', minRating: 95, label: "1st Class Honors (1.25)" },
  { gwa: '1.50', minRating: 92, label: "1st Class Dean's List (1.50)" },
  { gwa: '1.75', minRating: 89, label: "2nd Class Dean's List (1.75)" },
  { gwa: '2.00', minRating: 86, label: "Honors Floor (2.00)" },
  { gwa: '2.25', minRating: 83, label: "Above Average (2.25)" },
  { gwa: '2.50', minRating: 80, label: "Satisfactory (2.50)" },
  { gwa: '2.75', minRating: 77, label: "Fair (2.75)" },
  { gwa: '3.00', minRating: 75, label: "Passing Minimum (3.00)" }
];

/**
 * Calculates the required Final term rating and exam score to hit a target Semestral Grade.
 * @param {Object} params
 * @param {number} params.mr - Current Midterm Rating (0-100)
 * @param {number|null} [params.semiFinal=null] - Semi-Final rating if already recorded (0-100)
 * @param {number} params.targetRating - Target Semestral numeric rating (e.g. 89 for 1.75, 75 for 3.00)
 * @param {number} [params.estimatedFinalCs=80] - Estimated final term class standing (0-100%)
 * @param {number} [params.estimatedFinalChar=95] - Estimated final character rating (0-100%)
 * @param {number} [params.examMax=40] - Maximum points for the final exam
 * @returns {{ requiredTfr: number, requiredFinalTermRating: number, requiredExamScore: number, isAchievable: boolean, difficulty: 'Easy'|'Moderate'|'Challenging'|'Impossible' }}
 */
export const simulateRequiredFinalRating = ({
  mr,
  semiFinal = null,
  targetRating,
  estimatedFinalCs = 80,
  estimatedFinalChar = 95,
  examMax = 40
}) => {
  if (mr === null || mr === undefined || isNaN(mr)) {
    return {
      requiredTfr: targetRating,
      requiredFinalTermRating: targetRating,
      requiredExamScore: Math.round((targetRating / 100) * examMax),
      isAchievable: true,
      difficulty: 'Moderate'
    };
  }

  // SG = (MR + TFR) / 2 => TFR = (Target_SG * 2) - MR
  const requiredTfr = Math.max(0, (targetRating * 2) - mr);

  // If semi-final is already recorded: TFR = (SF + Final) / 2 => Final = (TFR * 2) - SF
  let requiredFinalTermRating = requiredTfr;
  if (semiFinal !== null && !isNaN(semiFinal)) {
    requiredFinalTermRating = Math.max(0, (requiredTfr * 2) - semiFinal);
  }

  // Component breakdown: FinalTermRating = CS(50%) + Char(10%) + Exam(40%)
  const csPoints = (estimatedFinalCs / 100) * 50;
  const charPoints = (estimatedFinalChar / 100) * 10;
  const neededExamPoints = requiredFinalTermRating - csPoints - charPoints;
  const requiredExamScore = Math.max(0, Math.min(examMax, Math.ceil((neededExamPoints / 40) * examMax)));

  const isAchievable = requiredFinalTermRating <= 100 && requiredTfr <= 100;

  let difficulty = 'Moderate';
  if (requiredFinalTermRating > 100) difficulty = 'Impossible';
  else if (requiredFinalTermRating >= 92) difficulty = 'Challenging';
  else if (requiredFinalTermRating <= 75) difficulty = 'Easy';

  return {
    requiredTfr: Math.min(100, Math.max(0, Math.round(requiredTfr))),
    requiredFinalTermRating: Math.min(100, Math.max(0, Math.round(requiredFinalTermRating))),
    requiredExamScore: Math.max(0, Math.min(examMax, requiredExamScore)),
    isAchievable,
    difficulty
  };
};
