// src/lib/classRoomService.js
// Service for Class Room Creation, Join Codes, and Irregular Student Verification

import { supabase } from './supabase';
import { calculateAcademicRisk, computeTentativeGradeDetails } from './riskEngine';
import { resolveGradingFormula, createGradingFormulaSnapshot } from './gradingMath';
import { resolveOfficialGwa } from './academicPolicy';
import { findMostAdvancedPostedGrade, getCanonicalGradePeriod } from './gradeMilestones';
import { countPendingActivities, countRecordedZeroScores, scoreOrNull } from './evaluationTracking';
// Note: riskEngine.js is now the single source of truth for all risk calculations (V4).

/**
 * Irregularity is class-contextual: a student is irregular for a class when
 * they have no home block section or their home section differs from the
 * class section. This mirrors get_class_attendance_roster in PostgreSQL.
 */
// What a piece of work IS, which is not what it is WORTH. The activity's COG
// component decides the weight; this only describes the activity. Nothing in
// the grading math reads it, and nothing should start -- a type that affects
// weight would be a second grading formula disagreeing with the frozen snapshot.
//
// 'formative' is not offered: it is the legacy default on rows created before
// the field reached the UI, kept so those rows stay valid.
export const ACTIVITY_TYPES = Object.freeze([
  { value: 'seatwork', label: 'Seatwork' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'performance_task', label: 'Performance Task' },
  { value: 'recitation', label: 'Recitation' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'project', label: 'Project' }
]);

export const DEFAULT_ACTIVITY_TYPE = 'seatwork';

export const activityTypeLabel = (value) =>
  ACTIVITY_TYPES.find((t) => t.value === value)?.label
    || (value === 'formative' ? 'Formative' : '');

// Terms a class is graded over. Summer runs two, everything else four.
export const GRADING_PERIODS = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
export const SUMMER_PERIODS = ['Midterm', 'Final'];

export const periodsForSemester = (semester) =>
  (semester === 'Summer' ? SUMMER_PERIODS : GRADING_PERIODS);

/**
 * The activity columns of a class, per grading period.
 *
 * One loader, because there were three. The Scorebook and Posted Grades each
 * rebuilt this list from their own code, and a class with no activities yet made
 * them disagree out loud: the Scorebook showed a single empty slot while Posted
 * Grades showed six columns called FA 1 to FA 6, which was neither the class's
 * data nor its template -- just a hard-coded initial state that every one of
 * Posted Grades' replacement branches had failed to overwrite.
 *
 * An unconfigured period returns exactly ONE empty placeholder, never six. The
 * number of activities is the instructor's to decide; a gradebook should not
 * invent five columns nobody asked for.
 */
