// Pure helpers shared by roster, tracker, and focused regression checks.
export const EVALUATION_TERMS = Object.freeze(['Prelim', 'Midterm', 'Semi-Final', 'Final']);

export function getTermsForPeriod(semester) {
  if (typeof semester === 'string' && semester.toLowerCase().includes('summer')) {
    return ['Midterm', 'Final'];
  }
  return [...EVALUATION_TERMS];
}

export function scoreOrNull(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function countRecordedZeroScores(termScores, columns, activities = [], granularScores = []) {
  // Dynamic activities replace the legacy slots for their term; never count both.
  const dynamicTerms = new Set(activities.map(activity => activity.term));
  const activityMap = new Map(activities.map(activity => [activity.activity_id, activity]));
  let count = 0;
  for (const row of termScores) {
    if (!row.term || dynamicTerms.has(row.term)) continue;
    for (const key of ['act1', 'act2', 'act3', 'act4', 'act5', 'act6']) {
      if ((columns[row.term]?.[key] ?? 0) > 0 && scoreOrNull(row[key]) === 0) count++;
    }
  }
  for (const row of granularScores) {
    if (Number(activityMap.get(row.activity_id)?.max_score) > 0 && scoreOrNull(row.score) === 0) count++;
  }
  return count;
}

// Compatibility alias: this counts recorded numeric zeros, not null/ungraded
// activities and not a confirmed submission status.
export const countMissingActivities = countRecordedZeroScores;

export function countPendingActivities(activities = [], granularScores = []) {
  const scoreMap = new Map(granularScores.map(row => [row.activity_id, scoreOrNull(row.score)]));
  return activities.filter(activity =>
    Number(activity.max_score) > 0
    && (!scoreMap.has(activity.activity_id) || scoreMap.get(activity.activity_id) === null)
  ).length;
}

// Compatibility alias for older callers. Activity visibility is automatic now;
// pending means the saved activity has no recorded numeric score.
export const countPendingReleasedActivities = countPendingActivities;

export function manilaDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(value);
}

export function taskState(task, today = manilaDate()) {
  if (task.completed === true) return 'Reported complete';
  const due = task.due_date;
  const valid = typeof due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due)
    && !Number.isNaN(Date.parse(`${due}T00:00:00Z`))
    && new Date(`${due}T00:00:00Z`).toISOString().slice(0, 10) === due;
  return valid && due < today ? 'Overdue' : 'Pending';
}

export function needsEvaluation(student, evaluations, term, threshold) {
  return Boolean(term) && (student.risk_score ?? 0) >= threshold
    && !evaluations.some(item => item.student_id === student.user_id && item.term === term);
}

export function isStudentVisibleEvaluation(evaluation) {
  return ['submitted', 'acknowledged_by_student'].includes(evaluation?.status)
    && Boolean(evaluation?.published_to_student_at);
}

export function referralEligibility(evaluation, classRecord, facultyId, history = false) {
  if (evaluation.refer_to_dean) return 'Already referred';
  if (history || classRecord?.faculty_id !== facultyId) return 'History is read-only';
  if (classRecord?.status !== 'active') return 'Class is inactive';
  if (!['submitted', 'acknowledged_by_student'].includes(evaluation.status)) return 'Publish the evaluation first';
  return '';
}
