// Institutional policy helpers. Per-subject grading-component weights remain
// in the database grading template, never in this module.

export const GRADE_SCALE = Object.freeze({ passingCutoff: 3, failedValue: 5 });
export const TRANSMUTATION_LADDER = Object.freeze([
  { minRating: 98, gwa: 1 }, { minRating: 95, gwa: 1.25 }, { minRating: 92, gwa: 1.5 },
  { minRating: 89, gwa: 1.75 }, { minRating: 86, gwa: 2 }, { minRating: 83, gwa: 2.25 },
  { minRating: 80, gwa: 2.5 }, { minRating: 77, gwa: 2.75 }, { minRating: 75, gwa: 3 }
]);
export const HONORS = Object.freeze({
  ceiling: 1.75,
  subjectGradeFloor: 2,
  minimumUnits: 18,
  tiers: Object.freeze([
    { key: 'sapientia', name: 'Sapientia', maxGwa: 1.25 },
    { key: 'excellentia', name: 'Excellentia', maxGwa: 1.5 },
    { key: 'virtus', name: 'Virtus', maxGwa: 1.75 }
  ])
});
export const ATTENDANCE = Object.freeze({ warningAbsences: 2, nearFdaAbsences: 3, fdaAbsences: 4, statuses: Object.freeze(['Present', 'Absent', 'Late', 'Excused']) });
export const RISK_TIERS = Object.freeze({
  LOW: { min: 0, max: 24, label: 'low', color: 'emerald' },
  MODERATE: { min: 25, max: 49, label: 'moderate', color: 'amber' },
  HIGH: { min: 50, max: 74, label: 'high', color: 'rose' },
  CRITICAL: { min: 75, max: 100, label: 'critical', color: 'rose' }
});
export const RISK_DISPLAY = Object.freeze({
  low: Object.freeze({ label: 'Safe', description: 'No current concern.' }),
  moderate: Object.freeze({ label: 'Watch', description: 'The student may need attention.' }),
  high: Object.freeze({ label: 'High', description: 'Timely faculty support is recommended.' }),
  critical: Object.freeze({ label: 'Critical', description: 'Prompt review and intervention are needed.' })
});
export const getRiskDisplay = (tier = 'low') => RISK_DISPLAY[String(tier).toLowerCase()] || RISK_DISPLAY.low;
export const GWA_BANDS = Object.freeze([
  { max: 1.25, label: 'Sapientia' }, { max: 1.5, label: 'Excellentia' },
  { max: 1.75, label: 'Virtus' }, { max: 2.5, label: 'Satisfactory' },
  { max: 3, label: 'Passing Margin' }, { max: Infinity, label: 'Academic Warning' }
]);

export function toGwaOrNull(rating) {
  if (rating === null || rating === undefined || rating === '' || !Number.isFinite(Number(rating))) return null;
  return TRANSMUTATION_LADDER.find(item => Number(rating) >= item.minRating)?.gwa ?? GRADE_SCALE.failedValue;
}

export function resolveOfficialGwa(row = {}) {
  const effective = Number(row.effective_grade);
  if (row.effective_grade !== null && row.effective_grade !== undefined && Number.isFinite(effective) && effective >= 1 && effective <= 5) return { gwa: effective, rating: Number(row.computed_grade), source: 'effective_grade' };
  const rating = Number(row.computed_grade);
  if (row.computed_grade !== null && row.computed_grade !== undefined && Number.isFinite(rating)) return { gwa: toGwaOrNull(rating), rating, source: 'computed_grade' };
  return { gwa: null, rating: null, source: null };
}

export function computeStudentGwa(entries = []) {
  const values = entries.map(entry => Number(entry?.gwa ?? entry)).filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
  return { gwa: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, n: values.length, method: 'plain_mean' };
}
export const averageCohortGwa = (gwas = []) => computeStudentGwa(gwas);
export const getGwaBand = (gwa) => Number.isFinite(Number(gwa)) ? GWA_BANDS.find(band => Number(gwa) <= band.max) || null : null;