export async function loadClassActivities(classRecordId, semester) {
  const periods = periodsForSemester(semester);
  const placeholder = () => ([{
    id: 'act1',
    name: '',            // empty means unconfigured
    max: 20,
    description: '',
    placeholder: 'Activity 1'
  }]);

  const empty = () => Object.fromEntries(periods.map((t) => [t, placeholder()]));
  if (!classRecordId) return empty();

  try {
    const { data, error } = await supabase
      .from('class_activities')
      .select('*')
      .eq('class_record_id', classRecordId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const rows = data || [];
    return Object.fromEntries(periods.map((term) => {
      const termActs = rows.filter((a) => a.term === term);
      if (termActs.length === 0) return [term, placeholder()];
      return [term, termActs.map((a, idx) => ({
        id: a.activity_id,
        dbId: a.activity_id,
        slotKey: `act${idx + 1}`,
        name: a.name || a.title || '',
        max: parseFloat(a.max_score) || 20,
        description: a.description || '',
        topicTag: a.topic_tag || '',
        activityType: a.activity_type || 'formative',
        releasedAt: a.released_at || null,
        releasedBy: a.released_by || null,
        createdAt: a.created_at || null,
        componentId: a.component_id || null
      }))];
    }));
  } catch (err) {
    // No localStorage fallback. Caching gradebook STRUCTURE per browser is how
    // one screen came to show columns the class did not have; an empty period
    // is both honest and recoverable by reloading.
    console.warn('Could not load class activities:', err);
    return empty();
  }
}

export function getEnrollmentType(studentSectionId, classSectionId) {
  if (!studentSectionId) return 'Irregular';
  // A class with no section assigned can't match any student's section, so the
  // SQL twin's `u.section_id = v_section_id` compares against NULL and evaluates
  // to NULL (never TRUE), falling through its CASE to 'Irregular'. Match that.
  if (!classSectionId) return 'Irregular';
  return studentSectionId === classSectionId ? 'Regular' : 'Irregular';
}

/**
 * The official masterlist of a section: the students whose home block it is
 * (users.section_id), independent of any subject offering.
 */
export async function getSectionHomeRoster(sectionId) {
  if (!sectionId) return [];
  const { data, error } = await supabase
    .from('users')
    .select('user_id, first_name, last_name, middle_name, email, user_number, year_level, status')
    .eq('section_id', sectionId)
    .eq('role', 'student')
    .order('last_name')
    .order('first_name');

  if (error) throw error;
  return data || [];
}

/**
 * Students taking one of a section's subject offerings whose home section is a
 * different block — the companion list to the home-section masterlist.
 *
 * Lives here, beside getEnrollmentType and getClassPriorityRoster, so enrollment
 * resolution has one owner: enrollments are keyed by the CLASS's subject_id and
 * section_id, not by the student's home section, and the Regular/Irregular label is
 * decided by getEnrollmentType. A separate query written in a page could drift from
 * the faculty rosters that rely on the same rule.
 */
export async function getSectionIrregularEnrollees(sectionId) {
  if (!sectionId) return [];
  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      student_id,
      subject_id,
      section_id,
      subjects:subject_id ( code, name ),
      users:student_id (
        user_id, first_name, last_name, middle_name, email, user_number, year_level, status,
        section_id,
        sections:section_id ( name )
      )
    `)
    .eq('section_id', sectionId);

  if (error) throw error;

  const seen = new Set();
  return (data || [])
    .filter(row => row.users)
    .filter(row => getEnrollmentType(row.users.section_id, row.section_id) === 'Irregular')
    .filter(row => {
      const key = `${row.student_id}:${row.subject_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(row => ({
      ...row.users,
      homeSectionName: row.users.sections?.name || '',
      subjectCode: row.subjects?.code || '',
      subjectName: row.subjects?.name || ''
    }));
}

// generateJoinCode() and getOrCreateJoinCode() were removed with the class
// join code: Registrar and Dean place students on a roster directly, so a code
// nobody can redeem was only generating rows in a table nothing read.




/**
 * Admin Provisions an official Classroom (Subject + Section + Faculty + Term)
 */
export async function provisionClassroomByAdmin({
  subjectId,
  sectionId,
  facultyId,
  schoolYear,
  semester
}) {
  // 1. Check if class record already exists for this subject + section + term
  const { data: existingClass } = await supabase
    .from('class_records')
    .select('class_record_id, faculty:users!faculty_id(first_name, last_name)')
    .eq('subject_id', subjectId)
    .eq('section_id', sectionId)
    .eq('school_year', schoolYear)
    .eq('semester', semester)
    .maybeSingle();

  if (existingClass) {
    const profName = existingClass.faculty 
      ? `Prof. ${existingClass.faculty.first_name} ${existingClass.faculty.last_name}`
      : 'another instructor';
    throw new Error(`A classroom for this subject and section already exists in ${schoolYear} (${semester}), assigned to ${profName}.`);
  }

  // 2. Fetch subject and section info for code generation
  const [{ data: sub }, { data: sec }] = await Promise.all([
    supabase.from('subjects').select('code, name, computation_id, fda_absence_threshold').eq('subject_id', subjectId).single(),
    supabase.from('sections').select('name').eq('section_id', sectionId).single()
  ]);

  // 2.5 Freeze the subject's current COG onto the class now, at creation, rather than
  // leaving it NULL until the first official posting (ASPIRE-C10). A template edit must
  // only reach the next rolling term: with the snapshot already set, an already-running
  // class keeps the weights it was created with, and that applies to the tentative and
  // live grades students and faculty see, not just to posted milestones.
  //
  // Built with the same resolve + snapshot functions the posting path uses, deliberately:
  // post_grade_milestone_atomic compares the submitted snapshot against the stored one with
  // a strict JSONB <>, which is order-sensitive for the components array, so this must not
  // be a reimplementation. A subject with no template, or one whose weights do not total
  // 100%, yields null here and falls back to the old snapshot-at-first-posting behavior.
  // This is also where the two dynamic policy thresholds are frozen. They are
  // read from the CURRENT template and subject at this moment and written into
  // the snapshot, which the immutability trigger then seals -- so editing a
  // template's passing threshold or a subject's FDA count later reaches only
  // classes provisioned after the edit, exactly as component weights already
  // behave. Both stay null when unset, meaning the institutional defaults.
  let gradingFormulaSnapshot = null;
  if (sub?.computation_id) {
    const { data: computation } = await supabase
      .from('grade_computations')
      .select('name, description, passing_threshold, grade_computation_components ( * )')
      .eq('computation_id', sub.computation_id)
      .maybeSingle();

    const formula = resolveGradingFormula(computation?.grade_computation_components || null, {
      formulaAssigned: true
    });
    gradingFormulaSnapshot = createGradingFormulaSnapshot(formula, {
      computationId: sub.computation_id,
      passingThreshold: computation?.passing_threshold ?? null,
      fdaThreshold: sub?.fda_absence_threshold ?? null
    });
  }

  // 3. Insert class record
  const { data: newClass, error: insErr } = await supabase
    .from('class_records')
    .insert({
      subject_id: subjectId,
      section_id: sectionId,
      faculty_id: facultyId,
      school_year: schoolYear,
      semester: semester,
      status: 'active',
      grading_formula_snapshot: gradingFormulaSnapshot
    })
    .select()
    .single();

  if (insErr) throw insErr;

  // 3.5 Auto-enroll regular block section students assigned to this section.
  //
  // Reported, not swallowed. This used to console.warn and return as if the
  // class were fully provisioned, so an RLS refusal here produced a class with
  // nobody in it and a success message on screen -- which is exactly how a
  // Dean's finalize failed unnoticed until someone opened the roster. The
  // class is still kept on failure: it exists and can be enrolled into from
  // Enrollment Management, so throwing away a correct class record would be
  // the worse outcome. The caller is told so it can say so.
  let enrolled = 0;
  let enrollmentError = null;
  try {
    const { data: sectionStudents } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'student')
      .eq('section_id', sectionId);

    if (sectionStudents && sectionStudents.length > 0) {
      const studentIds = sectionStudents.map(s => s.user_id);
      const { data: existingEnrolls } = await supabase
        .from('enrollments')
        .select('student_id')
        .eq('subject_id', subjectId)
        .in('student_id', studentIds);

      const existingStudentIds = new Set((existingEnrolls || []).map(e => e.student_id));
      const enrollmentsToInsert = sectionStudents
        .filter(std => !existingStudentIds.has(std.user_id))
        .map(std => ({
          student_id: std.user_id,
          subject_id: subjectId,
          section_id: sectionId,
          status: 'active'
        }));

      if (enrollmentsToInsert.length > 0) {
        const { error: enrollErr } = await supabase
          .from('enrollments')
          .insert(enrollmentsToInsert);

        if (enrollErr) {
          enrollmentError = enrollErr.message;
        } else {
          enrolled = enrollmentsToInsert.length;
        }
      }
    }
  } catch (autoErr) {
    enrollmentError = autoErr?.message || String(autoErr);
  }

  return {
    class_record: newClass,
    subject: sub,
    section: sec,
    enrolled,
    enrollmentError
  };
}

/**
 * Faculty Self-Service Provisioning / Creation of a single Classroom
 */

/**
 * Faculty Self-Service Batch Creation of Multiple Classrooms (Teaching Load)
 */



/**
 * Fetches class students and calculates their academic risk score,
 * auto-sorting in descending order of priority (students needing help at the top).
 */
export async function getClassPriorityRoster(classRecordId, { throwOnError = false } = {}) {
  const read = async query => {
    const result = await query;
    if (result.error) throw result.error;
    return result;
  };
  try {
    // 1. Get class details
    const { data: cr } = await read(supabase
      .from('class_records')
      .select('class_record_id, term_id, section_id, subject_id, semester, grading_formula_snapshot, subjects ( computation_id )')
      .eq('class_record_id', classRecordId)
      .single());

    if (!cr) return [];

    let formulaComponents = cr.grading_formula_snapshot?.components || null;
    if (!formulaComponents && cr.subjects?.computation_id) {
      const { data: computation } = await read(supabase
        .from('grade_computations')
        .select('grade_computation_components ( * )')
        .eq('computation_id', cr.subjects.computation_id)
        .maybeSingle());
      formulaComponents = computation?.grade_computation_components || null;
    }
    const gradingFormula = resolveGradingFormula(formulaComponents, {
      formulaAssigned: Boolean(cr.grading_formula_snapshot || cr.subjects?.computation_id)
    });

    // 2. Fetch enrolled students
    const { data: enrolls } = await read(supabase
      .from('enrollments')
      .select(`
        student_id,
        users:student_id (
          user_id,
          first_name,
          last_name,
          email,
          user_number,
          section_id
        )
      `)
      .eq('section_id', cr.section_id)
      .eq('subject_id', cr.subject_id));

    // Students recorded against THIS class record, added to the enrollment
    // roster above.
    //
    // `enrollments` has no term or school_year column, so it only answers "who
    // is in this section now" -- right for a running class, wrong for one whose
    // term has rolled over and whose students have been moved on. Scores and
    // posted grades are keyed to class_record_id and never rewritten, so they
    // are the durable record of who sat the class.
    //
    // This matters more here than elsewhere because of the early return below:
    // an empty roster abandons the WHOLE class, grading formula and all, so a
    // past class would render as if it had never happened while its grades sat
    // untouched in the database.
    const [scoreRoster, postedRoster] = await Promise.all([
      read(supabase
        .from('student_term_scores')
        .select('student_id')
        .eq('class_record_id', classRecordId)),
      read(supabase
        .from('posted_grades')
        .select('student_id')
        .eq('class_record_id', classRecordId))
    ]);

    // Deduplicate enrolled users by user_id
    const uniqueMap = new Map();
    (enrolls || []).forEach(e => {
      if (e.users && e.users.user_id && !uniqueMap.has(e.users.user_id)) {
        uniqueMap.set(e.users.user_id, e.users);
      }
    });

    const recordedIds = Array.from(new Set(
      [
        ...(scoreRoster?.data || []).map(r => r.student_id),
        ...(postedRoster?.data || []).map(r => r.student_id)
      ].filter(id => id && !uniqueMap.has(id))
    ));
    if (recordedIds.length > 0) {
      const { data: recovered } = await read(supabase
        .from('users')
        .select('user_id, first_name, last_name, email, user_number, section_id')
        .in('user_id', recordedIds));
      (recovered || []).forEach(u => {
        if (u?.user_id && !uniqueMap.has(u.user_id)) uniqueMap.set(u.user_id, u);
      });
    }

    const students = Array.from(uniqueMap.values());
    if (students.length === 0) return [];

    const studentIds = students.map(s => s.user_id);

    // Where each student sat during THIS class's term.
    //
    // Regular/Irregular asks "was this the student's own block section?", and
    // users.section_id cannot answer it for a class that has ended: the rollover
    // rewrites that column when it moves students into the next term, so every
    // student in a past class compares unequal and the entire roster reads as
    // Irregular. student_term_details is written by the rollover for the term
    // being closed, before the move, so it is the record of where they were.
    // No snapshot means the term is still running, where the live column is right.
    const historicalSection = new Map();
    if (cr.term_id && studentIds.length > 0) {
      const { data: termDetails } = await read(supabase
        .from('student_term_details')
        .select('student_id, section_id')
        .eq('term_id', cr.term_id)
        .in('student_id', studentIds));
      (termDetails || []).forEach(row => {
        if (row.section_id) historicalSection.set(row.student_id, row.section_id);
      });
    }

    // 3. Fetch column setup configurations
    const { data: cols } = await read(supabase
      .from('class_grading_columns')
      .select('*')
      .eq('class_record_id', classRecordId));

    const colsMap = {};
    (cols || []).forEach(c => {
      // Use ?? (nullish coalescing) NOT || — 0 means "activity not configured", not "use default"
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

    // 3. Fetch scores from student_term_scores
    const { data: scores } = await read(supabase
      .from('student_term_scores')
      .select('*')
      .eq('class_record_id', classRecordId)
      .in('student_id', studentIds));

    const { data: classActivities } = await read(supabase
      .from('class_activities')
      .select('activity_id, term, name, max_score, component_id')
      .eq('class_record_id', classRecordId));

    const activityIds = (classActivities || []).map(activity => activity.activity_id);
    const { data: granularScores } = activityIds.length > 0
      ? await read(supabase
          .from('student_activity_scores')
          .select('student_id, activity_id, score')
          .in('student_id', studentIds)
          .in('activity_id', activityIds))
      : { data: [] };

    const activitiesByTerm = {};
    (classActivities || []).forEach(activity => {
      if (!activitiesByTerm[activity.term]) activitiesByTerm[activity.term] = [];
      activitiesByTerm[activity.term].push({
        id: activity.activity_id,
        dbId: activity.activity_id,
        name: activity.name,
        max: scoreOrNull(activity.max_score) ?? 0,
        componentId: activity.component_id || null
      });
    });

    // 3b. Fetch posted grades
    const { data: postedGrades } = await read(supabase
      .from('posted_grades')
      .select('*')
      .eq('class_record_id', classRecordId)
      .in('student_id', studentIds));

    // 4. Fetch attendance records
    const { data: attendances } = await read(supabase
      .from('attendance_records')
      .select('student_id, status')
      .eq('class_record_id', classRecordId)
      .in('student_id', studentIds));

    // 5. Fetch existing evaluations
    const { data: evals } = await read(supabase
      .from('student_risk_evaluations')
      .select('student_id, evaluation_id, risk_level, risk_score, status, refer_to_dean')
      .eq('class_record_id', classRecordId));

    const evalMap = {};
    (evals || []).forEach(ev => {
      evalMap[ev.student_id] = ev;
    });

    // 6. Calculate risk score for each student
    const priorityList = students.map(stud => {
      const homeSectionId = historicalSection.get(stud.user_id) || stud.section_id;
      const enrollmentType = getEnrollmentType(homeSectionId, cr.section_id);
      const studScores = (scores || []).filter(sc => sc.student_id === stud.user_id);
      const studAbsences = (attendances || []).filter(
        at => at.student_id === stud.user_id && (at.status === 'Absent' || at.status?.toLowerCase() === 'absent')
      ).length;
      const studPosted = (postedGrades || []).filter(pg => pg.student_id === stud.user_id);
      const finalPosted = findMostAdvancedPostedGrade(studPosted);

      const classRecordScores = {};
      studScores.forEach(score => {
        if (score.term) classRecordScores[score.term] = { ...score };
      });
      (granularScores || [])
        .filter(score => score.student_id === stud.user_id)
        .forEach(score => {
          const activity = (classActivities || []).find(item => item.activity_id === score.activity_id);
          if (!activity?.term) return;
          classRecordScores[activity.term] ||= {};
          classRecordScores[activity.term][score.activity_id] = scoreOrNull(score.score);
        });

      const tentativeDetails = computeTentativeGradeDetails(classRecordScores, colsMap, {
        formula: gradingFormula,
        activitiesByTerm,
        isSummer: cr.semester === 'Summer'
      });
      const termRatings = tentativeDetails.termRatings;
      const prelimRating = termRatings.Prelim ?? null;
      const midtermRating = termRatings.Midterm ?? null;
      let examSumPct = 0;
      let examCount = 0;
      const hasValidScores = Object.keys(termRatings).length > 0;

      studScores.forEach(sc => {
        if (sc.term) {
          const colSetup = colsMap[sc.term] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };
          const examRaw = sc.exam;
          const examMax = scoreOrNull(colSetup.exam);
          const hasEnteredExam = scoreOrNull(examRaw) !== null && examMax > 0;
          if (hasEnteredExam) {
            examSumPct += Math.min(100, (examRaw / examMax) * 100);
            examCount++;
          }
        }
      });

      // Tentative GWA computation — ALWAYS prefer the live computation that matches
      // the Score Sheet's current state. Only fall back to the posted grade if the
      // tentative engine cannot produce a value (e.g. no scores at all).
      let approxGwa = null;
      if (hasValidScores && tentativeDetails.gwa !== null) {
        approxGwa = tentativeDetails.gwa;
      } else if (finalPosted) {
        approxGwa = resolveOfficialGwa(finalPosted).gwa;
      }

      // Count zero submissions ONLY for activities that are actually configured (max > 0)
      const zeroSubmissionsCount = countRecordedZeroScores(studScores, colsMap,
        classActivities || [], (granularScores || []).filter(score => score.student_id === stud.user_id));
      const pendingActivityCount = countPendingActivities(
        classActivities || [],
        (granularScores || []).filter(score => score.student_id === stud.user_id)
      );
      const pendingActivityCounts = Object.fromEntries(
        [...new Set((classActivities || []).map(activity => activity.term).filter(Boolean))].map(term => [
          term,
          countPendingActivities(
            (classActivities || []).filter(activity => activity.term === term),
            (granularScores || []).filter(score => score.student_id === stud.user_id)
          )
        ])
      );

      const riskData = calculateAcademicRisk({
        currentGwa: approxGwa,
        absenceCount: studAbsences,
        previousTermRating: prelimRating,
        currentTermRating: midtermRating,
        consecutiveAbsences: studAbsences >= 2 ? 2 : 0,
        zeroSubmissionsCount,
        isSummer: cr.semester === 'Summer'
      });

      return {
        user_id: stud.user_id,
        student_id: stud.user_id,
        first_name: stud.first_name,
        last_name: stud.last_name,
        student_id_number: stud.user_number || stud.email?.split('@')[0],
        email: stud.email,
        home_section_id: homeSectionId || null,
        enrollment_type: enrollmentType,
        is_irregular: enrollmentType === 'Irregular',
        current_gwa: approxGwa,
        standing_source: hasValidScores && tentativeDetails.gwa !== null ? 'Tentative' : finalPosted ? 'Posted' : 'Pending',
        standing_milestone: hasValidScores && tentativeDetails.gwa !== null
          ? Object.keys(termRatings).join(', ') : finalPosted ? getCanonicalGradePeriod(finalPosted) : null,
        failing_count: approxGwa !== null && approxGwa > 3 ? 1 : 0,
        absences: studAbsences,
        exam_average: examCount > 0 ? Math.round(examSumPct / examCount) : 100,
        pending_activity_count: pendingActivityCount,
        pending_activity_counts: pendingActivityCounts,
        term_ratings: termRatings,
        risk_score: riskData.composite_score,
        risk_level: riskData.risk_level,
        badge_color: riskData.badge_color,
        trajectory_delta: riskData.trajectory_delta,
        risk_analysis: riskData,
        evaluation: evalMap[stud.user_id] || null,
        sg_percentage: tentativeDetails.semesterResult?.sg ?? null,
        mr_percentage: tentativeDetails.semesterResult?.mr ?? null,
        tfr_percentage: tentativeDetails.semesterResult?.tfr ?? null,
        is_complete: tentativeDetails.isComplete
      };
    });

    // 7. Sort by Risk Score Descending (Students needing urgent help at the top)
    priorityList.sort((a, b) => b.risk_score - a.risk_score);

    return priorityList;
  } catch (err) {
    console.error('Error computing student priority roster:', err);
    if (throwOnError) throw err;
    return [];
  }
}

// Backward-compatibility alias
export const getClassTriageRoster = getClassPriorityRoster;

