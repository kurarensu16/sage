import { supabase } from './supabase';
import { fetchAcademicTerms, sortAcademicTerms, recordMatchesAcademicTerm, formatTermLabel } from './termStatus';
import { GRADE_MILESTONES, findPostedMilestone, getCanonicalGradePeriod } from './gradeMilestones';
import { resolveOfficialGradeState, computeStudentGwa } from './academicPolicy';
import { classifySection, indexProgramsByAbbreviation } from './sectionNaming';
import { formatClassSchedule } from './classSchedule';
import { fetchSgApproval, fetchSgApprovalsFor } from './sgApprovalService';

// Read-only data layer for the Registrar's Student Records and Class Grade
// Sheets (pre-final defense revision, 2026-11-18; plan:
// docs/02-thesis/defense/REGISTRAR_REVISIONS_PLAN_2026-11-18.md, Phase 2).
//
// Nothing here writes. Corrections stay in Grade Override and Late Grade
// Changes; this module only shows what is on record.
//
// Rules this module follows rather than re-deciding:
//  - An enrollment belongs to the class with the same subject_id AND
//    section_id (as MyGradesList and getSectionIrregularEnrollees do).
//  - A milestone row is identified with getCanonicalGradePeriod(), so legacy
//    'final'/'sg' rows still count as the SG.
//  - The official grade, remark and GWA come from resolveOfficialGradeState()
//    and computeStudentGwa() (plain mean, no unit weighting), the same figures
//    the student's own Grade Report shows.
//  - Program and year of a section come from its name via sectionNaming.js,
//    matched to programs.abbreviation from the database.
//
// Reading posted_grades needs the Registrar arm of
// can_read_student_class_record(), restored by
// 20261118152303_registrar_reads_official_grades_again.sql.

const PAGE_SIZE = 1000;

async function fetchAllPaged(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// PostgREST puts .in() lists in the URL, so long id lists are sent in chunks.
const IN_CHUNK = 150;
async function fetchByIds(ids, build) {
  const unique = [...new Set(ids.filter(Boolean))];
  const rows = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    rows.push(...(await fetchAllPaged((from, to) => build(chunk, from, to))));
  }
  return rows;
}

export const fullName = (person) => {
  if (!person) return '';
  const middle = person.middle_name ? ` ${person.middle_name}` : '';
  return `${person.last_name || ''}, ${person.first_name || ''}${middle}`.trim().replace(/^,\s*/, '');
};

const facultyName = (faculty) =>
  faculty ? `${faculty.first_name || ''} ${faculty.last_name || ''}`.trim() : '';

const formatRating = (value) =>
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);

// One milestone row reduced to what a records screen shows.
function describeMilestone(row) {
  if (!row) return null;
  const state = resolveOfficialGradeState(row);
  return {
    postedGradeId: row.posted_grade_id,
    rating: formatRating(state.rating),
    gwa: state.gwa,
    remark: state.displayRemark,
    isExceptional: state.isExceptional,
    postedAt: row.posted_at || row.updated_at || row.created_at || null
  };
}

function milestonesFor(rows) {
  return {
    mr: describeMilestone(findPostedMilestone(rows, GRADE_MILESTONES.MIDTERM_RATING)),
    tfr: describeMilestone(findPostedMilestone(rows, GRADE_MILESTONES.TENTATIVE_FINAL_RATING)),
    sg: describeMilestone(findPostedMilestone(rows, GRADE_MILESTONES.SEMESTRAL_GRADE))
  };
}

// ── Block section: Regular or Off-block ─────────────────────────────────────
//
// "Off-block" means the student takes this class with a section that is not
// their own block FOR THAT TERM. Two things make a plain section_id comparison
// wrong, and both were seen in QA (2026-11-18: a BSIT-1A student's BSIT-1A
// classes all read Off-block, in both semesters):
//  - every term has its own section row, so last term's BSIT-1A and this
//    term's BSIT-1A are different ids with the same name;
//  - the rollover rewrites users.section_id, so for a past term it no longer
//    says where the student was. student_term_details is the record of that
//    (the faculty roster reads it the same way, see getClassPriorityRoster).
// So: the block for a term is student_term_details for that term, else the
// current home section, and the comparison is by section NAME.

