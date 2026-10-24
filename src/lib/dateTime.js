export const PHILIPPINE_TIME_ZONE = 'Asia/Manila';
export const PHILIPPINE_TIME_ZONE_LABEL = 'PHT (UTC+8)';

const EXPLICIT_TIME_ZONE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * Parse a database timestamp as an instant.
 *
 * Legacy activity_logs rows came from a PostgreSQL `timestamp without time
 * zone` column. Supabase serializes those rows without an offset even though
 * the database clock value is UTC. Treating that legacy shape as UTC prevents
 * browsers from interpreting it as their own local wall-clock time. Values
 * that already contain Z or an offset are left unchanged.
 */
export function parseDatabaseUtcTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const rawValue = String(value).trim();
  if (!rawValue) return null;
  const normalizedValue = EXPLICIT_TIME_ZONE.test(rawValue)
    ? rawValue
    : `${rawValue.replace(' ', 'T')}Z`;
  const timestamp = new Date(normalizedValue);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export function formatPhilippineTimestamp(value, { includeSeconds = true } = {}) {
  const timestamp = parseDatabaseUtcTimestamp(value);
  if (!timestamp) return value ? String(value) : '';

  const date = timestamp.toLocaleDateString('en-PH', {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const time = timestamp.toLocaleTimeString('en-PH', {
    timeZone: PHILIPPINE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
  });
  return `${date} • ${time} ${PHILIPPINE_TIME_ZONE_LABEL}`;
}

export function toPhilippineIsoTimestamp(value) {
  const timestamp = parseDatabaseUtcTimestamp(value);
  if (!timestamp) return value ? String(value) : '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';

  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}+08:00`;
}

export function getPhilippineDateKey(value = new Date()) {
  const timestamp = value instanceof Date ? value : parseDatabaseUtcTimestamp(value);
  if (!timestamp || Number.isNaN(timestamp.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(timestamp);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
