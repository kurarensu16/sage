export const GRADE_MILESTONES = Object.freeze({
  MIDTERM_RATING: 'midterm_rating',
  TENTATIVE_FINAL_RATING: 'tentative_final_rating',
  SEMESTRAL_GRADE: 'semestral_grade'
});

const CANONICAL_PERIODS = new Set(Object.values(GRADE_MILESTONES));

const normalizeLocks = (row) => (row?.locked_milestones || [])
  .map(value => String(value).trim().toLowerCase());

/**
 * Normalizes old midterm/final rows while preserving explicit new identities.
 * Legacy final rows are classified from locked milestones; old rows with no
 * usable metadata default to semestral_grade because final posting historically
 * overwrote the earlier TFR row.
 */
export function getCanonicalGradePeriod(row) {
  const period = String(row?.grade_period || '').trim().toLowerCase();
  if (CANONICAL_PERIODS.has(period)) return period;
  if (period === 'mr') return GRADE_MILESTONES.MIDTERM_RATING;
  if (period === 'tfr') return GRADE_MILESTONES.TENTATIVE_FINAL_RATING;
  if (period === 'sg') return GRADE_MILESTONES.SEMESTRAL_GRADE;
  if (period === 'midterm') return GRADE_MILESTONES.MIDTERM_RATING;

  if (period === 'final') {
    const locks = normalizeLocks(row);
    if (locks.includes('semestral grade') || locks.includes('semestral_grade')) {
      return GRADE_MILESTONES.SEMESTRAL_GRADE;
    }
    if (locks.includes('tentative final rating') || locks.includes('tentative_final_rating')) {
      return GRADE_MILESTONES.TENTATIVE_FINAL_RATING;
    }
    return GRADE_MILESTONES.SEMESTRAL_GRADE;
  }

  return period;
}

export function isGradeMilestone(row, milestone) {
  return getCanonicalGradePeriod(row) === milestone;
}

export function getMilestoneForPostingTarget(targetMilestone) {
  if (targetMilestone === 'midterm') return GRADE_MILESTONES.MIDTERM_RATING;
  if (targetMilestone === 'tfr') return GRADE_MILESTONES.TENTATIVE_FINAL_RATING;
  return GRADE_MILESTONES.SEMESTRAL_GRADE;
}

export function findPostedMilestone(rows, milestone) {
  const exact = (rows || []).find(row => String(row?.grade_period || '').toLowerCase() === milestone);
  return exact || (rows || []).find(row => isGradeMilestone(row, milestone)) || null;
}

export function findMostAdvancedPostedGrade(rows) {
  return findPostedMilestone(rows, GRADE_MILESTONES.SEMESTRAL_GRADE)
    || findPostedMilestone(rows, GRADE_MILESTONES.TENTATIVE_FINAL_RATING)
    || findPostedMilestone(rows, GRADE_MILESTONES.MIDTERM_RATING)
    || null;
}
