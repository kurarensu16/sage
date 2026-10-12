// =============================================================================
// Student running GWA (Tentative until every Semestral Grade is posted)
//
// Students see the same live grade the faculty roster computes
// (computeTentativeGradeDetails in riskEngine.js), with two safeguards:
//   1. Posted milestones override live terms: a posted MR replaces the live
//      Prelim/Midterm, a posted TFR replaces the live Semi-Final/Final, and a
//      posted SG (including an audited admin override) is the official grade.
//   2. Blank activities are not counted yet. The result reports how many are
//      still blank so the UI can warn that posting may convert them to zero.
// =============================================================================

import { supabase } from './supabase';
import { resolveGradingFormula } from './gradingMath';
import { computeTentativeGradeDetails } from './riskEngine';
import { computeStudentGwa, resolveOfficialGwa, toGwaOrNull } from './academicPolicy';
import { GRADE_MILESTONES, findPostedMilestone, isTermCoveredByPostedMilestone } from './gradeMilestones';
import { scoreOrNull } from './evaluationTracking';

export const RUNNING_GRADE_BASIS = Object.freeze({
  OFFICIAL: 'official',           // SG posted
  PARTLY_POSTED: 'partly_posted', // MR and/or TFR posted, SG not yet
  TENTATIVE: 'tentative',         // nothing posted, live scores only
  NO_DATA: 'no_data'              // no posted milestone and no recorded score
});

const LEGACY_ACTIVITY_KEYS = ['act1', 'act2', 'act3', 'act4', 'act5', 'act6'];

const ratingOrNull = (value) => {
  const number = scoreOrNull(value);
  return number === null ? null : Math.round(number);
};

/**
 * Computes one subject's running grade for one student.
 *
 * @param {Object} params
 * @param {Object} params.classRecord - class_records row (semester, grading_formula_snapshot, subjects.computation_id)
 * @param {Array|null} params.formulaComponents - grade_computation_components when the class has no snapshot yet
 * @param {Array} params.postedRows - this student's posted_grades rows for the class
 * @param {Array} params.termScoreRows - this student's student_term_scores rows for the class
 * @param {Array} params.gradingColumnRows - class_grading_columns rows for the class
 * @param {Array} params.activities - class_activities rows for the class
 * @param {Array} params.activityScores - this student's student_activity_scores rows for those activities
 */
