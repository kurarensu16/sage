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
  Info
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getCachedData, setCachedData } from '../../lib/dataCache';
import { DashboardSkeleton } from '../../components/common/Skeleton';
import { findMostAdvancedPostedGrade } from '../../lib/gradeMilestones';
import { computeStudentGwa, getGwaBand, resolveOfficialGwa } from '../../lib/academicPolicy';

// Helper to check pending advising tasks
const checkPendingAdvisingTasks = async (studentId) => {
  try {
    const { data: evals } = await supabase
      .from('student_risk_evaluations')
      .select('evaluation_id, advising_plan, evaluation_context, shared_academic_feedback, status, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (!evals || evals.length === 0) return { pendingCount: 0, latestPlan: null };

    let pendingCount = 0;
    evals.forEach(ev => {
      // Published plans contain active actionable tasks for the student
      if (ev.status !== 'draft') {
        const items = Array.isArray(ev.advising_plan) ? ev.advising_plan : [];
        pendingCount += items.filter(item => !item.completed).length;
      }
    });

    return {
      pendingCount,
      latestPlan: evals[0]
    };
  } catch {
    return { pendingCount: 0, latestPlan: null };
  }
};

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState(null);
  const [activeTerm, setActiveTerm] = useState(null);
  const [enrolledSubjects, setEnrolledSubjects] = useState([]);
  const [currentGwa, setCurrentGwa] = useState('—');
  const [gwaStanding, setGwaStanding] = useState('No grades posted yet');
  const [pendingAdvisingCount, setPendingAdvisingCount] = useState(0);
  const [latestAdvisingPlan, setLatestAdvisingPlan] = useState(null);
  const [insightVerdict, setInsightVerdict] = useState('Normal');
  const [insightSummary, setInsightSummary] = useState('No academic risk flags detected. Keep up the good work!');
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
        setPendingAdvisingCount(cached.pendingAdvisingCount || 0);
        setLatestAdvisingPlan(cached.latestAdvisingPlan || null);
        setInsightVerdict(cached.insightVerdict);
        setInsightSummary(cached.insightSummary);
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

        // 4. Fetch all active class records to pair with enrollments
        const { data: allClassRecs } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            subject_id,
            section_id,
            status,
            faculty:users!faculty_id ( first_name, last_name )
          `)
          .eq('status', 'active');

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

        // 6. Map all student enrollments to their class records
        const activeEnrolled = (enrolls || []).map(e => {
          const matchingClass = (allClassRecs || []).find(
            cr => cr.subject_id === e.subject_id && cr.section_id === e.section_id
          );
          const classRecId = matchingClass?.class_record_id;
          const pGrade = classRecId ? postedMap[classRecId] : null;

          return {
            class_record_id: classRecId,
            code: e.subjects?.code || 'SUBJ',
            name: e.subjects?.name || 'Subject Name',
            credits: Number(e.subjects?.units || 0),
            professor: matchingClass?.faculty ? `Prof. ${matchingClass.faculty.first_name} ${matchingClass.faculty.last_name}` : 'Faculty Instructor',
            grade: pGrade ? resolveOfficialGwa(pGrade).gwa : null,
            status: pGrade ? 'Grades Posted' : 'Active'
          };
        });

        setEnrolledSubjects(activeEnrolled);

        // 7. Calculate real-time GWA
        const validGrades = activeEnrolled.filter(s => s.grade !== null && !isNaN(parseFloat(s.grade)));
        let resolvedGwa = '—';
        let resolvedStanding = 'No grades posted yet';

        if (validGrades.length > 0) {
          const gwaNum = computeStudentGwa(validGrades.map(s => s.grade)).gwa;
          resolvedGwa = gwaNum.toFixed(2);
          setCurrentGwa(resolvedGwa);

          resolvedStanding = getGwaBand(gwaNum)?.label || 'Academic warning';
          setGwaStanding(resolvedStanding);
        } else {
          setCurrentGwa('—');
          setGwaStanding('No grades posted yet');
        }

        // 8. ASPIRE v3.1: Check Pending Faculty Advising & Action Items
        const { pendingCount: resolvedPendingCount, latestPlan: resolvedLatestPlan } = await checkPendingAdvisingTasks(user.id);
        setPendingAdvisingCount(resolvedPendingCount);
        setLatestAdvisingPlan(resolvedLatestPlan);

        // 9. Academic Insights
        const { data: insightData } = await supabase
          .from('student_academic_insights')
          .select('*')
          .eq('student_id', user.id)
          .order('generated_at', { ascending: false })
          .limit(1);

        let resolvedVerdict = 'Normal';
        let resolvedSummary = 'No academic risk flags detected. Keep up the good work!';
        if (insightData && insightData.length > 0) {
          const latest = insightData[0];
          resolvedVerdict = latest.verdict === 'continue' ? 'Safe' : latest.verdict === 'at_risk' ? 'Struggling' : 'At Risk';
          resolvedSummary = latest.summary;
          setInsightVerdict(resolvedVerdict);
          setInsightSummary(resolvedSummary);
        } else {
          setInsightVerdict('Normal');
          setInsightSummary('No academic risk flags detected. Keep up the good work!');
        }

        // Store in cache
        setCachedData(cacheKey, {
          section: resolvedSection,
          activeTerm: termData || null,
          enrolledSubjects: activeEnrolled,
          currentGwa: resolvedGwa,
          gwaStanding: resolvedStanding,
          pendingAdvisingCount: resolvedPendingCount,
          latestAdvisingPlan: resolvedLatestPlan,
          insightVerdict: resolvedVerdict,
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
              Track your real-time academic milestones, review faculty intervention checklists, and explore AI counseling insights.
            </p>
          </div>
          
          <div className="flex w-full md:w-auto flex-shrink-0">
            <Link 
              to="/student/mygradeslist" 
              className="w-full md:w-auto justify-center px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-md flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Award className="h-4 w-4" /> View My Grades
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
              <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 truncate">
                Current GWA
                <button onClick={() => setInfoModalType('gwa')} className="text-slate-400 hover:text-sage-600 transition-colors" aria-label="What does this mean?">
                  <Info className="h-3 w-3" />
                </button>
              </span>
              <h3 className="text-lg sm:text-2xl md:text-3xl font-extrabold text-slate-900 font-mono mt-0.5 sm:mt-1 truncate">{currentGwa}</h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate" title={gwaStanding}>{gwaStanding}</p>
            </div>
            <div className="p-2 sm:p-2.5 md:p-3 bg-sage-50 text-sage-600 rounded-xl flex-shrink-0 mt-0.5">
              <Award className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          {/* Stat 2: Enrolled Subjects */}
          <div className="bg-white p-3 sm:p-5 md:p-6 rounded-2xl border border-slate-200/90 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 truncate">
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
              <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 truncate">
                Action Tasks
                <button onClick={() => setInfoModalType('tasks')} className="text-slate-400 hover:text-sage-600 transition-colors" aria-label="What does this mean?">
                  <Info className="h-3 w-3" />
                </button>
              </span>
              <h3 className={`text-lg sm:text-2xl md:text-3xl font-extrabold font-mono mt-0.5 sm:mt-1 truncate ${
                pendingAdvisingCount > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}>
                {pendingAdvisingCount > 0 ? `${pendingAdvisingCount} PENDING` : 'CLEARED'}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">
                {pendingAdvisingCount > 0 ? 'Intervention tasks active' : 'All tasks up to date'}
              </p>
            </div>
            <div className={`p-2 sm:p-2.5 md:p-3 rounded-xl flex-shrink-0 mt-0.5 ${
              pendingAdvisingCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {pendingAdvisingCount > 0 ? <ListTodo className="h-4 w-4 sm:h-5 sm:w-5" /> : <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />}
            </div>
          </div>

          {/* Stat 4: Academic Insight */}
          <div className="bg-white p-3 sm:p-5 md:p-6 rounded-2xl border border-slate-200/90 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 truncate">
                AI Standing
                <button onClick={() => setInfoModalType('ai')} className="text-slate-400 hover:text-sage-600 transition-colors" aria-label="What does this mean?">
                  <Info className="h-3 w-3" />
                </button>
              </span>
              <h3 className={`text-lg sm:text-2xl md:text-3xl font-extrabold font-mono mt-0.5 sm:mt-1 truncate ${insightVerdict === 'Safe' ? 'text-emerald-600' : insightVerdict === 'At Risk' ? 'text-rose-600' : 'text-amber-600'}`}>
                {insightVerdict}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">
                {insightVerdict === 'Safe' ? 'Low risk' : insightVerdict === 'Struggling' ? 'Moderate risk' : 'High risk'}
              </p>
            </div>
            <div className={`p-2 sm:p-2.5 md:p-3 rounded-xl flex-shrink-0 mt-0.5 ${insightVerdict === 'Safe' ? 'bg-emerald-50 text-emerald-600' : insightVerdict === 'At Risk' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
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
                <div className="col-span-1 sm:col-span-2 text-center py-8 text-slate-400 text-sm">
                  No enrolled subjects found in active status for this section.
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
              </div>
              <p className="text-xs text-slate-650 leading-relaxed font-medium">
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
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Faculty Advising Inbox</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {pendingAdvisingCount > 0 
                  ? `You have ${pendingAdvisingCount} pending action item(s) prescribed by your course instructors.`
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
                {infoModalType === 'gwa' && 'Current GWA'}
                {infoModalType === 'subjects' && 'Enrolled Subjects'}
                {infoModalType === 'tasks' && 'Action Tasks'}
                {infoModalType === 'ai' && 'AI Standing Predictions'}
              </h3>
              <button 
                onClick={() => setInfoModalType(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm text-slate-600">
              {infoModalType === 'gwa' && (
                <p>This is your overall <strong>General Weighted Average</strong> based on currently posted grades. Because some professors post grades earlier than others, this represents a provisional snapshot of your standing and may fluctuate as more grades are finalized.</p>
              )}
              {infoModalType === 'subjects' && (
                <p>The total number of active subjects and enrolled units you are taking this semester. Only subjects marked as 'Active' or 'Grades Posted' contribute to your GWA.</p>
              )}
              {infoModalType === 'tasks' && (
                <p>These are pending <strong>faculty advising interventions</strong> that require your attention. If you are marked as "CLEARED," you have no immediate required actions. If "PENDING," please check your Faculty Advising Inbox below for details.</p>
              )}
              {infoModalType === 'ai' && (
                <>
                  <p>The <strong>AI Study Advisor</strong> analyzes your real-time grades, absences, and academic history to predict your trajectory.</p>
                  
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
