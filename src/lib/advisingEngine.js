import { ATTENDANCE } from './academicPolicy.js';

export const ADVISING_THRESHOLDS = Object.freeze({
  weakActivityPercentage: 75,
  minimumRelatedResults: 2,
  attendanceWarningAbsences: ATTENDANCE.nearFdaAbsences,
  fdaAbsences: ATTENDANCE.fdaAbsences
});

const CATEGORY_PATTERNS = [
  ['quiz', /quiz|short test|seatwork/i],
  ['laboratory', /lab|laboratory|practical|exercise/i],
  ['assignment', /assignment|homework|problem set/i],
  ['project', /project|case study|presentation|capstone/i],
  ['recitation', /recitation|oral|participation/i]
];

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const inferCategory = (activity) => {
  const source = [activity.type, activity.title, activity.name].filter(Boolean).join(' ');
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(source))?.[0] || 'formative activity';
};

const getActivityGroup = (activity) => {
  const term = normalizeText(activity.term) || 'current term';
  const topic = normalizeText(activity.topic_tag || activity.topicTag);
  return topic ? `${term}:topic:${topic}` : `${term}:category:${inferCategory(activity)}`;
};

const getActivityLabel = (activity) => activity.title || activity.name || 'Saved activity';

const getActivityTopic = (activity) =>
  activity.topic_tag || activity.topicTag || activity.description || inferCategory(activity);

