import { supabase } from './supabase';

// AI Study Advising spend ceiling.
//
// WHY THIS EXISTS SEPARATELY FROM THE PER-STUDENT LIMIT
// The tutor already limited how many requests one student could make. That
// answers "is somebody abusing this". It does not answer "can we still afford
// to answer anyone" -- a per-user cap multiplied by the number of users is not
// a bound on anything. With a prepaid balance the second question is the one
// that matters, and it was unanswered until now.
//
// The ceiling is expressed in CALLS because that is what the system can count
// before spending. Token usage is recorded alongside it, so actual cost can be
// worked out afterwards from one published price rather than estimated.

/** Used, remaining, and the tokens consumed so far. Any signed-in account may read. */
export async function fetchAiBudget() {
  const { data, error } = await supabase.rpc('aspire_tutor_budget');
  if (error) throw error;
  return {
    budget: Number(data?.budget ?? 0),
    used: Number(data?.used ?? 0),
    remaining: Number(data?.remaining ?? 0),
    dailyCapPerStudent: Number(data?.daily_cap_per_student ?? 0),
    promptTokens: Number(data?.prompt_tokens ?? 0),
    completionTokens: Number(data?.completion_tokens ?? 0),
    since: data?.since || null
  };
}

/**
 * Raise, lower, or restart the ceiling. Administrator only.
 *
 * `resetWindow` restarts counting from now without deleting anything: the log
 * keeps every request, which matters because it is also the evidence of which
 * model served them.
 */
export async function saveAiBudget({ budget, dailyCap = null, resetWindow = false }) {
  const { data, error } = await supabase.rpc('aspire_set_tutor_budget', {
    p_budget: budget,
    p_daily_cap: dailyCap,
    p_reset_window: resetWindow
  });
  if (error) throw error;
  return data;
}

/**
 * Rough money, deliberately labelled as rough.
 *
 * The provider publishes a price per million tokens; nothing reports actual
 * charges back to this system. So this converts recorded tokens at a rate the
 * administrator supplies, and the UI must present it as an estimate. Showing a
 * confident figure the system cannot actually verify would be worse than
 * showing none.
 */
export function estimateSpend({ promptTokens, completionTokens }, ratePerMillion) {
  if (!Number.isFinite(ratePerMillion) || ratePerMillion <= 0) return null;
  const total = (Number(promptTokens) || 0) + (Number(completionTokens) || 0);
  return (total / 1_000_000) * ratePerMillion;
}

export const budgetRatio = ({ used, budget }) =>
  budget > 0 ? Math.min(used / budget, 1) : 0;