const normName = (n) => String(n || '').trim().toUpperCase();

/** Returns blockFor(studentId, termId) -> the student's block section name, or ''. */
async function fetchBlockSections(studentIds) {
  const ids = [...new Set(studentIds.filter(Boolean))];
  const current = new Map();
  const byTerm = new Map();
  if (ids.length) {
    const [users, details] = await Promise.all([
      fetchByIds(ids, (chunk, from, to) =>
        supabase.from('users').select('user_id, sections:section_id(name)').in('user_id', chunk).range(from, to)
      ),
      fetchByIds(ids, (chunk, from, to) =>
        supabase.from('student_term_details').select('student_id, term_id, sections:section_id(name)')
          .in('student_id', chunk).range(from, to)
      ).catch(() => [])
    ]);
    for (const u of users) current.set(u.user_id, u.sections?.name || '');
    for (const d of details) {
      if (d.term_id && d.sections?.name) byTerm.set(`${d.student_id}:${d.term_id}`, d.sections.name);
    }
  }
  return {
    blockFor: (studentId, termId) =>
      (termId && byTerm.get(`${studentId}:${termId}`)) || current.get(studentId) || ''
  };
}

/** 'Regular' (own block), 'Off-block' (another block), or 'No block' (irregular student). */
function blockStatus(blockName, classSectionName) {
  if (!normName(blockName)) return 'No block';
  return normName(blockName) === normName(classSectionName) ? 'Regular' : 'Off-block';
}

// ── Catalog shared by both screens ──────────────────────────────────────────

export async function fetchRecordsCatalog() {
  const [collegesRes, programsRes, terms] = await Promise.all([
    supabase.from('departments').select('department_id, name').order('name'),
    supabase.from('programs').select('program_id, name, abbreviation, department_id').order('name'),
    fetchAcademicTerms()
  ]);
  if (collegesRes.error) throw collegesRes.error;
  if (programsRes.error) throw programsRes.error;
  const programs = programsRes.data || [];
  return {
    colleges: collegesRes.data || [],
    programs,
    programsByAbbr: indexProgramsByAbbreviation(programs),
    terms: sortAcademicTerms(terms),
    activeTerm: terms.find((t) => t.is_active) || null
  };
}

// ── Student Records ─────────────────────────────────────────────────────────

/**
 * Every student account, classified by college (users.department_id),
 * program (parsed from the home section name) and year (users.year_level).
 */
export async function fetchStudentDirectory(programsByAbbr) {
  const rows = await fetchAllPaged((from, to) =>
    supabase
      .from('users')
      .select(
        'user_id, user_number, first_name, middle_name, last_name, email, status, department_id, section_id, year_level, sections:section_id(name)'
      )
      .eq('role', 'student')
      .order('last_name')
      .order('first_name')
      .range(from, to)
  );
  return rows.map((student) => {
    const sectionName = student.sections?.name || '';
    // No home section reads as Unclassified, which is what an irregular
    // student's program is until the Registrar gives them a block.
    const classified = classifySection(sectionName, programsByAbbr);
    return {
      ...student,
      sectionName,
      programId: classified.programId,
      programLabel: classified.programLabel,
      // Regular means the student has a home block; Irregular means they are
      // placed class by class. Same rule as Enrollment Management.
      standing: student.section_id ? 'Regular' : 'Irregular'
    };
  });
}

export async function fetchStudentProfile(studentId, programsByAbbr) {
  const { data, error } = await supabase
    .from('users')
    .select(
      'user_id, user_number, first_name, middle_name, last_name, email, status, role, department_id, section_id, year_level, departments:department_id(name), sections:section_id(name)'
    )
    .eq('user_id', studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.role !== 'student') return null;
  const classified = classifySection(data.sections?.name || '', programsByAbbr);
  return {
    ...data,
    collegeName: data.departments?.name || '',
    sectionName: data.sections?.name || '',
    programLabel: classified.programLabel,
    standing: data.section_id ? 'Regular' : 'Irregular'
  };
}

/**
 * Every subject the student is or was enrolled in, each matched to its class
 * record, tagged with the academic term it belongs to.
 */
