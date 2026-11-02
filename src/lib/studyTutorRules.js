// AI Study Tutor: the rules that are pure functions of their input.
//
// Kept apart from studyTutorService.js for the same reason gradeChangeRules.js
// is kept apart from its service: that module opens a Supabase client, which
// cannot be imported outside a browser, and the logic here decides what the
// student is offered. Splitting it out is what lets the verify scripts assert
// it -- the same split that caught real defects in Phases 5 and 6.
//
// Nothing here talks to the network.

// Explicit extension: the verify scripts load this in Node, which does not
// resolve extensionless specifiers the way Vite does.
import { DEFAULT_PASSING_THRESHOLD } from './academicPolicy.js';

export const TUTOR_BOUNDARY =
  'This is practice guidance for self-study, not an official grade or faculty decision.';

// --- The menu --------------------------------------------------------------

export const TUTOR_SCOPES = Object.freeze({ OVERALL: 'overall', SUBJECT: 'subject' });

export const TUTOR_ACTIONS = Object.freeze([
  {
    id: 'explain',
    label: 'Explain this concept',
    help: 'A plain-language walkthrough of the topic.'
  },
  {
    id: 'plan',
    label: 'Give me a study plan',
    help: 'A short checklist with suggested timeframes.'
  },
  {
    id: 'practice',
    label: 'Give me practice questions',
    help: 'Five questions, different each time, based on what you have already answered.'
  },
  {
    id: 'resources',
    label: 'Give me resources',
    help: 'Materials your instructor attached to this topic.'
  }
]);

export const TUTOR_HORIZONS = Object.freeze([
  {
    id: 'this_week',
    label: 'This week',
    help: 'A plan with a seven-day deadline.'
  },
  {
    id: 'until_next_assessment',
    label: 'Until my next activity on this topic',
    help: 'No fixed date. It runs until a new graded activity on this topic appears.'
  }
]);

export const PRACTICE_DIFFICULTIES = Object.freeze([
  { id: 'easier', label: 'Easier' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'harder', label: 'Harder' }
]);

// --- Topics ----------------------------------------------------------------

// Faculty may write the tag on either column shape depending on where the row
// came from, which is the same normalisation advisingEngine.js does.
export const topicOf = (activity) =>
  (activity?.topic_tag || activity?.topicTag || '').trim();

/**
 * Roll a student's activities up into topics.
 *
 * A topic "needs review" when the student's average on it falls below the
 * institutional passing threshold. That is a STUDY heuristic, not a grading
 * decision: the tutor never states or implies a grade, and per-class thresholds
 * (which faculty can set) deliberately are not consulted here, because using
 * them would make this look like an assessment of standing.
 *
 * Activities with no score yet are counted in `total` but not in the average --
 * an ungraded quiz says nothing about whether the topic is understood.
 */
export function summarizeTopics(activities = [], scoresByActivityId = {}) {
  const byTopic = new Map();

  for (const activity of activities) {
    const tag = topicOf(activity);
    if (!tag) continue;

    const subjectCode = activity.subjectCode || '';
    const key = `${subjectCode}::${tag}`;
    if (!byTopic.has(key)) {
      byTopic.set(key, {
        key,
        topic: tag,
        subjectCode,
        subjectId: activity.subjectId || null,
        total: 0,
        attempted: 0,
        earned: 0,
        possible: 0
      });
    }

    const entry = byTopic.get(key);
    entry.total += 1;

    const raw = scoresByActivityId[activity.activity_id ?? activity.id];
    const max = Number(activity.max_score ?? activity.max ?? 0);
    if (raw === undefined || raw === null || !Number.isFinite(Number(raw)) || max <= 0) continue;

    entry.attempted += 1;
    entry.earned += Number(raw);
    entry.possible += max;
  }

  return [...byTopic.values()]
    .map((entry) => {
      const percent = entry.possible > 0
        ? Math.round((entry.earned / entry.possible) * 1000) / 10
        : null;
      return {
        ...entry,
        percent,
        // Null percent means nothing is graded yet, which is not the same as
        // doing badly. Treating it as weak would send students to review topics
        // they have not been assessed on.
        needsReview: percent !== null && percent < DEFAULT_PASSING_THRESHOLD
      };
    })
    // Weakest first, then by name so the order is stable between renders.
    .sort((a, b) => {
      if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
      if (a.percent === null && b.percent === null) return a.topic.localeCompare(b.topic);
      if (a.percent === null) return 1;
      if (b.percent === null) return -1;
      if (a.percent !== b.percent) return a.percent - b.percent;
      return a.topic.localeCompare(b.topic);
    });
}

export const weakTopics = (topics = []) => topics.filter((t) => t.needsReview);

// --- Plans -----------------------------------------------------------------

export const planItems = (plan) => (Array.isArray(plan?.items) ? plan.items : []);

export function planProgress(plan) {
  const items = planItems(plan);
  const done = items.filter((i) => i?.done === true).length;
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 };
}

// An empty checklist is NOT finished. Without this guard a plan the model
// returned with no items would immediately read as complete and free its scope
// key, letting a student generate plan after plan.
export function isPlanFinished(plan) {
  const items = planItems(plan);
  return items.length > 0 && items.every((i) => i?.done === true);
}

export const PLAN_STATUS = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  SUPERSEDED: 'superseded',
  ARCHIVED: 'archived',
  DELETED: 'deleted'
});

// What the student is shown for each state. "Superseded" is never surfaced as
// jargon -- from the student's side they replaced it.
export const PLAN_STATUS_LABEL = Object.freeze({
  [PLAN_STATUS.ACTIVE]: 'In progress',
  [PLAN_STATUS.COMPLETED]: 'Finished',
  [PLAN_STATUS.SUPERSEDED]: 'Replaced',
  [PLAN_STATUS.ARCHIVED]: 'Past term',
  [PLAN_STATUS.DELETED]: 'Removed'
});

/**
 * Why a plan might be out of date, in the student's words.
 *
 * `stale_since` is set by a database trigger when new scores or a new activity
 * appear. A stale plan is still worth finishing -- this is "check this", never
 * "discard this".
 */
export function planStaleness(plan) {
  if (!plan?.stale_since) return null;
  return {
    since: plan.stale_since,
    message: 'New scores or activities were recorded since this plan was made. It may be out of date.'
  };
}

/** Past its seven-day deadline. Event-based plans have no deadline at all. */
export function planOverdue(plan, now = new Date()) {
  if (!plan?.deadline_at) return false;
  if (isPlanFinished(plan)) return false;
  return new Date(plan.deadline_at).getTime() < now.getTime();
}
