// src/lib/classRoomService.js
// Service for Class Room Creation, Join Codes, and Irregular Student Verification

import { supabase } from './supabase';
import { calculateAcademicRisk } from './riskEngine';
import { getTransmutedGrade } from './gradingMath';
// Note: riskEngine.js is now the single source of truth for all risk calculations (V4).

/**
 * Generates a clean, human-readable 6-8 character join code.
 * e.g., "CS3A-8X92"
 */
export function generateJoinCode(subjectCode = 'CLS', sectionName = 'A') {
  const prefix = (subjectCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || 'CLS').toUpperCase();
  const sec = (sectionName.replace(/[^A-Za-z0-9]/g, '').slice(-1) || 'X').toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${sec}-${rand}`;
}

/**
 * Gets or creates an active join code for a class record.
 */
export async function getOrCreateJoinCode(classRecordId, subjectCode = 'CLS', sectionName = 'A') {
  try {
    const { data: existing } = await supabase
      .from('class_room_join_codes')
      .select('join_code')
      .eq('class_record_id', classRecordId)
      .eq('is_active', true)
      .maybeSingle();

    if (existing?.join_code) {
      return existing.join_code;
    }

    // Create new join code
    const newCode = generateJoinCode(subjectCode, sectionName);
    const { data: inserted, error: insErr } = await supabase
      .from('class_room_join_codes')
      .insert({
        class_record_id: classRecordId,
        join_code: newCode,
        is_active: true
      })
      .select('join_code')
      .single();

    if (insErr) {
      console.warn('Could not insert join code into DB, using memory fallback:', insErr.message);
      return newCode;
    }
    return inserted?.join_code || newCode;
  } catch (err) {
    console.warn('Join code generation fallback:', err);
    return generateJoinCode(subjectCode, sectionName);
  }
}

/**
 * Submits a join request from a student using a classroom join code (Instant Enrollment).
 */
export async function submitJoinRequest(studentId, joinCode) {
  const cleanCode = (joinCode || '').trim().toUpperCase();
  if (!cleanCode) throw new Error('Please enter a valid join code.');

  // Find class record by join code
  const { data: codeRow, error: codeErr } = await supabase
    .from('class_room_join_codes')
    .select('class_record_id, is_active, class_records ( class_record_id, subject_id, section_id, subjects ( code, name ), sections ( name ) )')
    .eq('join_code', cleanCode)
    .maybeSingle();

  if (codeErr || !codeRow || !codeRow.is_active) {
    throw new Error('Invalid or inactive classroom code. Please check with your instructor.');
  }

  const classRecordId = codeRow.class_record_id;
  const subjectId = codeRow.class_records?.subject_id;
  const sectionId = codeRow.class_records?.section_id;

  // Check if student is already enrolled in this subject
  const { data: existingEnrollment } = await supabase
    .from('enrollments')
    .select('enrollment_id')
    .eq('student_id', studentId)
    .eq('subject_id', subjectId)
    .maybeSingle();

  if (existingEnrollment) {
    throw new Error(`You are already enrolled in ${codeRow.class_records?.subjects?.code || 'this subject'}.`);
  }

  // 1. Direct Enrollment: Insert into enrollments table
  if (subjectId && sectionId) {
    const { error: enrollErr } = await supabase
      .from('enrollments')
      .insert({
        student_id: studentId,
        subject_id: subjectId,
        section_id: sectionId,
        status: 'active'
      });

    if (enrollErr) {
      console.warn('Direct enrollment insert notice:', enrollErr.message);
    }
  }

  // 2. Also record in class_join_requests as approved for audit history
  await supabase
    .from('class_join_requests')
    .upsert({
      class_record_id: classRecordId,
      student_id: studentId,
      status: 'approved'
    }, { onConflict: 'class_record_id,student_id' });

  return {
    success: true,
    classRecord: codeRow.class_records,
    subjectCode: codeRow.class_records?.subjects?.code || 'Class',
    subjectName: codeRow.class_records?.subjects?.name || 'Subject',
    sectionName: codeRow.class_records?.sections?.name || 'Section',
    message: `Successfully enrolled in ${codeRow.class_records?.subjects?.code || 'Class'} (${codeRow.class_records?.sections?.name || 'Section'})!`
  };
}

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
    supabase.from('subjects').select('code, name').eq('subject_id', subjectId).single(),
    supabase.from('sections').select('name').eq('section_id', sectionId).single()
  ]);

  // 3. Insert class record
  const { data: newClass, error: insErr } = await supabase
    .from('class_records')
    .insert({
      subject_id: subjectId,
      section_id: sectionId,
      faculty_id: facultyId,
      school_year: schoolYear,
      semester: semester,
      status: 'active'
    })
    .select()
    .single();

  if (insErr) throw insErr;

  // 3.5 Auto-enroll regular block section students assigned to this section
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
          console.warn('Block section auto-enroll notice:', enrollErr.message);
        }
      }
    }
  } catch (autoErr) {
    console.warn('Auto-enrollment background error:', autoErr);
  }

  // 4. Generate unique join code
  const joinCode = await getOrCreateJoinCode(
    newClass.class_record_id,
    sub?.code || 'CLS',
    sec?.name || 'A'
  );

  return {
    class_record: newClass,
    join_code: joinCode,
    subject: sub,
    section: sec
  };
}

/**
 * Faculty Self-Service Provisioning / Creation of a single Classroom
 */
export async function provisionClassroomByFaculty({
  subjectId,
  sectionId,
  facultyId,
  schoolYear,
  semester
}) {
  return provisionClassroomByAdmin({
    subjectId,
    sectionId,
    facultyId,
    schoolYear,
    semester
  });
}

/**
 * Faculty Self-Service Batch Creation of Multiple Classrooms (Teaching Load)
 */
export async function provisionBatchClassroomsByFaculty({
  facultyId,
  classroomEntries,
  schoolYear,
  semester
}) {
  if (!classroomEntries || classroomEntries.length === 0) {
    throw new Error('Please add at least one classroom assignment.');
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < classroomEntries.length; i++) {
    const entry = classroomEntries[i];
    if (!entry.subjectId || !entry.sectionId) {
      errors.push(`Row #${i + 1}: Please select both a Subject and a Section.`);
      continue;
    }

    try {
      const res = await provisionClassroomByAdmin({
        subjectId: entry.subjectId,
        sectionId: entry.sectionId,
        facultyId,
        schoolYear,
        semester
      });
      results.push(res);
    } catch (err) {
      errors.push(`Row #${i + 1}: ${err.message}`);
    }
  }

  if (results.length === 0 && errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return {
    results,
    errors
  };
}

