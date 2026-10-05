// =============================================================================
// ASPIRE v4.0 — UNIFIED RISK ENGINE (Single Source of Truth)
// Institution: Dr. Yanga's Colleges, Inc. (DYCI)
// All portals (Dean, Faculty, Admin, Student) MUST use these shared functions.
// Do NOT duplicate grade/risk logic in individual page components.
// =============================================================================

import {
  calculateSemestralGrade,
  calculateStoredTermRating,
  getTransmutedGrade,
  resolveGradingFormula
} from './gradingMath.js';
import { getRiskTierForScore, RISK_TIERS, ATTENDANCE } from './academicPolicy.js';

// ── V4 Risk Matrix Weights (Anchored to DYCI Transmutation Scale) ────────────
// Individual components can exceed 100 (total potential: 135) but the final
// composite score is capped at 100 via Math.min(100, total).
// This design creates MULTIPLE INDEPENDENT PATHS to Critical Risk.

export const RISK_WEIGHTS = {
  gwa: 60,         // Max 60 pts — Anchored to DYCI Transmutation Scale
  attendance: 50,  // Max 50 pts — FDA trigger (faculty recommendation, not auto-override)
  missingWork: 15, // Max 15 pts — Ghost student / zero-submission detection
  trajectory: 10   // Max 10 pts — Grade velocity decline between terms
};

export { RISK_TIERS };

/**
 * Computes an explainable 0-100 risk score and categorical classification.
 * V4: Simplified 4-factor model anchored to the DYCI Institutional Transmutation Scale.
 *
 * GWA Factor (0-60) — threshold-anchored, NOT a single linear ramp:
 *   GWA 1.00-2.00 → 0 pts            (Safe / DL eligible)
 *   GWA 2.01-3.00 → 25-35 pts        (Watch — below the 2.00 scholarship grade floor)
 *   GWA 3.01-5.00 → 50-60 pts        (Failing — below the 75% passing cut-off)
 *
 *   The two step-ups are deliberate, not rounding artefacts. Each is pinned to an
 *   institutional threshold: losing the 2.00 scholarship grade floor puts a student
 *   on the Moderate watch list at once (25 pts = the Moderate tier floor), and
 *   crossing the 3.00 passing cut-off puts them straight into High (50 pts = the
 *   High tier floor), which is what triggers mandatory faculty evaluation. A smooth
 *   0-60 ramp would leave an already-failing student in Moderate until roughly
 *   GWA 4.41 and delay intervention — the opposite of what an early-warning system
 *   should do. Documented in the capstone paper, Table 2.5.
 *
 * Attendance / FDA Trigger (0-50):
 *   0-1 absences → 0 pts
 *   2 absences   → 10 pts
 *   3 absences   → 25 pts
 *   4+ absences  → 50 pts (FDA recommendation trigger)
 *
 * Missing Work / Ghost Detection (0-15):
 *   2 zero submissions → 10 pts
 *   3+ zero submissions → 15 pts
 *
 * Grade Velocity Decline (0-10):
 *   Drop > 15% between terms → 10 pts
 *   Drop > 10% → 7 pts
 *   Drop > 5%  → 3 pts
 *
 * @param {Object} params
 * @param {number|null} params.currentGwa - Student current running GWA (1.00 - 5.00)
 * @param {number} [params.absenceCount=0] - Total recorded absences in subject
 * @param {number|null} [params.previousTermRating=null] - Previous term rating (e.g., Prelim: 82)
 * @param {number|null} [params.currentTermRating=null] - Current term rating (e.g., Midterm: 74)
 * @param {number} [params.consecutiveAbsences=0] - Consecutive absences count
 * @param {number} [params.zeroSubmissionsCount=0] - Number of zero-score submissions on configured activities
 * @param {boolean} [params.isSummer=false] - Summer term flag
 * @returns {Object} Full explainable evaluation object
 */