export async function fetchStudentEnrollments(studentId, terms = []) {
  const { data: enrolls, error } = await supabase
    .from('enrollments')
    .select(
      'student_id, subject_id, section_id, sections:section_id(section_id, name, school_year, semester, term_id), subjects:subject_id(subject_id, code, name, units)'
    )
    .eq('student_id', studentId);
  if (error) throw error;

  const subjectIds = [...new Set((enrolls || []).map((e) => e.subject_id).filter(Boolean))];
  const sectionIds = [...new Set((enrolls || []).map((e) => e.section_id).filter(Boolean))];
  let classes = [];
  if (subjectIds.length && sectionIds.length) {
    const { data, error: crErr } = await supabase
      .from('class_records')
      .select(
        'class_record_id, subject_id, section_id, status, term_id, school_year, semester, meeting_days, start_time, end_time, class_type, rooms(code), faculty:users!faculty_id(first_name, last_name)'
      )
      .in('subject_id', subjectIds)
      .in('section_id', sectionIds);
    if (crErr) throw crErr;
    classes = data || [];
  }

  const homes = await fetchBlockSections([studentId]);

  const rows = [];
  for (const enrollment of enrolls || []) {
    const matching = classes.filter(
      (cr) => cr.subject_id === enrollment.subject_id && cr.section_id === enrollment.section_id
    );
    // A subject offered as lecture and laboratory is two class records; show
    // both. An enrollment with no class record yet still shows, as unscheduled.
    const targets = matching.length ? matching : [null];
    for (const cr of targets) {
      const section = enrollment.sections || {};
      const termSource = cr || { sections: section, school_year: section.school_year, semester: section.semester, term_id: section.term_id };
      const term = terms.find((t) => recordMatchesAcademicTerm(termSource, t)) || null;
      rows.push({
        key: `${enrollment.subject_id}:${enrollment.section_id}:${cr?.class_record_id || 'none'}`,
        classRecordId: cr?.class_record_id || null,
        termId: term?.term_id || null,
        termLabel: term ? formatTermLabel(term) : [section.school_year, section.semester].filter(Boolean).join(' · ') || 'Unknown term',
        subjectCode: enrollment.subjects?.code || '',
        subjectName: enrollment.subjects?.name || '',
        units: enrollment.subjects?.units ?? null,
        sectionName: section.name || '',
        classType: cr?.class_type || null,
        instructor: facultyName(cr?.faculty) || 'Not assigned',
        schedule: cr
          ? formatClassSchedule({ days: cr.meeting_days, startTime: cr.start_time, endTime: cr.end_time, room: cr.rooms?.code })
          : null,
        enrollmentType: blockStatus(homes.blockFor(studentId, term?.term_id || section.term_id), section.name)
      });
    }
  }
  return rows.sort(
    (a, b) => a.subjectCode.localeCompare(b.subjectCode) || String(a.classType || '').localeCompare(String(b.classType || ''))
  );
}

/**
 * The student's posted MR, TFR and SG for every class, grouped by term,
 * newest term first, with the term GWA from the posted SGs.
 */
