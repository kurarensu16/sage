// What a student or instructor is told when an AI feature does not answer.
//
// WHAT THIS IS NOT
//   Not the deterministic fallback Objective 6 promises. That would produce
//   usable guidance WITHOUT a provider -- study steps assembled from the
//   student's own recorded scores and activities. This only explains the
//   silence well. The distinction matters because the paper claims the former;
//   see QA bug B-06.
//
// WHY A SHARED HELPER
//   Three surfaces call three different edge functions, and each rendered
//   whatever string happened to arrive. The edge functions already return
//   student-safe text for the cases they recognise, but a network failure, a
//   timeout or an unhandled shape reached the UI raw -- which is how a student
//   ends up reading "FunctionsFetchError" and concluding the system is broken
//   rather than busy.
//
// THE RULE
//   Never show a status code, a provider name, a model id or a function name to
//   a user. Those go to the console for whoever is debugging. What the user
//   gets is: what happened, whether waiting helps, and what they can do now.

const RETRY_SECONDS = 120;

// Phrases the edge functions use for conditions where retrying is pointless.
// Matched loosely on purpose: the wording may be edited without this file
// being updated, and over-offering a retry is the kinder failure.
const NOT_WORTH_RETRYING = [
  'not set up correctly',
  'not configured',
  'administrator',
  'sign in again',
  'authentication is required',
  'may generate this draft',
  'active faculty account'
];

const BUSY_HINTS = ['lot of requests', 'try again', 'could not be reached', 'temporarily'];

/**
 * Turn any AI failure into something worth reading.
 *
 * @param {Error|string} error     whatever was thrown
 * @param {object} options
 * @param {string} options.feature plain-English name, e.g. "AI Study Advising"
 * @param {string} options.fallbackAction what the user can do instead, if anything
 * @returns {{ title: string, message: string, hint: string, canRetry: boolean, retryAfterSeconds: number }}
 */
export function describeAiFailure(error, { feature = 'This feature', fallbackAction = '' } = {}) {
  const raw = typeof error === 'string' ? error : (error?.message || '');
  const text = raw.toLowerCase();

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const configProblem = NOT_WORTH_RETRYING.some((p) => text.includes(p));

  // A message the edge function wrote for a person is better than anything
  // generic, so it is kept -- but only when it reads like one. Anything with a
  // status code, a stack frame or an underscore_identifier is ours to replace.
  const looksTechnical = !raw
    || /\b[45]\d{2}\b/.test(raw)
    || /_[a-z]+_/.test(raw)
    || /error:|failed to fetch|networkerror|functionsfetch/i.test(raw);

  if (offline) {
    return {
      title: 'You appear to be offline',
      message: `${feature} needs a connection. Nothing you typed has been lost.`,
      hint: 'Reconnect and try again.',
      canRetry: true,
      retryAfterSeconds: 0
    };
  }

  if (configProblem) {
    return {
      title: `${feature} is unavailable`,
      message: looksTechnical
        ? `${feature} is not available right now, and waiting will not change that.`
        : raw,
      hint: 'This one needs someone to look at it — tell your instructor or administrator.',
      canRetry: false,
      retryAfterSeconds: 0
    };
  }

  const busy = BUSY_HINTS.some((p) => text.includes(p)) || looksTechnical;

  return {
    title: busy ? `${feature} is busy right now` : `${feature} could not answer`,
    message: looksTechnical
      ? `${feature} did not answer in time. This is usually heavy traffic rather than a problem with your work, and it clears on its own.`
      : raw,
    hint: fallbackAction
      ? `Wait a couple of minutes and try again. ${fallbackAction}`
      : 'Wait a couple of minutes and try again.',
    canRetry: true,
    retryAfterSeconds: RETRY_SECONDS
  };
}
