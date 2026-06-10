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
        // 1. Fetch enrollments for the student
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select('subject_id, section_id, subjects(*)')
          .eq('student_id', user.id);

        // Determine activeSectionId (fallback to enrolls if profile.section_id is missing/null)
        const activeSectionId = profile.section_id || (enrolls && enrolls.length > 0 ? enrolls[0].section_id : null);

        // 2. Fetch section details
        if (activeSectionId) {
          const { data: secData } = await supabase
            .from('sections')
            .select('*')
            .eq('section_id', activeSectionId)
            .single();
          setSection(secData);
        }

        // 3. Fetch active class records
        const subjectIds = enrolls?.map(e => e.subject_id) || [];
        let classRecs = [];
        if (activeSectionId && subjectIds.length > 0) {
          const { data: records } = await supabase
            .from('class_records')
            .select(`
              class_record_id,
              subject_id,
              faculty:users!faculty_id ( first_name, last_name )
            `)
            .eq('section_id', activeSectionId)
            .in('subject_id', subjectIds)
            .eq('status', 'active');
          classRecs = records || [];
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

        const postedMap = {}; // class_record_id -> { grade_period, effective_grade, remarks }
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
        if (activeSectionId) {
          const count = await checkPendingEvals(user.id, activeSectionId);
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
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Academic Term Label
  const termLabel = section 
    ? `AY ${section.school_year} • ${section.semester === '1st' ? 'First' : section.semester === '2nd' ? 'Second' : section.semester} Semester`
    : 'AY — • — Semester';

  const totalCredits = enrolledSubjects.reduce((sum, sub) => sum + sub.credits, 0);

  return (
    <>
      <PageHeader title="Student Overview" breadcrumb="Student Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-8">
        
        {/* Welcome Banner Hero */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-6 md:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sage-700/50 text-sage-100 border border-sage-600/30">
              Academic Term: {termLabel}
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight font-display">
              Welcome Back, {profile?.first_name || 'Student'}!
            </h1>
            <p className="text-sm text-sage-200/90 max-w-xl">
              Track your real-time grades, evaluate faculty performance, and review AI counseling insights.
            </p>
          </div>
          
          <div className="flex gap-4">
            <Link 
              to="/student/mygradeslist" 
              className="px-5 py-3 text-sm font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
            >
              <Award className="h-4 w-4" /> View My Grades
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current GWA</span>
              <h3 className="text-3xl font-extrabold text-slate-900 font-mono mt-2">{currentGwa}</h3>
              <p className="text-xs text-slate-500 mt-1">{gwaStanding}</p>
            </div>
            <div className="p-3 bg-sage-50 text-sage-600 rounded-lg">
              <Award className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Enrolled Subjects</span>
              <h3 className="text-3xl font-extrabold text-slate-900 font-mono mt-2">
                {enrolledSubjects.length < 10 ? `0${enrolledSubjects.length}` : enrolledSubjects.length}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{totalCredits} total credit units</p>
            </div>
            <div className="p-3 bg-sage-50 text-sage-600 rounded-lg">
              <BookOpen className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Evaluations</span>
              <h3 className={`text-3xl font-extrabold font-mono mt-2 ${pendingEvals > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {pendingEvals < 10 ? `0${pendingEvals}` : pendingEvals}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Due before end of term</p>
            </div>
            <div className={`p-3 rounded-lg ${pendingEvals > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
              <MessageSquare className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-sage-300 transition-all flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Academic Insight</span>
              <h3 className={`text-3xl font-extrabold font-mono mt-2 ${insightVerdict === 'Safe' ? 'text-emerald-600' : insightVerdict === 'At Risk' ? 'text-rose-600' : 'text-amber-600'}`}>
                {insightVerdict}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {insightVerdict === 'Safe' ? 'Low risk index status' : insightVerdict === 'At Risk' ? 'High risk index status' : 'Academic standing alert'}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${insightVerdict === 'Safe' ? 'bg-emerald-50 text-emerald-600' : insightVerdict === 'At Risk' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
              <BrainCircuit className="h-5 w-5" />
            </div>
          </div>

        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Active Enrolled Classes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold font-display text-slate-900">Enrolled Subjects</h3>
                <p className="text-xs text-slate-500">Overview of courses and instructors for the current term.</p>
              </div>
              <Link to="/student/mygradeslist" className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-1">
                View Detailed Grades <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {enrolledSubjects.map((sub) => (
                <div key={sub.class_record_id} className="p-4 rounded-xl border border-slate-200 hover:border-sage-300 transition-all bg-slate-50/50 flex flex-col justify-between h-36">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold font-mono text-slate-400">{sub.code}</span>
                      {sub.status === 'Grades Posted' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {sub.grade} Posted
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                          Active
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 mt-2 line-clamp-1">{sub.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">{sub.professor}</p>
                  </div>
                  
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold border-t border-slate-200/60 pt-2">
                    <span>{sub.credits} Credit Units</span>
                    <Link to={`/student/mygradesdetail?id=${sub.class_record_id}`} className="text-sage-600 hover:text-sage-700 flex items-center gap-0.5">
                      Card Details <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
              {enrolledSubjects.length === 0 && (
                <div className="col-span-2 text-center py-8 text-slate-400 text-sm">
                  No enrolled subjects found in active status for this section.
                </div>
              )}
            </div>
          </div>

          {/* Quick-look Widgets */}
          <div className="space-y-6">
            
            {/* Academic Insights alert */}
            <div className={`${insightVerdict === 'Safe' ? 'bg-emerald-50/40 border-emerald-100' : insightVerdict === 'At Risk' ? 'bg-rose-50/40 border-rose-100' : 'bg-amber-50/40 border-amber-100'} border rounded-xl p-5 shadow-sm space-y-4`}>
              <div className="flex items-center gap-2">
                <BrainCircuit className={`h-5 w-5 ${insightVerdict === 'Safe' ? 'text-emerald-600' : insightVerdict === 'At Risk' ? 'text-rose-600' : 'text-amber-600'}`} />
                <h3 className="text-sm font-bold text-slate-900">Academic Insights</h3>
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
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-sage-600" />
                <h3 className="text-sm font-bold text-slate-900">Faculty Evaluations</h3>
              </div>
              <p className="text-xs text-slate-500">
                {pendingEvals > 0 
                  ? `You have ${pendingEvals} pending instructor evaluation surveys.` 
                  : 'All scheduled faculty evaluations are fully completed. Thank you for your feedback!'}
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
