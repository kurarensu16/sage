import { supabase } from './supabase';
import * as XLSX from 'xlsx';

// Registrar analytics and records reporting.
//
// Scope boundary: this module covers records, enrollment, and academic
// structure -- the things the Registrar owns. It deliberately does NOT compute
// student performance metrics (GWA, pass rates, risk), which belong to the Dean
// and faculty reporting layer in reportsService.js, nor system health, which is
// Admin's. Keeping that line sharp is what stops three portals from growing
// three slightly different versions of the same number.
//
// Two constraints that shape the queries below:
//
//  1. `sections` has no `program_id`. A section's program is encoded only in its
//     constructed name (e.g. "BSIT-1A"); the sole real foreign key is
//     `department_id` (see SectionForm.jsx, which uses the program list purely
//     to build that name string). Distribution is therefore reported per
//     COLLEGE, not per program -- deriving a program by parsing section names
//     would be guesswork dressed up as data.
//  2. PostgREST caps a response at 1000 rows. Any query that needs whole rows
//     rather than a count is paginated explicitly via `.range()`, because a
//     silent truncation at 1000 would produce confidently wrong analytics.
//     Count-only questions use `{ count: 'exact', head: true }` so no rows move.

const PAGE_SIZE = 1000;

// Fetches every row of a query in PAGE_SIZE pages. `build` receives a range and
// must return a fresh query, since a PostgREST builder cannot be re-executed.
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

