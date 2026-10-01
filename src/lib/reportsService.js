// =============================================================================
// ASPIRE FACULTY REPORTS SERVICE
// Module: Faculty Analytics & Performance Reporting
// =============================================================================

import { supabase } from './supabase';
import { PASSING_GRADE, HIGH_CUTOFF } from './constants';
import { isStudentAtRisk, computeUnifiedRisk } from './riskEngine';

/**
 * Determine a student's performance category based on institutional cutoffs.
 * Null/unrecorded scores evaluate to null (ungraded) to avoid false-struggling flags.
 *
 * @param {number|null} percentage
 * @returns {'Performed well'|'Average'|'Struggling'|null}
 */
export function getStudentStatus(percentage) {
  if (percentage === null || percentage === undefined || Number.isNaN(Number(percentage))) {
    return null;
  }
  const val = Number(percentage);
  if (val >= HIGH_CUTOFF) return 'Performed well';
  if (val >= PASSING_GRADE) return 'Average';
  return 'Struggling';
}

/**
 * Fetch raw student x activity performance dataset for a class record.
 * Strictly filters to approved student enrollments.
 *
 * @param {string} classRecordId
 * @returns {Promise<{ enrollments: Array, activities: Array, rows: Array }>}
 */
export async function fetchClassReportDataset(classRecordId) {
  if (!classRecordId) {
    return { enrollments: [], activities: [], rows: [] };
  }

  // 1. Fetch only approved enrollments with profile details
  const { data: enrollments, error: enrollError } = await supabase
    .from('class_enrollments')
    .select(`
      enrollment_id,
      student_id,
      approval_status,
      users:student_id (
        user_id,
        email,
        raw_user_meta_data
      )
    `)
    .eq('class_record_id', classRecordId)
    .eq('approval_status', 'approved');

  if (enrollError) {
    console.error('Error fetching class enrollments:', enrollError);
    throw enrollError;
  }

  // 2. Fetch class activities
  const { data: activities, error: actError } = await supabase
    .from('class_activities')
    .select('activity_id, title, term, component_id, max_score, created_at')
    .eq('class_record_id', classRecordId)
    .order('created_at', { ascending: true });

  if (actError) {
    console.error('Error fetching class activities:', actError);
    throw actError;
  }

  // 3. Fetch activity scores
  const { data: scores, error: scoreError } = await supabase
    .from('student_activity_scores')
    .select('score_id, activity_id, student_id, score, is_exempt')
    .eq('class_record_id', classRecordId);

  if (scoreError) {
    console.error('Error fetching activity scores:', scoreError);
    throw scoreError;
  }

  // Build lookup index: `${activity_id}:${student_id}`
  const scoreMap = new Map();
  (scores || []).forEach(row => {
    scoreMap.set(`${row.activity_id}:${row.student_id}`, row);
  });

  // Construct flat dataset rows
  const rows = [];
  (enrollments || []).forEach(enr => {
    const student = enr.users;
    const meta = student?.raw_user_meta_data || {};
    const studentName = meta.full_name || `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || student?.email || 'Student';
    const studentNumber = meta.student_number || meta.user_number || '—';

    (activities || []).forEach(act => {
      const scoreRecord = scoreMap.get(`${act.activity_id}:${enr.student_id}`);
      const rawScore = scoreRecord?.score;
      const hasScore = rawScore !== null && rawScore !== undefined && !scoreRecord?.is_exempt;
      const score = hasScore ? Number(rawScore) : null;
      const maxScore = Number(act.max_score || 100);
      const percentage = (hasScore && maxScore > 0)
        ? Math.min(100, Math.max(0, Math.round((score / maxScore) * 100)))
        : null;

      rows.push({
        classRecordId,
        studentId: enr.student_id,
        studentName,
        studentNumber,
        activityId: act.activity_id,
        activityTitle: act.title,
        activityTerm: act.term,
        score,
        maxScore,
        percentage,
        status: getStudentStatus(percentage),
        isExempt: !!scoreRecord?.is_exempt,
        isGraded: hasScore
      });
    });
  });

  return { enrollments: enrollments || [], activities: activities || [], rows };
}

/**
 * Aggregate rows by student to derive overall course rating, performance category, and at-risk standing.
 * Excludes ungraded (null) activities from the average.
 *
 * @param {Array} rows
 * @returns {Array}
 */
export function aggregateByStudent(rows = []) {
  const studentMap = new Map();

  rows.forEach(row => {
    if (!studentMap.has(row.studentId)) {
      studentMap.set(row.studentId, {
        studentId: row.studentId,
        studentName: row.studentName,
        studentNumber: row.studentNumber,
        activitiesCount: 0,
        gradedCount: 0,
        totalPercentage: 0,
        scores: {}
      });
    }

    const stud = studentMap.get(row.studentId);
    stud.activitiesCount += 1;
    stud.scores[row.activityId] = {
      score: row.score,
      maxScore: row.maxScore,
      percentage: row.percentage,
      status: row.status
    };

    if (row.percentage !== null) {
      stud.gradedCount += 1;
      stud.totalPercentage += row.percentage;
    }
  });

  return Array.from(studentMap.values()).map(stud => {
    const overallPercentage = stud.gradedCount > 0
      ? Math.round(stud.totalPercentage / stud.gradedCount)
      : null;

    // Unified risk integration using single source of truth
    const riskResult = computeUnifiedRisk({
      gwa: overallPercentage !== null ? (overallPercentage < PASSING_GRADE ? 3.5 : 2.0) : null
    });
    const riskLevel = riskResult?.riskLevel || 'low';
    const isAtRisk = isStudentAtRisk(riskLevel);

    return {
      ...stud,
      overallPercentage,
      overallStatus: getStudentStatus(overallPercentage),
      riskLevel,
      isAtRisk
    };
  });
}

/**
 * Build aggregated summary metric counts for top summary cards.
 *
 * @param {Array} students - aggregated student list from aggregateByStudent
 * @returns {{ total: number, atRisk: number, atRiskPct: number, wellCount: number, avgCount: number, strCount: number }}
 */
export function buildSummaryCards(students = []) {
  const total = students.length;
  const atRisk = students.filter(s => s.isAtRisk).length;
  const atRiskPct = total > 0 ? Math.round((atRisk / total) * 100) : 0;
  const wellCount = students.filter(s => s.overallStatus === 'Performed well').length;
  const avgCount = students.filter(s => s.overallStatus === 'Average').length;
  const strCount = students.filter(s => s.overallStatus === 'Struggling').length;

  return {
    total,
    atRisk,
    atRiskPct,
    wellCount,
    avgCount,
    strCount
  };
}

/**
 * Breakdown activity performance distribution.
 *
 * @param {Array} rows
 * @returns {Array}
 */
export function buildActivityBreakdown(rows = []) {
  const activityMap = new Map();

  rows.forEach(row => {
    if (!activityMap.has(row.activityId)) {
      activityMap.set(row.activityId, {
        activityId: row.activityId,
        title: row.activityTitle,
        term: row.activityTerm,
        maxScore: row.maxScore,
        wellCount: 0,
        avgCount: 0,
        strCount: 0,
        ungradedCount: 0,
        totalGraded: 0,
        sumPercentage: 0
      });
    }

    const item = activityMap.get(row.activityId);
    if (row.status === 'Performed well') item.wellCount += 1;
    else if (row.status === 'Average') item.avgCount += 1;
    else if (row.status === 'Struggling') item.strCount += 1;
    else item.ungradedCount += 1;

    if (row.percentage !== null) {
      item.totalGraded += 1;
      item.sumPercentage += row.percentage;
    }
  });

  return Array.from(activityMap.values()).map(item => ({
    ...item,
    activityAverage: item.totalGraded > 0
      ? Math.round(item.sumPercentage / item.totalGraded)
      : null
  }));
}
