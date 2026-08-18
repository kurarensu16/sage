import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  Award, 
  MessageSquare, 
  BrainCircuit, 
  ChevronRight, 
  ArrowRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

// Helper to check pending evaluations
const checkPendingEvals = async (studentId, sectionId) => {
  const now = new Date().toISOString();
  const { data: windows } = await supabase
    .from('evaluation_windows')
    .select('window_id')
    .eq('section_id', sectionId)
    .lte('open_at', now)
    .gte('close_at', now)
    .eq('is_closed', false);

  if (!windows || windows.length === 0) return 0;

  // Fetch responses submitted by this student
  const { data: responses } = await supabase
    .from('evaluation_responses')
    .select('window_id')
    .eq('student_id', studentId);

  const submittedWindowIds = new Set(responses?.map(r => r.window_id) || []);
  let pendingCount = 0;
  for (let i = 0; i < windows.length; i++) {
    if (!submittedWindowIds.has(windows[i].window_id)) {
      pendingCount++;
    }
  }
  return pendingCount;
};

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState(null);
  const [enrolledSubjects, setEnrolledSubjects] = useState([]);
  const [currentGwa, setCurrentGwa] = useState('—');
  const [gwaStanding, setGwaStanding] = useState('No grades posted yet');
  const [pendingEvals, setPendingEvals] = useState(0);
  const [insightVerdict, setInsightVerdict] = useState('Normal');
  const [insightSummary, setInsightSummary] = useState('No academic risk flags detected. Keep up the good work!');

  useEffect(() => {
    async function loadDashboardData() {
      if (!user || !profile) return;
      setLoading(true);
      try {
        // 1. Get Section info
        if (profile.section_id) {
          const { data: secData } = await supabase
            .from('sections')
            .select('*')
            .eq('section_id', profile.section_id)
            .single();
          setSection(secData);
        }

        // 2. Fetch Enrollments
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select('subject_id, subjects(*)')
          .eq('student_id', user.id);

        // 3. Fetch Class Records for Section
        let classRecs = [];
        if (profile.section_id) {
          const { data: crs } = await supabase
            .from('class_records')
            .select('class_record_id, subject_id, status, faculty:users!faculty_id(first_name, last_name)')
            .eq('section_id', profile.section_id)
            .eq('status', 'active');
          classRecs = crs || [];
        }

        // Map enrollments to active class records
        const subjMap = {};
        enrolls?.forEach(e => {
          if (e.subjects) {
            subjMap[e.subject_id] = e.subjects;
          }
        });

        // 4. Fetch Posted Grades
        const { data: posted } = await supabase
          .from('posted_grades')
          .select('*')
          .eq('student_id', user.id);

        const postedMap = {};
        posted?.forEach(p => {
          const periods = { prelim: 1, midterm: 2, semi_final: 3, final: 4 };
          const current = postedMap[p.class_record_id];
          const currentWeight = current ? (periods[current.grade_period] || 0) : 0;
          const newWeight = periods[p.grade_period] || 0;
          if (newWeight > currentWeight) {
            postedMap[p.class_record_id] = p;
          }
        });

        const activeEnrolled = classRecs
          .filter(cr => subjMap[cr.subject_id])
          .map(cr => {
            const subj = subjMap[cr.subject_id];
            const pGrade = postedMap[cr.class_record_id];
            const hasFinal = posted?.some(p => p.class_record_id === cr.class_record_id && p.grade_period === 'final');
            return {
              class_record_id: cr.class_record_id,
              code: subj.code,
              name: subj.name,
              credits: subj.units,
              professor: cr.faculty ? `Prof. ${cr.faculty.first_name} ${cr.faculty.last_name}` : 'TBA',
              status: hasFinal ? 'Grades Posted' : 'Ongoing',
              grade: pGrade ? pGrade.effective_grade : '—'
            };
          });

        setEnrolledSubjects(activeEnrolled);

        // Calculate running GWA from posted grades
        let totalUnits = 0;
        let weightedGradesSum = 0;
        activeEnrolled.forEach(sub => {
          if (sub.grade !== '—') {
            const numGrade = parseFloat(sub.grade);
            if (!isNaN(numGrade)) {
              totalUnits += sub.credits;
              weightedGradesSum += numGrade * sub.credits;
            }
          }
        });

        if (totalUnits > 0) {
          const calculatedGwa = (weightedGradesSum / totalUnits).toFixed(2);
          setCurrentGwa(calculatedGwa);
          
          const gwaNum = parseFloat(calculatedGwa);
          if (gwaNum <= 1.45) setGwaStanding('Excellent standing');
          else if (gwaNum <= 1.75) setGwaStanding('Very Good standing');
          else if (gwaNum <= 3.00) setGwaStanding('Satisfactory standing');
          else setGwaStanding('Academic warning');
        } else {
          setCurrentGwa('—');
          setGwaStanding('No grades posted yet');
        }

        // 5. Pending Evaluations
        if (profile.section_id) {
          const count = await checkPendingEvals(user.id, profile.section_id);
          setPendingEvals(count);
        }

        // 6. Academic Insights
        const { data: insightData } = await supabase
          .from('student_academic_insights')
          .select('*')
          .eq('student_id', user.id)
          .order('generated_at', { ascending: false })
          .limit(1);

        if (insightData && insightData.length > 0) {
          const latest = insightData[0];
          const verdictLabel = latest.verdict === 'continue' ? 'Safe' : latest.verdict === 'at_risk' ? 'At Risk' : 'Shift';
          setInsightVerdict(verdictLabel);
          setInsightSummary(latest.summary);
        } else {
          setInsightVerdict('Normal');
          setInsightSummary('No academic risk flags detected. Keep up the good work!');
        }

      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [user, profile]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-xs text-slate-500 font-medium font-sans">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const termLabel = section 
    ? `AY ${section.school_year} • ${section.semester === '1st' ? 'First' : section.semester === '2nd' ? 'Second' : section.semester} Sem`
    : 'AY — • — Sem';

  const totalCredits = enrolledSubjects.reduce((sum, sub) => sum + sub.credits, 0);

  return (
    <>
      <PageHeader title="Student Overview" breadcrumb="Student Portal" />
      
      <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Welcome Banner Hero */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-5 sm:p-6 md:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
          <div className="space-y-1.5 sm:space-y-2">
            <span className="inline-flex items-center px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-sage-700/50 text-sage-100 border border-sage-600/30">
              Academic Term: {termLabel}
            </span>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight font-display">
              Welcome Back, {profile?.first_name || 'Student'}!
            </h1>
            <p className="text-xs sm:text-sm text-sage-200/90 max-w-xl">
              Track your real-time grades, evaluate faculty performance, and review AI counseling insights.
            </p>
          </div>
          
          <div className="flex w-full md:w-auto">
            <Link 
              to="/student/mygradeslist" 
              className="w-full md:w-auto justify-center px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
            >
              <Award className="h-4 w-4" /> View My Grades
            </Link>
          </div>
        </div>

        {/* Term Clearance & Evaluation Alert Banner */}
        {pendingEvals > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-sm">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg text-amber-700 flex-shrink-0 mt-0.5 sm:mt-0">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm font-display text-amber-950">Term Clearance Pending</h4>
                <p className="text-[11px] sm:text-xs text-amber-800 mt-0.5">
                  You have <strong>{pendingEvals}</strong> pending faculty evaluation(s). Completing your evaluations signs your term clearance and unlocks official grade summary visibility.
                </p>
              </div>
            </div>
            <Link
              to="/student/evallist"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm self-end sm:self-auto cursor-pointer"
            >
              Evaluate Now <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          
          <div className="bg-white p-3.5 sm:p-5 md:p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider block">Current GWA</span>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 font-mono mt-1 sm:mt-2">{currentGwa}</h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate max-w-[110px] sm:max-w-none">{gwaStanding}</p>
            </div>
            <div className="p-2 sm:p-3 bg-sage-50 text-sage-600 rounded-lg flex-shrink-0">
              <Award className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-5 md:p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider block">Subjects</span>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 font-mono mt-1 sm:mt-2">
                {enrolledSubjects.length < 10 ? `0${enrolledSubjects.length}` : enrolledSubjects.length}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate max-w-[110px] sm:max-w-none">{totalCredits} units total</p>
            </div>
            <div className="p-2 sm:p-3 bg-sage-50 text-sage-600 rounded-lg flex-shrink-0">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-5 md:p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider block">Term Clearance</span>
              <h3 className={`text-base sm:text-lg md:text-xl font-extrabold font-display mt-1 sm:mt-2 ${pendingEvals === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {pendingEvals === 0 ? 'SIGNED' : 'UNSIGNED'}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate max-w-[110px] sm:max-w-none">
                {pendingEvals === 0 ? 'All evals completed' : `${pendingEvals} eval(s) pending`}
              </p>
            </div>
            <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${pendingEvals === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-5 md:p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider block">Academic Insight</span>
              <h3 className={`text-xl sm:text-2xl md:text-3xl font-extrabold font-mono mt-1 sm:mt-2 ${insightVerdict === 'Safe' ? 'text-emerald-600' : insightVerdict === 'At Risk' ? 'text-rose-600' : 'text-amber-600'}`}>
                {insightVerdict}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate max-w-[110px] sm:max-w-none">
                {insightVerdict === 'Safe' ? 'Low risk status' : insightVerdict === 'At Risk' ? 'High risk status' : 'Standing alert'}
              </p>
            </div>
            <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${insightVerdict === 'Safe' ? 'bg-emerald-50 text-emerald-600' : insightVerdict === 'At Risk' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
              <BrainCircuit className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          {/* Active Enrolled Classes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base sm:text-lg font-bold font-display text-slate-900">Enrolled Subjects</h3>
                <p className="text-xs text-slate-500">Overview of courses and instructors for the current term.</p>
              </div>
              <Link to="/student/mygradeslist" className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-1 self-start sm:self-auto">
                View Detailed Grades <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {enrolledSubjects.map((sub) => (
                <div key={sub.class_record_id} className="p-3.5 sm:p-4 rounded-xl border border-slate-200 hover:border-sage-300 transition-all bg-slate-50/50 flex flex-col justify-between min-h-[9rem]">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold font-mono text-slate-400 truncate">{sub.code}</span>
                      {sub.status === 'Grades Posted' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex-shrink-0">
                          {sub.grade} Posted
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 flex-shrink-0">
                          Active
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-xs sm:text-sm text-slate-900 mt-1.5 line-clamp-2">{sub.name}</h4>
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
            <div className={`${insightVerdict === 'Safe' ? 'bg-emerald-50/40 border-emerald-100' : insightVerdict === 'At Risk' ? 'bg-rose-50/40 border-rose-100' : 'bg-amber-50/40 border-amber-100'} border rounded-xl p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-4`}>
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

            {/* Pending evaluations card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-sage-600" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Faculty Evaluations</h3>
              </div>
              <p className="text-xs text-slate-500">
                {pendingEvals > 0 
                  ? `You have ${pendingEvals} pending instructor evaluation surveys.` 
                  : 'All scheduled faculty appraisals are fully completed. Thank you for your feedback!'}
              </p>
              <Link to="/student/evallist" className="inline-flex items-center gap-1 text-xs font-bold text-sage-600 hover:underline">
                Open Evaluations List <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

          </div>

        </div>

      </div>
    </>
  );
}
