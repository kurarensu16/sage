import { supabase } from './supabase';

// Term rollover with a grace period for unposted SGs (see
// supabase/migrations/20261011130000_term_rollover_grace.sql). The database decides the
// official SG label; these helpers only describe a class's state for display.

export const SG_SUBMISSION_LABELS = Object.freeze({
  on_time: 'On time',
  late: 'Late',
  late_overdue: 'Late (overdue)'
});

const DAY_MS = 24 * 60 * 60 * 1000;

export async function fetchAcademicTerms() {
  const { data, error } = await supabase
    .from('academic_terms')
    .select('term_id, school_year, semester, is_active, ended_at, sg_grace_days, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export const formatTermLabel = (term) => (term ? `${term.school_year} · ${term.semester}` : '');

const SEMESTER_ORDER = Object.freeze({ '1st': 1, '2nd': 2, Summer: 3 });

export function sortAcademicTerms(terms = []) {
  return [...terms].sort((left, right) => {
    const yearCompare = String(right.school_year || '').localeCompare(String(left.school_year || ''));
    if (yearCompare !== 0) return yearCompare;
    return (SEMESTER_ORDER[right.semester] || 0) - (SEMESTER_ORDER[left.semester] || 0);
  });
}

export function getActiveAcademicTerm(terms = []) {
  return terms.find(term => term.is_active) || null;
}

export function getArchivedAcademicTerms(terms = []) {
  return sortAcademicTerms(terms.filter(term => !term.is_active));
}

export function recordMatchesAcademicTerm(record, term) {
  if (!record || !term) return false;
  const classRecord = record.class_record || record.class_records || record;
  if (classRecord.term_id) return classRecord.term_id === term.term_id;
  const section = classRecord.sections || classRecord.section || null;
  const schoolYear = classRecord.school_year || section?.school_year;
  const semester = classRecord.semester || section?.semester;
  return schoolYear === term.school_year && semester === term.semester;
}

export function findClassTerm(terms, cls) {
  if (!cls) return null;
  return (cls.term_id && terms.find(t => t.term_id === cls.term_id))
    || terms.find(t => t.school_year === cls.school_year && t.semester === cls.semester)
    || null;
}

/**
 * 'current'  – the class's term is active (or has not ended)
 * 'pending'  – previous term, SG not yet posted, within the grace period (daysLeft)
 * 'overdue'  – previous term, SG not yet posted, grace period over
 * 'archived' – SG posted and the class is closed (view only)
 */
export function getClassTermState(terms, cls, now = new Date()) {
  const term = findClassTerm(terms, cls);
  if (cls?.status === 'archived') return { state: 'archived', term, daysLeft: null, deadline: null };
  if (!term || term.is_active || !term.ended_at) return { state: 'current', term, daysLeft: null, deadline: null };

  const deadline = new Date(new Date(term.ended_at).getTime() + (Number(term.sg_grace_days) || 0) * DAY_MS);
  if (now <= deadline) {
    return { state: 'pending', term, daysLeft: Math.max(0, Math.ceil((deadline - now) / DAY_MS)), deadline };
  }
  return { state: 'overdue', term, daysLeft: 0, deadline };
}