async function countOf(table, apply) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function fetchActiveTerm() {
  const { data, error } = await supabase
    .from('academic_terms')
    .select('term_id, school_year, semester, is_active')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Sections carry either an explicit term_id or, for legacy rows, a matching
// school_year/semester pair with a null term_id. SectionList.jsx already reads
// them this way; mirroring it keeps the dashboard's section count identical to
// what the Manage Sections page shows.
async function fetchTermSections(term) {
  if (!term) return [];
  const [scoped, legacy] = await Promise.all([
    fetchAllPaged((from, to) =>
      supabase
        .from('sections')
        .select('section_id, name, department_id, term_id, departments:department_id(name)')
        .eq('term_id', term.term_id)
        .range(from, to)
    ),
    fetchAllPaged((from, to) =>
      supabase
        .from('sections')
        .select('section_id, name, department_id, term_id, departments:department_id(name)')
        .is('term_id', null)
        .eq('school_year', term.school_year)
        .eq('semester', term.semester)
        .range(from, to)
    )
  ]);
  const seen = new Set();
  return [...scoped, ...legacy].filter((section) => {
    if (seen.has(section.section_id)) return false;
    seen.add(section.section_id);
    return true;
  });
}

export async function fetchStructureCounts(term) {
  const [colleges, programs, subjects, templates, sections] = await Promise.all([
    countOf('departments'),
    countOf('programs'),
    countOf('subjects'),
    countOf('grade_computations'),
    fetchTermSections(term)
  ]);

  const programRows = await fetchAllPaged((from, to) =>
    supabase.from('programs').select('program_id, name, abbreviation, department_id').range(from, to)
  );

  const perCollege = new Map();
  for (const section of sections) {
    const name = section.departments?.name || 'Unassigned';
    const entry = perCollege.get(name) || { college: name, sections: 0, programs: 0 };
    entry.sections += 1;
    perCollege.set(name, entry);
  }
  const collegeRows = await fetchAllPaged((from, to) =>
    supabase.from('departments').select('department_id, name').range(from, to)
  );
  const collegeNameById = new Map(collegeRows.map((c) => [c.department_id, c.name]));
  for (const program of programRows) {
    const name = collegeNameById.get(program.department_id) || 'Unassigned';
    const entry = perCollege.get(name) || { college: name, sections: 0, programs: 0 };
    entry.programs += 1;
    perCollege.set(name, entry);
  }

  return {
    totals: { colleges, programs, subjects, templates, sections: sections.length },
    perCollege: [...perCollege.values()].sort((a, b) => b.sections - a.sections),
    sections,
    programRows,
    collegeRows
  };
}

// Enrollment distribution per college, plus the Regular/Irregular split.
//
// "Irregular" is derived exactly as getEnrollmentType() in classRoomService.js
// does it -- by comparing the student's home section to the enrolled section --
// rather than by a stored flag, because irregularity is class-contextual: the
// same student is regular in their block subjects and irregular in an off-block
// one. Reusing that definition keeps this number consistent with the
// EnrollmentTypeBadge a faculty member sees on a roster.
export async function fetchEnrollmentDistribution(term) {
  const sections = await fetchTermSections(term);
  if (!sections.length) {
    return { total: 0, regular: 0, irregular: 0, perCollege: [], topSections: [] };
  }

  const sectionIds = sections.map((s) => s.section_id);
  const sectionById = new Map(sections.map((s) => [s.section_id, s]));

  const enrollments = await fetchAllPaged((from, to) =>
    supabase
      .from('enrollments')
      .select('student_id, section_id, users:student_id(section_id)')
      .in('section_id', sectionIds)
      .range(from, to)
  );

  const perCollege = new Map();
  const perSection = new Map();
  let regular = 0;
  let irregular = 0;

  for (const row of enrollments) {
    const section = sectionById.get(row.section_id);
    const college = section?.departments?.name || 'Unassigned';
    const homeSectionId = row.users?.section_id ?? null;
    const isIrregular = homeSectionId !== row.section_id;
    if (isIrregular) irregular += 1;
    else regular += 1;

    const collegeEntry =
      perCollege.get(college) || { college, enrollments: 0, regular: 0, irregular: 0 };
    collegeEntry.enrollments += 1;
    if (isIrregular) collegeEntry.irregular += 1;
    else collegeEntry.regular += 1;
    perCollege.set(college, collegeEntry);

    const sectionLabel = section?.name || 'Unknown';
    const sectionEntry =
      perSection.get(row.section_id) || { section: sectionLabel, college, enrollments: 0 };
    sectionEntry.enrollments += 1;
    perSection.set(row.section_id, sectionEntry);
  }

  return {
    total: enrollments.length,
    regular,
    irregular,
    perCollege: [...perCollege.values()].sort((a, b) => b.enrollments - a.enrollments),
    topSections: [...perSection.values()].sort((a, b) => b.enrollments - a.enrollments).slice(0, 8),
    enrolledSectionIds: new Set(perSection.keys())
  };
}

// Actionable records-quality signals. Each one is work the Registrar is
// responsible for clearing, not a vanity statistic -- which is why every entry
// carries the route that fixes it.
// Note on what is deliberately ABSENT: students with no home section are not
// counted here. At DYCI an irregular student legitimately has no block section,
// so a null section_id is a normal student category rather than a missing
// record. Listing it as integrity work would send the registrar chasing a
// backlog that should not be cleared. The count still appears on Enrollment
// Management, as information and a filter rather than a defect.
export async function fetchRecordsIntegrity(term, enrolledSectionIds) {
  const [sectionsNoTerm, subjectsNoTemplate] = await Promise.all([
    countOf('sections', (q) => q.is('term_id', null)),
    countOf('subjects', (q) => q.is('computation_id', null))
  ]);

  let emptySections = 0;
  if (enrolledSectionIds) {
    const sections = await fetchTermSections(term);
    emptySections = sections.filter((s) => !enrolledSectionIds.has(s.section_id)).length;
  }

  return [
    // Written for the registrar who reads them, not for the developer who
    // wrote the query. "Bound to a term", "term_id" and "freeze a grading
    // formula snapshot" describe how the system stores things; the reader needs
    // to know whether it is their problem and what to do.
    //
    // Two of the three are usually NOT problems -- they are states a term
    // passes through on its way to being ready -- so each says when it clears
    // on its own. A count presented as a defect sends someone hunting for a
    // fault that is not there, which is what happened with the Summer sections
    // pre-created for the next rollover.
    {
      id: 'sections_no_term',
      label: 'Sections waiting for their term to start',
      count: sectionsNoTerm,
      hint: 'Usually sections you created ahead of time for a term that has not begun. They attach themselves when that term starts — nothing to do.',
      to: '/registrar/sectionlist'
    },
    {
      id: 'subjects_no_template',
      label: 'Subjects with no grading formula',
      count: subjectsNoTemplate,
      hint: 'Grades cannot be computed for a class using one of these. Give each a grading template before its classes begin.',
      to: '/registrar/subjectlist'
    },
    {
      id: 'empty_sections',
      label: 'Sections with nobody enrolled yet',
      count: emptySections,
      hint: 'Students may already be assigned to the section but not yet enrolled in any subject. This clears as faculty loading fills in their classes.',
      to: '/registrar/sectionmasterlist'
    }
  ];
}

// Term readiness, via the existing get_term_sg_status RPC. That function is
// gated to Registrar (and the owning Dean) by
// 20261029040940_registrar_role_authorization.sql.
export async function fetchTermReadiness(term) {
  if (!term) return { perCollege: [], classes: [] };
  const { data, error } = await supabase.rpc('get_term_sg_status', {
    p_school_year: term.school_year,
    p_semester: term.semester
  });
  if (error) throw error;

  const classes = data || [];
  const collegeRows = await fetchAllPaged((from, to) =>
    supabase.from('departments').select('department_id, name').range(from, to)
  );
  const collegeNameById = new Map(collegeRows.map((c) => [c.department_id, c.name]));

  const perCollege = new Map();
  for (const row of classes) {
    const college = collegeNameById.get(row.department_id) || 'Unassigned';
    const entry =
      perCollege.get(college) || { college, classes: 0, posted: 0, overdue: 0, enrolled: 0 };
    entry.classes += 1;
    entry.enrolled += row.enrolled_count || 0;
    if ((row.sg_posted_count || 0) > 0) entry.posted += 1;
    if ((row.sg_overdue_count || 0) > 0) entry.overdue += 1;
    perCollege.set(college, entry);
  }

  return {
    classes,
    perCollege: [...perCollege.values()]
      .map((entry) => ({
        ...entry,
        completion: entry.classes ? Math.round((entry.posted / entry.classes) * 100) : 0
      }))
      .sort((a, b) => a.completion - b.completion)
  };
}

export async function fetchRegistrarDashboard() {
  const term = await fetchActiveTerm();
  const [structure, enrollment, readiness] = await Promise.all([
    fetchStructureCounts(term),
    fetchEnrollmentDistribution(term),
    fetchTermReadiness(term)
  ]);
  const integrity = await fetchRecordsIntegrity(term, enrollment.enrolledSectionIds);
  return { term, structure, enrollment, integrity, readiness };
}

// ── Reports ──────────────────────────────────────────────────────────────────
// Records-oriented, deliberately distinct from Dean/faculty performance
// reporting. The faculty-load export is intentionally absent: that belongs to
// the Faculty Loading & Provisioning page, and duplicating it here would create
// two sources of truth for the same figure.

export async function fetchEnrollmentReport(term) {
  const sections = await fetchTermSections(term);
  if (!sections.length) return [];
  const sectionById = new Map(sections.map((s) => [s.section_id, s]));

  const rows = await fetchAllPaged((from, to) =>
    supabase
      .from('enrollments')
      .select(
        'student_id, section_id, subjects:subject_id(code, name, units), users:student_id(first_name, last_name, user_number, section_id)'
      )
      .in('section_id', sections.map((s) => s.section_id))
      .range(from, to)
  );

  return rows
    .map((row) => {
      const section = sectionById.get(row.section_id);
      const home = row.users?.section_id ?? null;
      return {
        College: section?.departments?.name || 'Unassigned',
        Section: section?.name || 'Unknown',
        'Student No.': row.users?.user_number || '',
        Student: `${row.users?.last_name || ''}, ${row.users?.first_name || ''}`.trim(),
        'Subject Code': row.subjects?.code || '',
        Subject: row.subjects?.name || '',
        Units: row.subjects?.units ?? '',
        'Enrollment Type': home === row.section_id ? 'Regular' : 'Irregular'
      };
    })
    .sort(
      (a, b) =>
        a.College.localeCompare(b.College) ||
        a.Section.localeCompare(b.Section) ||
        a.Student.localeCompare(b.Student)
    );
}

export async function fetchSectionRosterReport(term) {
  const sections = await fetchTermSections(term);
  if (!sections.length) return [];
  const students = await fetchAllPaged((from, to) =>
    supabase
      .from('users')
      .select('user_id, first_name, last_name, user_number, section_id, status')
      .eq('role', 'student')
      .in('section_id', sections.map((s) => s.section_id))
      .range(from, to)
  );
  const sectionById = new Map(sections.map((s) => [s.section_id, s]));

  return students
    .map((student) => {
      const section = sectionById.get(student.section_id);
      return {
        College: section?.departments?.name || 'Unassigned',
        Section: section?.name || 'Unknown',
        'Student No.': student.user_number || '',
        Student: `${student.last_name || ''}, ${student.first_name || ''}`.trim(),
        Status: student.status || ''
      };
    })
    .sort(
      (a, b) =>
        a.College.localeCompare(b.College) ||
        a.Section.localeCompare(b.Section) ||
        a.Student.localeCompare(b.Student)
    );
}

export async function fetchAcademicStructureReport(term) {
  const [structure, subjects] = await Promise.all([
    fetchStructureCounts(term),
    fetchAllPaged((from, to) =>
      supabase
        .from('subjects')
        .select('code, name, units, computation_id, departments:department_id(name), grade_computations:computation_id(name)')
        .range(from, to)
    )
  ]);

  const programsByCollege = new Map();
  const collegeNameById = new Map(structure.collegeRows.map((c) => [c.department_id, c.name]));
  for (const program of structure.programRows) {
    const college = collegeNameById.get(program.department_id) || 'Unassigned';
    const list = programsByCollege.get(college) || [];
    list.push(program.abbreviation || program.name);
    programsByCollege.set(college, list);
  }

  return subjects
    .map((subject) => ({
      College: subject.departments?.name || 'Unassigned',
      'Programs in College': (programsByCollege.get(subject.departments?.name) || []).join(', '),
      'Subject Code': subject.code || '',
      Subject: subject.name || '',
      Units: subject.units ?? '',
      'Grading Template': subject.grade_computations?.name || 'NOT ASSIGNED'
    }))
    .sort((a, b) => a.College.localeCompare(b.College) || a['Subject Code'].localeCompare(b['Subject Code']));
}

// Grade Override is a Registrar-owned records action, so its log belongs here.
// Sourced from grade_correction_history, which records the applied result of
// both the Dean-approved correction path and the direct override path (the
// override RPC opens and self-approves a request row, so it lands here too).
export async function fetchGradeOverrideLogReport() {
  const { data, error } = await supabase
    .from('grade_correction_history')
    .select(
      `history_id, applied_at,
       previous_computed_grade, previous_effective_grade, previous_remark,
       final_computed_grade, final_effective_grade, final_remark,
       student:student_id(first_name, last_name, user_number),
       applier:applied_by(first_name, last_name),
       class_records:class_record_id(
         subjects:subject_id(code, name),
         sections:section_id(name)
       )`
    )
    .order('applied_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  return (data || []).map((row) => ({
    'Applied At': row.applied_at ? new Date(row.applied_at).toLocaleString('en-PH') : '',
    'Student No.': row.student?.user_number || '',
    Student: `${row.student?.last_name || ''}, ${row.student?.first_name || ''}`.trim(),
    Subject: row.class_records?.subjects?.code || '',
    Section: row.class_records?.sections?.name || '',
    'Previous %': row.previous_computed_grade ?? '',
    'Previous GWA': row.previous_effective_grade ?? '',
    'Previous Remark': row.previous_remark || '',
    'Final %': row.final_computed_grade ?? '',
    'Final GWA': row.final_effective_grade ?? '',
    'Final Remark': row.final_remark || '',
    'Applied By': `${row.applier?.last_name || ''}, ${row.applier?.first_name || ''}`.trim()
  }));
}

export function exportRegistrarReportToExcel({ rows = [], sheetName = 'Report', fileLabel = 'Report' }) {
  if (!rows.length) return false;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(
    workbook,
    `ASPIRE_${fileLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
  return true;
}
