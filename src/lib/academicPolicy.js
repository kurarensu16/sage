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
export const getRiskTierForScore = (score) => Object.values(RISK_TIERS).find(tier => Math.max(0, Math.min(100, Number(score) || 0)) >= tier.min && Math.max(0, Math.min(100, Number(score) || 0)) <= tier.max) || RISK_TIERS.LOW;
export const normalizeAttendanceStatus = (status) => ATTENDANCE.statuses.find(item => item.toLowerCase() === String(status || '').trim().toLowerCase()) || null;
export function countAttendance(records = []) { const statuses = records.map(record => normalizeAttendanceStatus(record?.status ?? record)).filter(Boolean); const absences = statuses.filter(status => status === 'Absent').length; return { total: statuses.length, absences, attendanceRate: statuses.length ? Math.round(((statuses.length - absences) / statuses.length) * 100) : 100 }; }
export const getAttendanceFlags = (absences) => { const count = Number(absences) || 0; return { isWarning: count >= ATTENDANCE.warningAbsences, isNearFda: count >= ATTENDANCE.nearFdaAbsences, isFda: count >= ATTENDANCE.fdaAbsences }; };
