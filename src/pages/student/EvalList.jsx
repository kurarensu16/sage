import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { MessageSquare, Clock, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';



export default function EvalList() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState([]);
  const [termLabel, setTermLabel] = useState('');

  useEffect(() => {
    async function loadActiveEvaluations() {
      if (!user || !profile?.section_id) {
        setLoading(false);
        return;
      }
      try {
        const now = new Date().toISOString();

        // 1. Fetch section information
        const { data: currentSec } = await supabase
          .from('sections')
          .select('*')
          .eq('section_id', profile.section_id)
          .single();

        if (currentSec) {
          const semName = currentSec.semester === '1st' ? 'First' : currentSec.semester === '2nd' ? 'Second' : currentSec.semester;
          setTermLabel(`Academic Year ${currentSec.school_year} — ${semName} Semester`);
        }

        // 2. Fetch evaluation windows for section
        const { data: windows, error: winErr } = await supabase
          .from('evaluation_windows')
          .select(`
            window_id,
            open_at,
            close_at,
            is_closed,
            faculty_id,
            faculty:users!evaluation_windows_faculty_id_fkey ( first_name, last_name )
          `)
          .eq('section_id', profile.section_id)
          .lte('open_at', now)
          .eq('is_closed', false);

        if (winErr) throw winErr;

        if (!windows || windows.length === 0) {
          setEvaluations([]);
          setLoading(false);
          return;
        }

        // 3. Fetch active class records for section to match subject details
        const { data: classRecords } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            faculty_id,
            subjects ( code, name )
          `)
          .eq('section_id', profile.section_id)
          .eq('status', 'active');

        // Map faculty_id -> subject details
        const facultySubjectMap = {};
        classRecords?.forEach(cr => {
          if (cr.subjects && cr.faculty_id) {
            facultySubjectMap[cr.faculty_id] = cr.subjects;
          }
        });

        // 4. Check submissions by student_id
        const { data: responses } = await supabase
          .from('evaluation_responses')
          .select('window_id')
          .eq('student_id', user.id);

        const submittedWindowIds = new Set(responses?.map(r => r.window_id) || []);

        const list = await Promise.all(windows.map(async (win, idx) => {
          const hasSubmitted = submittedWindowIds.has(win.window_id);
          const subj = facultySubjectMap[win.faculty_id] || { code: 'N/A', name: 'Unknown Subject' };
          const closeDate = new Date(win.close_at);
          const nowObj = new Date();
          const isOnTime = nowObj <= closeDate;
          const daysLeft = Math.max(0, Math.ceil((closeDate - nowObj) / (1000 * 60 * 60 * 24)));
          
          const instructorName = win.faculty 
            ? `${win.faculty.first_name} ${win.faculty.last_name}` 
            : 'Unknown Instructor';

          // Assign deterministic avatar colors
          const avatarColors = [
            'bg-sage-100 text-sage-800 border-sage-200',
            'bg-emerald-100 text-emerald-850 border-emerald-200',
            'bg-indigo-100 text-indigo-850 border-indigo-200',
            'bg-sky-100 text-sky-850 border-sky-200'
          ];
          const colorClass = avatarColors[idx % avatarColors.length];

          return {
            id: win.window_id,
            subjectCode: subj.code,
            subjectName: subj.name,
            instructor: instructorName,
            status: hasSubmitted ? 'Submitted' : 'Pending',
            deadline: closeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            daysLeft,
            isOnTime,
            avatarBg: colorClass
          };
        }));

        setEvaluations(list);

      } catch (err) {
        console.error('Error loading active evaluations:', err);
      } finally {
        setLoading(false);
      }
    }

    loadActiveEvaluations();
  }, [user, profile]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading evaluations...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Faculty Evaluations" breadcrumb="Student Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Info Header Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 items-start">
          <MessageSquare className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900">Feedback Logged</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Your feedback is used to evaluate faculty performance and improve instruction. Individual scores are aggregated to compute the final performance rating.
            </p>
          </div>
        </div>

        {/* Evaluation list grid */}
        <div className="space-y-4">
          {termLabel && (
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{termLabel}</h3>
          )}
          
          <div className="grid grid-cols-1 gap-4">
            {evaluations.map((evalItem) => (
              <div 
                key={evalItem.id} 
                className={cn(
                  "p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-sm",
                  evalItem.status === 'Submitted' 
                    ? "bg-slate-50/50 border-slate-200" 
                    : "bg-white border-slate-200 hover:border-sage-300"
                )}
              >
                {/* Faculty Info Block */}
                <div className="flex gap-4 items-center">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-bold font-mono text-xs border",
                    evalItem.avatarBg
                  )}>
                    {evalItem.instructor.split(' ').map(n => n[0]).filter(Boolean).slice(-2).join('')}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold font-mono text-slate-400">{evalItem.subjectCode}</span>
                    <h4 className="font-bold text-sm text-slate-900">{evalItem.instructor}</h4>
                    <p className="text-xs text-slate-500">{evalItem.subjectName}</p>
                  </div>
                </div>

                {/* Status Column */}
                <div className="flex items-center gap-6">
                  
                  {/* Deadline indicator */}
                  <div className="text-left sm:text-right">
                    {evalItem.status === 'Pending' ? (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Deadline</span>
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-amber-500" /> Closes in {evalItem.daysLeft} {evalItem.daysLeft === 1 ? 'day' : 'days'}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Status</span>
                        <div className="text-xs font-semibold text-emerald-650 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Submitted
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions button */}
                  {evalItem.status === 'Pending' ? (
                    <Link 
                      to={`/student/evalform?id=${evalItem.id}`}
                      className="px-4 py-2 text-xs font-bold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-1"
                    >
                      Evaluate <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="px-4 py-2 text-xs font-bold bg-slate-100 text-slate-400 rounded-lg border border-slate-200/50 cursor-not-allowed"
                    >
                      Done
                    </button>
                  )}

                </div>

              </div>
            ))}
            {evaluations.length === 0 && (
              <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
                <CheckCircle2 className="h-10 w-10 text-slate-350 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-900">All evaluation forms completed</h3>
                <p className="text-xs text-slate-400 mt-1">There are no pending scheduled evaluations for your section at this time.</p>
              </div>
            )}
          </div>

        </div>

      </div>
    </>
  );
}