const getTimestamp = (activity) => {
  const value = activity.updated_at || activity.released_at || activity.created_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const action = (id, title, description) => ({ id, title, description });

const boundaryStatement = 'This guidance is advisory and does not alter your official institutional grade.';

export function evaluateAcademicAdvising({
  courses = [],
  attendance = {},
  officialGwa = null,
  hasOfficialMilestone = false,
  latestMilestone = null
} = {}) {
  const highestAttendanceCourse = (Array.isArray(attendance.byCourse) ? attendance.byCourse : [])
    .map(course => ({ ...course, absenceCount: Number(course?.absenceCount) || 0 }))
    .sort((a, b) => b.absenceCount - a.absenceCount)[0];
  const absenceCount = highestAttendanceCourse?.absenceCount ?? (Number(attendance.absenceCount) || 0);
  const attendanceCourseLabel = highestAttendanceCourse?.courseCode ? ` in ${highestAttendanceCourse.courseCode}` : '';

  if (courses.length === 0) {
    return {
      state: 'no_enrollment',
      severity: 'low',
      signalType: 'no_enrollment',
      headline: 'No active courses available',
      summary: 'ASPIRE will begin monitoring saved academic evidence after your active course enrollment is available.',
      evidence: [],
      focusTopics: [],
      actions: [],
      reviewTrigger: 'course_enrollment',
      consultationRecommended: false,
      boundaryStatement
    };
  }

  if (absenceCount >= ADVISING_THRESHOLDS.fdaAbsences) {
    return {
      state: 'action_required',
      severity: 'critical',
      signalType: 'attendance_fda_threshold',
      headline: 'Attendance requires immediate faculty review',
      summary: `${absenceCount} absences are recorded${attendanceCourseLabel}. This meets the institutional FDA advisory threshold and requires confirmation with your instructor.`,
      evidence: [{ label: 'Recorded absences', value: `${absenceCount}/${ADVISING_THRESHOLDS.fdaAbsences}${attendanceCourseLabel}` }],
      focusTopics: ['Attendance recovery'],
      actions: [
        action('contact-instructor', 'Contact your instructor', 'Confirm the attendance record and ask which recovery options remain available.'),
        action('prepare-context', 'Prepare your attendance context', 'List the dates and any supporting documentation before the consultation.')
      ],
      reviewTrigger: 'attendance_record_update',
      consultationRecommended: true,
      boundaryStatement
    };
  }

  if (absenceCount >= ADVISING_THRESHOLDS.attendanceWarningAbsences) {
    return {
      state: 'action_required',
      severity: 'high',
      signalType: 'attendance_near_fda_threshold',
      headline: 'One more absence may trigger an FDA advisory',
      summary: `${absenceCount} absences are recorded${attendanceCourseLabel}. Protect your attendance standing and clarify any disputed record before the next class meeting.`,
      evidence: [{ label: 'Recorded absences', value: `${absenceCount}/${ADVISING_THRESHOLDS.fdaAbsences}${attendanceCourseLabel}` }],
      focusTopics: ['Attendance prevention'],
      actions: [
        action('review-attendance', 'Review your attendance record', 'Check the recorded dates and raise any discrepancy with your instructor.'),
        action('attendance-plan', 'Plan the next class meetings', 'Protect the remaining attendance allowance and arrive before the scheduled start.')
      ],
      reviewTrigger: 'next_attendance_record',
      consultationRecommended: true,
      boundaryStatement
    };
  }

  if (hasOfficialMilestone && officialGwa !== null && Number(officialGwa) > 3) {
    return {
      state: 'action_required',
      severity: 'critical',
      signalType: 'official_grade_nonpassing',
      headline: 'An official milestone requires a recovery discussion',
      summary: `Your latest official cumulative GWA is ${Number(officialGwa).toFixed(2)}. Review the posted course results with the relevant instructor before the next grading milestone.`,
      evidence: [{ label: 'Official cumulative GWA', value: Number(officialGwa).toFixed(2) }],
      focusTopics: ['Official grade recovery'],
      actions: [
        action('review-official-record', 'Review the official grade breakdown', 'Identify which posted course milestone needs the earliest recovery work.'),
        action('request-consultation', 'Request a faculty consultation', 'Confirm the available remediation steps and their deadlines.')
      ],
      reviewTrigger: 'next_official_grade_release',
      consultationRecommended: true,
      boundaryStatement
    };
  }

  const scoredEvidence = courses.flatMap((course) =>
    (course.activities || [])
      .filter((activity) => activity.score !== null && activity.score !== undefined && Number(activity.max_score) > 0)
      .map((activity) => ({
        ...activity,
        courseCode: course.code,
        courseName: course.name,
        instructor: course.instructor,
        percentage: Number.isFinite(Number(activity.percentage))
          ? Number(activity.percentage)
          : Math.round((Number(activity.score) / Number(activity.max_score)) * 100)
      }))
  );
  const pendingEvidence = courses.flatMap((course) =>
    (course.activities || [])
      .filter((activity) => activity.evidenceStatus === 'pending'
        || activity.score === null
        || activity.score === undefined)
      .map((activity) => ({
        ...activity,
        courseCode: course.code,
        courseName: course.name,
        instructor: course.instructor
      }))
  );

  const weakGroups = new Map();
  scoredEvidence
    .filter((activity) => activity.percentage < ADVISING_THRESHOLDS.weakActivityPercentage)
    .forEach((activity) => {
      const key = `${activity.courseCode}:${getActivityGroup(activity)}`;
      const existing = weakGroups.get(key) || [];
      existing.push(activity);
      weakGroups.set(key, existing);
    });

  const relatedWeakResults = [...weakGroups.values()]
    .filter((group) => group.length >= ADVISING_THRESHOLDS.minimumRelatedResults)
    .map((group) => group.sort((a, b) => getTimestamp(b) - getTimestamp(a)))
    .sort((a, b) => {
      const averageA = a.reduce((sum, item) => sum + item.percentage, 0) / a.length;
      const averageB = b.reduce((sum, item) => sum + item.percentage, 0) / b.length;
      return averageA - averageB;
    })[0];

  if (relatedWeakResults) {
    const latestTwo = relatedWeakResults.slice(0, 2);
    const courseCode = latestTwo[0].courseCode;
    const topic = getActivityTopic(latestTwo[0]);
    const average = Math.round(latestTwo.reduce((sum, item) => sum + item.percentage, 0) / latestTwo.length);

    return {
      state: 'action_required',
      severity: average < 60 ? 'high' : 'moderate',
      signalType: 'related_weak_activities',
      courseCode,
      headline: `${courseCode} needs focused review before the next activity`,
      summary: `Two related tentative results average ${average}%. Focus on ${topic} now; this is an activity-level study signal, not an official term grade.`,
      evidence: latestTwo.map((item) => ({
        id: item.activity_id,
        label: getActivityLabel(item),
        value: `${item.score}/${item.max_score} (${item.percentage}%)`
      })),
      focusTopics: [topic],
      actions: [
        action('review-errors', 'Review both activity attempts', 'Mark each missed item and identify the concept or step that caused the error.'),
        action('targeted-practice', `Practice ${topic}`, 'Complete one focused practice set before the next related activity.'),
        action('verify-understanding', 'Verify your understanding', 'Bring one unresolved example to your instructor or consultation session.')
      ],
      reviewTrigger: 'next_related_activity_score',
      consultationRecommended: average < 60,
      boundaryStatement
    };
  }

  const weakEvidence = scoredEvidence
    .filter((activity) => activity.percentage < ADVISING_THRESHOLDS.weakActivityPercentage)
    .sort((a, b) => getTimestamp(b) - getTimestamp(a));

  if (weakEvidence.length > 0) {
    const latest = weakEvidence[0];
    return {
      state: 'building_evidence',
      severity: 'low',
      signalType: 'single_weak_activity',
      courseCode: latest.courseCode,
      headline: 'ASPIRE is building your academic evidence',
      summary: `${getActivityLabel(latest)} in ${latest.courseCode} is recorded at ${latest.percentage}%. One result is not enough to classify a trend, but you can review it before the next related activity.`,
      evidence: [{ id: latest.activity_id, label: getActivityLabel(latest), value: `${latest.score}/${latest.max_score} (${latest.percentage}%)` }],
      focusTopics: [getActivityTopic(latest)],
      actions: [action('early-review', 'Review this activity early', 'Check the missed items now while waiting for the next related saved score.')],
      reviewTrigger: 'next_related_activity_score',
      consultationRecommended: false,
      boundaryStatement
    };
  }

  if (hasOfficialMilestone && officialGwa !== null && Number(officialGwa) <= 3) {
    const milestoneText = latestMilestone ? latestMilestone : 'Official milestone';
    let summaryText = `Your latest official cumulative GWA is ${Number(officialGwa).toFixed(2)}, which is a passing standing. ASPIRE will continue to monitor your progress.`;
    
    if (latestMilestone === 'Tentative Final Rating') {
      summaryText = `Your latest official cumulative GWA is ${Number(officialGwa).toFixed(2)} (Tentative Final Rating). Note: This grade is tentative and may vary since grading is not yet completed. ASPIRE will continue to monitor your progress.`;
    } else if (latestMilestone === 'Midterm Rating') {
      summaryText = `Your latest official cumulative GWA is ${Number(officialGwa).toFixed(2)} (Midterm Rating), which is a passing standing. ASPIRE will continue to monitor your progress.`;
    } else if (latestMilestone === 'Semestral Grade') {
      summaryText = `Your final Semestral Grade is ${Number(officialGwa).toFixed(2)}, which is a passing standing.`;
    }

    if (pendingEvidence.length > 0) {
      summaryText += ` ${pendingEvidence.length} ${pendingEvidence.length === 1 ? 'activity is' : 'activities are'} still labeled Pending because no score has been recorded.`;
    }

    return {
      state: 'monitoring',
      severity: 'low',
      signalType: 'official_grade_passing',
      headline: `${milestoneText} grade is on track`,
      summary: summaryText,
      evidence: [
        { label: `${milestoneText} GWA`, value: Number(officialGwa).toFixed(2) },
        ...(pendingEvidence.length > 0 ? [{ label: 'Pending activities', value: String(pendingEvidence.length) }] : [])
      ],
      focusTopics: [],
      actions: [action('maintain-routine', 'Maintain your study routine', 'Continue your current study habits and review upcoming requirements.')],
      reviewTrigger: 'next_activity_score',
      consultationRecommended: false,
      boundaryStatement
    };
  }

  if (scoredEvidence.length === 0) {
    if (pendingEvidence.length > 0) {
      return {
        state: 'building_evidence',
        severity: 'low',
        signalType: 'pending_activities',
        headline: `${pendingEvidence.length} ${pendingEvidence.length === 1 ? 'activity is' : 'activities are'} pending`,
        summary: 'These activities are available to ASPIRE, but no score has been recorded. They remain labeled Pending and are not treated as zero, failed, missing, or official evidence.',
        evidence: pendingEvidence.slice(0, 4).map(item => ({
          id: item.activity_id,
          label: `${item.courseCode} · ${getActivityLabel(item)}`,
          value: 'Pending'
        })),
        focusTopics: [],
        actions: [action('confirm-pending-activities', 'Review pending activities', 'Check the activity instructions and confirm requirements or schedules with your instructor.')],
        reviewTrigger: 'next_activity_score',
        consultationRecommended: false,
        boundaryStatement
      };
    }
    return {
      state: 'no_evidence',
      severity: 'low',
      signalType: 'awaiting_activity_score',
      headline: 'Waiting for tentative academic evidence',
      summary: 'No saved activity score is available yet. ASPIRE will begin with activity-level guidance before an official milestone grade when enough evidence exists.',
      evidence: [],
      focusTopics: [],
      actions: [action('continue-coursework', 'Continue current coursework', 'Complete upcoming activities and review faculty feedback when scores are saved.')],
      reviewTrigger: 'next_activity_score',
      consultationRecommended: false,
      boundaryStatement
    };
  }

  return {
    state: 'monitoring',
    severity: 'low',
    signalType: 'tentative_activities_on_track',
    headline: 'Tentative activity evidence is currently on track',
    summary: `${scoredEvidence.length} tentative scored ${scoredEvidence.length === 1 ? 'activity is' : 'activities are'} available, with no repeated below-benchmark pattern detected.${pendingEvidence.length > 0 ? ` ${pendingEvidence.length} additional ${pendingEvidence.length === 1 ? 'activity remains' : 'activities remain'} labeled Pending.` : ''}`,
    evidence: scoredEvidence.slice(-2).map((item) => ({
      id: item.activity_id,
      label: `${item.courseCode} · ${getActivityLabel(item)}`,
      value: `${item.percentage}%`
    })),
    focusTopics: [],
    actions: [action('maintain-routine', 'Maintain your study routine', 'Review feedback from each saved activity before starting the next one.')],
    reviewTrigger: 'next_activity_score',
    consultationRecommended: false,
    boundaryStatement
  };
}