export async function fetchStudentGradeHistory(studentId, terms = []) {
  const [posted, corrections] = await Promise.all([

    fetchAllPaged((from, to) =>
      supabase
        .from('posted_grades')
        .select(
          '*, class_records:class_record_id(class_record_id, term_id, school_year, semester, class_type, subjects:subject_id(code, name, units), sections:section_id(name, school_year, semester), faculty:users!faculty_id(first_name, last_name))'
        )
        .eq('student_id', studentId)
        .range(from, to)
    ),
    fetchCorrectedClassIds({ studentId })
  ]);

  const byClass = new Map();
  for (const row of posted) {
    if (!row.class_records) continue;
    const entry = byClass.get(row.class_record_id) || { cr: row.class_records, rows: [] };
    entry.rows.push(row);
    byClass.set(row.class_record_id, entry);
  }
  const approvals = await fetchSgApprovalsFor([...byClass.keys()]);

  const byTerm = new Map();
  for (const [classRecordId, { cr, rows }] of byClass) {
    const term = terms.find((t) => recordMatchesAcademicTerm(cr, t)) || null;
    const termKey = term?.term_id || `${cr.school_year}|${cr.semester}`;
    const bucket = byTerm.get(termKey) || {
      termKey,
      term,
      termLabel: term ? formatTermLabel(term) : [cr.school_year, cr.semester].filter(Boolean).join(' · '),
      subjects: []
    };
    bucket.subjects.push({
      classRecordId,
      subjectCode: cr.subjects?.code || '',
      subjectName: cr.subjects?.name || '',
      units: cr.subjects?.units ?? null,
      sectionName: cr.sections?.name || '',
      classType: cr.class_type || null,
      instructor: facultyName(cr.faculty),
      corrected: corrections.has(classRecordId),
      sgApprovalStatus: approvals.get(classRecordId)?.status || null,
      ...milestonesFor(rows)
    });
    byTerm.set(termKey, bucket);
  }

  const order = new Map(terms.map((t, i) => [t.term_id, i]));
  return [...byTerm.values()]
    .map((bucket) => {
      bucket.subjects.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
      // Only approved SGs are official, so only they count toward the term GWA.
      // (An SG from before Dean approval existed is recorded as approved.)
      const sgs = bucket.subjects
        .filter((s) => s.sg && (s.sgApprovalStatus === 'approved' || s.sgApprovalStatus === null))
        .map((s) => s.sg);
      const gwa = computeStudentGwa(sgs.map((s) => s.gwa));
      return {
        ...bucket,
        gwa: gwa.gwa,
        sgCount: sgs.length,
        subjectCount: bucket.subjects.length,
        // Official only once every subject in the term has its SG.
        gwaIsComplete: sgs.length > 0 && sgs.length === bucket.subjects.length
      };
    })
    .sort((a, b) => {
      const ai = a.term ? order.get(a.term.term_id) : Infinity;
      const bi = b.term ? order.get(b.term.term_id) : Infinity;
      return (ai ?? Infinity) - (bi ?? Infinity) || b.termLabel.localeCompare(a.termLabel);
    });
}

// Classes whose official grade was changed after posting, through either a
// Dean-approved correction or a Registrar override (both are recorded in
// grade_correction_history). Shown as a "Corrected" flag, never as the reason.
async function fetchCorrectedClassIds({ studentId = null, classRecordId = null }) {
  let query = supabase.from('grade_correction_history').select('class_record_id, student_id');
  if (studentId) query = query.eq('student_id', studentId);
  if (classRecordId) query = query.eq('class_record_id', classRecordId);
  const { data, error } = await query.limit(1000);
  // A missing read right on the history must not blank the grade screens.
  if (error) return new Set();
  if (classRecordId) return new Set((data || []).map((r) => r.student_id));
  return new Set((data || []).map((r) => r.class_record_id));
}

// ── Class Grade Sheets ──────────────────────────────────────────────────────

async function fetchTermClassRecords(term) {
  const select =
    'class_record_id, subject_id, section_id, status, class_type, term_id, school_year, semester, subjects:subject_id(code, name, units), sections:section_id(name, department_id), faculty:users!faculty_id(first_name, last_name)';
  const [scoped, legacy] = await Promise.all([
    fetchAllPaged((from, to) =>
      supabase.from('class_records').select(select).eq('term_id', term.term_id).range(from, to)
    ),
    fetchAllPaged((from, to) =>
      supabase
        .from('class_records')
        .select(select)
        .is('term_id', null)
        .eq('school_year', term.school_year)
        .eq('semester', term.semester)
        .range(from, to)
    )
  ]);
  const seen = new Set();
  return [...scoped, ...legacy].filter((cr) => {
    if (seen.has(cr.class_record_id)) return false;
    seen.add(cr.class_record_id);
    return true;
  });
}

/**
 * Every class of a term with its college, parsed program and year, enrolled
 * count, and how many of its students have an SG on record.
 */
