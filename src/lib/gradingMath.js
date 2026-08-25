// =============================================================================
// SAGE CENTRALIZED GRADING MATHEMATICS & TRANSMUTATION ENGINE
// Institution: Dr. Yanga's Colleges, Inc. (DYCI)
// =============================================================================

/**
 * Transmutes a 0-100 numerical rating to the official DYCI GWA scale (1.00 - 5.00).
 * @param {number|null} score - Raw or computed term/semestral score (0-100)
 * @returns {number} Transmuted GWA equivalent
 */
export const getTransmutedGrade = (score) => {
  if (score === null || score === undefined || isNaN(score) || score === '') return 5.00;
  const numScore = parseFloat(score);
  if (numScore >= 98) return 1.00;
  if (numScore >= 95) return 1.25;
  if (numScore >= 92) return 1.50;
  if (numScore >= 89) return 1.75;
  if (numScore >= 86) return 2.00;
  if (numScore >= 83) return 2.25;
  if (numScore >= 80) return 2.50;
  if (numScore >= 77) return 2.75;
  if (numScore >= 75) return 3.00;
  return 5.00;
};

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
    const remarks = sg !== null ? (parseFloat(gwa) <= 3.00 ? 'Passed' : 'Failed') : '—';

    return { mr, tfr: finalRating, sg, gwa, remarks };
  }

  // Regular 4-term progression: Prelim, Midterm, Semi-Final, Final
  const p = prelim !== null && !isNaN(prelim) ? parseFloat(prelim) : null;
  const m = midterm !== null && !isNaN(midterm) ? parseFloat(midterm) : null;
  const sf = semiFinal !== null && !isNaN(semiFinal) ? parseFloat(semiFinal) : null;
  const f = final !== null && !isNaN(final) ? parseFloat(final) : null;

  const mr = (p !== null && m !== null) ? Math.round((p + m) / 2) : (m ?? p);
  const tfr = (sf !== null && f !== null) ? Math.round((sf + f) / 2) : (f ?? sf);
  const sg = (mr !== null && tfr !== null) ? Math.round((mr + tfr) / 2) : null;

  const gwa = sg !== null ? getTransmutedGrade(sg).toFixed(2) : '—';
  const remarks = sg !== null ? (parseFloat(gwa) <= 3.00 ? 'Passed' : 'Failed') : '—';

  return { mr, tfr, sg, gwa, remarks };
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
