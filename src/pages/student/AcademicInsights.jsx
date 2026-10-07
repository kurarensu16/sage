import {
  getTransmutedGrade,
  GWA_TARGET_BENCHMARKS,
  simulateRequiredFinalRating
} from '../../lib/gradingMath';
import { computeStudentGwa, countAttendance, getAttendanceFlags, getGwaBand, getHonorTier, HONORS, toGwaOrNull } from '../../lib/academicPolicy';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  BrainCircuit, 
  AlertCircle, 
  GraduationCap, 
  BookOpen, 
  RefreshCw, 
  Target, 
  Compass, 
  ShieldCheck, 
  Sparkles, 
  Calculator,
  BarChart3,
  UserCheck, 
  Clock, 
  AlertTriangle, 
  MessageSquare,
  Calendar,
  Send,
  CheckCircle2,
  X,
  Plus,
  Lock,
  TrendingUp,
  ChevronDown,
  Info
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAiAcademicInsight } from '../../lib/openrouter';
import { evaluateAcademicAdvising } from '../../lib/advisingEngine';
import AskAspirePanel from '../../components/student/AskAspirePanel';
import { dispatchNotifications } from '../../lib/notificationDispatcher';
import { showLocalNotification } from '../../lib/notificationService';
import { DetailSkeleton } from '../../components/common/Skeleton';
import {
  GRADE_MILESTONES,
  findPostedMilestone,
  getCanonicalGradePeriod
} from '../../lib/gradeMilestones';

// Helper to compute academic verdict enum ('continue', 'at_risk', 'recommend_shift')
const computeVerdict = (gwaNum, fdaRisk, absents, failingCount = 0) => {
  if ((gwaNum !== null && gwaNum > 3.00) || failingCount > 1) {
    return 'recommend_shift';
  }
  if ((gwaNum !== null && gwaNum > 2.50) || fdaRisk || absents >= 4 || failingCount === 1) {
    return 'at_risk';
  }
  return 'continue';
};

// Helper to generate dynamic academic insights text based on period grade info
const generateDynamicInsight = (termName, rating, gwa, status) => {
  if (status === 'Pending' || gwa === '—') {
    return `Awaiting evaluation components for ${termName}.`;
  }
  const isPosted = status === 'Posted';
  const statusStr = isPosted ? "officially posted" : "calculated as draft";
  
  let baseText;
  if (termName === 'Midterm Rating (MR)' || termName === 'Midterm Rating') {
    baseText = `Your Midterm Rating combines your Prelim and Midterm efforts, ${statusStr} at ${gwa} GWA (${rating}%).`;
  } else if (termName === 'Tentative Final Rating (TFR)' || termName === 'Tentative Final Rating') {
    baseText = `Your Tentative Final Rating represents the average of your Semi-Final and Final marks, ${statusStr} at ${gwa} GWA (${rating}%).`;
  } else if (termName === 'Semestral Grade (SG)' || termName === 'Semestral Grade') {
    baseText = `Your projected Semestral Grade stands at a ${gwa} GWA (${rating}%), reflecting your cumulative performance for the term.`;
  } else {
    baseText = `Your ${termName} grade is ${statusStr} at ${gwa} GWA (${rating}%).`;
  }

  const numericGwa = parseFloat(gwa);
  if (isNaN(numericGwa)) {
    return `${baseText} Maintain your class participation and complete all upcoming tasks.`;
  }

  // Routed through the canonical GWA_BANDS ladder instead of a raw 1.45 literal —
  // Sapientia/Excellentia both read as "Outstanding" here since this is advisory
  // message tone, not the honors tier label itself (that's shown separately via
  // getHonorTier elsewhere on this page).
  const bandLabel = getGwaBand(numericGwa)?.label;
  if (bandLabel === 'Sapientia' || bandLabel === 'Excellentia') {
    return `${baseText} Outstanding result! You are demonstrating exceptional mastery of the course materials and are on track for honors.`;
  } else if (bandLabel === 'Virtus') {
    return `${baseText} Strong academic standing. You are maintaining a highly competitive position in this class.`;
  } else if (bandLabel === 'Satisfactory') {
    return `${baseText} Good, stable performance. Consistent efforts will keep you securely on track.`;
  } else if (bandLabel === 'Passing Margin') {
    return `${baseText} Passing grade. Focus on reviewing core topics to build a safer margin.`;
  } else {
    return `${baseText} Warning: This rating is currently below passing. We recommend reaching out to your instructor or coordinator for guidance.`;
  }
};

// A row existing in posted_grades does not by itself mean a real grade was recorded —
// a milestone row can be created with computed_grade/effective_grade still null before
// any components are scored. Treating that as a "Posted" 5.00 (the old getTransmutedGrade
// NaN fallback) fabricated a failing grade and an "Academic Warning" standing for students
// with zero graded work. Only a row with an actual finite rating counts as posted.
function resolvePostedTermRating(row) {
  const effective = row?.effective_grade !== null && row?.effective_grade !== undefined
    ? Number(row.effective_grade)
    : null;
  const rating = Number.isFinite(parseFloat(row?.computed_grade)) ? parseFloat(row.computed_grade) : null;
  const gwa = Number.isFinite(effective) ? effective : toGwaOrNull(rating);
  if (gwa === null) return null;
  return { rating: rating ?? 0, gwa: gwa.toFixed(2) };
}

// Period display mappings
const PERIODS_MAPPING = {
  prelim: 'Prelim Term',
  midterm: 'Midterm Term',
  midtermRating: 'Midterm Rating (MR)',
  semiFinal: 'Semi-Final Term',
  final: 'Final Term',
  tentativeFinalRating: 'Tentative Final Rating (TFR)',
  semestralGrade: 'Semestral Grade (SG)'
};