export async function fetchTermClasses(term, programsByAbbr) {
  if (!term) return [];
  const classes = await fetchTermClassRecords(term);
  if (!classes.length) return [];

  const sectionIds = classes.map((c) => c.section_id);
  const [enrollments, posted, approvals] = await Promise.all([
    fetchByIds(sectionIds, (chunk, from, to) =>
      supabase.from('enrollments').select('student_id, subject_id, section_id').in('section_id', chunk).range(from, to)
    ),
    fetchByIds(classes.map((c) => c.class_record_id), (chunk, from, to) =>
      supabase
        .from('posted_grades')
        .select('class_record_id, student_id, grade_period, locked_milestones')
        .in('class_record_id', chunk)
        .range(from, to)
    ),
    fetchSgApprovalsFor(classes.map((c) => c.class_record_id))
  ]);

  const enrolledByPair = new Map();
  for (const e of enrollments) {
    const key = `${e.subject_id}:${e.section_id}`;
    const set = enrolledByPair.get(key) || new Set();
    set.add(e.student_id);
    enrolledByPair.set(key, set);
  }
  const sgByClass = new Map();
  for (const row of posted) {
    if (getCanonicalGradePeriod(row) !== GRADE_MILESTONES.SEMESTRAL_GRADE) continue;
    const set = sgByClass.get(row.class_record_id) || new Set();
    set.add(row.student_id);
    sgByClass.set(row.class_record_id, set);
  }

  return classes
    .map((cr) => {
      const sectionName = cr.sections?.name || '';
      const classified = classifySection(sectionName, programsByAbbr);
      const enrolled = enrolledByPair.get(`${cr.subject_id}:${cr.section_id}`)?.size || 0;
      const sgPosted = sgByClass.get(cr.class_record_id)?.size || 0;
      return {
        classRecordId: cr.class_record_id,
        subjectCode: cr.subjects?.code || '',
        subjectName: cr.subjects?.name || '',
        classType: cr.class_type || null,
        sectionId: cr.section_id,
        sectionName,
        collegeId: cr.sections?.department_id || null,
        programId: classified.programId,
        programLabel: classified.programLabel,
        yearDigit: classified.yearDigit,
        yearLabel: classified.yearLabel,
        instructor: facultyName(cr.faculty) || 'Not assigned',
        status: cr.status || 'active',
        enrolled,
        sgPosted,
        sgState: sgPosted === 0 ? 'none' : sgPosted >= enrolled ? 'complete' : 'partial',
        // Dean approval of the SG: 'submitted' | 'approved' | 'returned' | null.
        approvalStatus: approvals.get(cr.class_record_id)?.status || null,
        approvedAt: approvals.get(cr.class_record_id)?.status === 'approved'
          ? approvals.get(cr.class_record_id)?.decidedAt || null
          : null
      };
    })
    .sort((a, b) => a.sectionName.localeCompare(b.sectionName) || a.subjectCode.localeCompare(b.subjectCode));
}

/**
 * One class: its header, and the roster with each student's posted MR, TFR
 * and SG. Students with an enrollment but no posting yet are included.
 */