export function computeStudentRunningGrade({
  classRecord,
  formulaComponents = null,
  postedRows = [],
  termScoreRows = [],
  gradingColumnRows = [],
  activities = [],
  activityScores = []
}) {
  const isSummer = String(classRecord?.semester || '').toLowerCase().includes('summer');
  const terms = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

  // Same formula resolution as the faculty roster (getClassPriorityRoster).
  const snapshotComponents = classRecord?.grading_formula_snapshot?.components || null;
  const gradingFormula = resolveGradingFormula(snapshotComponents || formulaComponents, {
    formulaAssigned: Boolean(classRecord?.grading_formula_snapshot || classRecord?.subjects?.computation_id)
  });

  const colsMap = {};
  (gradingColumnRows || []).forEach(c => {
    // 0 means "activity not configured", not "use default".
    colsMap[c.term] = {
      act1: c.act1_max ?? 0,
      act2: c.act2_max ?? 0,
      act3: c.act3_max ?? 0,
      act4: c.act4_max ?? 0,
      act5: c.act5_max ?? 0,
      act6: c.act6_max ?? 0,
      exam: c.exam_max ?? 0
    };
  });

  const activitiesByTerm = {};
  (activities || []).forEach(activity => {
    if (!activitiesByTerm[activity.term]) activitiesByTerm[activity.term] = [];
    activitiesByTerm[activity.term].push({
      id: activity.activity_id,
      dbId: activity.activity_id,
      name: activity.name,
      max: scoreOrNull(activity.max_score) ?? 0,
      componentId: activity.component_id || null
    });
  });

  const classRecordScores = {};
  (termScoreRows || []).forEach(score => {
    if (score.term) classRecordScores[score.term] = { ...score };
  });
  const scoreByActivity = {};
  (activityScores || []).forEach(score => {
    scoreByActivity[score.activity_id] = scoreOrNull(score.score);
    const activity = (activities || []).find(item => item.activity_id === score.activity_id);
    if (!activity?.term) return;
    classRecordScores[activity.term] ||= {};
    classRecordScores[activity.term][score.activity_id] = scoreOrNull(score.score);
  });

  const live = computeTentativeGradeDetails(classRecordScores, colsMap, {
    formula: gradingFormula,
    activitiesByTerm,
    isSummer
  });

  // Safeguard 2: posted milestones override the live calculation.
  const postedSg = findPostedMilestone(postedRows, GRADE_MILESTONES.SEMESTRAL_GRADE);
  const postedMr = findPostedMilestone(postedRows, GRADE_MILESTONES.MIDTERM_RATING);
  const postedTfr = findPostedMilestone(postedRows, GRADE_MILESTONES.TENTATIVE_FINAL_RATING);
  const postedLocks = [postedSg, postedMr, postedTfr]
    .filter(Boolean)
    .flatMap(row => [row.grade_period, ...(row.locked_milestones || [])]);
  const isTermPosted = (term) => isTermCoveredByPostedMilestone(term, postedLocks);

  const liveSemester = live.semesterResult || { mr: null, tfr: null };
  const mr = postedMr ? ratingOrNull(postedMr.computed_grade) : liveSemester.mr;
  const tfr = postedTfr ? ratingOrNull(postedTfr.computed_grade) : liveSemester.tfr;

  let sg;
  let gwa;
  if (postedSg) {
    // Official SG; effective_grade carries any audited admin override.
    sg = ratingOrNull(postedSg.computed_grade);
    gwa = resolveOfficialGwa(postedSg).gwa;
  } else {
    // Same milestone arithmetic as calculateSemestralGrade.
    sg = (mr !== null && tfr !== null) ? Math.round((mr + tfr) / 2) : (tfr ?? mr);
    gwa = toGwaOrNull(sg);
  }

  const liveTerms = terms.filter(term => !isTermPosted(term) && live.termRatings?.[term] !== undefined);

  // Safeguard 1: count activities still blank in terms that are not posted yet.
  let blankActivityCount = 0;
  terms.forEach(term => {
    if (isTermPosted(term)) return;
    const termActivities = (activities || []).filter(activity => activity.term === term);
    if (termActivities.length > 0) {
      termActivities.forEach(activity => {
        if ((scoreOrNull(activity.max_score) ?? 0) > 0 && scoreByActivity[activity.activity_id] == null) {
          blankActivityCount += 1;
        }
      });
      return;
    }
    const cols = colsMap[term];
    const termScores = classRecordScores[term];
    if (!cols || !termScores) return;
    LEGACY_ACTIVITY_KEYS.forEach(key => {
      if (Number(cols[key]) > 0 && scoreOrNull(termScores[key]) === null) blankActivityCount += 1;
    });
  });

  let basis = RUNNING_GRADE_BASIS.NO_DATA;
  if (postedSg) basis = RUNNING_GRADE_BASIS.OFFICIAL;
  else if (postedMr || postedTfr) basis = RUNNING_GRADE_BASIS.PARTLY_POSTED;
  else if (gwa !== null) basis = RUNNING_GRADE_BASIS.TENTATIVE;

  return {
    gwa,
    mr,
    tfr,
    sg,
    basis,
    isOfficial: basis === RUNNING_GRADE_BASIS.OFFICIAL,
    postedMilestones: [
      postedMr && GRADE_MILESTONES.MIDTERM_RATING,
      postedTfr && GRADE_MILESTONES.TENTATIVE_FINAL_RATING,
      postedSg && GRADE_MILESTONES.SEMESTRAL_GRADE
    ].filter(Boolean),
    liveTerms,
    termRatings: live.termRatings || {},
    blankActivityCount,
    isSummer
  };
}

/**
 * Combines per-subject running grades into the student's running GWA
 * (plain mean, as in computeStudentGwa). It is Official only when every
 * subject has a posted SG.
 */
