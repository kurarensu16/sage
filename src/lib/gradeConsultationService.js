import { supabase } from './supabase';

// Grade consultation windows: the period between posting a progress milestone
// and declaring it final. The data access lives here; the pure state logic
// lives in milestoneState.js so the verify scripts can assert it outside a
// browser. Re-exported so callers need only one import.
export {
  WINDOWED_MILESTONES,
  MILESTONE_LABEL,
  hasConsultationWindow,
  resolveMilestoneState
} from './milestoneState';

import { MILESTONE_LABEL } from './milestoneState';

export async function fetchWindowsForClass(classRecordId) {
  const { data, error } = await supabase
    .from('grade_consultation_windows')
    .select('*')
    .eq('class_record_id', classRecordId);
  if (error) throw error;
  return data || [];
}

// Which terms a milestone covers. Mirrors aspire_milestone_terms() in
// 20261031210000 -- the trigger and the gradebook must agree on this, or a cell
// looks editable and is refused on save.
export const MILESTONE_TERMS = Object.freeze({
  midterm_rating: ['Prelim', 'Midterm'],
  tentative_final_rating: ['Semi-Final', 'Final']
});

/**
 * The terms frozen for a class: those behind a finalized milestone.
 *
 * Finalizing is not merely a record that a consultation ended -- it closes the
 * scores behind that milestone. Afterwards the only way to change them is an
 * approved grade change request, which is the whole reason the two differ from
 * a semestral dispute.
 */
export function frozenTermsFromWindows(windows = []) {
  const frozen = new Set();
  (windows || []).forEach((w) => {
    if (!w?.finalized_at) return;
    (MILESTONE_TERMS[w.grade_period] || []).forEach((term) => frozen.add(term));
  });
  return frozen;
}

export const isMilestoneFinalized = (windows = [], gradePeriod) =>
  (windows || []).some((w) => w?.grade_period === gradePeriod && !!w.finalized_at);

export async function fetchWindowsForClasses(classRecordIds = []) {
  if (!classRecordIds.length) return [];
  const { data, error } = await supabase
    .from('grade_consultation_windows')
    .select('*')
    .in('class_record_id', classRecordIds);
  if (error) throw error;
  return data || [];
}

export async function fetchNotesForWindow(windowId) {
  const { data, error } = await supabase
    .from('grade_consultation_notes')
    .select('id, student_id, note, created_at, users:student_id(first_name, last_name, user_number)')
    .eq('window_id', windowId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    studentId: row.student_id,
    note: row.note,
    createdAt: row.created_at,
    studentName: `${row.users?.last_name || ''}, ${row.users?.first_name || ''}`.trim(),
    userNumber: row.users?.user_number || ''
  }));
}

export async function logConsultation(windowId, studentId, note) {
  const { error } = await supabase.rpc('log_grade_consultation', {
    p_window_id: windowId,
    p_student_id: studentId,
    p_note: note
  });
  if (error) throw error;
}

export async function finalizeMilestone(windowId) {
  const { data, error } = await supabase.rpc('finalize_grade_milestone', {
    p_window_id: windowId
  });
  if (error) throw error;
  return data;
}

// A student's own consultation history, grouped per term so older semesters
// archive the same way the rest of the system archives them.
export async function fetchStudentConsultationHistory(studentId) {
  const { data, error } = await supabase
    .from('grade_consultation_notes')
    .select(`
      id, note, created_at,
      grade_consultation_windows:window_id (
        grade_period, opened_at, finalized_at,
        class_records:class_record_id (
          class_record_id, school_year, semester,
          subjects:subject_id ( code, name ),
          sections:section_id ( name ),
          users:faculty_id ( first_name, last_name )
        )
      )
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((row) => {
    const win = row.grade_consultation_windows;
    const cls = win?.class_records;
    return {
      id: row.id,
      note: row.note,
      createdAt: row.created_at,
      gradePeriod: win?.grade_period,
      milestoneLabel: MILESTONE_LABEL[win?.grade_period] || 'Grade',
      finalizedAt: win?.finalized_at || null,
      schoolYear: cls?.school_year || '',
      semester: cls?.semester || '',
      subjectCode: cls?.subjects?.code || '',
      subjectName: cls?.subjects?.name || '',
      sectionName: cls?.sections?.name || '',
      facultyName: `${cls?.users?.last_name || ''}, ${cls?.users?.first_name || ''}`.trim()
    };
  });
}