export function calculateAcademicRisk({
  currentGwa = null,
  absenceCount = 0,
  consecutiveAbsences = 0,
  zeroSubmissionsCount = 0,
  previousTermRating = null,
  currentTermRating = null,
  isSummer = false
}) {
  // ── 1. GWA FACTOR (0 to 60 points) ──────────────────────────────────────────
  // Anchored directly to the DYCI Institutional Transmutation Scale.
  let gwaPoints = 0;
  let gwaDetail = "Good standing";

  if (currentGwa !== null && !isNaN(currentGwa) && currentGwa !== '—') {
    const gwa = Math.max(1.0, Math.min(5.0, parseFloat(currentGwa)));

    if (gwa <= 2.00) {
      // Safe zone: GWA 1.00–2.00 (Excellent to Satisfactory)
      gwaPoints = 0;
      gwaDetail = `GWA ${gwa.toFixed(2)} — On track (Honors eligible)`;
    } else if (gwa <= 3.00) {
      // Watch zone: GWA 2.01–3.00 (below the 2.00 scholarship grade floor, still passing).
      // Starts at the Moderate tier floor (25) and climbs to 35:
      //   2.01→25pts, 2.25→28pts, 2.50→30pts, 3.00→35pts
      gwaPoints = 25 + Math.round(((gwa - 2.00) / 1.00) * 10);
      gwaDetail = `GWA ${gwa.toFixed(2)} — Watch zone (DL track at risk)`;
    } else {
      // Failing zone: GWA 3.01–5.00 (below the 75% passing cut-off).
      // Starts at the High tier floor (50) and climbs to the 60-pt ceiling:
      //   3.01→50pts, 4.00→55pts, 5.00→60pts
      // Any failing GWA therefore reaches High on its own and prompts faculty evaluation.
      gwaPoints = 50 + Math.round(((gwa - 3.01) / 1.99) * 10);
      gwaDetail = `GWA ${gwa.toFixed(2)} — Failing (below 75% cut-off)`;
    }
  }

  // ── 2. ATTENDANCE / FDA TRIGGER (0 to 50 points) ───────────────────────────
  // FDA (4+ absences) is a RECOMMENDATION for faculty approval, not an auto-override.
  // The risk engine's job is to force the issue onto the faculty's attention.
  let attendPoints = 0;
  let attendDetail = `${absenceCount} absence(s)`;

  if (absenceCount >= ATTENDANCE.fdaAbsences) {
    attendPoints = 50;
    attendDetail = `${absenceCount} absences — FDA recommendation triggered (Faculty Choice)`;
  } else if (absenceCount === ATTENDANCE.nearFdaAbsences) {
    attendPoints = 25;
    attendDetail = "3 absences — Approaching FDA threshold";
  } else if (absenceCount === ATTENDANCE.warningAbsences) {
    attendPoints = 10;
    attendDetail = "2 absences — Early warning";
  }

  // Summer term amplifier: absences are more impactful in compressed 6-week terms
  if (isSummer && absenceCount >= ATTENDANCE.warningAbsences && attendPoints < 50) {
    attendPoints = Math.min(50, Math.round(attendPoints * 1.5));
    attendDetail += " (Summer amplified)";
  }

  // ── 3. MISSING WORK / GHOST DETECTION (0 to 15 points) ─────────────────────
  // Only counts zeros on activities that are actually configured (max > 0).
  let missingPoints = 0;
  let missingDetail = "No missing work";

  if (zeroSubmissionsCount >= 3) {
    missingPoints = 15;
    missingDetail = `${zeroSubmissionsCount} missing submissions — Ghost student alert`;
  } else if (zeroSubmissionsCount === 2) {
    missingPoints = 10;
    missingDetail = `${zeroSubmissionsCount} missing submissions — Warning`;
  }

  // ── 4. GRADE VELOCITY DECLINE (0 to 10 points) ─────────────────────────────
  // Compares current term rating to previous term (e.g., Midterm vs. Prelim).
  let trajPoints = 0;
  let trajDelta = 0;
  let trajDetail = "Stable trajectory";

  if (previousTermRating !== null && currentTermRating !== null &&
      !isNaN(previousTermRating) && !isNaN(currentTermRating)) {
    trajDelta = currentTermRating - previousTermRating;

    if (trajDelta < -15) {
      trajPoints = 10;
      trajDetail = `Performance dropped by ${Math.abs(trajDelta).toFixed(1)}% (Severe decline)`;
    } else if (trajDelta < -10) {
      trajPoints = 7;
      trajDetail = `Performance dropped by ${Math.abs(trajDelta).toFixed(1)}% (Moderate decline)`;
    } else if (trajDelta < -5) {
      trajPoints = 3;
      trajDetail = `Performance dropped by ${Math.abs(trajDelta).toFixed(1)}% (Mild decline)`;
    } else if (trajDelta > 0) {
      trajDetail = `Performance improved by +${trajDelta.toFixed(1)}%`;
    }
  }

  // ── COMPOSITE SCORE (capped at 100) ────────────────────────────────────────
  const rawTotal = gwaPoints + attendPoints + missingPoints + trajPoints;
  const compositeScore = Math.min(100, rawTotal);

  // ── CLASSIFICATION TIERS ────────────────────────────────────────────────────
  const riskTier = getRiskTierForScore(compositeScore);

  return {
    composite_score: compositeScore,
    risk_level: riskTier.label,
    badge_color: riskTier.color,
    trajectory_delta: trajDelta,
    factors: {
      gwa: {
        raw_value: currentGwa,
        points_contributed: gwaPoints,
        max_points: RISK_WEIGHTS.gwa,
        detail: gwaDetail
      },
      attendance: {
        absence_count: absenceCount,
        consecutive_absences: consecutiveAbsences,
        points_contributed: attendPoints,
        max_points: RISK_WEIGHTS.attendance,
        detail: attendDetail
      },
      missing_work: {
        zero_submissions_count: zeroSubmissionsCount,
        points_contributed: missingPoints,
        max_points: RISK_WEIGHTS.missingWork,
        detail: missingDetail
      },
      trajectory: {
        previous_rating: previousTermRating,
        current_rating: currentTermRating,
        delta: trajDelta,
        points_contributed: trajPoints,
        max_points: RISK_WEIGHTS.trajectory,
        detail: trajDetail
      }
    }
  };
}

