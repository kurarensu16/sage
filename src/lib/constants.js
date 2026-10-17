// Institutional Academic & Analytics Cutoffs
export const PASSING_GRADE = 75; // 3.00 on DYCI transmutation scale
export const HIGH_CUTOFF   = 85; // "Performed Well" benchmark threshold
export const SAME_MARGIN   = 2;  // +/- 2 pts margin of difference for term comparisons

// Colleges, programs and their abbreviations are not listed here on purpose: they live in
// the departments and programs tables. Read programs.abbreviation for a program code.

// Section names follow "<PROGRAM ABBREVIATION>-<year digit><suffix>", e.g. BSIT-1A, so the
// abbreviation can be read back off a section name. Returns the abbreviation only; resolve
// it to a program by matching programs.abbreviation.
export const getProgramAbbrFromSectionName = (sectionName) => {
  if (!sectionName) return '';
  const lastHyphenIndex = sectionName.lastIndexOf('-');
  if (lastHyphenIndex !== -1) {
    return sectionName.slice(0, lastHyphenIndex).toUpperCase();
  }
  const match = sectionName.match(/^([A-Z-]+)(\d)([A-Z]*)$/i);
  return match ? match[1].toUpperCase() : '';
};
