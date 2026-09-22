// src/lib/riskEngine.js
// Centralized Explainable Multi-Factor Academic Risk Engine for ASPIRE v3.1

export const RISK_WEIGHTS = {
  gwa: 0.35,        // 35% Academic Standing
  assessment: 0.30, // 30% Course failures & Major Exam ratings
  attendance: 0.15, // 15% Absences & FDA Proximity
  trajectory: 0.20  // 20% Performance Momentum
};

/**
 * Computes an explainable 0-100 risk score and categorical classification.
 * 
 * @param {Object} params
 * @param {number|null} params.currentGwa - Student current running GWA (1.00 - 5.00)
 * @param {number} [params.failingSubjectsCount=0] - Number of subjects with rating < 75
 * @param {number} [params.majorExamAverage=100] - Average percentage score on major exams (0-100)
 * @param {number} [params.absenceCount=0] - Total recorded absences in subject
 * @param {number|null} [params.previousTermRating=null] - Previous term rating (e.g., Prelim: 82)
 * @param {number|null} [params.currentTermRating=null] - Current term rating (e.g., Midterm: 74)
 * @returns {Object} Full explainable evaluation object
 */
export function calculateAcademicRisk({
  currentGwa = null,
  failingSubjectsCount = 0,
  majorExamAverage = 100,
  absenceCount = 0,
  previousTermRating = null,
  currentTermRating = null
}) {
  // 1. GWA Factor (0 - 100 scale: 1.00 -> 0 pts, 3.00 -> 60 pts, 5.00 -> 100 pts)
  let rawGwaScore = 0;
  let gwaDetail = "Good standing";
  if (currentGwa !== null && !isNaN(currentGwa)) {
    const clampedGwa = Math.max(1.0, Math.min(5.0, parseFloat(currentGwa)));
    rawGwaScore = Math.round(((clampedGwa - 1.0) / 4.0) * 100);
    gwaDetail = `Current GWA: ${clampedGwa.toFixed(2)}`;
  }

  // 2. Assessment Factor (0 - 100 scale)
  let rawAssessScore = 0;
  if (failingSubjectsCount === 1) rawAssessScore += 40;
  else if (failingSubjectsCount >= 2) rawAssessScore += 80;

  if (majorExamAverage < 60) {
    const examDeficit = Math.round(((60 - majorExamAverage) / 60) * 20);
    rawAssessScore += examDeficit;
  }
  rawAssessScore = Math.min(100, rawAssessScore);
  const assessDetail = `${failingSubjectsCount} failing subject(s), Exam Avg: ${Math.round(majorExamAverage)}%`;

  // 3. Attendance Factor (0 - 100 scale)
  // DYCI standard: 4 absences = FDA warning/threshold
  let rawAttendScore = 0;
  let attendDetail = `${absenceCount} absences`;
  if (absenceCount === 3) {
    rawAttendScore = 40;
    attendDetail = "3 absences (Approaching FDA threshold)";
  } else if (absenceCount >= 4) {
    rawAttendScore = 100;
    attendDetail = "4+ absences (FDA Threshold reached)";
  }

  // 4. Trajectory Factor (0 - 100 scale)
  let rawTrajScore = 0;
  let trajDelta = 0;
  let trajDetail = "Stable trajectory";
  if (previousTermRating !== null && currentTermRating !== null) {
    trajDelta = currentTermRating - previousTermRating;
    if (trajDelta < 0) {
      // Declining performance: drop of 5% -> 33 pts, 10% -> 66 pts, 15%+ -> 100 pts
      rawTrajScore = Math.min(100, Math.round(Math.abs(trajDelta) * 6.67));
      trajDetail = `Performance dropped by ${Math.abs(trajDelta).toFixed(1)}%`;
    } else {
      trajDetail = `Performance improved by +${trajDelta.toFixed(1)}%`;
    }
  }

  // Compute final weighted composite score (0 - 100)
  const gwaContributed = Math.round(RISK_WEIGHTS.gwa * rawGwaScore);
  const assessContributed = Math.round(RISK_WEIGHTS.assessment * rawAssessScore);
  const attendContributed = Math.round(RISK_WEIGHTS.attendance * rawAttendScore);
  const trajContributed = Math.round(RISK_WEIGHTS.trajectory * rawTrajScore);

  const compositeScore = Math.min(100, gwaContributed + assessContributed + attendContributed + trajContributed);

  // Classification Tiers
  let riskLevel = 'low';
  let badgeColor = 'emerald';
  if (compositeScore >= 75) {
    riskLevel = 'critical';
    badgeColor = 'rose';
  } else if (compositeScore >= 50) {
    riskLevel = 'high';
    badgeColor = 'rose';
  } else if (compositeScore >= 25) {
    riskLevel = 'moderate';
    badgeColor = 'amber';
  }

  return {
    composite_score: compositeScore,
    risk_level: riskLevel,
    badge_color: badgeColor,
    trajectory_delta: trajDelta,
    factors: {
      gwa: {
        raw_value: currentGwa,
        points_contributed: gwaContributed,
        detail: gwaDetail
      },
      assessment: {
        failing_subjects_count: failingSubjectsCount,
        exam_average: majorExamAverage,
        points_contributed: assessContributed,
        detail: assessDetail
      },
      attendance: {
        absence_count: absenceCount,
        points_contributed: attendContributed,
        detail: attendDetail
      },
      trajectory: {
        previous_rating: previousTermRating,
        current_rating: currentTermRating,
        delta: trajDelta,
        points_contributed: trajContributed,
        detail: trajDetail
      }
    }
  };
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
