// Reading a class timetable back to the people in it.
//
// class_records has carried meeting_days, start_time and end_time since
// 20261029093613, and until now nothing outside the provisioning workspace ever
// displayed them. The Registrar scheduled every class, conflict detection
// enforced it, and then no student was told when their class met and no
// instructor could see their own timetable.
//
// Scheduling is OPTIONAL per college -- find_schedule_conflict() returns NULL
// when no times are given, so a college can adopt it at its own pace. Every
// function here therefore has to answer "not scheduled" rather than assume a
// schedule exists.

const WEEK_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The compact forms a timetable is normally written in. MWF reads as one
// pattern; "Mon, Wed, Fri" reads as three separate facts.
const COMPACT = { Mon: 'M', Tue: 'T', Wed: 'W', Thu: 'Th', Fri: 'F', Sat: 'S', Sun: 'Su' };

/** Days in week order, however they were stored. */
export function orderDays(days) {
  if (!Array.isArray(days) || days.length === 0) return [];
  return [...days]
    .filter(Boolean)
    .sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
}

/** 'MWF', 'TTh'. Empty string when nothing is scheduled. */
export function formatDays(days) {
  const ordered = orderDays(days);
  if (ordered.length === 0) return '';
  return ordered.map((d) => COMPACT[d] || d).join('');
}

/**
 * '9:00 AM' from a Postgres TIME.
 *
 * Formatted from the parts rather than through a Date: a TIME has no date and
 * no zone, and constructing a Date from one makes the browser apply its own
 * offset -- which silently shifts a 9:00 AM class for anyone whose machine is
 * not on Philippine time.
 */
export function formatTime(value) {
  if (!value) return '';
  const [rawHour, rawMinute] = String(value).split(':');
  const hour = Number(rawHour);
  if (!Number.isFinite(hour)) return '';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${rawMinute ?? '00'} ${suffix}`;
}

/** '9:00 AM – 10:30 AM', or '' when either end is missing. */
export function formatTimeRange(start, end) {
  const from = formatTime(start);
  const to = formatTime(end);
  if (!from || !to) return '';
  return `${from} – ${to}`;
}

/**
 * The whole line: 'MWF · 9:00 AM – 10:30 AM · Room 201'.
 *
 * Returns null when there is nothing to show, so a caller renders nothing
 * rather than an empty row or a stray separator. A class with days but no times
 * still reports its days -- partial information is better than silence, and the
 * schema permits it.
 */
export function formatClassSchedule({ days, startTime, endTime, room } = {}) {
  const parts = [formatDays(days), formatTimeRange(startTime, endTime), room || '']
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** What to show when a class has no schedule yet. */
export const NO_SCHEDULE_TEXT = 'Schedule not set';
