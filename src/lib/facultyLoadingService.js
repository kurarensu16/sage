import { supabase } from './supabase';
import { provisionClassroomByAdmin, getEnrollmentType } from './classRoomService';
import { getProgramAbbrFromSectionName } from './constants';
import { toUserMessage } from './errorMessages';
import * as XLSX from 'xlsx';

// Data layer for the Faculty Loading & Provisioning page, shared by the
// Registrar (all colleges) and Dean (own college) pages so neither forks.
//
// Provisioning itself is NOT reimplemented here. Finalize calls
// provisionClassroomByAdmin() verbatim: it validates the slot, freezes the
// grading formula snapshot including Phase 3's passing and FDA thresholds,
// auto-enrols the block section and issues the join code. A second path would
// drift from that snapshot logic, which is the one thing in this system that
// must not diverge.

const PAGE_SIZE = 1000;

async function fetchAllPaged(build) {
  const out = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
  }
}

// A section's program and year level live only in its name -- there is no
// program_id or year_level column on sections. SectionForm builds the name as
// "<PROGRAM ABBREVIATION>-<year digit><suffix>", so the cascade reads it back
// the same way. Anything that does not parse is surfaced rather than hidden,
// because a section the picker silently drops is a class nobody can open.
export function parseSectionName(name) {
  const raw = String(name || '').trim();
  const programAbbr = getProgramAbbrFromSectionName(raw);
  const afterHyphen = raw.slice(raw.lastIndexOf('-') + 1);
  const yearDigit = (afterHyphen.match(/^(\d)/) || [])[1] || '';
  return { programAbbr, yearDigit, parsed: !!(programAbbr && yearDigit) };
}

export const YEAR_LEVEL_BY_DIGIT = Object.freeze({
  1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year'
});

