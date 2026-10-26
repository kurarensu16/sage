import { supabase } from './supabase';
import { resolveGradingFormula } from './gradingMath';
import { resolveOfficialGwa } from './academicPolicy';
import { calculateAcademicRisk, computeTentativeGradeDetails } from './riskEngine';
import { countRecordedZeroScores, scoreOrNull } from './evaluationTracking';
import { findMostAdvancedPostedGrade, getCanonicalGradePeriod } from './gradeMilestones';

const activeEnrollment = enrollment => (
  !enrollment?.status || String(enrollment.status).toLowerCase() === 'active'
);

const groupBy = (rows, keyFor) => {
  const grouped = new Map();
  rows.forEach(row => {
    const key = keyFor(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });
  return grouped;
};

const studentClassKey = (classRecordId, studentId) => `${classRecordId}:${studentId}`;
const offeringKey = (sectionId, subjectId) => `${sectionId}:${subjectId}`;

/**
 * Loads one explainable risk result per student-class for a Dean's college.
 * Attendance, numeric-zero evidence, and trajectory are never mixed across subjects.
 */
export async function getCollegeRiskRecords({
  departmentId,
  schoolYear = null,
  semester = null,
  activeOnly = true
} = {}) {
  if (!departmentId) return [];

  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('section_id, name, department_id')
    .eq('department_id', departmentId);
  if (sectionsError) throw sectionsError;

  const sectionIds = (sections || []).map(section => section.section_id);
  if (sectionIds.length === 0) return [];

  let classQuery = supabase
    .from('class_records')
    .select(`
      class_record_id,
      section_id,
      subject_id,
      semester,
      school_year,
      status,
      grading_formula_snapshot,
      subjects ( subject_id, code, name, computation_id ),
      sections ( section_id, name )
    `)
    .in('section_id', sectionIds);
  if (activeOnly) classQuery = classQuery.eq('status', 'active');
  if (schoolYear) classQuery = classQuery.eq('school_year', schoolYear);
  if (semester) classQuery = classQuery.eq('semester', semester);

  const { data: classRecords, error: classError } = await classQuery;
  if (classError) throw classError;
  if (!classRecords?.length) return [];

  const classRecordIds = classRecords.map(record => record.class_record_id);
  const computationIds = [...new Set(classRecords
    .map(record => record.subjects?.computation_id)
    .filter(Boolean))];

  const [
    { data: enrollments, error: enrollmentError },
    { data: columns, error: columnsError },
    { data: termScores, error: termScoresError },
    { data: activities, error: activitiesError },
    { data: postedGrades, error: postedGradesError },
    { data: attendance, error: attendanceError },
    { data: computations, error: computationsError }
  ] = await Promise.all([
    supabase.from('enrollments').select(`
      student_id,
      section_id,
      subject_id,
      status,
      users:student_id ( user_id, first_name, last_name, email, user_number, section_id )
    `).in('section_id', sectionIds),
    supabase.from('class_grading_columns')
      .select('class_record_id, term, act1_max, act2_max, act3_max, act4_max, act5_max, act6_max, exam_max')
      .in('class_record_id', classRecordIds),
    supabase.from('student_term_scores')
      .select('student_id, class_record_id, term, act1, act2, act3, act4, act5, act6, char_rating, exam')
      .in('class_record_id', classRecordIds),
    supabase.from('class_activities')
      .select('activity_id, class_record_id, term, name, max_score, component_id')
      .in('class_record_id', classRecordIds),
    supabase.from('posted_grades')
      .select('posted_grade_id, class_record_id, student_id, grade_period, computed_grade, effective_grade, remarks')
      .in('class_record_id', classRecordIds),
    supabase.from('attendance_records')
      .select('class_record_id, student_id, status')
      .in('class_record_id', classRecordIds),
    computationIds.length > 0
      ? supabase.from('grade_computations')
          .select('computation_id, grade_computation_components ( * )')
          .in('computation_id', computationIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  const firstError = enrollmentError || columnsError || termScoresError || activitiesError
    || postedGradesError || attendanceError || computationsError;
  if (firstError) throw firstError;

  const activityIds = (activities || []).map(activity => activity.activity_id);
  const { data: activityScores, error: activityScoresError } = activityIds.length > 0
    ? await supabase.from('student_activity_scores')
        .select('student_id, activity_id, score')
        .in('activity_id', activityIds)
    : { data: [], error: null };
  if (activityScoresError) throw activityScoresError;

  const activitiesById = new Map((activities || []).map(activity => [activity.activity_id, activity]));
  const computationMap = new Map((computations || []).map(computation => [
    computation.computation_id,
    computation.grade_computation_components || []
  ]));
  const columnsByClass = {};
  (columns || []).forEach(column => {
    columnsByClass[column.class_record_id] ||= {};
    columnsByClass[column.class_record_id][column.term] = {
      act1: column.act1_max ?? 0,
      act2: column.act2_max ?? 0,
      act3: column.act3_max ?? 0,
      act4: column.act4_max ?? 0,
      act5: column.act5_max ?? 0,
      act6: column.act6_max ?? 0,
      exam: column.exam_max ?? 0
    };
  });

  const enrollmentsByOffering = groupBy(
    (enrollments || []).filter(enrollment => activeEnrollment(enrollment) && enrollment.users),
    enrollment => offeringKey(enrollment.section_id, enrollment.subject_id)
  );
  const termScoresByStudentClass = groupBy(
    termScores || [],
    score => studentClassKey(score.class_record_id, score.student_id)
  );
  const activitiesByClass = groupBy(activities || [], activity => activity.class_record_id);
  const activityScoresByStudentClass = groupBy(activityScores || [], score => {
    const activity = activitiesById.get(score.activity_id);
    return studentClassKey(activity?.class_record_id, score.student_id);
  });
  const postedByStudentClass = groupBy(
    postedGrades || [],
    grade => studentClassKey(grade.class_record_id, grade.student_id)
  );
  const attendanceByStudentClass = groupBy(
    attendance || [],
    record => studentClassKey(record.class_record_id, record.student_id)
  );

  const records = [];
  classRecords.forEach(classRecord => {
    const classActivities = activitiesByClass.get(classRecord.class_record_id) || [];
    const dynamicActivitiesByTerm = {};
    classActivities.forEach(activity => {
      dynamicActivitiesByTerm[activity.term] ||= [];
      dynamicActivitiesByTerm[activity.term].push({
        id: activity.activity_id,
        dbId: activity.activity_id,
        name: activity.name,
        max: scoreOrNull(activity.max_score) ?? 0,
        componentId: activity.component_id || null
      });
    });
    const components = classRecord.grading_formula_snapshot?.components
      || computationMap.get(classRecord.subjects?.computation_id)
      || null;
    const formula = resolveGradingFormula(components, {
      formulaAssigned: Boolean(classRecord.grading_formula_snapshot || classRecord.subjects?.computation_id)
    });
    const isSummer = String(classRecord.semester || '').toLowerCase().includes('summer');
    const roster = enrollmentsByOffering.get(offeringKey(classRecord.section_id, classRecord.subject_id)) || [];

    roster.forEach(enrollment => {
      const student = enrollment.users;
      const key = studentClassKey(classRecord.class_record_id, student.user_id);
      const studentTermRows = termScoresByStudentClass.get(key) || [];
      const studentActivityRows = activityScoresByStudentClass.get(key) || [];
      const classRecordScores = {};
      studentTermRows.forEach(score => {
        if (score.term) classRecordScores[score.term] = { ...score };
      });
      studentActivityRows.forEach(score => {
        const activity = activitiesById.get(score.activity_id);
        if (!activity?.term) return;
        classRecordScores[activity.term] ||= {};
        classRecordScores[activity.term][score.activity_id] = scoreOrNull(score.score);
      });

      const tentative = computeTentativeGradeDetails(
        classRecordScores,
        columnsByClass[classRecord.class_record_id] || {},
        { formula, activitiesByTerm: dynamicActivitiesByTerm, isSummer }
      );
      const finalPosted = findMostAdvancedPostedGrade(postedByStudentClass.get(key) || []);
      const hasTentativeEvidence = Object.keys(tentative.termRatings || {}).length > 0;
      const currentGwa = hasTentativeEvidence && tentative.gwa !== null
        ? tentative.gwa
        : (finalPosted ? resolveOfficialGwa(finalPosted).gwa : null);
      const absences = (attendanceByStudentClass.get(key) || [])
        .filter(record => String(record.status || '').toLowerCase() === 'absent').length;
      const recordedZeroCount = countRecordedZeroScores(
        studentTermRows,
        columnsByClass[classRecord.class_record_id] || {},
        classActivities,
        studentActivityRows
      );
      const prelimRating = tentative.termRatings?.Prelim ?? null;
      const midtermRating = tentative.termRatings?.Midterm ?? null;
      const risk = calculateAcademicRisk({
        currentGwa,
        absenceCount: absences,
        consecutiveAbsences: absences >= 2 ? 2 : 0,
        zeroSubmissionsCount: recordedZeroCount,
        previousTermRating: prelimRating,
        currentTermRating: midtermRating,
        isSummer
      });

      records.push({
        risk_record_id: key,
        class_record_id: classRecord.class_record_id,
        student_id: student.user_id,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
        student_number: student.user_number,
        home_section_id: student.section_id,
        class_section_id: classRecord.section_id,
        section_name: classRecord.sections?.name || '',
        subject_id: classRecord.subject_id,
        subject_code: classRecord.subjects?.code || 'SUBJ',
        subject_name: classRecord.subjects?.name || 'Subject',
        school_year: classRecord.school_year,
        semester: classRecord.semester,
        current_gwa: currentGwa,
        standing_source: hasTentativeEvidence ? 'Tentative' : (finalPosted ? 'Posted' : 'Pending'),
        standing_milestone: hasTentativeEvidence
          ? Object.keys(tentative.termRatings).join(', ')
          : (finalPosted ? getCanonicalGradePeriod(finalPosted) : null),
        is_complete: hasTentativeEvidence ? tentative.isComplete : Boolean(finalPosted),
        absences,
        recorded_zero_count: recordedZeroCount,
        prelim_rating: prelimRating,
        midterm_rating: midtermRating,
        trajectory_delta: risk.trajectory_delta,
        risk_score: risk.composite_score,
        risk_level: risk.risk_level,
        badge_color: risk.badge_color,
        risk_analysis: risk
      });
    });
  });

  return records.sort((a, b) => (
    b.risk_score - a.risk_score
    || a.last_name.localeCompare(b.last_name)
    || a.subject_code.localeCompare(b.subject_code)
  ));
}

/** Selects each student's highest active course risk without combining subjects. */
export function getHighestRiskByStudent(records = []) {
  const highest = new Map();
  records.forEach(record => {
    const current = highest.get(record.student_id);
    if (!current || record.risk_score > current.risk_score) highest.set(record.student_id, record);
  });
  return [...highest.values()];
}
