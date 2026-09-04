import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  Users, 
  AlertCircle, 
  Calendar, 
  ChevronRight, 
  ArrowRight, 
  CheckSquare, 
  FileText
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { DashboardSkeleton } from '../../components/common/Skeleton';

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [stats, setStats] = useState({
    handledClassesCount: 0,
    pendingGradesCount: 0,
    evalWindowStatus: 'Closed',
    evalWindowDate: '',
    notificationsCount: 0,
    atRiskCount: 0
  });
  const [urgentTasks, setUrgentTasks] = useState([]);
  const [activities, setActivities] = useState([]);


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

        if (classesData && classesData.length > 0) {
          const classIds = classesData.map(c => c.class_record_id);

          // Get grading column configurations
          const { data: gradingCols } = await supabase
            .from('class_grading_columns')
            .select('class_record_id, term')
            .in('class_record_id', classIds);

          // Get posted grades details
          const { data: postedGrades } = await supabase
            .from('posted_grades')
            .select('class_record_id, grade_period, is_locked, remarks')
            .in('class_record_id', classIds);

          // Get student counts
          const { data: enrollments } = await supabase
            .from('enrollments')
            .select('section_id, subject_id');

          const enrolledCountsMap = {};
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

        // 2. Fetch Evaluation Windows
        const { data: evalWins } = await supabase
          .from('evaluation_windows')
          .select('close_at')
          .eq('faculty_id', user.id)
          .eq('is_closed', false)
          .gt('close_at', new Date().toISOString())
          .order('close_at', { ascending: true })
          .limit(1);

        let evalStatus = 'Closed';
        let evalDate = '';
        if (evalWins && evalWins.length > 0) {
          evalStatus = 'Open';
          evalDate = 'Until ' + new Date(evalWins[0].close_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        }

        // 3. Fetch Unread Notifications
        const { count: notificationsCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('recipient_id', user.id)
          .eq('is_read', false);

        setStats({
          handledClassesCount: classesData?.length || 0,
          pendingGradesCount: pendingGrades,
          evalWindowStatus: evalStatus,
          evalWindowDate: evalDate,
          notificationsCount: notificationsCount || 0,
          atRiskCount: atRiskCount
        });

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
              <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Eval Windows</span>
              <div className="p-1.5 sm:p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <h3 className={`text-xl sm:text-2xl font-extrabold font-display ${stats.evalWindowStatus === 'Open' ? 'text-sage-600' : 'text-slate-900'}`}>{stats.evalWindowStatus}</h3>
              <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 truncate">{stats.evalWindowDate || 'No open windows'}</p>
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

          {/* Right Column details (schedule preview & activities) */}
          <div className="space-y-4 sm:space-y-6">
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

      </div>
    </>
  );
}