export async function fetchActiveTerm() {
  const { data, error } = await supabase
    .from('academic_terms')
    .select('term_id, school_year, semester, is_active')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function fetchColleges() {
  const { data, error } = await supabase
    .from('departments')
    .select('department_id, name')
    .order('name');
  if (error) throw error;
  return data || [];
}

// Everything the picker needs for one college and term, in one round trip set.
export async function fetchLoadingCatalog(departmentId, term) {
  if (!departmentId || !term) {
    return { faculty: [], programs: [], sections: [], subjects: [] };
  }

  const [faculty, programs, subjects] = await Promise.all([
    fetchAllPaged((from, to) =>
      supabase
        .from('users')
        .select('user_id, first_name, last_name, user_number')
        .eq('role', 'faculty')
        .eq('status', 'active')
        .eq('department_id', departmentId)
        .order('last_name')
        .range(from, to)
    ),
    fetchAllPaged((from, to) =>
      supabase
        .from('programs')
        .select('program_id, name, abbreviation')
        .eq('department_id', departmentId)
        .order('name')
        .range(from, to)
    ),
    fetchAllPaged((from, to) =>
      supabase
        .from('subjects')
        .select('subject_id, code, name, units, computation_id')
        .eq('department_id', departmentId)
        .order('code')
        .range(from, to)
    )
  ]);

  // Sections for the active term, including legacy rows that carry the term by
  // school year and semester rather than term_id -- the same dual lookup
  // Manage Sections uses, so both pages agree on which sections exist.
  const [scoped, legacy] = await Promise.all([
    fetchAllPaged((from, to) =>
      supabase
        .from('sections')
        .select('section_id, name, department_id')
        .eq('department_id', departmentId)
        .eq('term_id', term.term_id)
        .range(from, to)
    ),
    fetchAllPaged((from, to) =>
      supabase
        .from('sections')
        .select('section_id, name, department_id')
        .eq('department_id', departmentId)
        .is('term_id', null)
        .eq('school_year', term.school_year)
        .eq('semester', term.semester)
        .range(from, to)
    )
  ]);
  const seen = new Set();
  const sections = [...scoped, ...legacy].filter((s) => {
    if (seen.has(s.section_id)) return false;
    seen.add(s.section_id);
    return true;
  });

  return { faculty, programs, sections, subjects };
}

// Current load for a college and term: live drafts plus already-provisioned
// classes. Both are needed, because a slot is taken by either one.
export async function fetchLoadState(departmentId, term) {
  if (!departmentId || !term) return { drafts: [], classes: [] };

  const [drafts, classes] = await Promise.all([
    fetchAllPaged((from, to) =>
      supabase
        .from('faculty_load_drafts')
        .select('*')
        .eq('department_id', departmentId)
        .eq('school_year', term.school_year)
        .eq('semester', term.semester)
        .neq('status', 'superseded')
        .range(from, to)
    ),
    fetchAllPaged((from, to) =>
      supabase
        .from('class_records')
        .select('class_record_id, subject_id, section_id, faculty_id, school_year, semester, meeting_days, start_time, end_time')
        .eq('school_year', term.school_year)
        .eq('semester', term.semester)
        .range(from, to)
    )
  ]);

  return { drafts, classes };
}

// A slot is claimed when either a live draft or a provisioned class holds it.
// The picker hides claimed classes; the database enforces it regardless via the
// partial unique index, since two sessions can race between render and click.
export function buildClaimedSlotKeys({ drafts = [], classes = [] }) {
  const keys = new Map();
  for (const d of drafts) {
    keys.set(`${d.subject_id}|${d.section_id}`, { by: d.faculty_id, source: 'draft' });
  }
  for (const c of classes) {
    keys.set(`${c.subject_id}|${c.section_id}`, { by: c.faculty_id, source: 'class' });
  }
  return keys;
}

// Per-faculty totals across drafts AND live classes, so the reviewer sees the
// complete picture before finalizing. Units are informational: no cap exists in
// the schema, and the developer confirmed none should be invented.
// Teaching hours. Nothing downstream reads the hour, so an out-of-range time
// never corrupted a computation -- it simply let a typo pass as a real class on
// the one field schedule-conflict detection depends on. Mirrored by a CHECK
// constraint and an RPC guard in 20261031161500.
export const TEACHING_DAY_START = '07:00';
export const TEACHING_DAY_END = '20:00';

// Class times land on the quarter hour. The picker cannot express anything else,
// but the picker is not the only way in: a stale tab, or a future importer,
// reaches addDraft directly.
const QUARTER_HOUR = /^\d{2}:(00|15|30|45)$/;
const onQuarterHour = (t) => QUARTER_HOUR.test(String(t).slice(0, 5));

// Week order for reporting the days a faculty member is in school. Matches the
// day set the schedule picker writes, plus Sun for completeness.
const WEEK_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function buildLoadSummary({ faculty = [], drafts = [], classes = [], subjects = [], sections = [] }) {
  const subjectById = new Map(subjects.map((s) => [s.subject_id, s]));
  const sectionById = new Map(sections.map((s) => [s.section_id, s]));

  return faculty
    .map((member) => {
      const own = [
        ...drafts
          .filter((d) => d.faculty_id === member.user_id)
          .map((d) => ({
            id: d.id,
            subjectId: d.subject_id,
            sectionId: d.section_id,
            state: d.status === 'finalized' ? 'Open' : 'Draft',
            // A finalized draft carries the class it produced. Open chips are
            // acted on by class_record_id, drafts by their own id, so both are
            // kept rather than inferred from `state` at the call site.
            classRecordId: d.class_record_id || null,
            days: d.meeting_days || [],
            startTime: d.start_time,
            endTime: d.end_time,
            draft: d
          })),
        // A class with no draft row predates this page (or was provisioned
        // elsewhere); it still counts toward the load.
        ...classes
          .filter(
            (c) =>
              c.faculty_id === member.user_id &&
              !drafts.some((d) => d.class_record_id === c.class_record_id)
          )
          .map((c) => ({
            id: c.class_record_id,
            subjectId: c.subject_id,
            sectionId: c.section_id,
            state: 'Open',
            classRecordId: c.class_record_id,
            // class_records carries its own pattern. Reading it here is what
            // lets a class provisioned outside this page still report the days
            // its instructor is in school.
            days: c.meeting_days || [],
            startTime: c.start_time,
            endTime: c.end_time,
            draft: null
          }))
      ];

      const chips = own.map((entry) => {
        const subject = subjectById.get(entry.subjectId);
        const section = sectionById.get(entry.sectionId);
        const sched = entry.days.length && entry.startTime && entry.endTime
          ? `${entry.days.join('/')} ${String(entry.startTime).slice(0, 5)}-${String(entry.endTime).slice(0, 5)}`
          : '';
        return {
          ...entry,
          label: `${subject?.code || '—'} · ${section?.name || '—'}`,
          schedule: sched,
          units: Number(subject?.units) || 0
        };
      });

      return {
        facultyId: member.user_id,
        name: `${member.last_name || ''}, ${member.first_name || ''}`.trim(),
        userNumber: member.user_number || '',
        units: chips.reduce((sum, c) => sum + c.units, 0),
        classCount: chips.length,
        draftCount: chips.filter((c) => c.state === 'Draft').length,
        openCount: chips.filter((c) => c.state === 'Open').length,
        // Distinct days across every class, in week order rather than the order
        // the assignments happened to be made. This is the question a Dean
        // actually asks of a load: which days is this person on campus.
        days: WEEK_ORDER.filter((day) => chips.some((c) => c.days.includes(day))),
        chips
      };
    })
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
}

// ── Lock ─────────────────────────────────────────────────────────────────────
export async function acquireLock(departmentId) {
  const { data, error } = await supabase.rpc('acquire_provisioning_lock', {
    p_department_id: departmentId
  });
  if (error) throw error;
  return data;
}

export async function touchLock(departmentId) {
  const { data, error } = await supabase.rpc('touch_provisioning_lock', {
    p_department_id: departmentId
  });
  if (error) return { held: false };
  return data;
}

export async function releaseLock(departmentId) {
  // Best effort: this fires on unmount, where a failure has no useful recovery
  // and the 3-minute TTL covers it anyway.
  try {
    await supabase.rpc('release_provisioning_lock', { p_department_id: departmentId });
  } catch {
    /* lock expires on its own */
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────
export async function addDraft({
  departmentId, subjectId, sectionId, facultyId, term,
  days = null, startTime = null, endTime = null
}) {
  // The schedule is REQUIRED. It used to be optional, which meant passing nulls
  // skipped conflict detection entirely -- so the one safeguard against
  // double-booking a faculty member was switched off by leaving a field blank.
  // Checked here as well as in the RPC and the column constraints: this is the
  // layer that can say which field is missing in plain words.
  if (!days || !days.length) {
    throw new Error('Pick at least one meeting day before adding the assignment.');
  }
  if (!startTime || !endTime) {
    throw new Error('Give both a start time and an end time before adding the assignment.');
  }
  if (endTime <= startTime) {
    throw new Error('The end time has to be after the start time.');
  }
  if (startTime < TEACHING_DAY_START || endTime > TEACHING_DAY_END) {
    throw new Error('Classes can only be scheduled between 7:00 AM and 8:00 PM.');
  }
  if (!onQuarterHour(startTime) || !onQuarterHour(endTime)) {
    throw new Error('Class times run on the quarter hour: :00, :15, :30 or :45.');
  }

  const { error } = await supabase.rpc('add_faculty_load_draft', {
    p_department_id: departmentId,
    p_subject_id: subjectId,
    p_section_id: sectionId,
    p_faculty_id: facultyId,
    p_school_year: term.school_year,
    p_semester: term.semester,
    p_days: days,
    p_start: startTime,
    p_end: endTime
  });
  if (error) throw new Error(toUserMessage(error, 'Could not add that assignment.'));
}

// Provision the live class, then stamp the draft. Two steps because
// provisionClassroomByAdmin is reused untouched. If the stamp fails the class
// still exists and the draft stays open, which is recoverable by finalizing
// again -- the RPC is idempotent. The reverse order would risk a draft marked
// finalized with no class behind it.
export async function finalizeDraft(draft, { subjects = [], sections = [] } = {}) {
  const subject = subjects.find((s) => s.subject_id === draft.subject_id);
  const section = sections.find((s) => s.section_id === draft.section_id);

  const result = await provisionClassroomByAdmin({
    subjectId: draft.subject_id,
    sectionId: draft.section_id,
    facultyId: draft.faculty_id,
    schoolYear: draft.school_year,
    semester: draft.semester
  });

  // provisionClassroomByAdmin resolves to { class_record, subject, section }
  // -- the id lives on class_record, not at the top level.
  const classRecordId = result?.class_record?.class_record_id || null;

  if (!classRecordId) {
    throw new Error(
      `The class for ${subject?.code || 'this subject'} ${section?.name || ''} was not created. Nothing was finalized.`
    );
  }

  const { error } = await supabase.rpc('finalize_faculty_load_draft', {
    p_draft_id: draft.id,
    p_class_record_id: classRecordId
  });
  if (error) throw new Error(toUserMessage(error, 'The class was created but could not be marked finalized. Try finalizing again.'));

  // A class with nobody in it is a half-finished job, and it used to report
  // itself as a complete one. The class is real and worth keeping, so this is
  // returned rather than thrown -- but the caller has to be able to say it.
  return {
    classRecordId,
    enrolled: result?.enrolled ?? 0,
    enrollmentError: result?.enrollmentError || null,
    label: `${subject?.code || 'this subject'} ${section?.name || ''}`.trim()
  };
}

// Students for the add-to-class search. Scoped to active students only.
export async function searchStudents(queryText) {
  const q = String(queryText || '').trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('users')
    .select('user_id, first_name, last_name, user_number, section_id')
    .eq('role', 'student')
    .eq('status', 'active')
    .or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%,user_number.ilike.%${q}%`)
    .order('last_name')
    .limit(20);
  if (error) throw error;
  return data || [];
}

// Adds a student straight onto a roster -- no join code, no faculty approval.
// `force` is the deliberate second attempt after a timetable clash was reported:
// an irregular student is exactly the case where the registrar may know more
// than the schedule does.
export async function addStudentToClass(classRecordId, studentId, { force = false } = {}) {
  const { error } = await supabase.rpc('add_student_to_class', {
    p_class_record_id: classRecordId,
    p_student_id: studentId,
    p_force: force
  });
  if (error) throw error;
}

// The roster as it stands, with each row labelled the same way a faculty roster
// labels it.
export async function fetchClassRoster(classRecordId) {
  const { data: cls, error: clsErr } = await supabase
    .from('class_records')
    .select('class_record_id, subject_id, section_id')
    .eq('class_record_id', classRecordId)
    .maybeSingle();
  if (clsErr) throw clsErr;
  if (!cls) return [];

  const { data, error } = await supabase
    .from('enrollments')
    .select('enrollment_id, student_id, section_id, users:student_id(first_name, last_name, user_number, section_id)')
    .eq('subject_id', cls.subject_id)
    .eq('section_id', cls.section_id);
  if (error) throw error;

  return (data || []).map((row) => ({
    enrollmentId: row.enrollment_id,
    studentId: row.student_id,
    name: `${row.users?.last_name || ''}, ${row.users?.first_name || ''}`.trim(),
    userNumber: row.users?.user_number || '',
    type: getEnrollmentType(row.users?.section_id, cls.section_id)
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// Remove a draft outright. Only ever a draft: the RPC refuses once a class
// record exists behind it, because that class may already carry enrolments and
// scores, and deleting the draft would leave no record of how it came to exist.
export async function deleteDraft(draftId) {
  const { error } = await supabase.rpc('delete_faculty_load_draft', {
    p_draft_id: draftId
  });
  if (error) throw new Error(toUserMessage(error, 'Could not remove that assignment.'));
}

// Correct a draft's schedule in place. The same guards as adding, because the
// result has to satisfy the same constraints and the same conflict check.
export async function updateDraftSchedule(draftId, { days, startTime, endTime }) {
  if (!days || !days.length) throw new Error('Pick at least one meeting day.');
  if (!startTime || !endTime) throw new Error('Give both a start time and an end time.');
  if (endTime <= startTime) throw new Error('The end time has to be after the start time.');
  if (startTime < TEACHING_DAY_START || endTime > TEACHING_DAY_END) {
    throw new Error('Classes can only be scheduled between 7:00 AM and 8:00 PM.');
  }
  if (!onQuarterHour(startTime) || !onQuarterHour(endTime)) {
    throw new Error('Class times run on the quarter hour: :00, :15, :30 or :45.');
  }

  const { error } = await supabase.rpc('update_faculty_load_draft', {
    p_draft_id: draftId,
    p_days: days,
    p_start: startTime,
    p_end: endTime
  });
  if (error) {
    // 42883/PGRST202 mean the function is not in the database yet. Saying so
    // plainly beats "Could not save", which reads as a bug in the page.
    if (error.code === '42883' || error.code === 'PGRST202') {
      throw new Error('Editing a schedule needs a database update that has not been applied yet.');
    }
    throw new Error(toUserMessage(error, 'Could not save that schedule.'));
  }
}

// ── Already-provisioned classes ──────────────────────────────────────────────
// A timetable clash does not respect the draft boundary: a room moves, a
// faculty member drops a load, two colleges find they booked the same person.
// These three mirror the draft actions against a live class, through RPCs
// rather than direct writes, because the class_records update and delete
// policies are admin-only and widening them would expose every column --
// school_year, semester, and the frozen grading_formula_snapshot included.

export async function updateClassSchedule(classRecordId, { days, startTime, endTime }) {
  if (!days || !days.length) throw new Error('Pick at least one meeting day.');
  if (!startTime || !endTime) throw new Error('Give both a start time and an end time.');
  if (endTime <= startTime) throw new Error('The end time has to be after the start time.');
  if (startTime < TEACHING_DAY_START || endTime > TEACHING_DAY_END) {
    throw new Error('Classes can only be scheduled between 7:00 AM and 8:00 PM.');
  }
  if (!onQuarterHour(startTime) || !onQuarterHour(endTime)) {
    throw new Error('Class times run on the quarter hour: :00, :15, :30 or :45.');
  }

  const { error } = await supabase.rpc('update_class_schedule', {
    p_class_record_id: classRecordId,
    p_days: days,
    p_start: startTime,
    p_end: endTime
  });
  if (error) throw new Error(toUserMessage(error, 'Could not save that schedule.'));
}

export async function reassignClassFaculty(classRecordId, newFacultyId) {
  const { data, error } = await supabase.rpc('reassign_class_faculty', {
    p_class_record_id: classRecordId,
    p_new_faculty_id: newFacultyId
  });
  if (error) throw new Error(toUserMessage(error, 'Could not reassign that class.'));
  return data;
}

export async function deleteClassRecord(classRecordId) {
  const { error } = await supabase.rpc('delete_class_record', {
    p_class_record_id: classRecordId
  });
  if (error) throw new Error(toUserMessage(error, 'Could not remove that class.'));
}

export async function reassignLoad(draftId, newFacultyId) {
  const { data, error } = await supabase.rpc('reassign_faculty_load', {
    p_draft_id: draftId,
    p_new_faculty_id: newFacultyId
  });
  if (error) throw new Error(toUserMessage(error, 'Could not reassign that class.'));
  return data;
}

// ── Export ───────────────────────────────────────────────────────────────────
// Current state at click time, per the confirmed decision: superseded history is
// deliberately excluded, since this is a recordkeeping printout rather than an
// audit trail.
export function exportLoadToExcel({ collegeName, term, summary = [] }) {
  const rows = [];
  for (const member of summary) {
    if (!member.chips.length) {
      rows.push({
        Faculty: member.name,
        'ID Number': member.userNumber,
        Subject: '',
        Section: '',
        Units: '',
        Status: 'No load'
      });
      continue;
    }
    for (const chip of member.chips) {
      const [code, section] = chip.label.split(' · ');
      rows.push({
        Faculty: member.name,
        'ID Number': member.userNumber,
        Subject: code,
        Section: section,
        Units: chip.units,
        Schedule: chip.schedule || 'Not scheduled',
        Status: chip.state
      });
    }
  }

  if (!rows.length) return false;

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Faculty Load');
  const label = (collegeName || 'College').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
  XLSX.writeFile(
    wb,
    `ASPIRE_Faculty_Load_${label}_${term?.school_year || ''}_${term?.semester || ''}.xlsx`.replace(/\s+/g, '')
  );
  return true;
}
