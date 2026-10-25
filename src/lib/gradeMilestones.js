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

/**
 * Returns the user-facing reason a grading period cannot be posted yet.
 * Posting follows one sequence: MR, then TFR, then SG.
 */
export function getGradePeriodSequenceBlock(targetPeriod, postedCoverage = []) {
  const coverage = new Set(postedCoverage || []);
  const hasMr = coverage.has('Midterm Rating');
  const hasTfr = coverage.has('Tentative Final Rating');

  if (targetPeriod === 'tfr' && !hasMr) {
    return 'Post the Midterm Rating (MR) before posting the Tentative Final Rating (TFR).';
  }
  if (targetPeriod === 'semestral' && (!hasMr || !hasTfr)) {
    const missing = [
      !hasMr ? 'Midterm Rating (MR)' : null,
      !hasTfr ? 'Tentative Final Rating (TFR)' : null
    ].filter(Boolean).join(' and ');
    return `Post the ${missing} before finalizing the Semestral Grade (SG).`;
  }
  return null;
}

export function isSummerClass(classInfo) {
  return [classInfo?.sections?.semester, classInfo?.semester]
    .some(value => String(value || '').trim().toLowerCase().includes('summer'));
}

export function getRequiredTermsForPostingTarget(targetMilestone, { isSummer = false } = {}) {
  if (targetMilestone === 'midterm') return isSummer ? ['Midterm'] : ['Prelim', 'Midterm'];
  if (targetMilestone === 'tfr') return isSummer ? ['Final'] : ['Semi-Final', 'Final'];
  return isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
}

export function getMilestonePostingPresentation(targetMilestone, { isSummer = false } = {}) {
  if (targetMilestone === 'midterm') {
    return {
      gradePeriod: GRADE_MILESTONES.MIDTERM_RATING,
      notificationName: isSummer ? 'Midterm Grade' : 'Midterm Rating (MR)',
      milestoneLock: 'Midterm Rating'
    };
  }
  if (targetMilestone === 'tfr') {
    return {
      gradePeriod: GRADE_MILESTONES.TENTATIVE_FINAL_RATING,
      notificationName: isSummer ? 'Final Grade (TFR)' : 'Tentative Final Rating (TFR)',
      milestoneLock: 'Tentative Final Rating'
    };
  }
  return {
    gradePeriod: GRADE_MILESTONES.SEMESTRAL_GRADE,
    notificationName: 'Official Semestral Grade (SG)',
    milestoneLock: 'Semestral Grade'
  };
}

export function getGradePostingAuditAction({ targetMilestone, isFirstPost, changedCount = 0 }) {
  const milestoneName = targetMilestone === 'midterm'
    ? 'Midterm Rating'
    : targetMilestone === 'tfr'
      ? 'Tentative Final Rating'
      : 'Semestral Grade';

  if (isFirstPost) return `Posted ${milestoneName}`;
  if (Number(changedCount) > 0) {
    return targetMilestone === 'semestral'
      ? 'Applied Semestral Grade Correction'
      : `Updated ${milestoneName}`;
  }
  return `Reposted ${milestoneName} (No Change)`;
}

export function getUpdatedMilestoneLocks(existingLocks, targetMilestone, { isSummer = false } = {}) {
  const coveredTerms = getRequiredTermsForPostingTarget(targetMilestone, { isSummer });
  const { milestoneLock } = getMilestonePostingPresentation(targetMilestone, { isSummer });
  return Array.from(new Set([
    ...(existingLocks || []),
    ...coveredTerms,
    milestoneLock
  ]));
}

const normalizeMilestoneLabel = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

/**
 * Returns true when a term is already covered by a posted milestone. Scores in
 * covered terms may be corrected, but an existing numeric value must never be
 * cleared back to NULL because that would silently invalidate the posted basis.
 */
export function isTermCoveredByPostedMilestone(term, lockedMilestones = []) {
  const normalizedTerm = normalizeMilestoneLabel(term);
  const locks = new Set((lockedMilestones || []).map(normalizeMilestoneLabel));

  if (locks.has('semestral_grade') || locks.has('sg')) return true;
  if (locks.has(normalizedTerm)) return true;

  if (['prelim', 'midterm'].includes(normalizedTerm)) {
    return locks.has('midterm_rating') || locks.has('mr');
  }
  if (['semi_final', 'final'].includes(normalizedTerm)) {
    return locks.has('tentative_final_rating') || locks.has('tfr');
  }
  return false;
}

const addCoverageForLabel = (coverage, label) => {
  const normalized = normalizeMilestoneLabel(label);
  if (['semestral_grade', 'sg'].includes(normalized)) {
    ['Prelim', 'Midterm', 'Semi-Final', 'Final', 'Semestral Grade'].forEach(item => coverage.add(item));
    return;
  }
  if (['tentative_final_rating', 'tfr'].includes(normalized)) {
    ['Semi-Final', 'Final', 'Tentative Final Rating'].forEach(item => coverage.add(item));
    return;
  }
  if (['midterm_rating', 'mr'].includes(normalized)) {
    ['Prelim', 'Midterm', 'Midterm Rating'].forEach(item => coverage.add(item));
    return;
  }
  if (normalized === 'semi_final') coverage.add('Semi-Final');
  else if (normalized === 'prelim') coverage.add('Prelim');
  else if (normalized === 'midterm') coverage.add('Midterm');
  else if (normalized === 'final') coverage.add('Final');
};

export function getPostedMilestoneCoverage(row) {
  const coverage = new Set();
  addCoverageForLabel(coverage, getCanonicalGradePeriod(row));
  (row?.locked_milestones || []).forEach(label => addCoverageForLabel(coverage, label));
  return [...coverage];
}

export function collectPostedMilestoneCoverage(rows = [], { lockedOnly = false } = {}) {
  const coverage = new Set();
  rows.forEach(row => {
    if (lockedOnly && !row?.is_locked) return;
    getPostedMilestoneCoverage(row).forEach(label => coverage.add(label));
  });
  return [...coverage];
}

export function findPostedMilestone(rows, milestone) {
  const exact = (rows || []).find(row => String(row?.grade_period || '').toLowerCase() === milestone);
  return exact || (rows || []).find(row => isGradeMilestone(row, milestone)) || null;
}

/**
 * Finds only a posted row that represents one individual academic period.
 * Aggregate MR, TFR, and SG records must never replace the Midterm or Final
 * period calculation in a score breakdown.
 *
 * The current posting workflow stores aggregate milestones only. Prelim and
 * Semi-Final are retained here for compatibility with older posted rows whose
 * identities are unambiguous. Legacy `midterm` and `final` identities are
 * aggregate aliases, so they are intentionally excluded.
 */
export function findPostedTermGrade(rows, term) {
  const gradePeriod = term === 'Prelim'
    ? 'prelim'
    : term === 'Semi-Final' ? 'semi_final' : null;
  if (!gradePeriod) return null;

  return (rows || []).find(row => (
    String(row?.grade_period || '').trim().toLowerCase() === gradePeriod
  )) || null;
}

export function findMostAdvancedPostedGrade(rows) {
  return findPostedMilestone(rows, GRADE_MILESTONES.SEMESTRAL_GRADE)
    || findPostedMilestone(rows, GRADE_MILESTONES.TENTATIVE_FINAL_RATING)
    || findPostedMilestone(rows, GRADE_MILESTONES.MIDTERM_RATING)
    || null;
}
