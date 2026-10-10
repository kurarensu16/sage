/**
 * Encode a single value according to RFC 4180-style CSV escaping.
 * NULL and undefined are represented as empty fields.
 */
export function encodeCsvField(value) {
  if (value === null || value === undefined) return '';

  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV document and reject malformed row shapes before download.
 */
export function buildCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';

  const columnCount = rows[0].length;
  const malformedRowIndex = rows.findIndex(
    row => !Array.isArray(row) || row.length !== columnCount,
  );

  if (malformedRowIndex !== -1) {
    throw new Error(
      `CSV row ${malformedRowIndex + 1} does not contain ${columnCount} columns.`,
    );
  }

  return rows
    .map(row => row.map(encodeCsvField).join(','))
    .join('\r\n');
}