export function getHonorTier(gwa, { subjectGrades = [], hasInc = false, units = 0 } = {}) {
  const value = Number(gwa);
  const unmetRequirements = [];
  if (!Number.isFinite(value)) unmetRequirements.push('Pending official grades.');
  else if (value > HONORS.ceiling) unmetRequirements.push('GWA exceeds the 1.75 President\'s List ceiling.');
  if (subjectGrades.some(grade => Number.isFinite(Number(grade)) && Number(grade) > HONORS.subjectGradeFloor)) unmetRequirements.push('A subject grade is above the 2.00 grade floor.');
  if (hasInc) unmetRequirements.push('Incomplete grades are not eligible for President\'s List.');
  if (Number(units) < HONORS.minimumUnits) unmetRequirements.push('The enrolled load is below 18 units.');
  const tier = unmetRequirements.length ? null : HONORS.tiers.find(item => value <= item.maxGwa)?.name || null;
  return { tier, isEligible: Boolean(tier), unmetRequirements };
}

export const getRemarks = ({ gwa, isComplete = true } = {}) => !isComplete || gwa === null || gwa === undefined || !Number.isFinite(Number(gwa)) ? 'In Progress' : Number(gwa) <= GRADE_SCALE.passingCutoff ? 'Passed' : 'Failed';

// Canonical remark vocabulary. Display labels are what the UI shows; DB values are the
// lowercase enum `posted_grades.remarks` actually stores. One mapping, both directions —
// so INC/FDA/Dropped never collapse to a binary Passed/Failed in either direction.
export const REMARKS = Object.freeze({ PASSED: 'Passed', FAILED: 'Failed', IN_PROGRESS: 'In Progress', INCOMPLETE: 'Incomplete (INC)', FDA: 'FDA', DROPPED: 'Dropped' });
export const DB_REMARKS = Object.freeze({ PASSED: 'passed', FAILED: 'failed', INCOMPLETE: 'incomplete', FDA: 'fda', DROPPED: 'dropped' });
const DISPLAY_TO_DB = Object.freeze({ passed: DB_REMARKS.PASSED, failed: DB_REMARKS.FAILED, inc: DB_REMARKS.INCOMPLETE, incomplete: DB_REMARKS.INCOMPLETE, fda: DB_REMARKS.FDA, dropped: DB_REMARKS.DROPPED });
const DB_TO_DISPLAY = Object.freeze({ passed: REMARKS.PASSED, failed: REMARKS.FAILED, incomplete: REMARKS.INCOMPLETE, fda: REMARKS.FDA, dropped: REMARKS.DROPPED });
// Any unencoded/no-verdict case ('In Progress', null, unrecognized) must not silently post
// as a passing grade — callers posting to the DB should gate on isComplete before calling this.
export const toDbRemark = (displayRemark) => DISPLAY_TO_DB[String(displayRemark || '').trim().toLowerCase()] ?? DB_REMARKS.FAILED;
// Never collapses an unrecognized/legacy value to "Failed" silently — surfaces it as-is instead.
export const toDisplayRemark = (dbRemark) => DB_TO_DISPLAY[String(dbRemark || '').trim().toLowerCase()] ?? (dbRemark || REMARKS.IN_PROGRESS);

export const isOfficialPassingRemark = (remark) => (
  String(remark || '').trim().toLowerCase() === DB_REMARKS.PASSED
);

export const isOfficialFailingRemark = (remark) => (
  [DB_REMARKS.FAILED, DB_REMARKS.FDA].includes(String(remark || '').trim().toLowerCase())
);

/**
 * Resolves the official academic outcome without deriving over an explicit
 * stored remark. INC, FDA, and Dropped must survive every consumer unchanged.
 */
export function resolveOfficialGradeState(row = {}) {
  const rawRemark = String(row.remarks ?? row.remark ?? '').trim().toLowerCase();
  const { gwa, rating, source } = resolveOfficialGwa(row);
  const dbRemark = Object.values(DB_REMARKS).includes(rawRemark)
    ? rawRemark
    : (gwa === null ? null : (gwa <= GRADE_SCALE.passingCutoff ? DB_REMARKS.PASSED : DB_REMARKS.FAILED));
  return {
    gwa,
    rating,
    source,
    dbRemark,
    displayRemark: toDisplayRemark(dbRemark),
    isPassing: isOfficialPassingRemark(dbRemark),
    isFailing: isOfficialFailingRemark(dbRemark),
    isExceptional: [DB_REMARKS.INCOMPLETE, DB_REMARKS.FDA, DB_REMARKS.DROPPED].includes(dbRemark)
  };
}