export default function AcademicInsights() {
  const { user, profile } = useAuth();
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  // Official milestone gate states
  const [hasOfficialMilestone, setHasOfficialMilestone] = useState(false);
  const [hasEnrolledSubjects, setHasEnrolledSubjects] = useState(false);

  // Selector states
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialScope = searchParams.get('tab') || 'overall';
  const [scope, setScope] = useState(initialScope); // Today, My Courses, My Progress
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('semestralGrade');
  const [completedActionIds, setCompletedActionIds] = useState([]);
  const [infoModalType, setInfoModalType] = useState(null);

  // Retained only for the future Grade Planning destination; not rendered in Advisor.
  const [simSubjectCode, setSimSubjectCode] = useState('');
  const [simTargetGwa, setSimTargetGwa] = useState('1.75');
  const [simEstimatedCs] = useState(85);

  // AI Guidance states
  const [aiCache, setAiCache] = useState(() => {
    try {
      const saved = localStorage.getItem(`sage_ai_cache_${user?.id || 'guest'}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [askAspireOpen, setAskAspireOpen] = useState(false);
  const [askAspireSubjectCode, setAskAspireSubjectCode] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`aspire_advisor_actions_${user?.id || 'guest'}`);
      setCompletedActionIds(saved ? JSON.parse(saved) : []);
    } catch {
      setCompletedActionIds([]);
    }
  }, [user?.id]);

  // Helper to persist insight to Supabase database table `student_academic_insights`
  const saveInsightToDb = useCallback(async (summaryText, verdictValue, basisSnapshot) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('student_academic_insights')
        .insert({
          student_id: user.id,
          summary: summaryText,
          verdict: verdictValue,
          basis_snapshot: basisSnapshot,
          generated_at: new Date().toISOString()
        })
        .select();

      if (error) {
        console.warn("Could not save insight to database:", error);
      } else {
        console.log("Insight saved to student_academic_insights table:", data);

        // Immediate local alert
        await showLocalNotification({
          title: 'AI Counseling Ready',
          body: '🧠 Your personalized academic guidance and counseling verdict is ready.'
        });

        // Persist notification record for inbox
        await dispatchNotifications([{
          recipient_id: user.id,
          type: 'ai_recommendation',
          message: 'Your personalized academic AI trajectory guidance and counseling report is ready.'
        }]);
      }
    } catch (err) {
      console.warn("Error inserting to student_academic_insights:", err);
    }
  }, [user]);

  // Helper to persist AI cache to localStorage
  const updateAiCache = useCallback((key, val) => {
    setAiCache(prev => {
      const next = { ...prev, [key]: val };
      try {
        localStorage.setItem(`sage_ai_cache_${user?.id || 'guest'}`, JSON.stringify(next));
      } catch (e) {
        console.debug('Failed to write aiCache to storage', e);
      }
      return next;
    });
  }, [user]);

  useEffect(() => {
    async function loadInsights() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Fetch pre-generated insights from Supabase database if any
        const { data: pregenData } = await supabase
          .from('student_academic_insights')
          .select('*')
          .eq('student_id', user.id)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 2. Fetch student enrollment records
        const { data: enrollsCheck } = await supabase
          .from('enrollments')
          .select('subject_id, section_id, subjects(*)')
          .eq('student_id', user.id);

        const activeSectionId = profile?.section_id || (enrollsCheck && enrollsCheck.length > 0 ? enrollsCheck[0].section_id : null);
        const enrolledSubjectsCount = enrollsCheck?.length || 0;
        setHasEnrolledSubjects(enrolledSubjectsCount > 0);

        // 3. Fetch attendance history
        const { data: attendanceData } = await supabase
          .from('attendance_records')
          .select('class_record_id, status')
          .eq('student_id', user.id);

        const attendanceSummary = countAttendance(attendanceData || []);
        const attendanceByClass = Object.values((attendanceData || []).reduce((groups, record) => {
          const key = record.class_record_id || 'unassigned';
          groups[key] ||= [];
          groups[key].push(record);
          return groups;
        }, {}));
        const absentAtt = attendanceSummary.absences;
        const fdaFlags = attendanceByClass.filter(records => getAttendanceFlags(countAttendance(records).absences).isFda).length;
        const attendanceRate = attendanceSummary.attendanceRate;

        if (activeSectionId && enrollsCheck && enrollsCheck.length > 0) {
          const subjectIds = enrollsCheck.map(e => e.subject_id).filter(Boolean);

          if (subjectIds.length > 0) {
            const { data: classRecords } = await supabase
              .from('class_records')
              .select('class_record_id, subject_id, faculty_id, faculty:users!faculty_id(first_name, last_name)')
              .eq('section_id', activeSectionId)
              .in('subject_id', subjectIds)
              .eq('status', 'active');

            const classRecordIds = classRecords?.map(cr => cr.class_record_id) || [];

            // Fetch activities with topics / descriptions
            const { data: classActs } = await supabase
              .from('class_activities')
              .select('*')
              .in('class_record_id', classRecordIds.length > 0 ? classRecordIds : ['00000000-0000-0000-0000-000000000000'])
              .eq('is_released', true);

            // Fetch professor evaluations for student
            const { data: riskEvals } = await supabase
              .from('student_risk_evaluations')
              .select(`
                evaluation_id,
                class_record_id,
                student_id,
                faculty_id,
                term,
                evaluation_context,
                shared_academic_feedback,
                advising_plan,
                baseline_snapshot,
                followup_snapshot,
                refer_to_dean,
                requires_tutoring,
                status,
                published_to_student_at,
                created_at,
                updated_at
              `)
              .eq('student_id', user.id)
              .in('class_record_id', classRecordIds.length > 0 ? classRecordIds : ['00000000-0000-0000-0000-000000000000'])
              .order('created_at', { ascending: false });

            const { data: posted } = await supabase
              .from('posted_grades')
              .select('*')
              .eq('student_id', user.id)
              .in('class_record_id', classRecordIds.length > 0 ? classRecordIds : ['00000000-0000-0000-0000-000000000000']);

            const activityIds = (classActs || []).map(activity => activity.activity_id);
            const [{ data: activityScores }, { data: termScores }, { data: gradingColumns }] = await Promise.all([
              activityIds.length > 0
                ? supabase
                    .from('student_activity_scores')
                    .select('activity_id, score, updated_at')
                    .eq('student_id', user.id)
                    .in('activity_id', activityIds)
                : Promise.resolve({ data: [] }),
              classRecordIds.length > 0
                ? supabase
                    .from('student_term_scores')
                    .select('class_record_id, term, char_rating, exam')
                    .eq('student_id', user.id)
                    .in('class_record_id', classRecordIds)
                : Promise.resolve({ data: [] }),
              classRecordIds.length > 0
                ? supabase
                    .from('class_grading_columns')
                    .select('class_record_id, term, exam_max')
                    .in('class_record_id', classRecordIds)
                : Promise.resolve({ data: [] })
            ]);

            const activityScoreMap = new Map(
              (activityScores || []).map(item => [item.activity_id, item])
            );
            const termScoreMap = new Map(
              (termScores || []).map(item => [`${item.class_record_id}:${item.term}`, item])
            );
            const gradingColumnMap = new Map(
              (gradingColumns || []).map(item => [`${item.class_record_id}:${item.term}`, item])
            );

            const subMap = {};
            enrollsCheck?.forEach(e => {
              if (e.subjects) subMap[e.subject_id] = e.subjects;
            });


            const postedMap = {};
            posted?.forEach(p => {
              if (!postedMap[p.class_record_id]) postedMap[p.class_record_id] = [];
              postedMap[p.class_record_id].push(p);
            });

            // Check if there is at least one officially posted Midterm or Final grade
            const officialPostedCount = (posted || []).filter(p => [
              GRADE_MILESTONES.MIDTERM_RATING,
              GRADE_MILESTONES.TENTATIVE_FINAL_RATING,
              GRADE_MILESTONES.SEMESTRAL_GRADE
            ].includes(getCanonicalGradePeriod(p))).length;
            const officialMilestonesExist = officialPostedCount > 0;
            setHasOfficialMilestone(officialMilestonesExist);

            const runningGwas = [];
            const allClassStandingAverages = [];
            const allExamAverages = [];
            const allCharacterAverages = [];

            const computedSubjectsList = (classRecords || [])
              .filter(cr => subMap[cr.subject_id])
              .map(cr => {
                const subj = subMap[cr.subject_id];
                const crPosted = postedMap[cr.class_record_id] || [];

                const getTermRating = (termName) => {
                  const dbTermKey = termName.toLowerCase().replace('-', '_');
                  const postedRow = crPosted.find(p => p.grade_period === dbTermKey || p.grade_period === termName.toLowerCase());
                  const resolved = postedRow ? resolvePostedTermRating(postedRow) : null;
                  if (resolved) {
                    return {
                      rating: resolved.rating,
                      gwa: resolved.gwa,
                      status: 'Posted',
                      insight: generateDynamicInsight(termName, resolved.rating, resolved.gwa, 'Posted')
                    };
                  }

                  // Grade is NOT posted yet (or the row exists with no real score encoded):
                  // MUST NOT calculate or display any draft/fabricated grade.
                  return {
                    rating: 0,
                    gwa: '—',
                    status: 'Pending',
                    insight: `Awaiting officially posted ${termName} grade from instructor and college dean.`
                  };
                };

                const prelim = getTermRating('Prelim');
                const midterm = getTermRating('Midterm');
                
                // Check if official Midterm Rating row exists in posted_grades
                const mrPostedRow = findPostedMilestone(crPosted, GRADE_MILESTONES.MIDTERM_RATING);
                let mr = { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting Prelim and Midterm components.` };
                
                const mrResolved = mrPostedRow ? resolvePostedTermRating(mrPostedRow) : null;
                if (mrResolved) {
                  mr = {
                    rating: mrResolved.rating,
                    gwa: mrResolved.gwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Midterm Rating', mrResolved.rating, mrResolved.gwa, 'Posted')
                  };
                } else if (prelim.status === 'Posted' && midterm.status === 'Posted') {
                  const avgRating = Math.round((prelim.rating + midterm.rating) / 2);
                  const avgGwa = getTransmutedGrade(avgRating).toFixed(2);
                  mr = {
                    rating: avgRating,
                    gwa: avgGwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Midterm Rating', avgRating, avgGwa, 'Posted')
                  };
                }

                const semiFinal = getTermRating('Semi-Final');
                const final = getTermRating('Final');

                // Check if official Tentative Final Rating row exists in posted_grades
                const tfrPostedRow = findPostedMilestone(crPosted, GRADE_MILESTONES.TENTATIVE_FINAL_RATING);
                let tentativeFinalRating = { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting Semi-Final and Final components.` };
                
                const tfrResolved = tfrPostedRow ? resolvePostedTermRating(tfrPostedRow) : null;
                if (tfrResolved) {
                  tentativeFinalRating = {
                    rating: tfrResolved.rating,
                    gwa: tfrResolved.gwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Tentative Final Rating', tfrResolved.rating, tfrResolved.gwa, 'Posted')
                  };
                } else if (semiFinal.status === 'Posted' && final.status === 'Posted') {
                  const avgRating = Math.round((semiFinal.rating + final.rating) / 2);
                  const avgGwa = getTransmutedGrade(avgRating).toFixed(2);
                  tentativeFinalRating = {
                    rating: avgRating,
                    gwa: avgGwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Tentative Final Rating', avgRating, avgGwa, 'Posted')
                  };
                }

                // Check if official Semestral Grade row exists in posted_grades
                const sgPostedRow = findPostedMilestone(crPosted, GRADE_MILESTONES.SEMESTRAL_GRADE);
                let semestralGrade = { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting complete term components.` };
                
                const sgResolved = sgPostedRow ? resolvePostedTermRating(sgPostedRow) : null;
                if (sgResolved) {
                  semestralGrade = {
                    rating: sgResolved.rating,
                    gwa: sgResolved.gwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Semestral Grade', sgResolved.rating, sgResolved.gwa, 'Posted')
                  };
                } else if (mr.status === 'Posted' && tentativeFinalRating.status === 'Posted') {
                  const avgRating = Math.round((mr.rating + tentativeFinalRating.rating) / 2);
                  const avgGwa = getTransmutedGrade(avgRating).toFixed(2);
                  semestralGrade = {
                    rating: avgRating,
                    gwa: avgGwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Semestral Grade', avgRating, avgGwa, 'Posted')
                  };
                }

                // Running GWA is strictly derived ONLY from officially posted milestones.
                // milestoneStage records WHICH posted row backs that number, since different
                // professors post Prelim/MR/TFR/Semestral Grade on different schedules — a
                // Prelim-only reading is not as settled as a Semestral Grade one, and the UI
                // needs to say so rather than presenting every subject's number as equally final.
                let runningGwaVal = null;
                let milestoneStage = null;
                if (semestralGrade.status === 'Posted') { runningGwaVal = parseFloat(semestralGrade.gwa); milestoneStage = 'Semestral Grade'; }
                else if (tentativeFinalRating.status === 'Posted') { runningGwaVal = parseFloat(tentativeFinalRating.gwa); milestoneStage = 'Tentative Final Rating'; }
                else if (mr.status === 'Posted') { runningGwaVal = parseFloat(mr.gwa); milestoneStage = 'Midterm Rating'; }
                else if (prelim.status === 'Posted') { runningGwaVal = parseFloat(prelim.gwa); milestoneStage = 'Prelim'; }

                const courseUnits = Number(subj.units) || 3;
                if (runningGwaVal !== null && !isNaN(runningGwaVal)) {
                  runningGwas.push(runningGwaVal);
                }

                // Filter activities and latest evaluation for this class record
                const subjectActivities = (classActs || [])
                  .filter(a => a.class_record_id === cr.class_record_id)
                  .map(activity => {
                    const scoreRecord = activityScoreMap.get(activity.activity_id);
                    const score = scoreRecord?.score === null || scoreRecord?.score === undefined
                      ? null
                      : Number(scoreRecord.score);
                    const maxScore = Number(activity.max_score) || 0;
                    return {
                      ...activity,
                      score,
                      gradingStatus: score === null ? 'ungraded' : score === 0 ? 'graded_zero' : 'graded',
                      submissionStatus: 'unknown',
                      percentage: score !== null && maxScore > 0
                        ? Math.round((score / maxScore) * 100)
                        : null
                    };
                  });
                const latestEval = (riskEvals || []).find(re => re.class_record_id === cr.class_record_id) || null;

                const scoredActivities = subjectActivities.filter(activity => activity.score !== null && Number(activity.max_score) > 0);
                const earnedActivityPoints = scoredActivities.reduce((sum, activity) => sum + activity.score, 0);
                const availableActivityPoints = scoredActivities.reduce((sum, activity) => sum + Number(activity.max_score), 0);
                const courseCsAvg = availableActivityPoints > 0
                  ? Math.round((earnedActivityPoints / availableActivityPoints) * 100)
                  : 0;

                const postedTermNames = new Set(
                  crPosted.map(item => {
                    const key = getCanonicalGradePeriod(item);
                    if (key === 'semi_final') return 'Semi-Final';
                    if (key === 'prelim') return 'Prelim';
                    if (key === 'midterm') return 'Midterm';
                    if (key === 'final') return 'Final';
                    return null;
                  }).filter(Boolean)
                );
                const officialTermScores = [...postedTermNames]
                  .map(term => termScoreMap.get(`${cr.class_record_id}:${term}`))
                  .filter(Boolean);
                const examPercentages = officialTermScores
                  .map(termScore => {
                    const max = Number(gradingColumnMap.get(`${cr.class_record_id}:${termScore.term}`)?.exam_max) || 40;
                    return max > 0 ? (Number(termScore.exam) / max) * 100 : null;
                  })
                  .filter(value => value !== null && Number.isFinite(value));
                const characterPercentages = officialTermScores
                  .map(termScore => Number(termScore.char_rating))
                  .filter(value => Number.isFinite(value) && value > 0);
                const courseExamAvg = examPercentages.length > 0
                  ? Math.round(examPercentages.reduce((sum, value) => sum + value, 0) / examPercentages.length)
                  : 0;
                const courseCharAvg = characterPercentages.length > 0
                  ? Math.round(characterPercentages.reduce((sum, value) => sum + value, 0) / characterPercentages.length)
                  : 0;

                if (scoredActivities.length > 0) allClassStandingAverages.push(courseCsAvg);
                if (courseExamAvg > 0) allExamAverages.push(courseExamAvg);
                if (courseCharAvg > 0) allCharacterAverages.push(courseCharAvg);

                return {
                  class_record_id: cr.class_record_id,
                  faculty_id: cr.faculty_id,
                  code: subj.code,
                  name: subj.name,
                  credits: courseUnits,
                  instructor: cr.faculty ? `Prof. ${cr.faculty.first_name} ${cr.faculty.last_name}` : 'TBA',
                  runningGwa: runningGwaVal !== null ? runningGwaVal.toFixed(2) : '—',
                  milestoneStage,
                  isFinalized: milestoneStage === 'Semestral Grade',
                  activities: subjectActivities,
                  latestEvaluation: latestEval,
                  diagnostics: {
                    csAvg: courseCsAvg,
                    scoredActivityCount: scoredActivities.length,
                    examAvg: courseExamAvg,
                    charAvg: courseCharAvg,
                    absenceCount: countAttendance((attendanceData || []).filter(record => record.class_record_id === cr.class_record_id)).absences,
                    attendanceRate: countAttendance((attendanceData || []).filter(record => record.class_record_id === cr.class_record_id)).attendanceRate
                  },
                  periods: {
                    prelim,
                    midterm,
                    midtermRating: mr,
                    semiFinal,
                    final,
                    tentativeFinalRating,
                    semestralGrade
                  }
                };
              });

            // Compute GWA strictly when there are real posted running units (never default to a fake number)
            const computedGwa = computeStudentGwa(runningGwas).gwa;

            // Completeness context: different professors post Prelim/MR/TFR/Semestral Grade on
            // different schedules, so computedGwa is often a blend of subjects at very different
            // stages. Every verdict below scales its WORDING (never the underlying math) to how
            // much of the term is actually posted, so a 1-subject Prelim reading is never shown
            // with the same confidence as a fully posted term.
            const totalSubjectCount = computedSubjectsList.length;
            const postedSubjectCount = runningGwas.length;
            const finalizedSubjectCount = computedSubjectsList.filter(s => s.isFinalized).length;
            const isFullyFinalized = totalSubjectCount > 0 && finalizedSubjectCount === totalSubjectCount;
            const completenessNote = totalSubjectCount > 0
              ? `Based on ${postedSubjectCount} of ${totalSubjectCount} enrolled subject${totalSubjectCount === 1 ? '' : 's'} currently graded.`
              : null;

            // Trajectory and Standing classification
            let gwaStanding = 'No Grades Posted Yet';
            let trajectoryVerdict = 'Awaiting Grade Posting';
            let trajectoryType = 'good'; // 'honors' | 'good' | 'warning' | 'critical'

            if (fdaFlags > 0 || absentAtt >= 4) {
              trajectoryVerdict = 'FDA Advisory Risk';
              trajectoryType = 'critical';
            } else if (computedGwa !== null) {
              gwaStanding = getGwaBand(computedGwa)?.label || 'Academic Warning';
              if (computedGwa <= 1.75) {
                trajectoryVerdict = isFullyFinalized ? "President's List pace" : "Trending Toward President's List";
                trajectoryType = 'honors';
              } else if (computedGwa <= 2.50) {
                trajectoryVerdict = isFullyFinalized ? 'Steady Academic Progression' : 'Currently Steady';
                trajectoryType = 'good';
              } else if (computedGwa <= 3.00) {
                trajectoryVerdict = isFullyFinalized ? 'Academic Warning Buffer' : 'Watch Zone — Early Signs';
                trajectoryType = 'warning';
              } else {
                trajectoryVerdict = isFullyFinalized ? 'Intervention Required' : 'Early Warning — Needs Attention';
                trajectoryType = 'critical';
              }
            } else {
              gwaStanding = computedSubjectsList.length > 0 ? 'No Grades Posted Yet' : 'No Active Enrollment';
              trajectoryVerdict = computedSubjectsList.length > 0 ? 'Awaiting Official Grade Posting' : 'Not Enrolled';
            }

            // President's List eligibility itself is deterministic (getHonorTier is the single
            // canonical source of truth, unchanged here) — only the wording around the result
            // scales with completeness, never the eligibility determination.
            let dlCategory = 'Pending Official Grades';
            let dlMessage = 'President\'s List eligibility will be determined once official milestones are available.';

            if (computedGwa !== null) {
              const honors = getHonorTier(computedGwa, {
                subjectGrades: computedSubjectsList.map(subject => subject.runningGwa),
                units: computedSubjectsList.reduce((sum, subject) => sum + (Number(subject.credits) || 0), 0)
              });
              dlCategory = honors.tier || 'Not Eligible';

              if (honors.isEligible) {
                dlMessage = isFullyFinalized
                  ? `Your official GWA of ${computedGwa.toFixed(2)} meets the ${honors.tier} President's List criteria.`
                  : `You're a possible ${honors.tier} President's List candidate based on your current performance across ${postedSubjectCount} of ${totalSubjectCount} graded subjects — this may shift as more grades are posted.`;
              } else if (!isFullyFinalized) {
                // A §3.8.4 subject-floor violation coming only from a not-yet-finalized subject
                // is still recoverable — say so, rather than reading as a permanent disqualification.
                const floorViolators = computedSubjectsList.filter(subject => {
                  const grade = parseFloat(subject.runningGwa);
                  return Number.isFinite(grade) && grade > HONORS.subjectGradeFloor;
                });
                const onlyProvisionalViolators = floorViolators.length > 0
                  && floorViolators.every(subject => !subject.isFinalized);
                dlMessage = onlyProvisionalViolators
                  ? `${honors.unmetRequirements.join(' ')} The subject${floorViolators.length === 1 ? '' : 's'} involved ${floorViolators.length === 1 ? 'is' : 'are'} still early-stage (${floorViolators.map(s => s.milestoneStage).join(', ')}) — this may still recover as more grades are posted.`
                  : honors.unmetRequirements.join(' ');
              } else {
                dlMessage = honors.unmetRequirements.join(' ');
              }
            }

            // Identify Priority Subject for rescue/elevation (only if running GWA exists)
            let prioritySub = null;
            let lowestGwa = 0;
            computedSubjectsList.forEach(s => {
              const num = parseFloat(s.runningGwa);
              if (!isNaN(num) && num > lowestGwa) {
                lowestGwa = num;
                prioritySub = s;
              }
            });
            if (!prioritySub && computedSubjectsList.length > 0) {
              prioritySub = computedSubjectsList[0];
            }

            // If a saved insight exists in DB, populate the cached summary
            if (pregenData && pregenData.summary) {
              updateAiCache('overall', pregenData.summary);
            }

            const activeInsightData = {
              studentName: `${profile?.first_name || 'Student'} ${profile?.last_name || ''}`.trim(),
              gwa: computedGwa,
              standing: gwaStanding,
              totalUnits: computedSubjectsList.reduce((sum, subject) => sum + subject.credits, 0),
              trajectoryVerdict,
              trajectoryType,
              aiSummary: pregenData?.summary || null,
              completeness: {
                totalSubjectCount,
                postedSubjectCount,
                finalizedSubjectCount,
                isFullyFinalized,
                note: completenessNote
              },
              dlEligibility: {
                awardCategory: dlCategory,
                message: dlMessage
              },
              diagnostics: {
                csAvg: allClassStandingAverages.length > 0
                  ? Math.round(allClassStandingAverages.reduce((sum, value) => sum + value, 0) / allClassStandingAverages.length)
                  : 0,
                examAvg: allExamAverages.length > 0
                  ? Math.round(allExamAverages.reduce((sum, value) => sum + value, 0) / allExamAverages.length)
                  : 0,
                charAvg: allCharacterAverages.length > 0
                  ? Math.round(allCharacterAverages.reduce((sum, value) => sum + value, 0) / allCharacterAverages.length)
                  : 0,
                scoredActivityCount: computedSubjectsList.reduce(
                  (count, subject) => count + (subject.diagnostics?.scoredActivityCount || 0),
                  0
                ),
                attendanceRate,
                absentCount: absentAtt,
                fdaRisk: fdaFlags > 0 || absentAtt >= 4
              },
              prioritySubject: prioritySub,
              subjects: computedSubjectsList
            };

            setInsight(activeInsightData);
            if (computedSubjectsList.length > 0) {
              setSelectedSubjectCode(computedSubjectsList[0].code);
              setSimSubjectCode(computedSubjectsList[0].code);
            }
          } else {
            setHasOfficialMilestone(false);
          }
        } else {
          setHasOfficialMilestone(false);
          setHasEnrolledSubjects(false);
        }
      } catch (err) {
        console.error("Failed to load academic insights:", err);
      } finally {
        setLoading(false);
      }
    }

    loadInsights();
  }, [user, profile, updateAiCache]);

  const studentStats = useMemo(() => insight || ({
    studentName: `${profile?.first_name || 'Student'} ${profile?.last_name || ''}`.trim(),
    gwa: null,
    standing: hasEnrolledSubjects ? 'Pending Official Milestone Grades' : 'No Active Enrollment',
    totalUnits: 0,
    trajectoryVerdict: hasEnrolledSubjects ? 'Awaiting Milestone Assessments' : 'Not Enrolled',
    trajectoryType: 'good',
    aiSummary: null,
    dlEligibility: { awardCategory: 'Not Eligible', message: 'No enrolled courses for the current academic term.' },
    diagnostics: { csAvg: 0, examAvg: 0, charAvg: 0, attendanceRate: 100, absentCount: 0, fdaRisk: false },
    prioritySubject: null,
    subjects: []
  }), [hasEnrolledSubjects, insight, profile?.first_name, profile?.last_name]);

  const subjectsList = useMemo(() => studentStats.subjects || [], [studentStats.subjects]);
  const releasedScoredActivityCount = useMemo(() => subjectsList.reduce(
    (count, subject) => count + (subject.activities || []).filter(
      activity => activity.score !== null && activity.score !== undefined
    ).length,
    0
  ), [subjectsList]);
  const advisorEvaluation = useMemo(() => evaluateAcademicAdvising({
    courses: subjectsList,
    attendance: {
      absenceCount: studentStats.diagnostics.absentCount,
      byCourse: subjectsList.map(subject => ({ courseCode: subject.code, absenceCount: subject.diagnostics?.absenceCount || 0 }))
    },
    officialGwa: studentStats.gwa,
    hasOfficialMilestone
  }), [hasOfficialMilestone, studentStats.diagnostics.absentCount, studentStats.gwa, subjectsList]);
  const advisorTone = {
    critical: 'border-rose-200 bg-rose-50 text-rose-800',
    high: 'border-amber-200 bg-amber-50 text-amber-900',
    moderate: 'border-amber-200 bg-amber-50 text-amber-900',
    low: 'border-sage-200 bg-sage-50 text-sage-900'
  }[advisorEvaluation.severity] || 'border-slate-200 bg-slate-50 text-slate-800';
  const currentSubject = subjectsList.find(s => s.code === selectedSubjectCode) || subjectsList[0] || null;
  const simSubject = subjectsList.find(s => s.code === simSubjectCode) || subjectsList[0] || null;
  const askAspireSubject = askAspireSubjectCode
    ? subjectsList.find(subject => subject.code === askAspireSubjectCode) || null
    : null;

  const scoredActivitiesForAsk = (askAspireSubject?.activities || [])
    .filter(activity => activity.score !== null && activity.score !== undefined)
    .sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101));
  const askRiskEvaluation = askAspireSubject?.latestEvaluation || null;
  const overallAdvisorEvidence = [
    { label: 'Released scored activities', value: String(releasedScoredActivityCount) },
    ...(studentStats.gwa !== null
      ? [{ label: 'Cumulative GWA', value: Number(studentStats.gwa).toFixed(2) }]
      : []),
    { label: 'Attendance', value: `${studentStats.diagnostics.attendanceRate}% · ${studentStats.diagnostics.absentCount} absence(s)` },
    { label: 'Enrolled courses', value: `${subjectsList.length} course(s) · ${studentStats.totalUnits} units` },
    ...(studentStats.prioritySubject
      ? [{
          label: 'Priority course',
          value: studentStats.prioritySubject.runningGwa === '—'
            ? `${studentStats.prioritySubject.code} · ${studentStats.prioritySubject.diagnostics?.csAvg || 0}% released activity average`
            : `${studentStats.prioritySubject.code} · ${studentStats.prioritySubject.runningGwa} official GWA (based on ${studentStats.prioritySubject.milestoneStage || 'no official milestone yet'}${studentStats.prioritySubject.isFinalized ? '' : ' — not yet final'})`
        }]
      : [])
  ];
  const askAspireEvidence = askAspireSubject
    ? [
        { label: 'Running course grade', value: askAspireSubject.runningGwa === '—' ? 'Awaiting official grade' : `${askAspireSubject.runningGwa} GWA` },
        ...(askAspireSubject.diagnostics?.scoredActivityCount > 0
          ? [{ label: 'Recorded activities', value: `${askAspireSubject.diagnostics.csAvg}% average` }]
          : []),
        ...(askAspireSubject.diagnostics?.examAvg > 0
          ? [{ label: 'Official-term exams', value: `${askAspireSubject.diagnostics.examAvg}% average` }]
          : []),
        ...(scoredActivitiesForAsk[0]
          ? [{
              label: scoredActivitiesForAsk[0].title || scoredActivitiesForAsk[0].name || 'Lowest recorded activity',
              value: `${scoredActivitiesForAsk[0].score}/${Number(scoredActivitiesForAsk[0].max_score)} (${scoredActivitiesForAsk[0].percentage}%)`
            }]
          : [])
      ]
    : overallAdvisorEvidence;

  const getAdvisorActionKey = (item) => [
    advisorEvaluation.signalType,
    advisorEvaluation.courseCode || 'overall',
    item.id
  ].join(':');
  const completedCurrentActionCount = advisorEvaluation.actions.filter(
    item => completedActionIds.includes(getAdvisorActionKey(item))
  ).length;
  const toggleAdvisorAction = (item) => {
    const actionKey = getAdvisorActionKey(item);
    setCompletedActionIds(previous => {
      const next = previous.includes(actionKey)
        ? previous.filter(id => id !== actionKey)
        : [...previous, actionKey];
      localStorage.setItem(`aspire_advisor_actions_${user?.id || 'guest'}`, JSON.stringify(next));
      return next;
    });
  };

  const askAspireContext = {
    contextKey: askAspireSubject
      ? `${askAspireSubject.class_record_id}:${selectedPeriod}`
      : `overall:${studentStats.gwa ?? 'pending'}`,
    student: {
      firstName: profile?.first_name || 'Student'
    },
    tabScope: scope,
    scope: askAspireSubject ? 'course' : 'overall',
    periodLabel: askAspireSubject
      ? PERIODS_MAPPING[selectedPeriod]
      : hasOfficialMilestone
        ? 'Latest official milestones'
        : 'Released activity and attendance evidence',
    officialStanding: {
      gwa: studentStats.gwa,
      standing: studentStats.standing,
      trajectory: studentStats.trajectoryVerdict,
      attendanceRate: studentStats.diagnostics.attendanceRate,
      absenceCount: studentStats.diagnostics.absentCount,
      fdaAdvisory: studentStats.diagnostics.fdaRisk
    },
    subject: askAspireSubject
      ? {
          code: askAspireSubject.code,
          name: askAspireSubject.name,
          instructor: askAspireSubject.instructor,
          runningGwa: askAspireSubject.runningGwa,
          selectedPeriodName: selectedPeriod,
          periods: askAspireSubject.periods || null,
          gradingFormula: askAspireSubject.gradingFormula || null,
          diagnostics: askAspireSubject.diagnostics,
          sharedAcademicFeedback: askRiskEvaluation?.shared_academic_feedback || null,
          activities: (askAspireSubject.activities || []).map(activity => ({
            title: activity.title || activity.name,
            description: activity.description || null,
            topicTag: activity.topic_tag || null,
            term: activity.term,
            score: activity.score,
            maxScore: Number(activity.max_score) || null,
            percentage: activity.percentage,
            gradingStatus: activity.gradingStatus,
            submissionStatus: activity.submissionStatus,
            isReleased: activity.is_released === true
          }))
        }
      : null,
    courses: askAspireSubject
      ? undefined
      : subjectsList.map(subject => ({
          code: subject.code,
          name: subject.name,
          runningGwa: subject.runningGwa,
          classStandingAverage: subject.diagnostics?.csAvg || null,
          examAverage: subject.diagnostics?.examAvg || null
        })),
    evidence: askAspireEvidence,
    boundaries: {
      advisoryOnly: true,
      studentVisibleEvidenceOnly: true,
      insufficientEvidenceMustBeAcknowledged: true
    },
    deterministicAdvisor: {
      state: advisorEvaluation.state,
      signalType: advisorEvaluation.signalType,
      severity: advisorEvaluation.severity,
      headline: advisorEvaluation.headline,
      summary: advisorEvaluation.summary,
      evidence: advisorEvaluation.evidence,
      actions: advisorEvaluation.actions,
      reviewTrigger: advisorEvaluation.reviewTrigger,
      consultationRecommended: advisorEvaluation.consultationRecommended
    }
  };

  const openAskAspire = (subjectCode = null) => {
    setAskAspireSubjectCode(subjectCode);
    setAskAspireOpen(true);
  };

  const openConsultationFromAskAspire = () => {
    setAskAspireOpen(false);
    navigate('/student/consultations');
  };

  // Calculation stays available for its planned relocation to Score Breakdown / Grade Planning.
  const targetBenchmark = GWA_TARGET_BENCHMARKS.find(b => b.gwa === simTargetGwa) || GWA_TARGET_BENCHMARKS[3];
  const simMr = simSubject?.periods?.midtermRating?.rating || (simSubject?.periods?.prelim?.rating || 75);
  const simSemiFinal = simSubject?.periods?.semiFinal?.rating || null;
  const simResult = simulateRequiredFinalRating({
    mr: simMr,
    semiFinal: simSemiFinal,
    targetRating: targetBenchmark.minRating,
    estimatedFinalCs: simEstimatedCs,
    estimatedFinalChar: 95,
    examMax: 40
  });

  // Fetch AI guidance automatically ONLY when official Midterm / Final grades exist and cache is empty
  useEffect(() => {
    if (loading || !user || !hasEnrolledSubjects || !hasOfficialMilestone) return;

    let cacheKey = '';
    let payload = {};

    if (scope === 'overall') {
      cacheKey = 'overall';
      if (aiCache[cacheKey]) return; // Already loaded from DB / cache

      payload = {
        type: 'overall',
        studentName: studentStats.studentName,
        gwa: studentStats.gwa !== null ? studentStats.gwa.toFixed(2) : '—',
        standing: studentStats.standing,
        trajectoryVerdict: studentStats.trajectoryVerdict,
        trajectoryType: studentStats.trajectoryType,
        dlEligibility: studentStats.dlEligibility,
        completeness: studentStats.completeness,
        diagnostics: studentStats.diagnostics,
        subjects: subjectsList
      };
    } else {
      if (!currentSubject) return;
      cacheKey = `${currentSubject.code}_${selectedPeriod}`;
      const periodObj = currentSubject.periods?.[selectedPeriod] || {};
      
      // Do not query AI for pending/empty periods
      if (periodObj.gwa === '—' || periodObj.status === 'Pending') return;
      if (aiCache[cacheKey]) return;

      payload = {
        type: 'subject',
        studentName: studentStats.studentName,
        subjectCode: currentSubject.code,
        subjectName: currentSubject.name,
        credits: currentSubject.credits,
        instructor: currentSubject.instructor,
        periodLabel: PERIODS_MAPPING[selectedPeriod],
        rating: periodObj.rating || 0,
        gwa: periodObj.gwa || '—',
        status: periodObj.status || 'Pending',
        courseCs: currentSubject.diagnostics?.csAvg,
        courseExam: currentSubject.diagnostics?.examAvg,
        allPeriods: currentSubject.periods || {}
      };
    }

    async function fetchAiGuidance() {
      setAiLoading(true);
      try {
        const result = await getAiAcademicInsight(payload);
        if (result) {
          updateAiCache(cacheKey, result);

          // If overall guidance, persist directly into Supabase `student_academic_insights` table
          if (scope === 'overall') {
            const v = computeVerdict(studentStats.gwa, studentStats.diagnostics?.fdaRisk, studentStats.diagnostics?.absentCount, 0);
            await saveInsightToDb(result, v, {
              gwa: studentStats.gwa,
              standing: studentStats.standing,
              totalUnits: studentStats.totalUnits,
              trajectoryVerdict: studentStats.trajectoryVerdict,
              trajectoryType: studentStats.trajectoryType,
              dlEligibility: studentStats.dlEligibility,
              diagnostics: studentStats.diagnostics,
              hasOfficialMilestone: true,
              generatedAt: new Date().toISOString()
            });
          }
        }
      } catch (err) {
        console.warn("AI generation failed, relying on fallback.", err);
      } finally {
        setAiLoading(false);
      }
    }

    fetchAiGuidance();
  }, [scope, selectedSubjectCode, selectedPeriod, loading, user, hasEnrolledSubjects, hasOfficialMilestone, studentStats, subjectsList, currentSubject, aiCache, saveInsightToDb, updateAiCache]);

  // Handler for explicit on-demand re-generation (only enabled when official grades exist)
  const handleRegenerateCurrentInsight = async (e) => {
    e?.stopPropagation?.();
    if (!hasOfficialMilestone) return;

    let cacheKey;
    let payload;

    if (scope === 'overall') {
      cacheKey = 'overall';
      payload = {
        type: 'overall',
        studentName: studentStats.studentName,
        gwa: studentStats.gwa !== null ? studentStats.gwa.toFixed(2) : '—',
        standing: studentStats.standing,
        trajectoryVerdict: studentStats.trajectoryVerdict,
        trajectoryType: studentStats.trajectoryType,
        dlEligibility: studentStats.dlEligibility,
        completeness: studentStats.completeness,
        diagnostics: studentStats.diagnostics,
        subjects: subjectsList
      };
    } else {
      if (!currentSubject) return;
      cacheKey = `${currentSubject.code}_${selectedPeriod}`;
      const periodObj = currentSubject.periods?.[selectedPeriod] || {};
      payload = {
        type: 'subject',
        studentName: studentStats.studentName,
        subjectCode: currentSubject.code,
        subjectName: currentSubject.name,
        credits: currentSubject.credits,
        instructor: currentSubject.instructor,
        periodLabel: PERIODS_MAPPING[selectedPeriod],
        rating: periodObj.rating || 0,
        gwa: periodObj.gwa || '—',
        status: periodObj.status || 'Pending',
        courseCs: currentSubject.diagnostics?.csAvg,
        courseExam: currentSubject.diagnostics?.examAvg,
        allPeriods: currentSubject.periods || {}
      };
    }

    setAiLoading(true);
    try {
      const result = await getAiAcademicInsight(payload);
      if (result) {
        updateAiCache(cacheKey, result);

        if (scope === 'overall') {
          const v = computeVerdict(studentStats.gwa, studentStats.diagnostics?.fdaRisk, studentStats.diagnostics?.absentCount, 0);
          await saveInsightToDb(result, v, {
            gwa: studentStats.gwa,
            standing: studentStats.standing,
            totalUnits: studentStats.totalUnits,
            trajectoryVerdict: studentStats.trajectoryVerdict,
            trajectoryType: studentStats.trajectoryType,
            dlEligibility: studentStats.dlEligibility,
            diagnostics: studentStats.diagnostics,
            hasOfficialMilestone: true,
            generatedAt: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.warn("AI re-generation failed:", err);
    } finally {
      setAiLoading(false);
    }
  };


  if (loading) {
    return <DetailSkeleton />;
  }

  return (
    <>
      <PageHeader 
        title="ASPIRE Academic Advisor"
        breadcrumb="Student Portal" 
      >
        <button
          onClick={() => {
            navigate('/student/consultations');
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Request Consultation</span>
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-5 sm:space-y-6">
        
        {/* Navigation Scope Tabs */}
        {scope !== 'consultations' && (
          <div className="bg-slate-200/70 p-1 rounded-2xl shadow-inner grid grid-cols-3 gap-1 max-w-2xl mx-auto">
          <button
            onClick={() => setScope('overall')}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center select-none",
              scope === 'overall'
                ? "bg-white text-sage-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <BrainCircuit className="h-4 w-4 text-sage-600" />
            <span>Today</span>
          </button>

          <button
            onClick={() => setScope('subject')}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center select-none",
              scope === 'subject'
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <BookOpen className="h-4 w-4 text-sage-600" />
            <span>My Courses</span>
          </button>

          <button
            onClick={() => setScope('progress')}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center select-none",
              scope === 'progress'
                ? "bg-white text-sage-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <TrendingUp className="h-4 w-4 text-sage-600" />
            <span>My Progress</span>
          </button>

        </div>
        )}

        {/* Dynamic Panels */}
        {scope === 'overall' ? (
          /* ================= OVERALL ADVISORY PANEL ================= */
          <div className="space-y-5 sm:space-y-6 animate-fade-in">
            
            {/* 1. Academic Health Hero Banner */}
            <div className="bg-gradient-to-r from-sage-950 via-slate-900 to-sage-900 rounded-2xl p-5 sm:p-7 text-white shadow-md border border-sage-800/60 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-sage-300 bg-sage-800/60 px-2.5 py-0.5 rounded-md border border-sage-700/50">
                    Academic Trajectory
                  </span>
                  <span className={cn(
                    "text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1",
                    studentStats.trajectoryType === 'honors' && "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
                    studentStats.trajectoryType === 'good' && "bg-sage-500/20 text-sage-300 border border-sage-500/30",
                    studentStats.trajectoryType === 'warning' && "bg-amber-500/20 text-amber-300 border border-amber-500/30",
                    studentStats.trajectoryType === 'critical' && "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  )}>
                    <Sparkles className="h-3 w-3" />
                    {studentStats.trajectoryVerdict}
                  </span>
                </div>
                
                <h2 className="text-xl sm:text-2xl font-extrabold font-display tracking-tight text-white flex items-center gap-2">
                  <GraduationCap className="h-6 w-6 text-sage-300 flex-shrink-0" />
                  {studentStats.standing}
                </h2>
                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                  {subjectsList.length > 0
                    ? `Evaluated against DYCI 4-Term progression standards across ${subjectsList.length} enrolled subjects (${studentStats.totalUnits} Units).`
                    : 'No active course enrollments recorded for this academic term.'}
                </p>
                {studentStats.completeness?.note && !studentStats.completeness.isFullyFinalized && (
                  <p className="text-[11px] text-sage-300/90 italic">
                    {studentStats.completeness.note} Professors post Prelim/Midterm/Semi-Final/Final
                    grades on their own schedule, so this is a live snapshot, not a final result.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-sage-800/80 pt-3 md:pt-0 md:pl-6 justify-between md:justify-end">
                <div>
                  <span className="text-[10px] font-bold text-sage-300 uppercase tracking-wider flex items-center gap-1">
                    Tentative Cumulative GWA
                    <Info className="h-3 w-3 cursor-pointer hover:text-white transition-colors" onClick={() => setInfoModalType('gwa')} />
                  </span>
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono text-sage-200">
                    {studentStats.gwa !== null && studentStats.gwa !== undefined && !isNaN(studentStats.gwa) 
                      ? Number(studentStats.gwa).toFixed(2) 
                      : '—'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-sage-300 uppercase tracking-wider flex items-center gap-1 justify-end">
                    President's List Standing
                    <Info className="h-3 w-3 cursor-pointer hover:text-white transition-colors" onClick={() => setInfoModalType('pl')} />
                  </span>
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
                    {studentStats.gwa !== null ? studentStats.dlEligibility?.awardCategory || 'Not Eligible' : '—'}
                  </span>
                  {studentStats.gwa !== null && !studentStats.completeness?.isFullyFinalized && (
                    <span className="block text-[10px] text-sage-300/80 italic mt-0.5">Tentative</span>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Deterministic ASPIRE Academic Advisor Guidance */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sage-50 rounded-lg text-sage-600 border border-sage-100">
                    <BrainCircuit className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Proactive academic guidance</h3>
                    <p className="text-[11px] text-slate-400">Released activities, attendance, and official milestone evidence</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {hasOfficialMilestone && (
                    <button
                      onClick={handleRegenerateCurrentInsight}
                      disabled={aiLoading}
                      title="Generate fresh counseling guidance and update database record"
                      className="text-xs font-semibold text-slate-600 hover:text-sage-700 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5 text-sage-600", aiLoading && "animate-spin")} />
                      <span className="hidden sm:inline">{aiLoading ? "Consulting..." : "Refresh"}</span>
                    </button>
                  )}
                  <button
                    onClick={() => openAskAspire(null)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sage-700 px-3 py-2 text-xs font-bold text-white hover:bg-sage-800 transition-colors cursor-pointer"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Ask ASPIRE
                  </button>
                </div>
              </div>

              <div className={cn("rounded-xl border p-4 sm:p-5", advisorTone)}>
                <div className="flex items-start gap-3">
                  {advisorEvaluation.state === 'action_required' ? (
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  ) : advisorEvaluation.state === 'building_evidence' || advisorEvaluation.state === 'no_evidence' ? (
                    <Clock className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{advisorEvaluation.headline}</p>
                      <span className="rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                        {advisorEvaluation.state.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-normal leading-relaxed opacity-80">{advisorEvaluation.summary}</p>

                    {advisorEvaluation.evidence.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {advisorEvaluation.evidence.map((item, index) => (
                          <span key={item.id || `${item.label}-${index}`} className="rounded-lg border border-current/15 bg-white/70 px-2.5 py-1.5 text-[10px] font-semibold">
                            {item.label}: <span className="font-mono font-bold">{item.value}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {advisorEvaluation.actions.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide">Your next actions</p>
                          <span className="text-[10px] font-semibold opacity-70">
                            {completedCurrentActionCount}/{advisorEvaluation.actions.length} completed
                          </span>
                        </div>
                        {advisorEvaluation.actions.map((item) => {
                          const isComplete = completedActionIds.includes(getAdvisorActionKey(item));
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleAdvisorAction(item)}
                              className="flex w-full items-start gap-3 rounded-lg border border-current/15 bg-white/80 p-3 text-left transition-colors hover:bg-white cursor-pointer"
                            >
                              <span className={cn(
                                'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border',
                                isComplete ? 'border-sage-600 bg-sage-600 text-white' : 'border-current/30 bg-white'
                              )}>
                                {isComplete && <CheckCircle2 className="h-3.5 w-3.5" />}
                              </span>
                              <span className="min-w-0">
                                <span className={cn('block text-[11px] font-bold', isComplete && 'line-through opacity-60')}>{item.title}</span>
                                <span className="mt-0.5 block text-[10px] font-normal leading-relaxed opacity-75">{item.description}</span>
                              </span>
                            </button>
                          );
                        })}
                        <p className="pt-1 text-[10px] font-medium opacity-70">
                          Review after: {advisorEvaluation.reviewTrigger.replaceAll('_', ' ')}
                        </p>
                      </div>
                    )}

                    <p className="mt-3 text-[9px] font-medium opacity-60">{advisorEvaluation.boundaryStatement}</p>
                  </div>
                </div>
              </div>

              {hasOfficialMilestone && (aiLoading || aiCache.overall || studentStats.aiSummary) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-800">Ask ASPIRE explanation: </span>
                  {aiLoading && !aiCache.overall
                    ? 'Preparing a plain-language explanation of the deterministic evidence...'
                    : aiCache.overall || studentStats.aiSummary}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Available context</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  Released scored activities: <span className="text-slate-800">{releasedScoredActivityCount}</span>
                </span>
                {overallAdvisorEvidence.slice(0, 4).map(item => (
                  <span key={`${item.label}-${item.value}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                    {item.label}: <span className="text-slate-800">{item.value}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* 3. Component Strength & Weakness Diagnostic Grid */}
            <div className="hidden" aria-hidden="true">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-sage-600" />
                  <h3 className="text-sm font-bold text-slate-900">Component Strength & Weakness Diagnosis</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Weights: 50% Activities | 40% Exams | 10% Character</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                
                {/* Metric 1: Class Standing */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Standing (50%)</span>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      releasedScoredActivityCount === 0
                        ? "bg-slate-50 text-slate-500 border-slate-200"
                        : studentStats.diagnostics.csAvg < 75
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      {releasedScoredActivityCount === 0 ? 'Pending' : studentStats.diagnostics.csAvg < 75 ? 'Needs Attention' : studentStats.diagnostics.csAvg >= 85 ? 'Strong Asset' : 'On Track'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold font-mono text-slate-800">
                      {releasedScoredActivityCount > 0 ? `${studentStats.diagnostics.csAvg}%` : '—'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Activities & Quizzes</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        studentStats.diagnostics.csAvg < 75 ? "bg-amber-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${studentStats.diagnostics.csAvg || 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {releasedScoredActivityCount > 0
                      ? studentStats.diagnostics.csAvg < 75
                        ? "Released activity evidence is below the 75% advising benchmark. Follow the action plan above."
                        : "Released activity evidence is currently at or above the advising benchmark."
                      : "Class standing scores will compile as activities are graded."}
                  </p>
                </div>

                {/* Metric 2: Major Term Exams */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Major Exams (40%)</span>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      studentStats.diagnostics.examAvg === 0
                        ? "bg-slate-50 text-slate-500 border-slate-200"
                        : studentStats.diagnostics.examAvg < 80 
                          ? "bg-amber-50 text-amber-700 border-amber-200" 
                          : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      {studentStats.diagnostics.examAvg === 0 ? 'Pending' : studentStats.diagnostics.examAvg < 80 ? 'Primary Growth Area' : 'Solid'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold font-mono text-slate-800">
                      {studentStats.diagnostics.examAvg > 0 ? `${studentStats.diagnostics.examAvg}%` : '—'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Major Milestone Tests</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        studentStats.diagnostics.examAvg < 80 ? "bg-amber-500" : "bg-emerald-500"
                      )} 
                      style={{ width: `${studentStats.diagnostics.examAvg || 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {studentStats.diagnostics.examAvg > 0 
                      ? (studentStats.diagnostics.examAvg < 80 ? "Exam marks average lower than class standing. Allocate more time for test prep." : "Balanced exam performance across active subjects.")
                      : "Major exam performance is measured upon completion of term examinations."}
                  </p>
                </div>

                {/* Metric 3: Attendance Reliability */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance (FDA Risk)</span>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      studentStats.diagnostics.absentCount >= 3 
                        ? "bg-rose-50 text-rose-700 border-rose-200" 
                        : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      {studentStats.diagnostics.absentCount >= 3 ? 'Warning' : 'Good Standing'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold font-mono text-slate-800">{studentStats.diagnostics.attendanceRate}%</span>
                    <span className="text-xs text-slate-400 font-medium">{studentStats.diagnostics.absentCount}/4 Absences</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        studentStats.diagnostics.absentCount >= 3 ? "bg-rose-500" : "bg-emerald-500"
                      )} 
                      style={{ width: `${studentStats.diagnostics.attendanceRate}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {studentStats.diagnostics.absentCount >= 4 
                      ? "⚠️ FDA Flagged: Exceeded 4 institutional absences." 
                      : "Attendance is compliant with institutional regulations."}
                  </p>
                </div>

                {/* Metric 4: Character & Values */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Character (10%)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {studentStats.diagnostics.charAvg > 0 ? 'Exemplary' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold font-mono text-slate-800">
                      {studentStats.diagnostics.charAvg > 0 ? `${studentStats.diagnostics.charAvg}%` : '—'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Conduct & Ethics</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${studentStats.diagnostics.charAvg || 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {studentStats.diagnostics.charAvg > 0
                      ? "Strong collaborative etiquette and proactive classroom discipline."
                      : "Character ratings encoded periodically by subject faculty."}
                  </p>
                </div>

              </div>
            </div>

            {/* 4. Interactive "What-If" Final Exam Grade Simulator */}
            {hasOfficialMilestone ? (
              <div className="hidden bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4" aria-hidden="true">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 border border-indigo-100">
                    <Calculator className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Interactive "What-If" Grade Simulator</h3>
                    <p className="text-[11px] text-slate-400">Calculate the exact score needed on your Final Exam to reach your desired grade</p>
                  </div>
                </div>

                {/* Course Picker for Simulator */}
                {subjectsList.length > 0 ? (
                  <select
                    value={simSubjectCode}
                    onChange={(e) => setSimSubjectCode(e.target.value)}
                    className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 outline-none focus:ring-1 focus:ring-sage-500"
                  >
                    {subjectsList.map(s => (
                      <option key={s.code} value={s.code}>
                        {s.code} - {s.name} (Running GWA: {s.runningGwa})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400 italic">No courses enrolled</span>
                )}
              </div>

              {/* Target Grade Selector Buttons */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Select Target Semestral GWA Milestone:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {GWA_TARGET_BENCHMARKS.slice(0, 6).map((b) => (
                    <button
                      key={b.gwa}
                      onClick={() => setSimTargetGwa(b.gwa)}
                      className={cn(
                        "flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer",
                        simTargetGwa === b.gwa
                          ? "bg-sage-600 text-white border-sage-600 shadow-sm font-bold scale-[1.02]"
                          : "bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100"
                      )}
                    >
                      <span className="text-xs font-extrabold font-mono">{b.gwa}</span>
                      <span className={cn(
                        "text-[9px] font-medium leading-tight mt-0.5",
                        simTargetGwa === b.gwa ? "text-sage-100" : "text-slate-400"
                      )}>
                        {b.label.split('(')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulation Result Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Required Final Exam Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold font-mono text-slate-900">
                      {simResult.requiredExamScore} <span className="text-base text-slate-400">/ 40 pts</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Exam target equivalent to <strong>{Math.round((simResult.requiredExamScore / 40) * 100)}%</strong>
                  </p>
                </div>

                <div className="space-y-1 border-t md:border-t-0 md:border-l md:border-r border-slate-200 pt-3 md:pt-0 md:px-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target Term Milestone</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-extrabold font-mono text-slate-800">
                      {simResult.requiredFinalTermRating}%
                    </span>
                    <span className="text-xs text-slate-500 font-medium">Final Rating</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Requires Tentative Final Rating (TFR) of <strong>{simResult.requiredTfr}%</strong>
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Feasibility Verdict</span>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5",
                      simResult.difficulty === 'Easy' && "bg-emerald-100 text-emerald-800 border-emerald-200",
                      simResult.difficulty === 'Moderate' && "bg-sage-100 text-sage-800 border-sage-200",
                      simResult.difficulty === 'Challenging' && "bg-amber-100 text-amber-800 border-amber-200",
                      simResult.difficulty === 'Impossible' && "bg-rose-100 text-rose-800 border-rose-200"
                    )}>
                      {simResult.difficulty === 'Impossible' ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      {simResult.difficulty === 'Impossible' ? 'Mathematically Out of Reach' : `${simResult.difficulty} Target`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {simResult.difficulty === 'Impossible' 
                      ? "Even with 100% on Finals, target cannot be met. Select a reachable benchmark like 2.00 or 2.25."
                      : "Realistic target with focused revision and consistent assignment scores."}
                  </p>
                </div>

              </div>
              </div>
            ) : (
              <div className="hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs" aria-hidden="true">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-slate-500">
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">What-If Grade Simulator</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Available after an official Midterm Rating is posted. Released activity results support study advice, but ASPIRE will not use them to predict or display an unofficial term grade.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Deterministic Action Plan */}
            <div className="hidden" aria-hidden="true">
              <div className="flex items-center gap-2 mb-3">
                <Compass className="h-4 w-4 text-sage-600" />
                <h3 className="text-sm font-bold text-slate-900">ASPIRE Action Plan</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {advisorEvaluation.actions.length > 0 ? advisorEvaluation.actions.map((item, index) => (
                  <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-2.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-sage-700">
                      {index === 0 ? <Target className="h-4 w-4 text-sage-600" /> : index === 1 ? <BookOpen className="h-4 w-4 text-amber-600" /> : <UserCheck className="h-4 w-4 text-indigo-600" />}
                      <h4 className="text-xs font-bold uppercase tracking-wider">{index + 1}. {item.title}</h4>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">{item.description}</p>
                  </div>
                )) : (
                  <div className="md:col-span-3 rounded-xl border border-dashed border-slate-200 bg-white p-5 text-xs text-slate-500">
                    Action items will appear when released academic evidence is available.
                  </div>
                )}
              </div>
            </div>

            {/* Compact course overview; detailed evidence lives in My Courses. */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Your courses</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Open a course to review released evidence and official milestones.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setScope('subject')}
                  className="rounded-lg border border-sage-200 bg-sage-50 px-3 py-2 text-xs font-bold text-sage-700 hover:bg-sage-100 transition-colors cursor-pointer"
                >
                  View courses
                </button>
              </div>
              {subjectsList.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <BookOpen className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
                  <p className="font-semibold text-slate-600">No Enrolled Subjects Found</p>
                  <p className="text-[11px]">Enrolled courses for this academic term will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-2.5 px-3">Subject Code & Name</th>
                        <th className="py-2.5 px-3">Instructor</th>
                        <th className="py-2.5 px-3 text-center">Units</th>
                        <th className="py-2.5 px-3 text-center">Class Standing</th>
                        <th className="py-2.5 px-3 text-center">Running GWA</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {subjectsList.map((sub) => (
                        <tr key={sub.code} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-900 block">{sub.code}</span>
                            <span className="text-[11px] text-slate-400">{sub.name}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-600">{sub.instructor}</td>
                          <td className="py-3 px-3 text-center font-mono">{sub.credits}</td>
                          <td className="py-3 px-3 text-center font-mono">
                            {sub.diagnostics?.scoredActivityCount > 0 ? `${sub.diagnostics.csAvg}%` : '—'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="font-extrabold font-mono text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                              {sub.runningGwa}
                            </span>
                            {sub.milestoneStage && (
                              <span className="block text-[10px] text-slate-400 mt-1">
                                {sub.isFinalized ? `Final (${sub.milestoneStage})` : `As of ${sub.milestoneStage}`}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {sub.runningGwa !== '—' ? (
                              <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                parseFloat(sub.runningGwa) <= 1.75 ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                              )}>
                                {parseFloat(sub.runningGwa) <= 1.75 ? 'Honors Tier' : 'Passing Range'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                Ongoing
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        ) : scope === 'subject' ? (
          /* ================= SUBJECT & MILESTONE BREAKDOWN ================= */
          <div className="space-y-5 sm:space-y-6 animate-fade-in">
            
            {/* Subject Selector Tabs */}
            {subjectsList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-2xl border border-dashed border-slate-200">
                <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-sm">No Courses Available</p>
                <p className="text-xs text-slate-400 mt-1">Enroll in subjects to view course-by-course milestone breakdowns and diagnostics.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {subjectsList.map(sub => (
                    <button
                      key={sub.code}
                      onClick={() => setSelectedSubjectCode(sub.code)}
                      className={cn(
                        "px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer",
                        selectedSubjectCode === sub.code
                          ? "bg-sage-900 text-white border-sage-900 shadow-xs font-bold"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {sub.code} - {sub.name}
                    </button>
                  ))}
                </div>

                {currentSubject && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-7 space-y-6">
                    
                    {/* Course Header Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-sage-700 uppercase tracking-wider bg-sage-50 px-2 py-0.5 rounded border border-sage-200">
                          {currentSubject.credits} Academic Credits
                        </span>
                        <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
                          {currentSubject.code} — {currentSubject.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">Instructor: {currentSubject.instructor}</p>
                      </div>

                      <div className="flex items-center gap-3 sm:justify-end">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Running Course Grade</span>
                          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-sage-800">{currentSubject.runningGwa}</span>
                          {currentSubject.milestoneStage && (
                            <span className="block text-[11px] text-slate-400 mt-0.5">
                              {currentSubject.isFinalized
                                ? `Final — Semestral Grade posted`
                                : `As of ${currentSubject.milestoneStage} — not yet final`}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => openAskAspire(currentSubject.code)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-sage-700 px-3 py-2 text-xs font-bold text-white hover:bg-sage-800 transition-colors cursor-pointer"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Ask ASPIRE
                        </button>
                      </div>
                    </div>

                    {/* Released evidence remains useful before official Midterm/Final posting. */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-sage-600" />
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">Released activity evidence</h4>
                            <p className="text-[10px] text-slate-500">Used for study advice, never as an unofficial term grade.</p>
                          </div>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">
                          {currentSubject.activities?.length || 0} released
                        </span>
                      </div>

                      {currentSubject.activities?.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          {currentSubject.activities.map((activity) => (
                            <div key={activity.activity_id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold text-slate-900">{activity.title || activity.name}</p>
                                  <p className="text-[10px] text-slate-500">{activity.topic_tag || activity.term || 'Course activity'}</p>
                                </div>
                                <span className={cn(
                                  'rounded-md px-2 py-1 text-[10px] font-mono font-bold',
                                  activity.percentage === null
                                    ? 'bg-slate-100 text-slate-500'
                                    : activity.percentage < 75
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                )}>
                                  {activity.score === null ? 'Not scored' : `${activity.score}/${Number(activity.max_score)} · ${activity.percentage}%`}
                                </span>
                              </div>
                              {activity.description && <p className="text-[10px] leading-relaxed text-slate-500">{activity.description}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500">
                          No faculty-released activity result is available for this course yet.
                        </div>
                      )}
                    </div>

                    {/* Milestone Progression Selector */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Official grading milestones</span>
                      <div className="grid grid-cols-3 gap-1.5 sm:max-w-md">
                        {['midtermRating', 'tentativeFinalRating', 'semestralGrade'].map((key) => {
                          const periodData = currentSubject.periods?.[key];
                          const isAvailable = periodData && periodData.gwa !== '—';
                          return (
                            <button
                              key={key}
                              onClick={() => setSelectedPeriod(key)}
                              className={cn(
                                "p-2 rounded-xl text-center border transition-all cursor-pointer flex flex-col items-center justify-center",
                                selectedPeriod === key
                                  ? "bg-sage-600 text-white border-sage-600 shadow-xs font-bold"
                                  : "bg-slate-50 text-slate-700 border-slate-200/70 hover:bg-slate-100"
                              )}
                            >
                              <span className="text-[11px] font-bold truncate max-w-full">
                                {key === 'midtermRating' ? 'MR' : key === 'tentativeFinalRating' ? 'TFR' : key === 'semestralGrade' ? 'SG' : key.charAt(0).toUpperCase() + key.slice(1)}
                              </span>
                              <span className={cn(
                                "text-[10px] font-mono mt-0.5",
                                selectedPeriod === key ? "text-sage-100 font-bold" : isAvailable ? "text-slate-900 font-bold" : "text-slate-400"
                              )}>
                                {periodData?.gwa || '—'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Period Metrics & AI Guidance */}
                    {currentSubject.periods?.[selectedPeriod] && currentSubject.periods[selectedPeriod].gwa !== '—' ? (
                      <div className="space-y-4 pt-2">
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Numerical Rating</span>
                            <span className="text-xl font-extrabold font-mono text-slate-800 mt-1 block">
                              {currentSubject.periods[selectedPeriod].rating}%
                            </span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Transmuted GWA</span>
                            <span className="text-xl font-extrabold font-mono text-sage-700 mt-1 block">
                              {currentSubject.periods[selectedPeriod].gwa}
                            </span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Posting Status</span>
                            <span className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-1",
                              currentSubject.periods[selectedPeriod].status === 'Posted' 
                                ? "bg-emerald-100 text-emerald-800" 
                                : "bg-amber-100 text-amber-800"
                            )}>
                              {currentSubject.periods[selectedPeriod].status}
                            </span>
                          </div>
                        </div>

                        {/* Milestone AI Counselor Insight */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sage-700">
                              <BrainCircuit className="h-4 w-4" />
                              <h4 className="text-xs font-bold uppercase tracking-wider">Milestone Diagnostic Insight</h4>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={handleRegenerateCurrentInsight}
                                disabled={aiLoading}
                                className="text-[11px] font-semibold text-slate-500 hover:text-sage-600 flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw className={cn("h-3 w-3", aiLoading && "animate-spin text-sage-600")} />
                                <span className="hidden sm:inline">{aiLoading ? "Consulting..." : "Refresh"}</span>
                              </button>
                            </div>
                          </div>

                          <div className="text-xs sm:text-sm font-medium text-slate-700 leading-relaxed italic bg-slate-50 p-3.5 rounded-lg border border-slate-200/60">
                            {aiLoading && !aiCache[`${currentSubject.code}_${selectedPeriod}`] ? (
                              <div className="flex items-center gap-2 text-xs text-slate-400 not-italic">
                                <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-sage-600"></div>
                                Analyzing subject performance via AI...
                              </div>
                            ) : (
                              <p>"{aiCache[`${currentSubject.code}_${selectedPeriod}`] || currentSubject.periods[selectedPeriod].insight || 'No qualitative data compiled for this milestone.'}"</p>
                            )}
                          </div>
                        </div>

                        {/* ASPIRE v3.1: Topic Scope Coverage Diagnostic */}
                        {currentSubject.activities && currentSubject.activities.length > 0 && (
                          <div className="hidden bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3" aria-hidden="true">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-slate-800">
                                <BookOpen className="h-4 w-4 text-sage-600" />
                                <h4 className="text-xs font-bold uppercase tracking-wider">Curriculum Topic Scope &amp; Activities</h4>
                              </div>
                              <span className="text-[10px] font-bold text-slate-400">
                                {currentSubject.activities.length} Recorded Tasks
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {currentSubject.activities.map((act) => (
                                <div key={act.activity_id} className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-900">{act.title || act.name}</span>
                                    <span className="text-[10px] font-mono text-slate-500 font-semibold">{act.term}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 leading-relaxed">
                                    {act.description || 'General curriculum activity covering weekly learning competencies.'}
                                  </p>
                                  <div className="flex items-center justify-between pt-1 text-[10px]">
                                    <span className="font-semibold text-slate-400">Recorded score</span>
                                    <span className={cn(
                                      'rounded-md px-2 py-0.5 font-mono font-bold',
                                      act.percentage === null
                                        ? 'bg-slate-200 text-slate-500'
                                        : act.percentage < 75
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-emerald-100 text-emerald-800'
                                    )}>
                                      {act.score === null ? 'Not recorded' : `${act.score}/${Number(act.max_score)} · ${act.percentage}%`}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Only explicitly student-visible guidance and tasks are rendered here. */}
                        {currentSubject.latestEvaluation && (
                          <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-4 sm:p-5 space-y-3">
                            <div className="flex items-center gap-2 text-amber-900">
                              <Target className="h-4 w-4 text-amber-600" />
                              <h4 className="text-xs font-bold uppercase tracking-wider">Faculty Academic Guidance &amp; Recovery Plan</h4>
                            </div>

                            {currentSubject.latestEvaluation.shared_academic_feedback && (
                              <p className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-amber-100 leading-relaxed">
                                <strong>Faculty Academic Guidance:</strong> {currentSubject.latestEvaluation.shared_academic_feedback}
                              </p>
                            )}

                            {Array.isArray(currentSubject.latestEvaluation.advising_plan) && currentSubject.latestEvaluation.advising_plan.length > 0 && (
                              <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-amber-100 leading-relaxed">
                                <strong className="block mb-1.5">Faculty advising plan</strong>
                                <ul className="space-y-1 list-disc pl-4">
                                  {currentSubject.latestEvaluation.advising_plan.map((task, index) => (
                                    <li key={task.task_id || `${task.description}-${index}`}>
                                      {task.description}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-xs space-y-1 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <AlertCircle className="h-6 w-6 text-slate-300 mx-auto" />
                        <p className="font-semibold text-slate-600">No evaluation data encoded for {PERIODS_MAPPING[selectedPeriod]}</p>
                        <p className="text-[11px]">Milestone scores will appear once graded by your instructor.</p>
                      </div>
                    )}

                  </div>
                )}
              </>
            )}

          </div>
        ) : scope === 'progress' ? (
          <>
            {/* ================= MY PROGRESS ================= */}
            <div className="space-y-5 sm:space-y-6 animate-fade-in text-left">
              <div className="rounded-2xl border border-sage-800 bg-gradient-to-r from-sage-950 via-slate-900 to-sage-900 p-5 text-white shadow-md sm:p-6">
                <span className="rounded-md border border-sage-700/50 bg-sage-800/60 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-sage-300">
                  Follow-through
                </span>
                <h3 className="mt-2 text-xl font-extrabold font-display tracking-tight sm:text-2xl">My Progress</h3>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-300">
                  Track the actions you completed and know exactly when ASPIRE will review your evidence again.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Actions completed</span>
                  <span className="mt-1 block font-mono text-2xl font-extrabold text-slate-900">
                    {completedCurrentActionCount}/{advisorEvaluation.actions.length}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Released evidence</span>
                  <span className="mt-1 block font-mono text-2xl font-extrabold text-slate-900">{releasedScoredActivityCount}</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Current advisor state</span>
                  <span className="mt-1 block text-sm font-bold capitalize text-slate-900">{advisorEvaluation.state.replaceAll('_', ' ')}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
                <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Current action checklist</h4>
                    <p className="mt-0.5 text-[11px] text-slate-500">These actions come from the same evidence shown on Today.</p>
                  </div>
                  <span className="rounded-full border border-sage-200 bg-sage-50 px-2.5 py-1 text-[10px] font-bold capitalize text-sage-700">
                    Review: {advisorEvaluation.reviewTrigger.replaceAll('_', ' ')}
                  </span>
                </div>

                {advisorEvaluation.actions.length > 0 ? (
                  <div className="mt-4 space-y-2.5">
                    {advisorEvaluation.actions.map((item) => {
                      const isComplete = completedActionIds.includes(getAdvisorActionKey(item));
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleAdvisorAction(item)}
                          className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-left transition-colors hover:bg-slate-100 cursor-pointer"
                        >
                          <span className={cn(
                            'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border',
                            isComplete ? 'border-sage-600 bg-sage-600 text-white' : 'border-slate-300 bg-white text-slate-400'
                          )}>
                            {isComplete && <CheckCircle2 className="h-3.5 w-3.5" />}
                          </span>
                          <span>
                            <span className={cn('block text-xs font-bold text-slate-900', isComplete && 'line-through text-slate-500')}>{item.title}</span>
                            <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{item.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-xs text-slate-500">
                    Your progress plan will begin when faculty release academic evidence that supports a specific next step.
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-500">Need help with an action or your official record?</p>
                  <button
                    type="button"
                    onClick={() => openAskAspire(null)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sage-700 px-3 py-2 text-xs font-bold text-white hover:bg-sage-800 transition-colors cursor-pointer"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Ask ASPIRE
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}

      </div>
      <AskAspirePanel
        open={askAspireOpen}
        context={askAspireContext}
        onClose={() => setAskAspireOpen(false)}
        onRequestConsultation={openConsultationFromAskAspire}
      />

      {/* Unified Info Modal */}
      {infoModalType && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Info className="h-5 w-5 text-sage-600" />
                {infoModalType === 'gwa' && 'Tentative Cumulative GWA'}
                {infoModalType === 'pl' && 'President\'s List Standing'}
              </h3>
              <button 
                onClick={() => setInfoModalType(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm text-slate-600 text-left">
              {infoModalType === 'gwa' && (
                <p>This is your overall <strong>Tentative Cumulative GWA</strong> based on currently posted grades. Because some professors post grades earlier than others, this represents a provisional snapshot of your standing and may fluctuate as more grades are finalized.</p>
              )}
              {infoModalType === 'pl' && (
                <p>Your current projected eligibility for honors. Note that this is a <strong>tentative</strong> status based only on grades submitted so far and does not become official until all professors have completely finalized grades for the term.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