// =============================================================================
// UNIFIED RISK UTILITIES (formerly in riskUtils.js)
// =============================================================================

/**
 * Computes a tentative transmuted GWA for a single class record from raw term scores.
 * Uses Available-Term Non-Null Averaging per ASPIRE Rule 1.
 * 
 * @param {Object} classRecordScores - Keyed by term name, each containing act1-6, char_rating, exam
 * @param {Object} classRecordCols   - Keyed by term name, each containing act1_max-6_max, exam_max
 * @param {Object} [options]
 * @param {Object|Array} [options.formula] Resolved formula or raw components
 * @param {Object} [options.activitiesByTerm]
 * @param {boolean} [options.isSummer=false]
 * @returns {number|null} Transmuted GWA (1.00-5.00) or null if no data
 */
export function computeTentativeGradeDetails(classRecordScores, classRecordCols, options = {}) {
  const formula = options.formula?.ok !== undefined
    ? options.formula
    : resolveGradingFormula(options.formula || null, {
        formulaAssigned: Array.isArray(options.formula) && options.formula.length > 0
      });
  if (!formula.ok) {
    return { formula, termRatings: {}, semesterResult: null, gwa: null };
  }

  const isSummer = Boolean(options.isSummer);
  const terms = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
  const termRatings = {};
  const termDetails = {};

  terms.forEach(term => {
    const tSc = classRecordScores?.[term];
    if (!tSc) return;

    const tMx = classRecordCols?.[term] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };
    const result = calculateStoredTermRating({
      formula,
      termScores: tSc,
      maxItems: { ...tMx, char: tMx.char ?? 100 },
      activities: options.activitiesByTerm?.[term] || []
    });
    termDetails[term] = result;
    if (result.ok && result.hasData) termRatings[term] = result.rating;
  });

  const semesterResult = calculateSemestralGrade({
    prelim: termRatings['Prelim'] ?? null,
    midterm: termRatings['Midterm'] ?? null,
    semiFinal: termRatings['Semi-Final'] ?? null,
    final: termRatings['Final'] ?? null,
    isSummer
  });

  return {
    formula,
    termRatings,
    termDetails,
    semesterResult,
    isComplete: terms.every(term => termDetails[term]?.isComplete),
    gwa: semesterResult.sg === null ? null : getTransmutedGrade(semesterResult.sg)
  };
}