// Passed and Failed are derived from the current official GWA. They must not be
// reloaded as manual overrides after a score correction, or a formerly failing
// student can remain marked Failed after earning a passing SG. These exceptional
// remarks cannot be inferred from the GWA, so they remain explicit overrides.
export const getPersistentRemarkOverride = (dbRemark) => {
  switch (String(dbRemark || '').trim().toLowerCase()) {
    case DB_REMARKS.INCOMPLETE: return 'INC';
    case DB_REMARKS.FDA: return REMARKS.FDA;
    case DB_REMARKS.DROPPED: return REMARKS.DROPPED;
    default: return '';
  }
};
export const getRiskTierForScore = (score) => Object.values(RISK_TIERS).find(tier => Math.max(0, Math.min(100, Number(score) || 0)) >= tier.min && Math.max(0, Math.min(100, Number(score) || 0)) <= tier.max) || RISK_TIERS.LOW;
export const normalizeAttendanceStatus = (status) => ATTENDANCE.statuses.find(item => item.toLowerCase() === String(status || '').trim().toLowerCase()) || null;
export function countAttendance(records = []) { const statuses = records.map(record => normalizeAttendanceStatus(record?.status ?? record)).filter(Boolean); const absences = statuses.filter(status => status === 'Absent').length; return { total: statuses.length, absences, attendanceRate: statuses.length ? Math.round(((statuses.length - absences) / statuses.length) * 100) : 100 }; }
export const getAttendanceFlags = (absences) => { const count = Number(absences) || 0; return { isWarning: count >= ATTENDANCE.warningAbsences, isNearFda: count >= ATTENDANCE.nearFdaAbsences, isFda: count >= ATTENDANCE.fdaAbsences }; };
export function evaluateFdaDecision({ absences = 0, selected = false, reason = '' } = {}) {
  const absenceCount = Math.max(0, Number(absences) || 0);
  const recommended = absenceCount >= ATTENDANCE.fdaAbsences;
  if (!selected) return { ok: true, recommended, selected: false, effectiveGrade: null, error: null };
  if (!recommended) {
    return {
      ok: false,
      recommended,
      selected: true,
      effectiveGrade: null,
      error: `FDA requires at least ${ATTENDANCE.fdaAbsences} recorded absences in the subject.`
    };
  }
  if (!String(reason || '').trim()) {
    return { ok: false, recommended, selected: true, effectiveGrade: null, error: 'A written faculty reason is required for FDA.' };
  }
  return { ok: true, recommended, selected: true, effectiveGrade: GRADE_SCALE.failedValue, error: null };
}
// Number of subjects whose own absences reach the FDA threshold (FDA is per subject, never combined).
export const countFdaSubjects = (attendanceRecords = []) => { const byClass = {}; attendanceRecords.forEach(record => { const key = record?.class_record_id; if (!key) return; (byClass[key] ||= []).push(record); }); return Object.values(byClass).filter(records => getAttendanceFlags(countAttendance(records).absences).isFda).length; };

/**
 * Student academic verdict shared by the dashboard AI Standing card and the AI Study Tutor.
 * 'continue' = Safe, 'at_risk' = Struggling, 'recommend_shift' = At Risk.
 * hasFdaSubject is true when any single subject reaches 4 absences (per subject, not combined).
 */
export function computeAcademicVerdict({ gwa = null, hasFdaSubject = false, failingCount = 0 } = {}) {
  const value = gwa === null || gwa === undefined || gwa === '' ? null : Number(gwa);
  const hasGwa = value !== null && Number.isFinite(value);
  if ((hasGwa && value > 3.00) || failingCount > 1) return 'recommend_shift';
  if ((hasGwa && value > 2.50) || hasFdaSubject || failingCount === 1) return 'at_risk';
  return 'continue';
}
