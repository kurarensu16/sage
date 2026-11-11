import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  Award, 
  BrainCircuit, 
  ChevronRight, 
  ArrowRight,
  ListTodo,
  CheckCircle2,
  Lock,
  Info,
  Clock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getCachedData, setCachedData } from '../../lib/dataCache';
import { DashboardSkeleton } from '../../components/common/Skeleton';
import { findMostAdvancedPostedGrade } from '../../lib/gradeMilestones';
import { computeAcademicVerdict, countFdaSubjects, getGwaBand, resolveOfficialGwa } from '../../lib/academicPolicy';
import { loadStudentRunningGrades, RUNNING_GRADE_BASIS } from '../../lib/studentRunningGrade';
import { isStudentVisibleEvaluation } from '../../lib/evaluationTracking';
import { formatClassSchedule, NO_SCHEDULE_TEXT } from '../../lib/classSchedule';
import {
  createPostedMilestoneKey,
  shouldAutoRegenerateOverallInsight,
} from '../../lib/insightFreshness';

// Helper to check pending advising tasks.
//
// An evaluation ends when its grading period is finalized (20261103090600), or
// at the rollover for anything never finalized (20261103092900). From that
// moment the database refuses every write to it: the student cannot tick a task
// and the instructor cannot verify one.
//
// This counter did not know that. It counted unticked tasks on CLOSED plans as
// pending, so a student whose Prelim was finalized kept being told to complete
// work the system would reject -- "3 PENDING" against a plan that can never
// reach zero.
//
// closure_state IS NULL is the one test for "still open", the same one
// FacultyAdvisingInbox.jsx uses to decide whether to render live checkboxes.
const checkPendingAdvisingTasks = async (studentId) => {
  try {
    const { data: evals } = await supabase
      .from('student_risk_evaluations')
      .select('evaluation_id, advising_plan, evaluation_context, shared_academic_feedback, status, published_to_student_at, created_at, closure_state, term')
      .eq('student_id', studentId)
      .in('status', ['submitted', 'acknowledged_by_student'])
      .not('published_to_student_at', 'is', null)
      .order('created_at', { ascending: false });

    const visibleEvaluations = (evals || []).filter(isStudentVisibleEvaluation);
    if (visibleEvaluations.length === 0) {
      return { pendingCount: 0, latestPlan: null, closedUnfinishedTerm: null };
    }

    const openEvaluations = visibleEvaluations.filter(ev => !ev.closure_state);

    let pendingCount = 0;
    openEvaluations.forEach(ev => {
      const items = Array.isArray(ev.advising_plan) ? ev.advising_plan : [];
      pendingCount += items.filter(item => !item.completed).length;
    });

    // A plan that closed with work outstanding must not be reported as
    // "all tasks completed". Saying so to a student who did not finish is both
    // untrue and the opposite of the record the instructor kept.
    const closedUnfinished = visibleEvaluations.find(ev => ev.closure_state === 'unfinished');

    return {
      pendingCount,
      latestPlan: visibleEvaluations[0],
      closedUnfinishedTerm: closedUnfinished?.term || null
    };
  } catch {
    return { pendingCount: 0, latestPlan: null, closedUnfinishedTerm: null };
  }
};

const NO_INSIGHT_SUMMARY = 'No AI guidance yet. Open Academic Insights to generate it from your recorded scores.';

// computeAcademicVerdict values -> card labels (same mapping the saved insights use).
const VERDICT_LABELS = {
  continue: 'Safe',
  at_risk: 'Struggling',
  recommend_shift: 'At Risk'
};

const AI_STANDING_SUBTITLES = {
  Safe: 'Low risk',
  Struggling: 'Moderate risk',
  'At Risk': 'High risk',
  'No data yet': 'Awaiting recorded scores',
  Checking: 'Validating evidence'
};