export function computeTentativeGrade(classRecordScores, classRecordCols, options = {}) {
  return computeTentativeGradeDetails(classRecordScores, classRecordCols, options).gwa;
}

/**
 * Unified risk classification using the V4 Risk Matrix.
 * This is the SINGLE SOURCE OF TRUTH for risk level assignment across ALL portals.
 *
 * Key constraint: hasGradeBelow200 (Scholarship Grade Floor Breach) is ONLY applied to
 * PL/scholarship candidates (GWA ≤ 1.75) per DYCI Handbook Section 3.8.4 & 5.2.5.1.
 * It is NOT a general-population risk factor.
 *
 * @param {Object} params
 * @param {number|null}  params.avgGwa                - Running GWA (transmuted, 1.00-5.00)
 * @param {number}       [params.failingCount=0]       - Subjects with GWA > 3.00
 * @param {number}       [params.absenceCount=0]       - Total absences
 * @param {number}       [params.examAverage=100]      - Average exam percentage (0-100)
 * @param {number}       [params.zeroSubmissionsCount=0]
 * @param {number|null}  [params.previousTermRating]   - Previous term raw rating
 * @param {number|null}  [params.currentTermRating]    - Current term raw rating
 * @param {number}       [params.consecutiveAbsences=0]
 * @param {boolean}      [params.isSummer=false]
 * @param {number[]}     [params.individualSubjectGrades=[]] - Individual per-subject GWA values for PL check
 * @returns {Object} Full explainable risk assessment from the centralized engine
 */
export function computeUnifiedRisk({
  avgGwa = null,
  absenceCount = 0,
  zeroSubmissionsCount = 0,
  previousTermRating = null,
  currentTermRating = null,
  consecutiveAbsences = 0,
  isSummer = false,
  isComplete = true
}) {
  return calculateAcademicRisk({
    currentGwa: isComplete ? avgGwa : null,
    absenceCount,
    consecutiveAbsences,
    zeroSubmissionsCount,
    previousTermRating,
    currentTermRating,
    isSummer
  });
}

// ── Shared threshold helpers (single source of truth for all portals) ──────

/**
 * Returns true if the student should be counted in the "At-Risk" KPI.
 * Only HIGH and CRITICAL trigger the at-risk count.
 */
export function isStudentAtRisk(riskLevel) {
  return riskLevel === 'high' || riskLevel === 'critical';
}

/**
 * Returns true if the student is in the "Moderate Watch" tier.
 * Moderate students need tutoring support but are NOT counted as at-risk.
 */
export function isStudentModerateRisk(riskLevel) {
  return riskLevel === 'moderate';
}

/**
 * Computes difference between baseline and followup snapshots to measure outcome.
 */
export function calculateInterventionOutcome(baseline, followup) {
  if (!baseline || !followup) return null;

  const scoreDelta = (followup.risk_score || 0) - (baseline.risk_score || 0);
  const examDelta = (followup.exam_average || 0) - (baseline.exam_average || 0);
  const gwaDelta = (followup.gwa !== null && baseline.gwa !== null) ? (parseFloat(baseline.gwa) - parseFloat(followup.gwa)) : 0;

  return {
    riskScoreChange: scoreDelta,      // negative is good (e.g. -36 points)
    examAverageChange: examDelta,     // positive is good (e.g. +11%)
    gwaImprovement: gwaDelta,         // positive is good (e.g. +0.25)
    tasksCompletionRate: baseline.tasks_total > 0 
      ? Math.round(((followup.tasks_completed || 0) / baseline.tasks_total) * 100) 
      : 0,
    improved: scoreDelta < 0 || examDelta > 0
  };
}