export async function fetchClassGradeSheet(classRecordId, terms = [], programsByAbbr = new Map()) {
  const { data: cr, error } = await supabase
    .from('class_records')
    .select(
      'class_record_id, subject_id, section_id, status, class_type, term_id, school_year, semester, meeting_days, start_time, end_time, rooms(code), subjects:subject_id(code, name, units), sections:section_id(name, department_id, departments:department_id(name)), faculty:users!faculty_id(first_name, last_name)'
    )
    .eq('class_record_id', classRecordId)
    .maybeSingle();
  if (error) throw error;
  if (!cr) return null;

  const [enrollments, posted, corrected, approval] = await Promise.all([
    fetchAllPaged((from, to) =>
      supabase
        .from('enrollments')
        .select('student_id, users:student_id(user_id, user_number, first_name, middle_name, last_name, section_id, status, sections:section_id(name))')
        .eq('subject_id', cr.subject_id)
        .eq('section_id', cr.section_id)
        .range(from, to)
    ),
    fetchAllPaged((from, to) =>
      supabase.from('posted_grades').select('*').eq('class_record_id', classRecordId).range(from, to)
    ),
    fetchCorrectedClassIds({ classRecordId }),
    fetchSgApproval(classRecordId).catch(() => null)
  ]);

  const postedByStudent = new Map();
  for (const row of posted) {
    const list = postedByStudent.get(row.student_id) || [];
    list.push(row);
    postedByStudent.set(row.student_id, list);
  }

  const homes = await fetchBlockSections(enrollments.map((e) => e.student_id));

  const seen = new Set();
  const roster = [];
  for (const e of enrollments) {
    if (!e.users || seen.has(e.student_id)) continue;
    seen.add(e.student_id);
    const block = homes.blockFor(e.student_id, cr.term_id);
    roster.push({
      studentId: e.student_id,
      userNumber: e.users.user_number || '',
      name: fullName(e.users),
      homeSection: block || '',
      enrollmentType: blockStatus(block, cr.sections?.name),
      corrected: corrected.has(e.student_id),
      ...milestonesFor(postedByStudent.get(e.student_id) || [])
    });
  }
  // A posted grade whose enrollment was later removed is still an official
  // record, so it is listed rather than dropped.
  for (const [studentId, rows] of postedByStudent) {
    if (seen.has(studentId)) continue;
    roster.push({
      studentId,
      userNumber: '',
      name: 'Student no longer on this roster',
      homeSection: '',
      enrollmentType: 'Removed',
      corrected: corrected.has(studentId),
      ...milestonesFor(rows)
    });
  }
  roster.sort((a, b) => a.name.localeCompare(b.name));

  const term = terms.find((t) => recordMatchesAcademicTerm(cr, t)) || null;
  const classified = classifySection(cr.sections?.name || '', programsByAbbr);
  return {
    classRecordId: cr.class_record_id,
    subjectCode: cr.subjects?.code || '',
    subjectName: cr.subjects?.name || '',
    units: cr.subjects?.units ?? null,
    classType: cr.class_type || null,
    sectionName: cr.sections?.name || '',
    collegeName: cr.sections?.departments?.name || '',
    programLabel: classified.programLabel,
    yearLabel: classified.yearLabel,
    instructor: facultyName(cr.faculty) || 'Not assigned',
    schedule: formatClassSchedule({ days: cr.meeting_days, startTime: cr.start_time, endTime: cr.end_time, room: cr.rooms?.code }),
    status: cr.status || 'active',
    termLabel: term ? formatTermLabel(term) : [cr.school_year, cr.semester].filter(Boolean).join(' · '),
    approval,
    roster,
    counts: {
      enrolled: roster.filter((r) => r.enrollmentType !== 'Removed').length,
      mr: roster.filter((r) => r.mr).length,
      tfr: roster.filter((r) => r.tfr).length,
      sg: roster.filter((r) => r.sg).length
    }
  };
}

// Rows for Excel. Kept beside the fetchers so the export and the screen cannot
// disagree about what a cell means.
const cellGwa = (m) => (m && m.gwa !== null ? Number(m.gwa).toFixed(2) : '');
const cellRating = (m) => (m && m.rating !== null ? Number(m.rating).toFixed(2) : '');

export function gradeSheetExportRows(sheet) {
  return sheet.roster.map((r) => ({
    'Student No.': r.userNumber,
    Student: r.name,
    'Home Section': r.homeSection,
    Type: r.enrollmentType,
    'MR %': cellRating(r.mr),
    'MR Grade': cellGwa(r.mr),
    'TFR %': cellRating(r.tfr),
    'TFR Grade': cellGwa(r.tfr),
    'SG %': cellRating(r.sg),
    'SG Grade': cellGwa(r.sg),
    Remark: r.sg ? r.sg.remark : '',
    Corrected: r.corrected ? 'Yes' : ''
  }));
}

export function gradeHistoryExportRows(student, history) {
  const rows = [];
  for (const term of history) {
    for (const s of term.subjects) {
      rows.push({
        Term: term.termLabel,
        'Student No.': student?.user_number || '',
        Student: fullName(student),
        'Subject Code': s.subjectCode,
        Subject: s.subjectName,
        Units: s.units ?? '',
        Section: s.sectionName,
        'MR Grade': cellGwa(s.mr),
        'TFR Grade': cellGwa(s.tfr),
        'SG %': cellRating(s.sg),
        'SG Grade': cellGwa(s.sg),
        Remark: s.sg ? s.sg.remark : '',
        Corrected: s.corrected ? 'Yes' : ''
      });
    }
  }
  return rows;
}
