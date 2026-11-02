// Turns a raw database or network error into something a person can act on.
//
// Nothing a user sees should name a table, a column, a constraint, a schema or
// an error code. Those tell a registrar nothing, look like a crash, and quietly
// disclose the database's shape. The technical detail still reaches the console
// for whoever is debugging.
//
// Our own RPCs already RAISE EXCEPTION with plain, actionable sentences --
// "Only an active registrar may submit student records." Those are worth
// showing verbatim, so this module's job is to tell those apart from machine
// errors rather than to replace everything.

// Phrases that mark a message as machine-generated. If any appears, the message
// is replaced rather than shown.
const TECHNICAL_MARKERS = [
  'public.', 'schema cache', 'relation', 'column ', 'constraint',
  'violates', 'syntax error', 'duplicate key', 'null value in',
  'foreign key', 'permission denied for', 'pgrst', 'jwt', 'row-level security',
  'function ', 'operator ', 'type ', 'invalid input'
];

// Error codes we raise deliberately, whose messages are written for users.
const OUR_CODES = new Set(['42501', '23514', '23505', 'P0002', '22023']);

const BY_CODE = {
  // Missing table or undefined object -- almost always a migration not applied.
  '42P01': 'This part of the system is not set up yet. Please contact your administrator.',
  PGRST205: 'This part of the system is not set up yet. Please contact your administrator.',
  PGRST204: 'This part of the system is not set up yet. Please contact your administrator.',
  '42703': 'This part of the system is not set up yet. Please contact your administrator.',
  // Permission
  '42501': 'You do not have permission to do this.',
  PGRST301: 'Your session has expired. Please sign in again.',
  // Data problems
  '23505': 'That record already exists.',
  '23503': 'This is still linked to other records, so it cannot be changed or removed.',
  '23502': 'Something required was left blank.',
  '23514': 'Some of the information entered is not allowed.',
  '22P02': 'Some of the information entered is in the wrong format.',
  P0002: 'That record could not be found. It may have been changed or removed.',
  // Transport
  '08006': 'Could not reach the server. Check your connection and try again.',
  '57014': 'That took too long and was stopped. Please try again.'
};

const DEFAULT_MESSAGE = 'Something went wrong. Please try again, or contact your administrator if it keeps happening.';

function looksTechnical(message) {
  const lower = String(message).toLowerCase();
  return TECHNICAL_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * @param {unknown} error    the caught error
 * @param {string} [fallback] what to say when nothing more specific applies;
 *                            write it for the person using the page
 * @returns {string} a message safe to put on screen
 */
export function toUserMessage(error, fallback = DEFAULT_MESSAGE) {
  // The developer still gets the real thing.
  if (error) console.error('[ASPIRE]', error);

  if (!error) return fallback;

  const code = error.code || error.status || '';
  const raw = typeof error === 'string' ? error : error.message || '';

  // Offline is worth saying plainly rather than as a fetch failure.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  if (BY_CODE[code]) {
    // One of our own guards: its wording is already written for the user and
    // says what to do, so prefer it over the generic text for that code.
    if (OUR_CODES.has(code) && raw && !looksTechnical(raw)) return raw;
    return BY_CODE[code];
  }

  if (raw && !looksTechnical(raw)) return raw;

  return fallback;
}

/** Convenience for the common `catch` shape. */
export const userMessageOr = (fallback) => (error) => toUserMessage(error, fallback);
