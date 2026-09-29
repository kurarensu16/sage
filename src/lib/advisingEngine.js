export const ADVISING_THRESHOLDS = Object.freeze({
  weakActivityPercentage: 75,
  minimumRelatedResults: 2,
  attendanceWarningAbsences: 3,
  fdaAbsences: 4
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

const getActivityLabel = (activity) => activity.title || activity.name || 'Released activity';

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
  hasOfficialMilestone = false
} = {}) {
  const absenceCount = Number(attendance.absenceCount) || 0;

  if (courses.length === 0) {
    return {
      state: 'no_enrollment',
      severity: 'low',
      signalType: 'no_enrollment',
      headline: 'No active courses available',
      summary: 'ASPIRE will begin monitoring released academic evidence after your active course enrollment is available.',
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
      summary: `${absenceCount} absences are recorded. This meets the institutional FDA advisory threshold and requires confirmation with your instructor.`,
      evidence: [{ label: 'Recorded absences', value: `${absenceCount}/${ADVISING_THRESHOLDS.fdaAbsences}` }],
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
      summary: `${absenceCount} absences are recorded. Protect your attendance standing and clarify any disputed record before the next class meeting.`,
      evidence: [{ label: 'Recorded absences', value: `${absenceCount}/${ADVISING_THRESHOLDS.fdaAbsences}` }],
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
      summary: `Two related released results average ${average}%. Focus on ${topic} now; this is an activity-level study signal, not an unofficial term grade.`,
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
      reviewTrigger: 'next_related_activity_release',
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
      actions: [action('early-review', 'Review this activity early', 'Check the missed items now while waiting for the next related released result.')],
      reviewTrigger: 'next_related_activity_release',
      consultationRecommended: false,
      boundaryStatement
    };
  }

  if (scoredEvidence.length === 0) {
    return {
      state: 'no_evidence',
      severity: 'low',
      signalType: 'awaiting_released_activity',
      headline: 'Waiting for released academic evidence',
      summary: 'No faculty-released activity result is available yet. ASPIRE will begin with activity-level guidance before the official Midterm or Final grade when enough evidence exists.',
      evidence: [],
      focusTopics: [],
      actions: [action('continue-coursework', 'Continue current coursework', 'Complete upcoming activities and review faculty feedback when results are released.')],
      reviewTrigger: 'next_activity_release',
      consultationRecommended: false,
      boundaryStatement
    };
  }

  return {
    state: 'monitoring',
    severity: 'low',
    signalType: 'released_activities_on_track',
    headline: 'Released activity evidence is currently on track',
    summary: `${scoredEvidence.length} released scored ${scoredEvidence.length === 1 ? 'activity is' : 'activities are'} available, with no repeated below-benchmark pattern detected.`,
    evidence: scoredEvidence.slice(-2).map((item) => ({
      id: item.activity_id,
      label: `${item.courseCode} · ${getActivityLabel(item)}`,
      value: `${item.percentage}%`
    })),
    focusTopics: [],
    actions: [action('maintain-routine', 'Maintain your study routine', 'Review feedback from each released activity before starting the next one.')],
    reviewTrigger: 'next_activity_release',
    consultationRecommended: false,
    boundaryStatement
  };
}
