// src/lib/classRoomService.js
// Service for Class Room Creation, Join Codes, and Irregular Student Verification

import { supabase } from './supabase';
import { calculateAcademicRisk } from './riskEngine';
import { getTransmutedGrade } from './gradingMath';

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
        status: 'enrolled'
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
        await supabase
          .from('enrollments')
          .upsert({
            student_id: studentId,
            subject_id: cls.subject_id,
            section_id: cls.section_id,
            status: 'enrolled'
          }, { onConflict: 'student_id,subject_id' });
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

    const students = (enrolls || []).map(e => e.users).filter(Boolean);
    if (students.length === 0) return [];

    const studentIds = students.map(s => s.user_id);

    // 3. Fetch scores
    const { data: scores } = await supabase
      .from('class_record_scores')
      .select('*')
      .eq('class_record_id', classRecordId)
      .in('student_id', studentIds);

    // 4. Fetch attendance records
    const { data: attendances } = await supabase
      .from('student_attendances')
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
      const studAbsences = (attendances || []).filter(at => at.student_id === stud.user_id && at.status === 'absent').length;

      // Extract term ratings
      const termRatings = {};
      let prelimRating = null;
      let midtermRating = null;
      let examSum = 0;
      let examCount = 0;

      studScores.forEach(sc => {
        if (sc.term) {
          const actSum = (sc.act1 || 0) + (sc.act2 || 0) + (sc.act3 || 0) + (sc.act4 || 0) + (sc.act5 || 0) + (sc.act6 || 0);
          const char = (sc.char_rating || 0) * 0.1;
          const ex = sc.exam || 0;
          if (sc.exam !== null && sc.exam !== undefined) {
            examSum += sc.exam;
            examCount++;
          }
          // Default CS max ~100
          const csPct = Math.min(50, actSum * 0.5);
          const exPct = Math.min(40, ex * 0.4);
          const totalRating = Math.round(csPct + char + exPct);
          termRatings[sc.term] = totalRating;
          if (sc.term === 'Prelim') prelimRating = totalRating;
          if (sc.term === 'Midterm') midtermRating = totalRating;
        }
      });

      // Tentative GWA
      let approxGwa = 2.50;
      if (midtermRating !== null) {
        approxGwa = getTransmutedGrade(midtermRating);
      } else if (prelimRating !== null) {
        approxGwa = getTransmutedGrade(prelimRating);
      }

      const examAvg = examCount > 0 ? Math.round(examSum / examCount) : 75;
      const failingCount = (approxGwa > 3.00) ? 1 : 0;

      const riskData = calculateAcademicRisk({
        currentGwa: approxGwa,
        failingSubjectsCount: failingCount,
        majorExamAverage: examAvg,
        absenceCount: studAbsences,
        previousTermRating: prelimRating,
        currentTermRating: midtermRating
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
        exam_average: examAvg,
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