export function summarizeStudentRunningGwa(subjectResults = []) {
  const results = subjectResults.filter(Boolean);
  const graded = results.filter(result => result.gwa !== null);
  const { gwa } = computeStudentGwa(graded.map(result => result.gwa));

  let basis = RUNNING_GRADE_BASIS.NO_DATA;
  if (graded.length > 0) {
    const allOfficial = results.every(result => result.basis === RUNNING_GRADE_BASIS.OFFICIAL);
    const anyPosted = results.some(result =>
      result.basis === RUNNING_GRADE_BASIS.OFFICIAL || result.basis === RUNNING_GRADE_BASIS.PARTLY_POSTED
    );
    basis = allOfficial
      ? RUNNING_GRADE_BASIS.OFFICIAL
      : anyPosted ? RUNNING_GRADE_BASIS.PARTLY_POSTED : RUNNING_GRADE_BASIS.TENTATIVE;
  }

  const postedMilestones = new Set(results.flatMap(result => result.postedMilestones || []));

  return {
    gwa,
    basis,
    isOfficial: basis === RUNNING_GRADE_BASIS.OFFICIAL,
    subjectCount: results.length,
    gradedSubjectCount: graded.length,
    hasPostedMr: postedMilestones.has(GRADE_MILESTONES.MIDTERM_RATING),
    hasPostedTfr: postedMilestones.has(GRADE_MILESTONES.TENTATIVE_FINAL_RATING),
    blankActivityCount: results.reduce((sum, result) => sum + (result.blankActivityCount || 0), 0)
  };
}

/**
 * Loads everything needed for one student's running grade across the given
 * class records in batched reads. Returns per-subject results keyed by
 * class_record_id plus the combined summary.
 */
export async function loadStudentRunningGrades(studentId, classRecordIds = []) {
  const ids = [...new Set((classRecordIds || []).filter(Boolean))];
  if (!studentId || ids.length === 0) {
    return { bySubject: {}, summary: summarizeStudentRunningGwa([]) };
  }

  const [
    { data: classRecords, error: classError },
    { data: postedRows, error: postedError },
    { data: termScoreRows, error: termError },
    { data: gradingColumnRows, error: colsError },
    { data: activities, error: activitiesError }
  ] = await Promise.all([
    supabase
      .from('class_records')
      .select('class_record_id, semester, grading_formula_snapshot, subjects ( computation_id )')
      .in('class_record_id', ids),
    supabase.from('posted_grades').select('*').eq('student_id', studentId).in('class_record_id', ids),
    supabase.from('student_term_scores').select('*').eq('student_id', studentId).in('class_record_id', ids),
    supabase.from('class_grading_columns').select('*').in('class_record_id', ids),
    supabase
      .from('class_activities')
      .select('activity_id, class_record_id, term, name, max_score, component_id')
      .in('class_record_id', ids)
  ]);
  const firstError = classError || postedError || termError || colsError || activitiesError;
  if (firstError) throw firstError;

  const activityIds = (activities || []).map(activity => activity.activity_id);
  const { data: activityScores, error: scoresError } = activityIds.length > 0
    ? await supabase
        .from('student_activity_scores')
        .select('activity_id, score')
        .eq('student_id', studentId)
        .in('activity_id', activityIds)
    : { data: [], error: null };
  if (scoresError) throw scoresError;

  // Classes without a snapshot use their subject's current COG template.
  const computationIds = [...new Set((classRecords || [])
    .filter(cr => !cr.grading_formula_snapshot && cr.subjects?.computation_id)
    .map(cr => cr.subjects.computation_id))];
  const { data: computations, error: computationError } = computationIds.length > 0
    ? await supabase
        .from('grade_computations')
        .select('computation_id, grade_computation_components ( * )')
        .in('computation_id', computationIds)
    : { data: [], error: null };
  if (computationError) throw computationError;

  const componentsByComputation = Object.fromEntries(
    (computations || []).map(row => [row.computation_id, row.grade_computation_components || null])
  );
  const activityClassById = Object.fromEntries(
    (activities || []).map(activity => [activity.activity_id, activity.class_record_id])
  );

  const bySubject = {};
  (classRecords || []).forEach(classRecord => {
    const classId = classRecord.class_record_id;
    bySubject[classId] = computeStudentRunningGrade({
      classRecord,
      formulaComponents: componentsByComputation[classRecord.subjects?.computation_id] || null,
      postedRows: (postedRows || []).filter(row => row.class_record_id === classId),
      termScoreRows: (termScoreRows || []).filter(row => row.class_record_id === classId),
      gradingColumnRows: (gradingColumnRows || []).filter(row => row.class_record_id === classId),
      activities: (activities || []).filter(activity => activity.class_record_id === classId),
      activityScores: (activityScores || []).filter(score => activityClassById[score.activity_id] === classId)
    });
  });

  return {
    bySubject,
    summary: summarizeStudentRunningGwa(Object.values(bySubject))
  };
}