// Line under the GWA value; the Tentative/Official pill carries the status.
const getGwaStatusLine = (summary, standing) => {
  if (!summary || summary.basis === RUNNING_GRADE_BASIS.NO_DATA) return 'No scores recorded yet';
  if (summary.basis === RUNNING_GRADE_BASIS.OFFICIAL) return standing;
  if (summary.hasPostedTfr) return 'Awaiting Semestral Grade';
  if (summary.hasPostedMr) return 'Midterm Rating posted · later terms live';
  return 'No grades posted yet';
};

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState(null);
  const [activeTerm, setActiveTerm] = useState(null);
  const [enrolledSubjects, setEnrolledSubjects] = useState([]);
  const [currentGwa, setCurrentGwa] = useState('—');
  const [gwaStanding, setGwaStanding] = useState('No grades posted yet');
  const [gwaSummary, setGwaSummary] = useState(null);
  const [pendingAdvisingCount, setPendingAdvisingCount] = useState(0);
  const [latestAdvisingPlan, setLatestAdvisingPlan] = useState(null);
  // The term of a plan that closed with work outstanding, or null. Drives an
  // honest message instead of congratulating a student who did not finish.
  const [closedUnfinishedTerm, setClosedUnfinishedTerm] = useState(null);
  const [insightVerdict, setInsightVerdict] = useState('No data yet');
  const [insightVerdictTentative, setInsightVerdictTentative] = useState(false);
  const [insightSummary, setInsightSummary] = useState(NO_INSIGHT_SUMMARY);
  const [infoModalType, setInfoModalType] = useState(null); // 'gwa', 'subjects', 'tasks', 'ai'

  useEffect(() => {
    async function loadDashboardData() {
      if (!user || !profile) return;
      
      const cacheKey = `student_dashboard_${user.id}`;
      const cached = getCachedData(cacheKey, 120000);
      if (cached) {
        setSection(cached.section);
        setActiveTerm(cached.activeTerm);
        setEnrolledSubjects(cached.enrolledSubjects);
        setCurrentGwa(cached.currentGwa);
        setGwaStanding(cached.gwaStanding);
        setGwaSummary(cached.gwaSummary || null);
        setPendingAdvisingCount(cached.pendingAdvisingCount || 0);
        setLatestAdvisingPlan(cached.latestAdvisingPlan || null);
        setClosedUnfinishedTerm(cached.closedUnfinishedTerm || null);
        // Cached academic facts (including the deterministic verdict) may render
        // immediately, but AI text is withheld until its evidence fingerprint is
        // revalidated against current records.
        setInsightVerdict(cached.insightVerdict || 'Checking');
        setInsightVerdictTentative(Boolean(cached.insightVerdictTentative));
        setInsightSummary('Validating the latest academic evidence...');
        setLoading(false);
      }

      try {
        // 1. Fetch active academic term
        const { data: termData } = await supabase
          .from('academic_terms')
          .select('term_id, school_year, semester')
          .eq('is_active', true)
          .maybeSingle();

        setActiveTerm(termData || null);

        // 2. Fetch student's enrollments
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select('subject_id, section_id, status, subjects(*), sections(*)')
          .eq('student_id', user.id);

        // Determine activeSectionId
        const activeSectionId = profile.section_id || (enrolls && enrolls.length > 0 ? enrolls[0].section_id : null);

        // 3. Fetch section details
        let resolvedSection = null;
        if (activeSectionId) {
          const { data: secData } = await supabase
            .from('sections')
            .select('*')
            .eq('section_id', activeSectionId)
            .maybeSingle();
          resolvedSection = secData || null;
          setSection(resolvedSection);
        }

        // 4. Class records for the ACTIVE TERM ONLY, to pair with enrollments.
        //
        // This used to fetch every class_record with status = 'active' and no
        // term filter at all. That was wrong the moment a term rolled over,
        // because perform_semester_transition deliberately leaves last term's
        // classes active while their Semestral Grade is still outstanding
        // (the sg_grace_days window). Those classes matched the student's old
        // enrollments, so after the rollover the dashboard kept showing last
        // semester's four subjects, twelve units and running GWA under a banner
        // that read "Second Sem".
        //
        // The same status = 'active' that correctly means "still owed" on the
        // faculty class list means "still mine this term" here, and only one of
        // those readings is right for a student. The term decides.
        //
        // Two queries rather than one .or(): term_id is null on rows created
        // before it was recorded, and the rollover only backfills the two terms
        // it touches. Same shape as ClassRecordsList.jsx.
        const classSelect = `
            class_record_id,
            subject_id,
            section_id,
            status,
            term_id,
            school_year,
            semester,
            meeting_days,
            start_time,
            end_time,
            rooms ( code ),
            faculty:users!faculty_id ( first_name, last_name )
          `;
        const [currentTermClasses, legacyTermClasses] = await Promise.all([
          termData?.term_id
            ? supabase.from('class_records').select(classSelect)
                .eq('status', 'active').eq('term_id', termData.term_id)
            : Promise.resolve({ data: [] }),
          termData?.school_year
            ? supabase.from('class_records').select(classSelect)
                .eq('status', 'active').is('term_id', null)
                .eq('school_year', termData.school_year)
                .eq('semester', termData.semester)
            : Promise.resolve({ data: [] })
        ]);
        const allClassRecs = [
          ...(currentTermClasses.data || []),
          ...(legacyTermClasses.data || [])
        ];

        // 5. Fetch Posted Grades
        const { data: posted } = await supabase
          .from('posted_grades')
          .select('*')
          .eq('student_id', user.id);

        const postedRowsByClass = {};
        (posted || []).forEach(p => {
          if (!postedRowsByClass[p.class_record_id]) postedRowsByClass[p.class_record_id] = [];
          postedRowsByClass[p.class_record_id].push(p);
        });
        const postedMap = Object.fromEntries(
          Object.entries(postedRowsByClass).map(([classId, rows]) => [
            classId,
            findMostAdvancedPostedGrade(rows)
          ])
        );

        // 6. Map the student's enrollments to this term's class records.
        //
        // Enrollments are not term-stamped -- they point at a subject and a
        // section, and sections are per-term. So an enrollment only belongs to
        // this term if a class record for it exists in this term. Rows that find
        // no match are last term's and are dropped, rather than rendered as a
        // subject with no instructor and no grade.
        const activeEnrolled = (enrolls || []).map(e => {
          const matchingClass = (allClassRecs || []).find(
            cr => cr.subject_id === e.subject_id && cr.section_id === e.section_id
          );
          if (!matchingClass) return null;
          const classRecId = matchingClass.class_record_id;
          const pGrade = classRecId ? postedMap[classRecId] : null;

          return {
            class_record_id: classRecId,
            code: e.subjects?.code || 'SUBJ',
            name: e.subjects?.name || 'Subject Name',
            credits: Number(e.subjects?.units || 0),
            professor: matchingClass?.faculty ? `Prof. ${matchingClass.faculty.first_name} ${matchingClass.faculty.last_name}` : 'Faculty Instructor',
            schedule: formatClassSchedule({
              days: matchingClass?.meeting_days,
              startTime: matchingClass?.start_time,
              endTime: matchingClass?.end_time,
              room: matchingClass?.rooms?.code
            }),
            grade: pGrade ? resolveOfficialGwa(pGrade).gwa : null,
            status: pGrade ? 'Grades Posted' : 'Active'
          };
        }).filter(Boolean);

        setEnrolledSubjects(activeEnrolled);

        // 7. Running GWA: posted milestones first, unposted terms live (Tentative)
        const resolvedGwaSummary = await loadStudentRunningGrades(
          user.id,
          activeEnrolled.map(item => item.class_record_id)
        )
          .then(result => result.summary)
          .catch(err => {
            console.error('Error loading running GWA:', err);
            return null;
          });
        const resolvedGwa = resolvedGwaSummary?.gwa != null ? resolvedGwaSummary.gwa.toFixed(2) : '—';
        const resolvedStanding = resolvedGwaSummary?.gwa != null
          ? getGwaBand(resolvedGwaSummary.gwa)?.label || 'Academic warning'
          : 'No grades posted yet';
        setCurrentGwa(resolvedGwa);
        setGwaStanding(resolvedStanding);
        setGwaSummary(resolvedGwaSummary);

        // 8. ASPIRE v3.1: Check Pending Faculty Advising & Action Items
        const {
          pendingCount: resolvedPendingCount,
          latestPlan: resolvedLatestPlan,
          closedUnfinishedTerm: resolvedClosedUnfinishedTerm
        } = await checkPendingAdvisingTasks(user.id);
        setPendingAdvisingCount(resolvedPendingCount);
        setLatestAdvisingPlan(resolvedLatestPlan);
        setClosedUnfinishedTerm(resolvedClosedUnfinishedTerm);

        // 9. Academic Insights: the saved AI text is kept until a grade is posted;
        // attendance feeds the live AI Standing verdict.
        const classRecordIds = activeEnrolled.map(item => item.class_record_id).filter(Boolean);
        const currentPostedGrades = (posted || []).filter(item => classRecordIds.includes(item.class_record_id));

        const [
          { data: insightAttendance },
          { data: insightData },
        ] = await Promise.all([
          supabase
            .from('attendance_records')
            .select('*')
            .eq('student_id', user.id),
          supabase
            .from('student_academic_insights')
            .select('*')
            .eq('student_id', user.id)
            .order('generated_at', { ascending: false })
            .limit(1),
        ]);

        // AI Standing: the verdict is the deterministic rule shared with the AI Study
        // Tutor, computed live from the running GWA and per-subject FDA recommendation (no AI call).
        // Only the explanation text comes from the latest saved AI insight.
        const currentAttendance = (insightAttendance || [])
          .filter(record => classRecordIds.includes(record.class_record_id));
        const hasFdaSubject = countFdaSubjects(currentAttendance) > 0;
        const resolvedVerdict = resolvedGwaSummary?.gwa == null && !hasFdaSubject
          ? 'No data yet'
          : VERDICT_LABELS[computeAcademicVerdict({ gwa: resolvedGwaSummary?.gwa ?? null, hasFdaSubject })];
        const resolvedVerdictTentative = resolvedVerdict !== 'No data yet' && !resolvedGwaSummary?.isOfficial;

        // Same rule as Academic Insights: the saved insight stays until a grade is
        // posted (or its format changes); newer scores alone wait for a manual Refresh.
        let resolvedSummary = NO_INSIGHT_SUMMARY;
        if (insightData && insightData.length > 0) {
          const latest = insightData[0];
          const isUsable = !shouldAutoRegenerateOverallInsight(latest, createPostedMilestoneKey(currentPostedGrades));
          resolvedSummary = isUsable
            ? latest.summary
            : 'A grade was posted since your last AI guidance. Open Academic Insights to update it.';
        }
        setInsightVerdict(resolvedVerdict);
        setInsightVerdictTentative(resolvedVerdictTentative);
        setInsightSummary(resolvedSummary);

        // Store in cache
        setCachedData(cacheKey, {
          section: resolvedSection,
          activeTerm: termData || null,
          enrolledSubjects: activeEnrolled,
          currentGwa: resolvedGwa,
          gwaStanding: resolvedStanding,
          gwaSummary: resolvedGwaSummary,
          pendingAdvisingCount: resolvedPendingCount,
          latestAdvisingPlan: resolvedLatestPlan,
          closedUnfinishedTerm: resolvedClosedUnfinishedTerm,
          insightVerdict: resolvedVerdict,
          insightVerdictTentative: resolvedVerdictTentative,
          insightSummary: resolvedSummary
        });

      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [user, profile]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const termLabel = activeTerm
    ? `AY ${activeTerm.school_year} • ${activeTerm.semester === '1st' ? 'First' : activeTerm.semester === '2nd' ? 'Second' : activeTerm.semester} Sem`
    : section 
      ? `AY ${section.school_year} • ${section.semester === '1st' ? 'First' : section.semester === '2nd' ? 'Second' : section.semester} Sem`
      : 'AY 2025–2026 • Second Sem';

  const totalCredits = enrolledSubjects.reduce((sum, sub) => sum + sub.credits, 0);

  return (
    <>
      <PageHeader title="Student Overview" breadcrumb="Student Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Welcome Banner Hero */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-4 sm:p-6 md:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
          <div className="space-y-1.5 sm:space-y-2 min-w-0 flex-1">
            <span className="inline-flex items-center px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-sage-700/50 text-sage-100 border border-sage-600/30 whitespace-nowrap">
              Academic Term: {termLabel}
            </span>
            <h1 className="text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight font-display leading-tight">
              Welcome Back, {profile?.first_name || 'Student'}!
            </h1>
            <p className="text-xs sm:text-sm text-sage-200/90 max-w-xl leading-relaxed">
              Track your real-time academic progress, review faculty intervention checklists, and explore Academic Insights.
            </p>
          </div>
          
          <div className="flex w-full md:w-auto flex-shrink-0">
            <Link 
              to="/student/mygradeslist" 
              className="w-full md:w-auto justify-center px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-md flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Award className="h-4 w-4" /> View Grade Report
            </Link>
          </div>
        </div>

        {/* ASPIRE v3.1: Faculty Intervention Checklist Alert Banner */}
        {pendingAdvisingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-sm">
            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-700 flex-shrink-0 mt-0.5 sm:mt-0">
                <ListTodo className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-xs sm:text-sm font-display text-amber-950 flex items-center gap-1.5">
                  <span>Action Items Awaiting Completion</span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.2 rounded-full font-mono font-extrabold">
                    {pendingAdvisingCount}
                  </span>
                </h4>
                <p className="text-[11px] sm:text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Your professor has created a tailored intervention and recovery plan. Complete your assigned learning tasks to improve your academic standing.
                </p>
              </div>
            </div>
            <Link
              to="/student/advising-inbox"
              className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm cursor-pointer flex-shrink-0"
            >
              Open Advising Tasks <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
          
          {/* Stat 1: Current GWA */}
          <div className="bg-white p-3 sm:p-5 md:p-6 rounded-2xl border border-slate-200/90 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-micro sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 truncate">
                {gwaSummary?.isOfficial ? 'Official GWA' : 'Current Running GWA'}
                <button onClick={() => setInfoModalType('gwa')} className="text-slate-400 hover:text-sage-600 transition-colors" aria-label="What does this mean?">
                  <Info className="h-3 w-3" />
                </button>
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 min-w-0">
                <h3 className="text-lg sm:text-2xl md:text-3xl font-extrabold text-slate-900 font-mono truncate">{currentGwa}</h3>
                {currentGwa !== '—' && (
                  <span className={`px-1.5 sm:px-2 py-0.5 rounded-full border text-micro sm:text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${
                    gwaSummary?.isOfficial
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {gwaSummary?.isOfficial ? 'Official' : 'Tentative'}
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate" title={getGwaStatusLine(gwaSummary, gwaStanding)}>
                {getGwaStatusLine(gwaSummary, gwaStanding)}
              </p>
            </div>
            <div className="p-2 sm:p-2.5 md:p-3 bg-sage-50 text-sage-600 rounded-xl flex-shrink-0 mt-0.5">
              <Award className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          {/* Stat 2: Enrolled Subjects */}
          <div className="bg-white p-3 sm:p-5 md:p-6 rounded-2xl border border-slate-200/90 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-micro sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 truncate">
                Subjects
                <button onClick={() => setInfoModalType('subjects')} className="text-slate-400 hover:text-sage-600 transition-colors" aria-label="What does this mean?">
                  <Info className="h-3 w-3" />
                </button>
              </span>
              <h3 className="text-lg sm:text-2xl md:text-3xl font-extrabold text-slate-900 font-mono mt-0.5 sm:mt-1 truncate">
                {enrolledSubjects.length < 10 ? `0${enrolledSubjects.length}` : enrolledSubjects.length}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">{totalCredits} units total</p>
            </div>
            <div className="p-2 sm:p-2.5 md:p-3 bg-sage-50 text-sage-600 rounded-xl flex-shrink-0 mt-0.5">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          {/* Stat 3: Advising Tasks (Replacing obsolete Eval Clearance) */}
          <div className="bg-white p-3 sm:p-5 md:p-6 rounded-2xl border border-slate-200/90 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-micro sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 truncate">
                Action Tasks
                <button onClick={() => setInfoModalType('tasks')} className="text-slate-400 hover:text-sage-600 transition-colors" aria-label="What does this mean?">
                  <Info className="h-3 w-3" />
                </button>
              </span>
              {/* Three outcomes, not two. A plan that closed with work
                  outstanding is neither "pending" (nothing can be ticked any
                  more) nor "cleared" (the student did not finish). */}
              <h3 className={`text-lg sm:text-2xl md:text-3xl font-extrabold font-mono mt-0.5 sm:mt-1 truncate ${
                pendingAdvisingCount > 0
                  ? 'text-amber-700'
                  : closedUnfinishedTerm ? 'text-slate-600' : 'text-emerald-700'
              }`}>
                {pendingAdvisingCount > 0
                  ? `${pendingAdvisingCount} PENDING`
                  : closedUnfinishedTerm ? 'CLOSED' : 'CLEARED'}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">
                {pendingAdvisingCount > 0
                  ? 'Intervention tasks active'
                  : closedUnfinishedTerm
                  ? `${closedUnfinishedTerm} period finalized`
                  : 'All tasks up to date'}
              </p>
            </div>
            <div className={`p-2 sm:p-2.5 md:p-3 rounded-xl flex-shrink-0 mt-0.5 ${
              pendingAdvisingCount > 0
                ? 'bg-amber-50 text-amber-600'
                : closedUnfinishedTerm ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {/* A padlock, not a tick: the plan is shut, not satisfied. */}
              {pendingAdvisingCount > 0
                ? <ListTodo className="h-4 w-4 sm:h-5 sm:w-5" />
                : closedUnfinishedTerm
                ? <Lock className="h-4 w-4 sm:h-5 sm:w-5" />
                : <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />}
            </div>
          </div>

          {/* Stat 4: Academic Insight */}
          <div className="bg-white p-3 sm:p-5 md:p-6 rounded-2xl border border-slate-200/90 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-micro sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 truncate">
                AI Standing
                <button onClick={() => setInfoModalType('ai')} className="text-slate-400 hover:text-sage-600 transition-colors" aria-label="What does this mean?">
                  <Info className="h-3 w-3" />
                </button>
              </span>
              {/* Smaller than the other stat values so labels like "Struggling" are not cut off. */}
              <h3 className={`text-base sm:text-xl md:text-2xl font-extrabold font-mono mt-1 sm:mt-1.5 truncate ${
                insightVerdict === 'Safe' ? 'text-emerald-600'
                  : insightVerdict === 'At Risk' ? 'text-rose-600'
                  : insightVerdict === 'Struggling' ? 'text-amber-600'
                  : 'text-slate-500'
              }`} title={insightVerdict}>
                {insightVerdict}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">
                {AI_STANDING_SUBTITLES[insightVerdict] || 'Open Academic Insights'}
                {insightVerdictTentative ? ' · tentative' : ''}
              </p>
            </div>
            <div className={`p-2 sm:p-2.5 md:p-3 rounded-xl flex-shrink-0 mt-0.5 ${
              insightVerdict === 'Safe' ? 'bg-emerald-50 text-emerald-600'
                : insightVerdict === 'At Risk' ? 'bg-rose-50 text-rose-600'
                : insightVerdict === 'Struggling' ? 'bg-amber-50 text-amber-600'
                : 'bg-slate-50 text-slate-500'
            }`}>
              <BrainCircuit className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          {/* Active Enrolled Classes */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold font-display text-slate-900">Enrolled Subjects</h3>
                <p className="text-xs text-slate-500">Overview of courses and instructors for the current term.</p>
              </div>
              <Link to="/student/mygradeslist" className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-1 self-start sm:self-auto whitespace-nowrap">
                View Detailed Grades <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {enrolledSubjects.map((sub) => (
                <div key={sub.class_record_id} className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 hover:border-sage-300 transition-all bg-slate-50/50 flex flex-col justify-between min-h-[8.5rem]">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold font-mono text-slate-400 truncate min-w-0 flex-1">{sub.code}</span>
                      {sub.status === 'Grades Posted' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex-shrink-0 whitespace-nowrap">
                          {sub.grade} Posted
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 flex-shrink-0 whitespace-nowrap">
                          Active
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-xs sm:text-sm text-slate-900 mt-1.5 line-clamp-2 leading-snug">{sub.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{sub.professor}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 text-[10px]">
                      <Clock className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      {sub.schedule
                        ? <span className="font-mono text-slate-600 truncate">{sub.schedule}</span>
                        : <span className="text-slate-400">{NO_SCHEDULE_TEXT}</span>}
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold border-t border-slate-200/60 pt-2 mt-2">
                    <span>{sub.credits} Credit Units</span>
                    <Link to={`/student/mygradesdetail?id=${sub.class_record_id}`} className="text-sage-600 hover:text-sage-700 flex items-center gap-0.5">
                      Card Details <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
              {enrolledSubjects.length === 0 && (
                // The ordinary state right after a rollover, not a fault: the
                // new term's classes do not exist until instructors create them.
                // Saying so, and pointing at where last term's records live,
                // stops it reading as lost data.
                <div className="col-span-1 sm:col-span-2 text-center py-8 space-y-2">
                  <p className="text-sm text-slate-500">
                    No subjects yet for {activeTerm ? `${activeTerm.school_year} · ${activeTerm.semester} Semester` : 'this term'}.
                  </p>
                  <p className="text-xs text-slate-400">
                    They appear once your instructors set up their classes. Previous terms stay in your Grade Report.
                  </p>
                  <Link to="/student/mygradeslist" className="inline-flex items-center gap-1 text-xs font-bold text-sage-600 hover:underline">
                    Open Grade Report <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Quick-look Widgets */}
          <div className="space-y-4 sm:space-y-6">
            
            {/* Academic Insights alert */}
            <div className={`${insightVerdict === 'Safe' ? 'bg-emerald-50/40 border-emerald-100' : insightVerdict === 'At Risk' ? 'bg-rose-50/40 border-rose-100' : 'bg-amber-50/40 border-amber-100'} border rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-4`}>
              <div className="flex items-center gap-2">
                <BrainCircuit className={`h-4 w-4 sm:h-5 sm:w-5 ${insightVerdict === 'Safe' ? 'text-emerald-600' : insightVerdict === 'At Risk' ? 'text-rose-600' : 'text-amber-600'}`} />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Academic Insights</h3>
                <button onClick={() => setInfoModalType('insights')} className="text-slate-400 hover:text-sage-600 transition-colors" aria-label="How do I update my academic insights?">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-650 leading-relaxed font-medium whitespace-pre-line">
                {insightSummary}
              </p>
              <Link 
                to="/student/academic-insights" 
                className={`inline-flex items-center gap-1 text-xs font-bold ${insightVerdict === 'Safe' ? 'text-emerald-700 hover:text-emerald-850' : insightVerdict === 'At Risk' ? 'text-rose-700 hover:text-rose-850' : 'text-amber-700 hover:text-amber-850'} hover:underline`}
              >
                View Insights <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* ASPIRE Advising Inbox Widget */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 sm:h-5 sm:w-5 text-sage-600" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Faculty Action Plans</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {pendingAdvisingCount > 0
                  ? `You have ${pendingAdvisingCount} pending action item(s) prescribed by your course instructors.`
                  : closedUnfinishedTerm
                  ? `Your ${closedUnfinishedTerm} action plan closed when the grading period was finalized. It stays on record as it was, and nothing further is required.`
                  : latestAdvisingPlan
                  ? 'All prescribed intervention tasks have been completed. Great job keeping your recovery on track!'
                  : 'No active academic intervention plans currently prescribed for this semester.'}
              </p>
              <Link to="/student/advising-inbox" className="inline-flex items-center gap-1 text-xs font-bold text-sage-600 hover:underline">
                Open Advising Inbox <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

          </div>

        </div>

      </div>

      {/* Unified Info Modal */}
      {infoModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {infoModalType === 'ai' ? <BrainCircuit className="h-5 w-5 text-sage-600" /> : <Info className="h-5 w-5 text-sage-600" />}
                {infoModalType === 'gwa' && (gwaSummary?.isOfficial ? 'Official GWA' : 'Current Running GWA (Tentative)')}
                {infoModalType === 'subjects' && 'Enrolled Subjects'}
                {infoModalType === 'tasks' && 'Action Tasks'}
                {infoModalType === 'ai' && 'AI Standing Predictions'}
                {infoModalType === 'insights' && 'Academic Insights'}
              </h3>
              <button 
                onClick={() => setInfoModalType(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm text-slate-600">
              {infoModalType === 'gwa' && (gwaSummary?.isOfficial ? (
                <p>This is your <strong>Official GWA</strong>: the average of the Semestral Grades your instructors have posted for every enrolled subject this term.</p>
              ) : (
                <>
                  <p>This is your GWA computed live from the scores your instructors have recorded so far, using each subject's official grading template (COG). It is <strong>not an official grade</strong>.</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>Posted grades come first.</strong> Once a Midterm Rating, Tentative Final Rating, or Semestral Grade is posted, ASPIRE uses that posted grade instead of the live estimate. If your instructor corrects a score after posting, your posted grade updates when they repost.</li>
                    <li>
                      <strong>Blank activities are not counted yet.</strong> If an activity still has no score when your instructor posts grades, it may be recorded as zero, which can lower your official grade.
                      {gwaSummary?.blankActivityCount > 0 && (
                        <span className="block mt-1 font-semibold text-amber-700">
                          {gwaSummary.blankActivityCount} {gwaSummary.blankActivityCount === 1 ? 'activity still has' : 'activities still have'} no score.
                        </span>
                      )}
                    </li>
                    <li>This number changes as new scores are recorded. Use it to see where you stand early and to ask Academic Insights what to improve.</li>
                  </ul>
                  <p>When every subject's Semestral Grade is posted, this card shows your <strong>Official GWA</strong>.</p>
                </>
              ))}
              {infoModalType === 'insights' && (
                <>
                  <p>This is a short AI explanation of your current standing and what to do next. It is advisory and does not change your grades.</p>
                  <div>
                    <p className="font-semibold text-slate-800">When it updates</p>
                    <ul className="list-disc pl-5 space-y-1 mt-1">
                      <li>It is created automatically the first time you open <strong>Academic Insights</strong>.</li>
                      <li>It updates automatically when your instructor <strong>posts a grade</strong> (Midterm Rating, Tentative Final Rating, or Semestral Grade).</li>
                      <li>New activity scores do <strong>not</strong> update it automatically.</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">To update it yourself</p>
                    <ol className="list-decimal pl-5 space-y-1 mt-1">
                      <li>Click <strong>View Insights</strong> (or open <strong>Academic Insights</strong> in the sidebar).</li>
                      <li>On the <strong>Today</strong> tab, find <strong>Proactive academic guidance</strong>.</li>
                      <li>Click <strong>Refresh</strong>.</li>
                      <li>Return to the dashboard to see the new insight.</li>
                    </ol>
                  </div>
                </>
              )}
              {infoModalType === 'subjects' && (
                <p>The total number of active subjects and enrolled units you are taking this semester. Only subjects marked as 'Active' or 'Grades Posted' contribute to your GWA.</p>
              )}
              {infoModalType === 'tasks' && (
                <p>These are pending <strong>faculty advising interventions</strong> that require your attention. If you are marked as "CLEARED," you have no immediate required actions. If "PENDING," please check Faculty Action Plans below for details.</p>
              )}
              {infoModalType === 'ai' && (
                <>
                  <p>Your standing is computed live from your <strong>running GWA</strong> and your <strong>absences in each subject</strong>, using the same rule as <strong>Academic Insights</strong>. It is marked <em>tentative</em> until your Semestral Grades are posted. Open Academic Insights for a written explanation.</p>
                  
                  <div className="space-y-3 mt-4">
                    <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl flex gap-3">
                      <div className="text-emerald-600 font-bold w-20 shrink-0">Safe</div>
                      <div>Low risk. You are on track to safely pass your currently enrolled subjects.</div>
                    </div>
                    
                    <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl flex gap-3">
                      <div className="text-amber-600 font-bold w-20 shrink-0">Struggling</div>
                      <div>Moderate risk. Warning signs detected (e.g., failing exam or frequent absences). Proactive intervention is recommended.</div>
                    </div>
                    
                    <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl flex gap-3">
                      <div className="text-rose-600 font-bold w-20 shrink-0">At Risk</div>
                      <div>Urgent alert. The AI predicts significant difficulty in your current path. We strongly recommend scheduling a consultation with your academic adviser to discuss support options.</div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setInfoModalType(null)}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
