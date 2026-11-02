// Explicit extension: the verify scripts load this module in Node, which does
// not resolve extensionless specifiers the way Vite does.
import { GRADE_MILESTONES } from './gradeMilestones.js';

// The finality of a grade milestone, as the student sees it.
//
// Kept apart from gradeConsultationService on purpose: that module opens a
// Supabase client, which cannot be imported outside the browser, and this logic
// decides what every student reads about their own grades. It is pure so the
// verify scripts can assert it.
//
// SCOPE: midterm rating and tentative final rating have consultation windows.
// Semestral grade has none by design -- it is the summary of those two, so the
// consultation belongs at the milestones that feed it rather than being
// repeated on the total. SG posts and locks immediately, exactly as before.

export const WINDOWED_MILESTONES = Object.freeze([
  GRADE_MILESTONES.MIDTERM_RATING,
  GRADE_MILESTONES.TENTATIVE_FINAL_RATING
]);

export const MILESTONE_LABEL = Object.freeze({
  [GRADE_MILESTONES.MIDTERM_RATING]: 'Midterm Rating',
  [GRADE_MILESTONES.TENTATIVE_FINAL_RATING]: 'Tentative Final Rating',
  [GRADE_MILESTONES.SEMESTRAL_GRADE]: 'Semestral Grade'
});

export const hasConsultationWindow = (gradePeriod) =>
  WINDOWED_MILESTONES.includes(gradePeriod);

// The three states, derived rather than stored:
//
//   Tentative            no posted row yet
//   Posted — Not Final   posted, window still open -- MR/TFR only
//   Finalized            window closed, or a milestone that never has one
//
// A missing window on a windowed milestone means the row predates Phase 5, so
// it reads Finalized: the pre-window behaviour, where posting locked the grade.
// Reading an older grade as still-open would invite a correction the posting
// RPC will refuse.
export function resolveMilestoneState({ posted, window: win, gradePeriod }) {
  if (!posted) return { state: 'tentative', label: 'Tentative' };
  if (!hasConsultationWindow(gradePeriod)) {
    return { state: 'finalized', label: 'Finalized' };
  }
  if (win?.finalized_at) {
    return { state: 'finalized', label: 'Finalized', at: win.finalized_at };
  }
  if (!win) return { state: 'finalized', label: 'Finalized' };
  return { state: 'posted', label: 'Posted — Not Finalized', since: win.opened_at || null };
}
