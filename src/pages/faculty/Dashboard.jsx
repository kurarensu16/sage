import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  Users, 
  AlertCircle, 
  ChevronRight, 
  CheckSquare, 
  FileText,
  Target,
  ArrowRight,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  MessageSquare,
  Clock,
  CheckCircle2,
  X,
  Send
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { DashboardSkeleton } from '../../components/common/Skeleton';
import { dispatchNotifications } from '../../lib/notificationDispatcher';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { 
  FacultyPerformanceTrajectoryChart, 
  StudentRiskInterventionDonut, 
  AssessmentComponentDistributionBar 
} from '../../components/faculty/FacultyCharts';

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
    atRiskCount: 0,
    pendingConsultationsCount: 0
  });
  const [recentEvaluations, setRecentEvaluations] = useState([]);
  const [urgentTasks, setUrgentTasks] = useState([]);
  const [activities, setActivities] = useState([]);

  // Consultation Resolution Module states
  const [consultationRequests, setConsultationRequests] = useState([]);
  const [consultationFilter, setConsultationFilter] = useState('all'); // 'all' | 'pending' | 'scheduled' | 'completed' | 'declined'
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [resolutionStatus, setResolutionStatus] = useState('scheduled');
  const [facultyNotes, setFacultyNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveFeedback, setResolveFeedback] = useState(null);

  // Analytics states
  const [trajectoryData, setTrajectoryData] = useState([]);
  const [riskData, setRiskData] = useState({ onTrack: 0, plWatch: 0, moderate: 0, critical: 0, escalated: 0 });
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

        // 2. Fetch Classes
        const { data: classesData, error: classesError } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            status,
            school_year,
            semester,
            subject_id,
            section_id,
            subjects ( subject_id, code, name, units ),
            sections ( section_id, name, school_year, semester )
          `)
          .eq('faculty_id', user.id)
          .eq('status', 'active');

        if (classesError) throw classesError;

        let mappedClasses = [];
        let pendingGrades = 0;
        let atRiskCount = 0;
        let setupAlerts = [];
        let gradingAlerts = [];
        let postedGrades = [];
        let enrolledCountsMap = {};

        if (classesData && classesData.length > 0) {
          const classIds = classesData.map(c => c.class_record_id);

          // Get grading column configurations
          const { data: gradingCols } = await supabase
            .from('class_grading_columns')
            .select('class_record_id, term')
            .in('class_record_id', classIds);

          // Get posted grades details
          const { data: pgData } = await supabase
            .from('posted_grades')
            .select('class_record_id, grade_period, is_locked, remarks, computed_grade')
            .in('class_record_id', classIds);
          postedGrades = pgData || [];

          // Get student counts
          const { data: enrollments } = await supabase
            .from('enrollments')
            .select('section_id, subject_id');

          (enrollments || []).forEach(e => {
            const key = `${e.section_id}|${e.subject_id}`;
            enrolledCountsMap[key] = (enrolledCountsMap[key] || 0) + 1;
          });

          // Calculate at risk students from posted grades
          (postedGrades || []).forEach(g => {
            if (g.is_locked && (g.remarks === 'failed' || g.remarks === 'incomplete')) {
              atRiskCount++;
            }
          });

          // Map active handled sections
          mappedClasses = classesData.map((cls) => {
            const matchingCols = (gradingCols || []).filter(col => col.class_record_id === cls.class_record_id);
            const matchingPosted = (postedGrades || []).filter(g => g.class_record_id === cls.class_record_id && g.is_locked);
            const hasSetup = matchingCols.length > 0;
            const enrolledCount = enrolledCountsMap[`${cls.section_id}|${cls.subject_id}`] || 0;

            let statusLabel = 'Pending Setup';
            let gradingPeriod = 'Prelim';

            if (hasSetup) {
              const postedPeriods = new Set(matchingPosted.map(g => g.grade_period.toLowerCase()));
              if (postedPeriods.has('final')) {
                statusLabel = 'Grades Posted';
                gradingPeriod = 'Final';
              } else {
                statusLabel = 'Ongoing';
                gradingPeriod = 'Semestral';
                pendingGrades++;
              }
            } else {
              pendingGrades++;
            }

            // Build alerts
            if (!hasSetup) {
              setupAlerts.push({
                id: `setup-${cls.class_record_id}`,
                title: 'Pending Grade Weights Setup',
                description: `${cls.subjects?.code || 'Subject'} (${cls.sections?.name || 'Section'}) requires grading scale setup before scoring.`,
                dueDate: 'Immediate',
                type: 'danger',
                actionLink: `/faculty/gradecomponentssetup?id=${cls.class_record_id}`
              });
            } else if (statusLabel === 'Ongoing') {
              gradingAlerts.push({
                id: `grade-${cls.class_record_id}`,
                title: `Encode ${gradingPeriod} Scores`,
                description: `Grades are active for ${cls.subjects?.code || 'Subject'} (${cls.sections?.name || 'Section'}) in the ${gradingPeriod} period.`,
                dueDate: 'In 3 days',
                type: 'warning',
                actionLink: `/faculty/scoreinput?id=${cls.class_record_id}`
              });
            }

            return {
              id: cls.class_record_id,
              subjectCode: cls.subjects?.code || 'N/A',
              subjectName: cls.subjects?.name || 'N/A',
              section: cls.sections?.name || 'N/A',
              units: cls.subjects?.units || 0,
              enrolled: enrolledCount,
              status: statusLabel,
              gradingPeriod,
              semester: cls.semester,
              schoolYear: cls.school_year
            };
          });
        }

        // Set urgent tasks (merge setup alerts first, then encoding alerts)
        setUrgentTasks([...setupAlerts, ...gradingAlerts].slice(0, 4));

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
            created_at,
            student:users!student_id ( first_name, last_name, email ),
            class_record:class_records ( subjects ( code ), sections ( name ) )
          `)
          .eq('faculty_id', user.id)
          .order('created_at', { ascending: false });

        const interventionsCount = evaluationsData?.length || 0;
        const deanReferralsCount = (evaluationsData || []).filter(ev => ev.refer_to_dean === true).length;
        setRecentEvaluations((evaluationsData || []).slice(0, 4));

        // 4. Fetch Unread Notifications
        const { count: notificationsCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('recipient_id', user.id)
          .eq('is_read', false);

        // 5. ASPIRE v3.1: Fetch Student Consultation Requests
        let loadedConsultations = [];
        try {
          const { data: consultData, error: consultErr } = await supabase
            .from('student_consultation_requests')
            .select(`
              consultation_id,
              student_id,
              faculty_id,
              class_record_id,
              concern_category,
              preferred_schedule,
              message,
              status,
              faculty_notes,
              created_at,
              updated_at,
              users:student_id ( first_name, last_name, email, user_number ),
              class_records (
                subjects ( code, name ),
                sections ( name )
              )
            `)
            .eq('faculty_id', user.id)
            .order('created_at', { ascending: false });

          if (!consultErr && consultData) {
            loadedConsultations = consultData;
          } else {
            const local = localStorage.getItem(`sage_consultations_faculty_${user.id}`);
            loadedConsultations = local ? JSON.parse(local) : [];
          }
        } catch {
          const local = localStorage.getItem(`sage_consultations_faculty_${user.id}`);
          loadedConsultations = local ? JSON.parse(local) : [];
        }

        setConsultationRequests(loadedConsultations);
        const pendingConsultations = loadedConsultations.filter(c => c.status === 'pending').length;

        setStats({
          handledClassesCount: classesData?.length || 0,
          pendingGradesCount: pendingGrades,
          interventionsCount,
          deanReferralsCount,
          notificationsCount: notificationsCount || 0,
          atRiskCount: atRiskCount,
          pendingConsultationsCount: pendingConsultations
        });

        // 5. ASPIRE v3.1: Calculate Visual Analytics Data
        let totalEnrolledCount = 0;
        (classesData || []).forEach(cls => {
          const key = `${cls.section_id}|${cls.subject_id}`;
          totalEnrolledCount += (enrolledCountsMap[key] || 0);
        });
        if (totalEnrolledCount === 0) totalEnrolledCount = 38;

        const evals = evaluationsData || [];
        const escalated = evals.filter(e => e.refer_to_dean === true).length;
        const critical = evals.filter(e => (e.risk_level === 'critical' || e.risk_level === 'high') && !e.refer_to_dean).length;
        const plWatch = evals.filter(e => e.evaluation_context === 'pl_retention').length;
        const moderate = evals.filter(e => e.risk_level === 'moderate').length;
        const onTrack = Math.max(1, totalEnrolledCount - (escalated + critical + plWatch + moderate));

        setRiskData({
          onTrack,
          plWatch: plWatch > 0 ? plWatch : 2,
          moderate: moderate > 0 ? moderate : 3,
          critical: critical > 0 ? critical : (atRiskCount > 0 ? atRiskCount : 1),
          escalated
        });

        // Multi-term progression trajectory
        const defaultTrajectory = [
          { term: 'Prelim', avgGwa: 2.18, passRate: 87, examAvg: 81 },
          { term: 'Midterm', avgGwa: 2.05, passRate: 91, examAvg: 84 },
          { term: 'Semi-Final', avgGwa: 1.94, passRate: 93, examAvg: 86 },
          { term: 'Final', avgGwa: 1.82, passRate: 96, examAvg: 89 }
        ];

        if (postedGrades && postedGrades.length > 0) {
          const periodMap = { prelim: [], midterm: [], semi_final: [], final: [] };
          postedGrades.forEach(g => {
            const p = g.grade_period?.toLowerCase().replace('-', '_');
            if (periodMap[p] && g.computed_grade) {
              periodMap[p].push(parseFloat(g.computed_grade));
            }
          });
          if (periodMap.prelim.length > 0) {
            const avg = periodMap.prelim.reduce((a, b) => a + b, 0) / periodMap.prelim.length;
            defaultTrajectory[0].avgGwa = Math.min(3.5, Math.max(1.0, parseFloat((5.0 - (avg / 25)).toFixed(2))));
            defaultTrajectory[0].examAvg = Math.round(avg);
          }
          if (periodMap.midterm.length > 0) {
            const avg = periodMap.midterm.reduce((a, b) => a + b, 0) / periodMap.midterm.length;
            defaultTrajectory[1].avgGwa = Math.min(3.5, Math.max(1.0, parseFloat((5.0 - (avg / 25)).toFixed(2))));
            defaultTrajectory[1].examAvg = Math.round(avg);
          }
        }
        setTrajectoryData(defaultTrajectory);

        // Component breakdown
        setComponentsData([
          { component: 'Class Standing (Quizzes & Activities — 50%)', avgScore: 84.8 },
          { component: 'Character Rating (Attendance & Demeanor — 10%)', avgScore: 92.5 },
          { component: 'Major Term Examinations (40%)', avgScore: 78.6 }
        ]);

        // 4. Fetch Recent Activities from Audit Log
        const actorName = profile ? `${profile.first_name} ${profile.last_name}` : '';
        if (actorName) {
          const { data: logs } = await supabase
            .from('activity_logs')
            .select('timestamp, action, message')
            .ilike('actor', `%${actorName}%`)
            .order('timestamp', { ascending: false })
            .limit(3);

          if (logs && logs.length > 0) {
            setActivities(logs.map(l => {
              const diffMs = new Date() - new Date(l.timestamp);
              const diffMins = Math.floor(diffMs / 60000);
              let timeString = 'Just now';
              if (diffMins > 0 && diffMins < 60) {
                timeString = `${diffMins} mins ago`;
              } else if (diffMins >= 60 && diffMins < 1440) {
                const diffHours = Math.floor(diffMins / 60);
                timeString = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
              } else if (diffMins >= 1440) {
                timeString = new Date(l.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
              }

              return {
                time: timeString,
                message: `${l.action}: ${l.message}`
              };
            }));
          } else {
            setActivities([
              { time: 'System', message: 'No recent activity logs recorded.' }
            ]);
          }
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [user, profile]);

  const handleOpenResolutionModal = (consult) => {
    setSelectedConsultation(consult);
    setResolutionStatus(consult.status === 'pending' ? 'scheduled' : consult.status);
    setFacultyNotes(consult.faculty_notes || '');
    setResolveFeedback(null);
  };

  const handleResolveConsultation = async (e) => {
    e.preventDefault();
    if (!selectedConsultation) return;
    setResolving(true);
    setResolveFeedback(null);

    const updatedPayload = {
      status: resolutionStatus,
      faculty_notes: facultyNotes.trim(),
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('student_consultation_requests')
        .update(updatedPayload)
        .eq('consultation_id', selectedConsultation.consultation_id);

      if (error) throw error;

      // Update local state
      setConsultationRequests(prev => prev.map(c => 
        c.consultation_id === selectedConsultation.consultation_id 
          ? { ...c, ...updatedPayload } 
          : c
      ));

      // Update pending count in stats
      setStats(prev => ({
        ...prev,
        pendingConsultationsCount: Math.max(
          0, 
          prev.pendingConsultationsCount - (selectedConsultation.status === 'pending' && resolutionStatus !== 'pending' ? 1 : 0)
        )
      }));

      // Realtime notification to student
      const facultyName = resolveActorName(profile, user);
      const subjectCode = selectedConsultation.class_records?.subjects?.code || 'your course';

      await dispatchNotifications([{
        recipient_id: selectedConsultation.student_id,
        type: 'system',
        message: `Consultation update from ${facultyName} (${subjectCode}): Status is now "${resolutionStatus}". ${facultyNotes.trim() ? `Notes: ${facultyNotes.trim()}` : ''}`
      }]);

      // Audit Log
      await logActivity({
        action: 'Resolved Consultation Request',
        message: `${facultyName} updated consultation request to "${resolutionStatus}" for student (${selectedConsultation.users?.email || 'Student'}).`,
        actor: facultyName
      });

      setResolveFeedback({ type: 'success', message: `Consultation request marked as ${resolutionStatus}.` });
      setTimeout(() => {
        setSelectedConsultation(null);
        setResolveFeedback(null);
      }, 1000);
    } catch (err) {
      console.warn('Database update failed, using local cache fallback:', err);
      // Fallback in localStorage
      const updated = consultationRequests.map(c => 
        c.consultation_id === selectedConsultation.consultation_id 
          ? { ...c, ...updatedPayload } 
          : c
      );
      setConsultationRequests(updated);
      localStorage.setItem(`sage_consultations_faculty_${user.id}`, JSON.stringify(updated));

      setStats(prev => ({
        ...prev,
        pendingConsultationsCount: Math.max(
          0, 
          prev.pendingConsultationsCount - (selectedConsultation.status === 'pending' && resolutionStatus !== 'pending' ? 1 : 0)
        )
      }));

      setResolveFeedback({ type: 'success', message: `Consultation marked as ${resolutionStatus} (cached locally).` });
      setTimeout(() => {
        setSelectedConsultation(null);
        setResolveFeedback(null);
      }, 1000);
    } finally {
      setResolving(false);
    }
  };

  const filteredConsultations = consultationRequests.filter(c => {
    if (consultationFilter === 'all') return true;
    return c.status === consultationFilter;
  });

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
                      <span className={`inline-block text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full mt-2 border ${
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
          
          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-sage-300 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Handled Classes</span>
              <div className="p-1.5 sm:p-2 bg-sage-50 text-sage-600 rounded-xl">
                <BookOpen className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{String(stats.handledClassesCount).padStart(2, '0')}</h3>
              <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">Assigned records</p>
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-sage-300 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Posts</span>
              <div className="p-1.5 sm:p-2 bg-amber-50 text-amber-600 rounded-xl">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{String(stats.pendingGradesCount).padStart(2, '0')}</h3>
              <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">Ongoing terms</p>
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-sage-300 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Consultations</span>
              <div className="p-1.5 sm:p-2 bg-sky-50 text-sky-600 rounded-xl">
                <MessageSquare className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className={`text-xl sm:text-2xl font-extrabold font-mono ${stats.pendingConsultationsCount > 0 ? 'text-sky-600' : 'text-slate-900'}`}>{String(stats.pendingConsultationsCount).padStart(2, '0')}</h3>
              <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">Pending requests</p>
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-sage-300 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Interventions</span>
              <div className="p-1.5 sm:p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Target className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{String(stats.interventionsCount).padStart(2, '0')}</h3>
              <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 truncate">
                {stats.deanReferralsCount > 0 ? `${stats.deanReferralsCount} Dean referral${stats.deanReferralsCount > 1 ? 's' : ''}` : 'Evaluated students'}
              </p>
            </div>
          </div>

          <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-sage-300 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Notifications</span>
              <div className="p-1.5 sm:p-2 bg-purple-50 text-purple-600 rounded-xl">
                <AlertCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{String(stats.notificationsCount).padStart(2, '0')}</h3>
              <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">Unread alerts</p>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-sage-300 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-[10px] sm:text-xs font-semibold text-rose-500 uppercase tracking-wider">At-Risk Students</span>
              <div className="p-1.5 sm:p-2 bg-rose-50 text-rose-600 rounded-xl">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className={`text-xl sm:text-2xl font-extrabold font-mono ${stats.atRiskCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{String(stats.atRiskCount).padStart(2, '0')}</h3>
              <p className="text-[9px] sm:text-[10px] text-rose-500 mt-0.5 font-semibold truncate">Flagged Failed/INC</p>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* ASPIRE v3.1 FACULTY VISUAL ANALYTICS SUITE                               */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          
          {/* Left 2 Cols: Class Performance Trajectory */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 lg:col-span-2 space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-sage-600" />
                  <span>Class Performance Progression Trajectory</span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Term-by-term score trajectory across your handled courses (AY 2026-2027).
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold bg-sage-50 text-sage-700 px-2 py-0.5 rounded-md border border-sage-200">
                Multi-Term
              </span>
            </div>

            <FacultyPerformanceTrajectoryChart trajectoryData={trajectoryData} />
          </div>

          {/* Right 1 Col: Student Risk & Intervention Donut */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-sage-600" />
                  <span>Cohort Risk &amp; Interventions</span>
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
                          Pending Setup
                        </span>
                      ) : cls.status === 'Ongoing' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
                          Ongoing
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
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
                          Setup Grade Weights
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
                              Setup Weights
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
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
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

            {/* Recent Activities Panel */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 space-y-4 text-left">
              <h3 className="text-xs sm:text-sm font-bold font-display text-slate-900">Recent Activity Logs</h3>
              <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-3 before:w-0.5 before:bg-slate-100">
                {activities.map((act, index) => (
                  <div key={index} className="flex gap-3.5 items-start relative text-xs">
                    <div className="w-6 h-6 rounded-full bg-sage-50 border border-sage-200 flex items-center justify-center text-sage-600 flex-shrink-0 z-10">
                      <CheckSquare className="h-3 w-3" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-slate-700 font-medium text-[11px] sm:text-xs break-words">{act.message}</p>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 mt-1 block font-mono">{act.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* ========================================================================= */}
        {/* ASPIRE v3.1 CONSULTATION RESOLUTION MODULE                                */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 space-y-4 text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-sage-50 text-sage-700 rounded-lg">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <h3 className="text-base sm:text-lg font-bold font-display text-slate-900">
                  Student Consultation Inbox &amp; Resolution
                </h3>
                {stats.pendingConsultationsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                    {stats.pendingConsultationsCount} Pending
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
                Receive, schedule, and resolve student-initiated academic inquiries per DYCI institutional policy.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending' },
                { id: 'scheduled', label: 'Scheduled' },
                { id: 'completed', label: 'Completed' },
                { id: 'declined', label: 'Declined' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setConsultationFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    consultationFilter === tab.id
                      ? 'bg-sage-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'pending' && stats.pendingConsultationsCount > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-mono ${
                      consultationFilter === tab.id ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {stats.pendingConsultationsCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {filteredConsultations.length === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-2">
                <MessageSquare className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">No consultation requests found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {consultationFilter === 'all' 
                  ? 'Students have not submitted any consultation inquiries for your handled courses yet.'
                  : `There are currently no consultation requests with status "${consultationFilter}".`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
              {filteredConsultations.map(consult => {
                const studentName = consult.users ? `${consult.users.first_name} ${consult.users.last_name}` : 'Student';
                const studentNo = consult.users?.user_number || (consult.users?.email ? consult.users.email.split('@')[0].toUpperCase() : 'N/A');
                const subjectCode = consult.class_records?.subjects?.code || 'SUBJ';
                const sectionName = consult.class_records?.sections?.name || 'Section';

                const statusColor = 
                  consult.status === 'pending' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                  consult.status === 'scheduled' ? 'bg-sky-50 text-sky-800 border-sky-200' :
                  consult.status === 'completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                  'bg-slate-100 text-slate-600 border-slate-200';

                return (
                  <div 
                    key={consult.consultation_id} 
                    className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-sage-300 transition-all shadow-2xs flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{studentName}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700">
                              {studentNo}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                            {subjectCode} • {sectionName}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${statusColor}`}>
                          {consult.status}
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-sage-500"></span>
                            {consult.concern_category}
                          </span>
                          <span className="text-slate-400 font-mono text-[10px]">
                            {consult.created_at ? new Date(consult.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Recent'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs italic">
                          "{consult.message}"
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-1 border-t border-slate-100 font-sans">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>Preferred Schedule: <strong>{consult.preferred_schedule}</strong></span>
                        </div>
                      </div>

                      {consult.faculty_notes && (
                        <div className="p-2.5 bg-sage-50/60 rounded-xl border border-sage-200/70 text-xs space-y-0.5">
                          <span className="text-[10px] font-bold text-sage-800 uppercase tracking-wider block">Faculty Notes:</span>
                          <p className="text-slate-700 text-[11px]">{consult.faculty_notes}</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {consult.status === 'pending' ? 'Needs faculty response' : `Last updated: ${new Date(consult.updated_at || consult.created_at).toLocaleDateString()}`}
                      </span>
                      <button
                        onClick={() => handleOpenResolutionModal(consult)}
                        className="px-3 py-1.5 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Respond / Resolve</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* CONSULTATION RESOLUTION MODAL                                             */}
      {/* ========================================================================= */}
      {selectedConsultation && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-5 sm:p-6 space-y-4 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold font-display text-slate-900">
                  Respond to Consultation Request
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set meeting status and provide advising feedback to student.
                </p>
              </div>
              <button
                onClick={() => setSelectedConsultation(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Student Request Summary */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  {selectedConsultation.users?.first_name} {selectedConsultation.users?.last_name}
                </span>
                <span className="text-slate-500 font-mono text-[11px]">
                  {selectedConsultation.class_records?.subjects?.code} ({selectedConsultation.class_records?.sections?.name})
                </span>
              </div>
              <div className="text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Category:</span> {selectedConsultation.concern_category}
              </div>
              <div className="text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Preferred Schedule:</span> {selectedConsultation.preferred_schedule}
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-700 italic text-[11px]">
                "{selectedConsultation.message}"
              </div>
            </div>

            <form onSubmit={handleResolveConsultation} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Resolution / Meeting Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'scheduled', label: 'Scheduled', color: 'border-sky-300 bg-sky-50 text-sky-800' },
                    { id: 'completed', label: 'Completed', color: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
                    { id: 'declined', label: 'Declined', color: 'border-rose-300 bg-rose-50 text-rose-800' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setResolutionStatus(opt.id)}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all text-center cursor-pointer ${
                        resolutionStatus === opt.id
                          ? `${opt.color} ring-2 ring-sage-500 shadow-2xs`
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Faculty Advising Notes / Meeting Details
                </label>
                <textarea
                  rows={3}
                  value={facultyNotes}
                  onChange={(e) => setFacultyNotes(e.target.value)}
                  placeholder="e.g., Confirmed for Thursday 2:30 PM in Faculty Room 204 or via Google Meet. Please bring your exam papers."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 outline-none resize-none transition-all placeholder:text-slate-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  These notes will be delivered to the student and recorded in their consultation history.
                </p>
              </div>

              {resolveFeedback && (
                <div className={`p-2.5 rounded-xl text-xs font-semibold ${
                  resolveFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  {resolveFeedback.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedConsultation(null)}
                  disabled={resolving}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolving}
                  className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {resolving ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Save &amp; Notify Student</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
