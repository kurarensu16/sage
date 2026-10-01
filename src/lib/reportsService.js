// =============================================================================
// ASPIRE FACULTY REPORTS SERVICE
// Module: Faculty Analytics & Performance Reporting
// =============================================================================

import { supabase } from './supabase';
import { PASSING_GRADE, HIGH_CUTOFF, SAME_MARGIN } from './constants';
import { isStudentAtRisk, computeUnifiedRisk } from './riskEngine';
import * as XLSX from 'xlsx-js-style';

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

  // 0. Resolve class_record → section_id + subject_id (enrollments table links by these, not class_record_id)
  const { data: classRecord, error: crError } = await supabase
    .from('class_records')
    .select('class_record_id, section_id, subject_id')
    .eq('class_record_id', classRecordId)
    .maybeSingle();

  if (crError) {
    console.error('Error fetching class record:', crError);
    throw crError;
  }
  if (!classRecord) {
    console.warn('Class record not found:', classRecordId);
    return { enrollments: [], activities: [], rows: [] };
  }

  // 1. Fetch only active enrollments with profile details
  //    Table is 'enrollments' (not 'class_enrollments'), status column is 'status' (not 'approval_status')
  const { data: enrollments, error: enrollError } = await supabase
    .from('enrollments')
    .select(`
      enrollment_id,
      student_id,
      status,
      users:student_id (
        user_id,
        first_name,
        last_name,
        email,
        user_number
      )
    `)
    .eq('section_id', classRecord.section_id)
    .eq('subject_id', classRecord.subject_id)
    .eq('status', 'active');

  if (enrollError) {
    console.error('Error fetching enrollments:', enrollError);
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

  // 3. Fetch activity scores — student_activity_scores has no class_record_id;
  //    query by activity_id list instead (matching ScoreInput.jsx pattern)
  const activityIds = (activities || []).map(a => a.activity_id);
  let scores = [];
  if (activityIds.length > 0) {
    const { data: scoreData, error: scoreError } = await supabase
      .from('student_activity_scores')
      .select('score_id, activity_id, student_id, score')
      .in('activity_id', activityIds);

    if (scoreError) {
      console.error('Error fetching activity scores:', scoreError);
      throw scoreError;
    }
    scores = scoreData || [];
  }

  // Build lookup index: `${activity_id}:${student_id}`
  const scoreMap = new Map();
  scores.forEach(row => {
    scoreMap.set(`${row.activity_id}:${row.student_id}`, row);
  });

  // Construct flat dataset rows
  const rows = [];
  (enrollments || []).forEach(enr => {
    const student = enr.users;
    const studentName = `${student?.first_name || ''} ${student?.last_name || ''}`.trim() || student?.email || 'Student';
    const studentNumber = student?.user_number || '—';

    (activities || []).forEach(act => {
      const scoreRecord = scoreMap.get(`${act.activity_id}:${enr.student_id}`);
      const rawScore = scoreRecord?.score;
      const hasScore = rawScore !== null && rawScore !== undefined;
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
        isExempt: false,
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

/**
 * Export class performance and student activity score sheet to Excel workbook (.xlsx).
 *
 * @param {object} params
 * @param {object} params.selectedClass
 * @param {Array} params.students
 * @param {Array} params.activities
 */
export function exportClassPerformanceToExcel({ selectedClass, students = [], activities = [] }) {
  if (!students || students.length === 0) return;

  const dataToExport = students.map(s => {
    const row = {
      'Student Name': s.studentName,
      'Student ID': s.studentNumber,
      'Activities Graded': `${s.gradedCount} / ${s.activitiesCount}`,
      'Overall Average': s.overallPercentage !== null ? `${s.overallPercentage}%` : '—',
      'Performance Status': s.overallStatus || 'Ungraded',
      'At-Risk Standing': s.isAtRisk ? 'At-Risk' : 'On Track'
    };

    (activities || []).forEach(act => {
      const scoreObj = s.scores?.[act.activity_id];
      const hasScore = scoreObj?.score !== null && scoreObj?.score !== undefined;
      row[act.title] = hasScore
        ? `${scoreObj.score} / ${act.max_score || 100} (${scoreObj.percentage}%)`
        : '—';
    });

    return row;
  });

  const ws = XLSX.utils.json_to_sheet(dataToExport);
  const wb = XLSX.utils.book_new();
  const safeSheetName = (selectedClass?.subjects?.code || 'Performance').replace(/[\\/?*[\]]/g, '').slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName || 'Class Performance');

  const filePrefix = selectedClass?.subjects?.code ? selectedClass.subjects.code.replace(/\s+/g, '_') : 'Class';
  const filename = `${filePrefix}_Performance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Fetch distinct courses taught by a faculty member grouped by subject code.
 * Used for multi-term Performance Comparison.
 *
 * @param {string} facultyId
 * @returns {Promise<Array<{ courseCode: string, courseName: string, classes: Array }>>}
 */
export async function fetchFacultyCourseHistory(facultyId) {
  if (!facultyId) return [];

  const { data, error } = await supabase
    .from('class_records')
    .select(`
      class_record_id,
      section_id,
      subject_id,
      semester,
      school_year,
      subjects:subject_id (code, name),
      sections:section_id (name)
    `)
    .eq('faculty_id', facultyId)
    .order('school_year', { ascending: false });

  if (error) {
    console.error('Error fetching faculty course history:', error);
    throw error;
  }

  // Group by subject code
  const courseMap = new Map();
  (data || []).forEach(cr => {
    const code = cr.subjects?.code || 'UNKNOWN';
    const name = cr.subjects?.name || 'Untitled Course';

    if (!courseMap.has(code)) {
      courseMap.set(code, {
        courseCode: code,
        courseName: name,
        classes: []
      });
    }

    courseMap.get(code).classes.push(cr);
  });

  return Array.from(courseMap.values());
}

/**
 * Fetch performance metrics for a specific class record cohort.
 *
 * @param {string} classRecordId
 * @returns {Promise<{ classSize: number, passingRate: number, atRiskRate: number, averageGrade: number, gradedCount: number, students: Array }>}
 */
export async function fetchTermCohortMetrics(classRecordId) {
  if (!classRecordId) {
    return { classSize: 0, passingRate: 0, atRiskRate: 0, averageGrade: 0, gradedCount: 0, students: [] };
  }

  const { rows } = await fetchClassReportDataset(classRecordId);
  const students = aggregateByStudent(rows);
  const classSize = students.length;

  const gradedStudents = students.filter(s => s.overallPercentage !== null);
  const gradedCount = gradedStudents.length;

  const passingCount = gradedStudents.filter(s => s.overallPercentage >= PASSING_GRADE).length;
  const passingRate = gradedCount > 0 ? Math.round((passingCount / gradedCount) * 100) : 0;

  const atRiskCount = students.filter(s => s.isAtRisk).length;
  const atRiskRate = classSize > 0 ? Math.round((atRiskCount / classSize) * 100) : 0;

  const totalGradeSum = gradedStudents.reduce((acc, s) => acc + s.overallPercentage, 0);
  const averageGrade = gradedCount > 0 ? Math.round(totalGradeSum / gradedCount) : 0;

  return {
    classSize,
    passingRate,
    atRiskRate,
    averageGrade,
    gradedCount,
    students
  };
}

/**
 * Compare two cohort metrics (Current Term vs Previous Term) using institutional ±SAME_MARGIN tolerance.
 *
 * @param {object} current - Metrics from current class record
 * @param {object} previous - Metrics from comparison class record
 * @param {number} [margin=SAME_MARGIN]
 * @returns {object}
 */
export function compareCohortMetrics(current, previous, margin = SAME_MARGIN) {
  if (!current || !previous) {
    return null;
  }

  // 1. Passing Rate (Higher is better)
  const passDiff = current.passingRate - previous.passingRate;
  const passTrend = passDiff > margin ? 'better' : passDiff < -margin ? 'worse' : 'about the same';

  // 2. At-Risk Rate (Lower is better!)
  const riskDiff = current.atRiskRate - previous.atRiskRate;
  const riskTrend = riskDiff < -margin ? 'better' : riskDiff > margin ? 'worse' : 'about the same';

  // 3. Average Grade (Higher is better)
  const avgDiff = current.averageGrade - previous.averageGrade;
  const avgTrend = avgDiff > margin ? 'better' : avgDiff < -margin ? 'worse' : 'about the same';

  // 4. Class size delta
  const sizeDiff = current.classSize - previous.classSize;

  // 5. Generate plain-language summary
  let summary;
  if (passDiff > margin) {
    summary = `Passing rate improved by ${passDiff}% compared to the reference term.`;
  } else if (passDiff < -margin) {
    summary = `Passing rate decreased by ${Math.abs(passDiff)}% compared to the reference term.`;
  } else if (riskDiff < -margin) {
    summary = `At-risk rate decreased by ${Math.abs(riskDiff)}% indicating improved academic retention.`;
  } else if (riskDiff > margin) {
    summary = `At-risk rate increased by ${riskDiff}%, suggesting higher student difficulty with current coursework.`;
  } else {
    summary = `Cohort performance is stable and about the same as the reference term (within ±${margin}% margin).`;
  }

  return {
    passingRate: { current: current.passingRate, previous: previous.passingRate, diff: passDiff, trend: passTrend },
    atRiskRate:  { current: current.atRiskRate,  previous: previous.atRiskRate,  diff: riskDiff, trend: riskTrend },
    averageGrade:{ current: current.averageGrade,previous: previous.averageGrade,diff: avgDiff, trend: avgTrend },
    classSize:   { current: current.classSize,   previous: previous.classSize,   diff: sizeDiff },
    summary
  };
}
