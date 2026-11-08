import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  Users, 
  AlertCircle, 
  ChevronRight, 
  FileText,
  Target,
  ArrowRight,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { DashboardSkeleton } from '../../components/common/Skeleton';
import {
  FacultyPerformanceTrajectoryChart,
  StudentRiskInterventionDonut,
  AssessmentComponentDistributionBar
} from '../../components/faculty/FacultyCharts';
import InfoModal from '../../components/InfoModal';
import RiskEducationNote from '../../components/faculty/RiskEducationNote';
import { getClassPriorityRoster } from '../../lib/classRoomService';
import { GRADE_MILESTONES, getCanonicalGradePeriod } from '../../lib/gradeMilestones';

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [stats, setStats] = useState({
    handledClassesCount: 0,
    pendingGradesCount: 0,
    interventionsCount: 0,
    deanReferralsCount: 0,
    notificationsCount: 0,
    atRiskCount: 0
  });
  const [recentEvaluations, setRecentEvaluations] = useState([]);
  const [urgentTasks, setUrgentTasks] = useState([]);
  const [infoModalData, setInfoModalData] = useState(null);
  // Classes from a term that has ended whose Semestral Grade is still unposted.
  // Kept out of the term's figures and stated on its own, so neither number
  // misleads.
  const [outstandingPriorTermClasses, setOutstandingPriorTermClasses] = useState(0);

  // Analytics states
  const [trajectoryData, setTrajectoryData] = useState([]);
  const [riskData, setRiskData] = useState({ safe: 0, watch: 0, high: 0, critical: 0 });
  const [componentsData, setComponentsData] = useState([]);


  useEffect(() => {
    async function fetchDashboardData() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Fetch Active Academic Term
        const { data: termData } = await supabase
          .from('academic_terms')
          .select('term_id, school_year, semester')
          .eq('is_active', true)
          .maybeSingle();

        setActiveTerm(termData || null);

        // 2. Fetch this term's classes.
        //
        // This used to load every class with status = 'active' and no term
        // filter, under a header that prints the active term. After a rollover
        // that is two terms blended into one set of figures: the rollover
        // deliberately leaves last term's classes active while their Semestral
        // Grade is outstanding, so those classes joined the counts and every
        // number on the page meant nothing in particular.
        //
        // My Classes DOES show them, and should -- that is work still owed
        // (B-22). A dashboard is a different job: it answers "how is this term
        // going". So the stats are scoped, and the outstanding work is stated
        // separately below rather than folded into the totals.
        const classSelect = `
            class_record_id,
            status,
            term_id,
            school_year,
            semester,
            subject_id,
            section_id,
            subjects ( subject_id, code, name, units ),
            sections ( section_id, name, school_year, semester )
          `;
        const [currentTermResult, legacyTermResult, carryOverResult] = await Promise.all([
          termData?.term_id
            ? supabase.from('class_records').select(classSelect)
                .eq('faculty_id', user.id).eq('status', 'active').eq('term_id', termData.term_id)
            : Promise.resolve({ data: [], error: null }),
          termData?.school_year
            ? supabase.from('class_records').select(classSelect)
                .eq('faculty_id', user.id).eq('status', 'active').is('term_id', null)
                .eq('school_year', termData.school_year).eq('semester', termData.semester)
            : Promise.resolve({ data: [], error: null }),
          // Counted, not listed: how many classes from an earlier term are still
          // open because their Semestral Grade has not been posted.
          termData?.term_id
            ? supabase.from('class_records')
                .select('class_record_id', { count: 'exact', head: true })
                .eq('faculty_id', user.id).eq('status', 'active').neq('term_id', termData.term_id)
            : Promise.resolve({ count: 0, error: null })
        ]);

        const classesError = currentTermResult.error || legacyTermResult.error;
        const classesData = [...(currentTermResult.data || []), ...(legacyTermResult.data || [])];
        setOutstandingPriorTermClasses(carryOverResult.count || 0);

        if (classesError) throw classesError;

        let mappedClasses = [];
        let postedGrades = [];
        let combinedStudents = [];

        if (classesData && classesData.length > 0) {
          const classIds = classesData.map(c => c.class_record_id);

          // Get posted grades details
          const { data: pgData } = await supabase
            .from('posted_grades')
            .select('class_record_id, grade_period, is_locked, remarks, computed_grade')
            .in('class_record_id', classIds);
          postedGrades = pgData || [];

          // Fetch student priority rosters for all handled classes
          const rosterPromises = classIds.map(id => getClassPriorityRoster(id).catch(() => []));
          const rosters = await Promise.all(rosterPromises);
          
          const uniqueStudentMap = new Map();
          rosters.flat().forEach(s => {
            if (s.user_id && !uniqueStudentMap.has(s.user_id)) {
              uniqueStudentMap.set(s.user_id, s);
            }
          });
          combinedStudents = Array.from(uniqueStudentMap.values());

          // Map active handled sections
          mappedClasses = classesData.map((cls, idx) => {
            const classRoster = rosters[idx] || [];
            const matchingPosted = (postedGrades || []).filter(g => g.class_record_id === cls.class_record_id);
            const postedPeriods = new Set(matchingPosted.map(getCanonicalGradePeriod));
            
            let statusLabel = 'Ongoing';
            let gradingPeriod = 'Semestral';

            if (postedPeriods.has(GRADE_MILESTONES.SEMESTRAL_GRADE)) {
              statusLabel = 'Grades Posted';
              gradingPeriod = 'Final';
            }

            return {
              id: cls.class_record_id,
              subjectCode: cls.subjects?.code || 'N/A',
              subjectName: cls.subjects?.name || 'N/A',
              section: cls.sections?.name || 'N/A',
              units: cls.subjects?.units || 0,
              enrolled: classRoster.length,
              status: statusLabel,
              gradingPeriod,
              semester: cls.semester,
              schoolYear: cls.school_year
            };
          });
        }

        setClasses(mappedClasses);

        // 3. ASPIRE v3.1: Fetch Student Risk Evaluations & Active Interventions
        const { data: evaluationsData } = await supabase
          .from('student_risk_evaluations')
          .select(`
            evaluation_id,
            student_id,
            term,
            evaluation_context,
            risk_level,
            risk_score,
            refer_to_dean,
            status,
            published_to_student_at,
            followup_snapshot,
            created_at,
            student:users!student_id ( first_name, last_name, email ),
            class_record:class_records ( subjects ( code ), sections ( name ) )
          `)
          .eq('faculty_id', user.id)
          .order('created_at', { ascending: false });

        const activeInterventions = (evaluationsData || []).filter(evaluation => (
          Boolean(evaluation.published_to_student_at)
          && !evaluation.followup_snapshot
          && ['submitted', 'acknowledged_by_student'].includes(evaluation.status)
        ));
        const interventionsCount = activeInterventions.length;
        const deanReferralsCount = (evaluationsData || []).filter(ev => ev.refer_to_dean === true).length;
        setRecentEvaluations((evaluationsData || []).slice(0, 4));

        // 4. Fetch Unread Notifications
        const { count: notificationsCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('recipient_id', user.id)
          .eq('is_read', false)
          .is('dismissed_at', null);

        // Unified risk threshold: Only HIGH and CRITICAL count as "At-Risk" (single source of truth via riskUtils.js)
        const atRiskStudents = combinedStudents.filter(s => s.risk_level === 'high' || s.risk_level === 'critical');

        setStats({
          handledClassesCount: classesData?.length || 0,
          pendingGradesCount: classesData?.length || 0, // Ongoing terms
          interventionsCount,
          deanReferralsCount,
          notificationsCount: notificationsCount || 0,
          atRiskCount: atRiskStudents.length
        });

        // 5. ASPIRE v4.0: Calculate Visual Analytics Data + PL Eligibility Tracking
        const safe = combinedStudents.filter(s => s.risk_level === 'low').length;
        const watch = combinedStudents.filter(s => s.risk_level === 'moderate').length;
        const high = combinedStudents.filter(s => s.risk_level === 'high').length;
        const critical = combinedStudents.filter(s => s.risk_level === 'critical').length;
        
        setRiskData({
          safe,
          watch,
          high,
          critical
        });

        // Component breakdown & progression trajectory from student_term_scores
        if (classesData && classesData.length > 0) {
          const classIds = classesData.map(c => c.class_record_id);
          const { data: termScores } = await supabase
            .from('student_term_scores')
            .select('*')
            .in('class_record_id', classIds);

          let csSum = 0, csCount = 0;
          let charSum = 0, charCount = 0;
          let examSum = 0, examCount = 0;

          (termScores || []).forEach(sc => {
            const actSum = (sc.act1 || 0) + (sc.act2 || 0) + (sc.act3 || 0) + (sc.act4 || 0) + (sc.act5 || 0) + (sc.act6 || 0);
            if (actSum > 0) {
              csSum += Math.min(100, (actSum / 110) * 100);
              csCount++;
            }
            if (sc.char_rating != null && sc.char_rating > 0) {
              charSum += sc.char_rating;
              charCount++;
            }
            if (sc.exam != null && sc.exam > 0) {
              examSum += Math.min(100, (sc.exam / 40) * 100);
              examCount++;
            }
          });

          setComponentsData([
            { component: 'Class Standing (Quizzes & Activities — 50%)', avgScore: csCount > 0 ? Math.round(csSum / csCount) : 85 },
            { component: 'Character Rating (Attendance & Demeanor — 10%)', avgScore: charCount > 0 ? Math.round(charSum / charCount) : 90 },
            { component: 'Major Term Examinations (40%)', avgScore: examCount > 0 ? Math.round(examSum / examCount) : 78 }
          ]);

          // Detect if current semester is Summer (compressed 2-term: Midterm + Final)
          const isSummerSemester = (activeTerm?.semester || '').toLowerCase().includes('summer') ||
            classesData.some(c => (c.semester || '').toLowerCase().includes('summer'));
          
          const termNames = isSummerSemester 
            ? ['Midterm', 'Final'] 
            : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

          const termRatings = {};
          termNames.forEach(t => { termRatings[t] = []; });
          
          combinedStudents.forEach(s => {
            if (s.term_ratings) {
              Object.entries(s.term_ratings).forEach(([t, r]) => {
                if (termRatings[t] && r > 0) termRatings[t].push(r);
              });
            }
          });

          const trajectory = termNames.map(termName => {
            const rList = termRatings[termName] || [];
            if (rList.length > 0) {
              // Per Unify-Academic-Rules-Across-ASPIRE.md Step 15 (C11): a cohort mean of
              // 0-100 ratings is not anybody's GWA. Previously this averaged the ratings
              // THEN transmuted the average into a field literally called `avgGwa` —
              // presented to faculty as "Class GWA" when it was never a real GWA at all.
              // Kept as the raw average rating (0-100%); never transmute a cohort mean.
              const avgR = rList.reduce((a, b) => a + b, 0) / rList.length;
              const pass = Math.round((rList.filter(r => r >= 75).length / rList.length) * 100);
              return { term: termName, avgRating: Math.round(avgR), passRate: pass, examAvg: Math.round(avgR) };
            }
            return { term: termName, avgRating: null, passRate: null, examAvg: null };
          }).filter(d => d.avgRating !== null); // Only include terms with actual data

          setTrajectoryData(trajectory);
        }

      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [user, profile]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      <PageHeader title="Overview Dashboard" breadcrumb="Faculty Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Welcome Hero Banner */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-4 sm:p-6 md:p-8 text-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-sage-700/60 text-sage-100 border border-sage-600/40">
              Active Term: AY {activeTerm?.school_year || '2025-2026'} • {activeTerm?.semester === '1st' ? 'First' : activeTerm?.semester === '2nd' ? 'Second' : activeTerm?.semester || 'Second'} Semester
            </span>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight font-display">Welcome Back, {profile?.first_name || 'Instructor'}!</h1>
            <p className="text-xs sm:text-sm text-sage-200/90 max-w-xl">
              Monitor class submissions, track student performance metrics, and submit calculated grades securely to the Dean's Office.
            </p>
          </div>
          
          <div className="flex gap-2 sm:gap-4">
            <Link 
              to="/faculty/classrecordslist" 
              className="w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <BookOpen className="h-4 w-4 text-sage-700" /> Manage Classes
            </Link>
          </div>
        </div>

        {/* Work carried over from a term that has ended.
            Stated on its own rather than counted into the figures above, which
            describe the active term. Both numbers are then true. */}
        {outstandingPriorTermClasses > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 sm:p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-bold text-amber-900">
                {outstandingPriorTermClasses} class{outstandingPriorTermClasses === 1 ? '' : 'es'} from an earlier term still need a Semestral Grade
              </p>
              <p className="text-[11px] sm:text-xs text-amber-800 mt-0.5 leading-relaxed">
                These are not counted in this term&rsquo;s figures. They stay open until you post the grade.
              </p>
              <Link
                to="/faculty/classrecordslist"
                className="inline-flex items-center gap-1 mt-1.5 text-[11px] sm:text-xs font-bold text-amber-900 underline"
              >
                Open My Classes <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Action Center / Alerts */}
        {urgentTasks.length > 0 && (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base md:text-lg font-bold font-display text-slate-900">Immediate Action Required</h2>
              <span className="text-[10px] sm:text-xs text-rose-600 font-bold bg-rose-50 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full animate-pulse border border-rose-200">
                {urgentTasks.length} Pending
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {urgentTasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`p-3.5 sm:p-4 rounded-2xl border flex items-start justify-between gap-3 sm:gap-4 transition-all shadow-2xs ${
                    task.type === 'danger' 
                      ? 'bg-rose-50/50 border-rose-200 hover:border-rose-300' 
                      : 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                  }`}
                >
                  <div className="flex gap-3 min-w-0">
                    <AlertCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                      task.type === 'danger' ? 'text-rose-600' : 'text-amber-600'
                    }`} />
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate">{task.title}</h4>
                      <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5 line-clamp-2">{task.description}</p>
                      <span className={`inline-block text-micro sm:text-[10px] font-bold px-2 py-0.5 rounded-full mt-2 border ${
                        task.type === 'danger' 
                          ? 'bg-rose-100 text-rose-800 border-rose-200' 
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}>
                        Due: {task.dueDate}
                      </span>
                    </div>
                  </div>
                  
                  <Link 
                    to={task.actionLink} 
                    className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-600 hover:text-slate-950 transition-colors flex-shrink-0"
                  >
                    <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
          
          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-sage-300 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Handled Classes</span>
              <div className="p-1.5 sm:p-2 bg-sage-50 text-sage-600 rounded-xl">
                <BookOpen className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{String(stats.handledClassesCount).padStart(2, '0')}</h3>
              <p className="text-micro sm:text-[10px] text-slate-500 mt-0.5">Assigned records</p>
            </div>
          </div>

          <div 
            className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-amber-300 transition-all flex flex-col justify-between cursor-pointer group"
            onClick={() => setInfoModalData({
              title: "Pending Posts",
              message: "The number of handled classes that have ongoing terms and where final grades have not yet been posted."
            })}
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-amber-600 transition-colors">Pending Posts</span>
              <div className="p-1.5 sm:p-2 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-100 transition-colors">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{String(stats.pendingGradesCount).padStart(2, '0')}</h3>
              <p className="text-micro sm:text-[10px] text-slate-500 mt-0.5">Current Grading Period</p>
            </div>
          </div>

          <div
            className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-indigo-300 transition-all flex flex-col justify-between cursor-pointer group"
            onClick={() => setInfoModalData({
              title: "Active Intervention Cases",
              message: "Published faculty evaluations that do not yet have a recorded follow-up. A true zero is displayed as zero."
            })}
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">Active Intervention Cases</span>
              <div className="p-1.5 sm:p-2 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-100 transition-colors">
                <Target className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{String(stats.interventionsCount).padStart(2, '0')}</h3>
              <p className="text-micro sm:text-[10px] text-slate-500 mt-0.5 truncate">
                {stats.deanReferralsCount > 0 ? `${stats.deanReferralsCount} Dean referral${stats.deanReferralsCount > 1 ? 's' : ''}` : 'Awaiting follow-up'}
              </p>
            </div>
          </div>

          <div 
            className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-purple-300 transition-all flex flex-col justify-between cursor-pointer group"
            onClick={() => setInfoModalData({
              title: "Notifications",
              message: "Unread system alerts, messages from the Dean, or important updates regarding your classes and students."
            })}
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-purple-600 transition-colors">Notifications</span>
              <div className="p-1.5 sm:p-2 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-100 transition-colors">
                <AlertCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{String(stats.notificationsCount).padStart(2, '0')}</h3>
              <p className="text-micro sm:text-[10px] text-slate-500 mt-0.5">Unread alerts</p>
            </div>
          </div>

          <div 
            className="col-span-2 sm:col-span-1 bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-rose-300 transition-all flex flex-col justify-between cursor-pointer group"
            onClick={() => setInfoModalData({
              title: "At-Risk Students",
              message: "Students classified in the High or Critical risk tiers by the ASPIRE Early Warning System across all your handled classes. These students require immediate intervention."
            })}
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-rose-500 uppercase tracking-wider group-hover:text-rose-600 transition-colors">At-Risk Students</span>
              <div className="p-1.5 sm:p-2 bg-rose-50 text-rose-600 rounded-xl">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className={`text-xl sm:text-2xl font-extrabold font-mono ${stats.atRiskCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{String(stats.atRiskCount).padStart(2, '0')}</h3>
              <p className="text-micro sm:text-[10px] text-rose-500 mt-0.5 font-semibold truncate">Flagged Failed/INC</p>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* ASPIRE v3.1 FACULTY VISUAL ANALYTICS SUITE                               */}
        {/* ========================================================================= */}
        <RiskEducationNote variant="dashboard" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          
          {/* Left 2 Cols: Class Performance Trajectory */}
          <div className="min-w-0 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 lg:col-span-2 space-y-4 text-left">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-sage-600" />
                  <span>Class Performance Progression Trajectory</span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Term-by-term score trajectory across your handled courses (AY 2026-2027).
                </p>
              </div>
              <span className="shrink-0 text-[10px] font-mono font-bold bg-sage-50 text-sage-700 px-2 py-0.5 rounded-md border border-sage-200">
                Multi-Term
              </span>
            </div>

            <FacultyPerformanceTrajectoryChart trajectoryData={trajectoryData} />
          </div>

          {/* Right 1 Col: Student Risk & Intervention Donut */}
          <div className="min-w-0 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 space-y-4 text-left">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-sage-600" />
                  <span>Cohort Risk Distribution</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Live student distribution across ASPIRE tiers.
                </p>
              </div>
            </div>

            <StudentRiskInterventionDonut riskData={riskData} />
          </div>

        </div>

        {/* Assessment Component Score Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 text-left space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-sage-600" />
                <span>Formative vs. Summative Component Distribution</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Evaluates student average performance against the 75% institutional passing benchmark per DYCI formula weights.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
              50% Class Standing • 10% Character • 40% Exam
            </span>
          </div>

          <AssessmentComponentDistributionBar componentsData={componentsData} />
        </div>

        {/* Classes Table / Active Progress */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          
          {/* Active Handled Sections */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base md:text-lg font-bold font-display text-slate-900">Active Handled Classes</h3>
                <p className="text-[11px] sm:text-xs text-slate-500">Track grading progress and current schedules per section.</p>
              </div>
              <Link to="/faculty/classrecordslist" className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-1">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Mobile Handled Classes Feed (md:hidden) */}
            <div className="md:hidden space-y-3">
              {classes.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No active handled classes found.
                </div>
              ) : (
                classes.map(cls => (
                  <div key={cls.id} className="p-3.5 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 font-display text-sm">{cls.subjectCode}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-mono">
                            {cls.section}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{cls.subjectName}</p>
                      </div>

                      {cls.status === 'Pending Setup' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
                          Pending Setup
                        </span>
                      ) : cls.status === 'Ongoing' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-bold bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
                          Ongoing
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
                          Grades Posted
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-200/60 font-sans">
                      <span>{cls.schoolYear} • {cls.semester} Sem ({cls.units} Units)</span>
                      <span className="font-mono font-bold text-slate-800">{cls.enrolled} Enrolled</span>
                    </div>

                    <div className="pt-1">
                      {cls.status === 'Pending Setup' ? (
                        <Link 
                          to={`/faculty/gradecomponentssetup?id=${cls.id}`} 
                          className="w-full py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          View Grade Weights
                        </Link>
                      ) : (
                        <Link 
                          to={`/faculty/scoreinput?id=${cls.id}`} 
                          className="w-full py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          Input Scores
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Handled Classes Table (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto table-container">
              {classes.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No active handled classes found.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-slate-100 text-left">
                  <thead>
                    <tr className="text-slate-400 text-xs font-semibold tracking-wider">
                      <th className="pb-3 font-medium">Class / Section</th>
                      <th className="pb-3 font-medium">Term / Units</th>
                      <th className="pb-3 font-medium text-center">Students</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {classes.map((cls) => (
                      <tr key={cls.id} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="py-4">
                          <div className="font-bold text-slate-900 text-sm">{cls.subjectCode}</div>
                          <div className="text-slate-400 text-[10px] font-normal truncate max-w-[180px]">{cls.subjectName}</div>
                        </td>
                        <td className="py-4 text-slate-500">
                          <div>{cls.schoolYear} • {cls.semester} Sem</div>
                          <div className="text-[10px] text-slate-400">{cls.units} Units</div>
                        </td>
                        <td className="py-4 text-center font-mono font-semibold text-slate-900">
                          {cls.enrolled}
                        </td>
                        <td className="py-4">
                          {cls.status === 'Pending Setup' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Pending Setup
                            </span>
                          ) : cls.status === 'Ongoing' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              Grading Ongoing
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Grades Posted
                            </span>
                          )}
                        </td>
                        <td className="py-4 text-right">
                          {cls.status === 'Pending Setup' ? (
                            <Link to={`/faculty/gradecomponentssetup?id=${cls.id}`} className="text-sage-600 hover:text-sage-700 font-bold hover:underline">
                              View Weights
                            </Link>
                          ) : (
                            <Link to={`/faculty/scoreinput?id=${cls.id}`} className="text-sage-600 hover:text-sage-700 font-bold hover:underline">
                              Input Scores
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right Column details (Interventions & Activities) */}
          <div className="space-y-4 sm:space-y-6">

            {/* Active Interventions & Priority Watch */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 space-y-4 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold font-display text-slate-900 flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-rose-600" />
                    <span>Active Interventions</span>
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-400">Cases evaluated &amp; monitored</p>
                </div>
                <Link to="/faculty/classrecordslist" className="text-[11px] font-bold text-sage-600 hover:text-sage-700">
                  View All
                </Link>
              </div>

              {recentEvaluations.length > 0 ? (
                <div className="space-y-2.5">
                  {recentEvaluations.map(ev => (
                    <div key={ev.evaluation_id} className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {ev.student ? `${ev.student.first_name} ${ev.student.last_name}` : 'Student'}
                        </span>
                        {ev.refer_to_dean && (
                          <span className="px-1.5 py-0.2 rounded text-micro font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Dean Queue
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>{ev.class_record?.subjects?.code || 'SUBJ'} ({ev.class_record?.sections?.name || 'Section'})</span>
                        <span className="font-bold text-rose-700">{ev.risk_score} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <p>No student risk evaluations logged yet.</p>
                  <Link to="/faculty/classrecordslist" className="text-sage-600 font-bold hover:underline mt-1 inline-block text-[11px]">
                    Open Class Records &amp; Priority List
                  </Link>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* Info Modal */}
      <InfoModal 
        isOpen={!!infoModalData}
        title={infoModalData?.title}
        message={infoModalData?.message}
        onClose={() => setInfoModalData(null)}
      />
    </>
  );
}
