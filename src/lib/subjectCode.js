// Reading the term out of a subject code.
//
// WHY THIS EXISTS
//   `subjects` has no semester column. SubjectForm offers a semester dropdown,
//   but the payload it writes is only:
//
//     { code, name, units, department_id, computation_id, fda_absence_threshold }
//
//   The chosen semester survives as the THIRD DIGIT of the code, which the form
//   builds as `prefix + year + semester + units` and recovers by parsing that
//   digit back out when the subject is edited.
//
//     DSA123  ->  DSA · year 1 · semester 2 · 3 units
//     SEA103  ->  SEA · year 1 · Summer     · 3 units
//
//   So the semester is real data stored in a string. Until it becomes a column,
//   anything that needs it has to read it here rather than keep a second copy of
//   the rule.
//
// THE DIGIT
//   '1' first semester · '2' second semester · '0' Summer.
//   Verified against all 12 subjects in the live catalogue on 2026-11-03: every
//   code parses and no other digit occurs.

export const SUBJECT_SEMESTER_DIGIT = {
  FIRST: '1',
  SECOND: '2',
  SUMMER: '0'
};

const SEMESTER_LABEL = {
  '1': '1st Sem',
  '2': '2nd Sem',
  '0': 'Summer'
};

/**
 * The semester digit encoded in a subject code, or null when the code does not
 * follow the convention.
 *
 * Requires exactly three trailing digits. SubjectForm's own parser treats the
 * last two as optional, which is right when recovering a half-typed code into a
 * form; it is wrong here, because a code without them tells us nothing about the
 * semester and must not be read as "first".
 */
export function semesterDigitFromCode(code) {
  const match = String(code || '').trim().match(/^[A-Za-z-]*?(\d)(\d)(\d)$/);
  return match ? match[2] : null;
}

/** The digit an academic term's semester corresponds to, or null. */
export function semesterDigitFromTerm(semester) {
  const value = String(semester || '').trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith('1')) return SUBJECT_SEMESTER_DIGIT.FIRST;
  if (value.startsWith('2')) return SUBJECT_SEMESTER_DIGIT.SECOND;
  if (value.startsWith('sum')) return SUBJECT_SEMESTER_DIGIT.SUMMER;
  return null;
}

/** '2nd Sem' and the like, for showing beside an out-of-term subject. */
export function semesterLabelFromCode(code) {
  const digit = semesterDigitFromCode(code);
  return digit ? SEMESTER_LABEL[digit] || null : null;
}

/**
 * Does this subject belong to this term's semester?
 *
 * Returns TRUE when either side cannot be read. A subject whose code does not
 * follow the convention is shown rather than hidden: hiding one silently is
 * worse than the problem this filter solves, because the registrar would have no
 * way to tell a missing subject from a subject that does not exist.
 */
export function subjectMatchesTermSemester(code, termSemester) {
  const wanted = semesterDigitFromTerm(termSemester);
  const found = semesterDigitFromCode(code);
  if (!wanted || !found) return true;
  return wanted === found;
}
