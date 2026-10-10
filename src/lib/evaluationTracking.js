// Pure helpers shared by roster, tracker, and focused regression checks.
import { calculateInterventionOutcome } from './riskEngine.js';

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

// 'verified' (faculty confirmed), 'reported' (student checked, awaiting faculty),
// 'returned' (faculty sent it back with a note), or 'open'.
export function taskVerification(task) {
  if (task?.verification_status === 'verified') return 'verified';
  if (task?.completed === true) return 'reported';
  if (task?.verification_status === 'returned') return 'returned';
  return 'open';
}

export function countTaskProgress(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  return {
    total: list.length,
    reported: list.filter(task => task?.completed === true).length,
    verified: list.filter(task => taskVerification(task) === 'verified').length
  };
}

export function taskState(task, today = manilaDate()) {
  const state = taskVerification(task);
  if (state === 'verified') return 'Verified by instructor';
  if (state === 'reported') return 'Reported, awaiting verification';
  const due = task.due_date;
  const valid = typeof due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due)
    && !Number.isNaN(Date.parse(`${due}T00:00:00Z`))
    && new Date(`${due}T00:00:00Z`).toISOString().slice(0, 10) === due;
  const overdue = valid && due < today;
  if (state === 'returned') return overdue ? 'Returned · Overdue' : 'Returned to student';
  return overdue ? 'Overdue' : 'Pending';
}

// Official aggregate milestones that can serve as an intervention follow-up point.
export const FOLLOWUP_MILESTONES = Object.freeze(['midterm_rating', 'tentative_final_rating', 'semestral_grade']);
export const FOLLOWUP_MILESTONE_LABELS = Object.freeze({
  midterm_rating: 'Midterm Rating',
  tentative_final_rating: 'Tentative Final Rating',
  semestral_grade: 'Semestral Grade'
});

// Mirrors record_intervention_followup: the latest MR/TFR/SG posted for the same
// class and student after the evaluation was published.
export function findFollowupMilestone(evaluation, postedRows = []) {
  const since = Date.parse(evaluation?.published_to_student_at || '');
  if (!Number.isFinite(since)) return null;
  return postedRows
    .filter(row => row.class_record_id === evaluation.class_record_id
      && row.student_id === evaluation.student_id
      && FOLLOWUP_MILESTONES.includes(row.grade_period)
      && Date.parse(row.posted_at) > since)
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))[0] || null;
}

export function summarizeInterventionOutcome(evaluation, followupMilestone = null) {
  const baseline = evaluation?.baseline_snapshot || {};
  const followup = evaluation?.followup_snapshot || null;
  const outcome = followup ? calculateInterventionOutcome(baseline, followup) : null;
  const live = countTaskProgress(evaluation?.advising_plan);
  const tasks = followup
    ? { total: outcome.tasksTotal, verified: outcome.tasksVerified, reported: Number(followup.tasks_reported) || 0 }
    : live;
  let status = 'In intervention';
  if (followup) {
    status = { improved: 'Improved', unchanged: 'Unchanged', worsened: 'Worsened' }[outcome.riskTransition] || 'Follow-up recorded';
  } else if (followupMilestone) {
    status = 'Follow-up due';
  } else if (evaluation?.refer_to_dean) {
    status = 'Escalated to Dean';
  }
  return {
    baseline,
    followup,
    outcome,
    tasks,
    completionRate: tasks.total > 0 ? Math.round((tasks.verified / tasks.total) * 100) : null,
    followupDue: !followup && Boolean(followupMilestone),
    status
  };
}

export function needsEvaluation(student, evaluations, term, threshold) {
  return Boolean(term) && (student.risk_score ?? 0) >= threshold
    && !evaluations.some(item => item.student_id === student.user_id && item.term === term);
}

export function isStudentVisibleEvaluation(evaluation) {
  return ['submitted', 'acknowledged_by_student'].includes(evaluation?.status)
    && Boolean(evaluation?.published_to_student_at);
}

// Mirrors acknowledge_student_evaluation: a faculty change to the plan clears it.
export function isAcknowledged(evaluation) {
  return evaluation?.status === 'acknowledged_by_student' && Boolean(evaluation?.acknowledged_at);
}

export function referralEligibility(evaluation, classRecord, facultyId, history = false) {
  if (evaluation.refer_to_dean) return 'Already referred';
  if (history || classRecord?.faculty_id !== facultyId) return 'History is read-only';
  if (classRecord?.status !== 'active') return 'Class is inactive';
  if (!['submitted', 'acknowledged_by_student'].includes(evaluation.status)) return 'Publish the evaluation first';
  return '';
}
