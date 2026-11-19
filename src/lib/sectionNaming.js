import { getProgramAbbrFromSectionName } from './constants';

// A section's program and year level live only in its name -- there is no
// program_id or year_level column on sections. SectionForm builds the name as
// "<PROGRAM ABBREVIATION>-<year digit><suffix>" (e.g. BSIT-1A), so readers parse
// it back the same way. The abbreviation is resolved to a program by matching
// programs.abbreviation from the database, never a lookup table in code.
//
// Shared by Faculty Loading (Dean) and the Registrar's Student Records and
// Class Grade Sheets, so the College -> Program -> Year cascade means the same
// thing on every screen. Anything that does not parse is surfaced as
// unclassified rather than hidden, because a section a filter silently drops is
// a class nobody can open.

export function parseSectionName(name) {
  const raw = String(name || '').trim();
  const programAbbr = getProgramAbbrFromSectionName(raw);
  const afterHyphen = raw.slice(raw.lastIndexOf('-') + 1);
  const yearDigit = (afterHyphen.match(/^(\d)/) || [])[1] || '';
  return { programAbbr, yearDigit, parsed: !!(programAbbr && yearDigit) };
}

export const YEAR_LEVEL_BY_DIGIT = Object.freeze({
  1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year'
});

// Filter value used for a section, class or student whose program or year
// cannot be read. A real value, so "show me the unclassified ones" is a filter
// the user can pick, not a hole in the list.
export const UNCLASSIFIED = '__unclassified__';

/**
 * Resolves a section name to the program row and year level it encodes.
 * `programsByAbbr` is a Map of upper-cased programs.abbreviation -> program row.
 * Returns { programId, programLabel, yearDigit, yearLabel }, with UNCLASSIFIED
 * ids when a part cannot be resolved.
 */
export function classifySection(sectionName, programsByAbbr) {
  const { programAbbr, yearDigit } = parseSectionName(sectionName);
  const program = programAbbr ? programsByAbbr.get(programAbbr.toUpperCase()) : null;
  return {
    programId: program?.program_id || UNCLASSIFIED,
    programLabel: program ? (program.abbreviation || program.name) : 'Unclassified',
    yearDigit: yearDigit || UNCLASSIFIED,
    yearLabel: yearDigit ? (YEAR_LEVEL_BY_DIGIT[yearDigit] || `Year ${yearDigit}`) : 'Unclassified'
  };
}

export function indexProgramsByAbbreviation(programs = []) {
  const map = new Map();
  for (const program of programs) {
    if (program?.abbreviation) map.set(String(program.abbreviation).toUpperCase(), program);
  }
  return map;
}