/**
 * Gets pending irregular join requests for a class record.
 */
export async function getPendingJoinRequests(classRecordId) {
  try {
    const { data, error } = await supabase
      .from('class_join_requests')
      .select(`
        request_id,
        class_record_id,
        student_id,
        status,
        created_at,
        users:student_id (
          user_id,
          first_name,
          last_name,
          email,
          user_number
        )
      `)
      .eq('class_record_id', classRecordId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch class_join_requests:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('Fallback getting join requests:', err);
    return [];
  }
}

/**
 * Approves or rejects a join request.
 */
export async function resolveJoinRequest(requestId, classRecordId, studentId, newStatus) {
  try {
    const { error: updErr } = await supabase
      .from('class_join_requests')
      .update({ status: newStatus })
      .eq('request_id', requestId);

    if (updErr) throw updErr;

    // If approved, ensure student is added to enrollments
    if (newStatus === 'approved') {
      const { data: cls } = await supabase
        .from('class_records')
        .select('subject_id, section_id')
        .eq('class_record_id', classRecordId)
        .single();

      if (cls) {
        const { data: existingEnc } = await supabase
          .from('enrollments')
          .select('enrollment_id')
          .eq('student_id', studentId)
          .eq('subject_id', cls.subject_id)
          .maybeSingle();

        if (!existingEnc) {
          await supabase
            .from('enrollments')
            .insert({
              student_id: studentId,
              subject_id: cls.subject_id,
              section_id: cls.section_id,
              status: 'active'
            });
        }
      }
    }

    return true;
  } catch (err) {
    console.error('Failed to resolve join request:', err);
    throw err;
  }
}

/**
 * Fetches class students and calculates their academic risk score,
 * auto-sorting in descending order of priority (students needing help at the top).
 */
export async function getClassPriorityRoster(classRecordId) {
  try {
    // 1. Get class details
    const { data: cr } = await supabase
      .from('class_records')
      .select('class_record_id, section_id, subject_id')
      .eq('class_record_id', classRecordId)
      .single();

    if (!cr) return [];

    // 2. Fetch enrolled students
    const { data: enrolls } = await supabase
      .from('enrollments')
      .select(`
        student_id,
        users:student_id (
          user_id,
          first_name,
          last_name,
          email,
          user_number
        )
      `)
      .eq('section_id', cr.section_id)
      .eq('subject_id', cr.subject_id);

    // Deduplicate enrolled users by user_id
    const uniqueMap = new Map();
    (enrolls || []).forEach(e => {
      if (e.users && e.users.user_id && !uniqueMap.has(e.users.user_id)) {
        uniqueMap.set(e.users.user_id, e.users);
      }
    });
    const students = Array.from(uniqueMap.values());
    if (students.length === 0) return [];

    const studentIds = students.map(s => s.user_id);

    // 3. Fetch column setup configurations
    const { data: cols } = await supabase
      .from('class_grading_columns')
      .select('*')
      .eq('class_record_id', classRecordId);

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
    const { data: scores } = await supabase
      .from('student_term_scores')
      .select('*')
      .eq('class_record_id', classRecordId)
      .in('student_id', studentIds);

    // 3b. Fetch posted grades
    const { data: postedGrades } = await supabase
      .from('posted_grades')
      .select('*')
      .eq('class_record_id', classRecordId)
      .in('student_id', studentIds);

    // 4. Fetch attendance records
    const { data: attendances } = await supabase
      .from('attendance_records')
      .select('student_id, status')
      .eq('class_record_id', classRecordId)
      .in('student_id', studentIds);

    // 5. Fetch existing evaluations
    const { data: evals } = await supabase
      .from('student_risk_evaluations')
      .select('student_id, evaluation_id, risk_level, risk_score, status, refer_to_dean')
      .eq('class_record_id', classRecordId);

    const evalMap = {};
    (evals || []).forEach(ev => {
      evalMap[ev.student_id] = ev;
    });

    // 6. Calculate risk score for each student
    const priorityList = students.map(stud => {
      const studScores = (scores || []).filter(sc => sc.student_id === stud.user_id);
      const studAbsences = (attendances || []).filter(
        at => at.student_id === stud.user_id && (at.status === 'Absent' || at.status?.toLowerCase() === 'absent')
      ).length;
      const studPosted = (postedGrades || []).filter(pg => pg.student_id === stud.user_id);
      const finalPosted = studPosted.find(pg => pg.grade_period === 'final');

      // Extract term ratings
      const termRatings = {};
      let prelimRating = null;
      let midtermRating = null;
      let examSumPct = 0;
      let examCount = 0;
      let hasValidScores = false;

      studScores.forEach(sc => {
        if (sc.term) {
          const colSetup = colsMap[sc.term] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };
          const actSum = (sc.act1 || 0) + (sc.act2 || 0) + (sc.act3 || 0) + (sc.act4 || 0) + (sc.act5 || 0) + (sc.act6 || 0);
          const char = sc.char_rating || 0;
          const examRaw = sc.exam;

          const hasEnteredActivity = (
            (sc.act1 != null && sc.act1 > 0) ||
            (sc.act2 != null && sc.act2 > 0) ||
            (sc.act3 != null && sc.act3 > 0) ||
            (sc.act4 != null && sc.act4 > 0) ||
            (sc.act5 != null && sc.act5 > 0) ||
            (sc.act6 != null && sc.act6 > 0)
          );
          const hasEnteredExam = examRaw != null && examRaw > 0;
          const hasEnteredChar = char > 0;

          const hasData = hasEnteredActivity || hasEnteredExam || hasEnteredChar;

          if (hasData) {
            hasValidScores = true;
            // Use values directly from colSetup — defaults are already in the fallback object (line 494)
            const actMax = colSetup.act1 + colSetup.act2 + colSetup.act3 + colSetup.act4 + colSetup.act5 + colSetup.act6;
            const csPct = (hasEnteredActivity && actMax > 0) ? Math.min(50, (actSum / actMax) * 50) : 0;
            const charPct = char * 0.1;
            
            const examMax = colSetup.exam || 40;
            let exPct = 0;
            if (hasEnteredExam) {
              const examPercentage = Math.min(100, (examRaw / examMax) * 100);
              exPct = (examPercentage / 100) * 40;
              examSumPct += examPercentage;
              examCount++;
            }

            const totalRating = Math.round(csPct + charPct + exPct);
            termRatings[sc.term] = totalRating;
            if (sc.term === 'Prelim') prelimRating = totalRating;
            if (sc.term === 'Midterm') midtermRating = totalRating;
          }
        }
      });

      // Tentative GWA computation
      let approxGwa = null;
      if (finalPosted && finalPosted.effective_grade != null) {
        approxGwa = parseFloat(finalPosted.effective_grade);
      } else if (finalPosted && finalPosted.computed_grade != null) {
        approxGwa = getTransmutedGrade(parseFloat(finalPosted.computed_grade));
      } else if (hasValidScores) {
        if (midtermRating !== null) {
          approxGwa = getTransmutedGrade(midtermRating);
        } else if (prelimRating !== null) {
          approxGwa = getTransmutedGrade(prelimRating);
        } else {
          const available = Object.values(termRatings);
          if (available.length > 0) {
            const avgRating = Math.round(available.reduce((a, b) => a + b, 0) / available.length);
            approxGwa = getTransmutedGrade(avgRating);
          }
        }
      }

      const examAvg = examCount > 0 ? Math.round(examSumPct / examCount) : 100;
      const failingCount = (approxGwa !== null && approxGwa > 3.00) ? 1 : 0;
      // hasGradeBelow200: Scholarship Grade Floor Breach (DYCI Handbook Sec 3.8.4 / 5.2.5.1)
      // Only relevant for PL/scholarship candidates (GWA ≤ 1.75) — NOT a general risk factor.
      // Moved to unified riskUtils.js computeUnifiedRisk() for proper per-student evaluation.
      const hasGradeBelow200 = false;

      // Count zero submissions ONLY for activities that are actually configured (max > 0)
      let zeroSubmissionsCount = 0;
      studScores.forEach(sc => {
        if (sc.term) {
          const termColSetup = colsMap[sc.term] || {};
          const hasEnteredActivity = (
            (sc.act1 != null && sc.act1 > 0) ||
            (sc.act2 != null && sc.act2 > 0) ||
            (sc.act3 != null && sc.act3 > 0) ||
            (sc.act4 != null && sc.act4 > 0) ||
            (sc.act5 != null && sc.act5 > 0) ||
            (sc.act6 != null && sc.act6 > 0)
          );
          if (hasEnteredActivity) {
            ['act1', 'act2', 'act3', 'act4', 'act5', 'act6'].forEach(key => {
              // Only count zeros for activities that actually exist (configured max > 0)
              const actMax = termColSetup[key] ?? 0;
              if (actMax > 0 && sc[key] === 0) zeroSubmissionsCount++;
            });
          }
        }
      });

      const riskData = calculateAcademicRisk({
        currentGwa: approxGwa,
        failingSubjectsCount: failingCount,
        majorExamAverage: examAvg,
        absenceCount: studAbsences,
        previousTermRating: prelimRating,
        currentTermRating: midtermRating,
        consecutiveAbsences: studAbsences >= 2 ? 2 : 0,
        zeroSubmissionsCount,
        hasGradeBelow200
      });

      return {
        user_id: stud.user_id,
        student_id: stud.user_id,
        first_name: stud.first_name,
        last_name: stud.last_name,
        student_id_number: stud.user_number || stud.email?.split('@')[0],
        email: stud.email,
        current_gwa: approxGwa,
        failing_count: failingCount,
        absences: studAbsences,
        exam_average: examAvg !== null ? examAvg : 100,
        term_ratings: termRatings,
        risk_score: riskData.composite_score,
        risk_level: riskData.risk_level,
        badge_color: riskData.badge_color,
        trajectory_delta: riskData.trajectory_delta,
        risk_analysis: riskData,
        evaluation: evalMap[stud.user_id] || null
      };
    });

    // 7. Sort by Risk Score Descending (Students needing urgent help at the top)
    priorityList.sort((a, b) => b.risk_score - a.risk_score);

    return priorityList;
  } catch (err) {
    console.error('Error computing student priority roster:', err);
    return [];
  }
}

// Backward-compatibility alias
export const getClassTriageRoster = getClassPriorityRoster;


