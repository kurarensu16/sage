import { calculateSemestralGrade, calculateStoredTermRating } from './gradingMath.js';
import { resolveOfficialGwa, toDisplayRemark } from './academicPolicy.js';

const TERM_NAMES = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

const getTermScores = (student, termName) => {
  if (termName === 'Semi-Final') {
    return student?.periods?.['Semi-Final'] || student?.periods?.SemiFinal || {};
  }
  return student?.periods?.[termName] || {};
};

const toFiniteNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Produces the values shown in official grade exports and their preview.
 * MR/TFR are current progress ratings from the dynamic COG formula; SG, GWA,
 * and remarks appear only when a Semestral Grade has been posted.
 */
export function resolveExportGradeRow(student, gradingOptions = {}) {
  if (!student) {
    return {
      studentNo: '', name: '', prelim: null, midterm: null, semiFinal: null,
      finalTerm: null, mr: null, tfr: null, sg: null, gwa: null, remarks: '',
      hasPostedSemestralGrade: false
    };
  }

  const termRatings = Object.fromEntries(TERM_NAMES.map(termName => [
    termName,
    calculateStoredTermRating({
      formula: gradingOptions.formula || null,
      termScores: getTermScores(student, termName),
      maxItems: gradingOptions.maxItems?.[termName] || {},
      activities: gradingOptions.activities?.[termName] || []
    }).rating
  ]));

  const progress = calculateSemestralGrade({
    prelim: termRatings.Prelim,
    midterm: termRatings.Midterm,
    semiFinal: termRatings['Semi-Final'],
    final: termRatings.Final,
    isSummer: Boolean(gradingOptions.isSummer)
  });

  const posted = student.postedSemestralGrade || null;
  const postedRating = toFiniteNumberOrNull(posted?.computed_grade);
  const { gwa: postedGwa } = resolveOfficialGwa(posted || {});
  const hasPostedSemestralGrade = Boolean(posted) && postedRating !== null;

  return {
    studentNo: student.studentNo || '',
    name: student.name || '',
    prelim: termRatings.Prelim,
    midterm: termRatings.Midterm,
    semiFinal: termRatings['Semi-Final'],
    finalTerm: termRatings.Final,
    mr: progress.mr,
    tfr: progress.tfr,
    sg: hasPostedSemestralGrade ? postedRating : null,
    gwa: hasPostedSemestralGrade ? postedGwa : null,
    remarks: hasPostedSemestralGrade ? toDisplayRemark(posted?.remarks) : '',
    hasPostedSemestralGrade
  };
}

export const formatExportGwa = (gwa) => (
  typeof gwa === 'number' ? gwa.toFixed(2) : (gwa || '')
);
