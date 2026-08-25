import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { MessageSquare, Clock, CheckCircle2, ChevronRight, AlertCircle, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

// Helper to compute SHA-256 hash for evaluation anonymity token
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function EvalList() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState([]);
  const [termLabel, setTermLabel] = useState('');

  useEffect(() => {
    async function loadActiveEvaluations() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. Resolve student's section(s) from Profile, User Record, and Enrollments
        const sectionIds = new Set();
        if (profile?.section_id) {
          sectionIds.add(profile.section_id);
        }

        // Direct DB fetch to avoid stale auth context profile
        const { data: dbUser } = await supabase
          .from('users')
          .select('section_id, role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (dbUser?.section_id) {
          sectionIds.add(dbUser.section_id);
        }

        // Fetch student enrollments (for block or irregular courses)
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('section_id, subject_id')
          .eq('student_id', user.id);

        enrollments?.forEach(e => {
          if (e.section_id) sectionIds.add(e.section_id);
        });

        // 2. Fetch section details for term header
        if (sectionIds.size > 0) {
          const primarySecId = profile?.section_id || dbUser?.section_id || Array.from(sectionIds)[0];
          const { data: currentSec } = await supabase
            .from('sections')
            .select('*')
            .eq('section_id', primarySecId)
            .maybeSingle();

          if (currentSec) {
            const semName = currentSec.semester === '1st' ? 'First' : currentSec.semester === '2nd' ? 'Second' : currentSec.semester;
            const sy = currentSec.school_year?.startsWith('AY') ? currentSec.school_year : `AY ${currentSec.school_year || '2025-2026'}`;
            setTermLabel(`${sy} — ${semName} Semester`);
          }
        }

        // 3. Query all evaluation windows for the student's section(s)
        let windowsQuery = supabase
          .from('evaluation_windows')
          .select(`
            window_id,
            open_at,
            close_at,
            is_closed,
            faculty_id,
            section_id,
            sections ( section_id, name, school_year, semester ),
            faculty:users!evaluation_windows_faculty_id_fkey ( first_name, last_name ),
            evaluation_forms ( form_id, title )
          `);

        if (sectionIds.size > 0) {
          windowsQuery = windowsQuery.in('section_id', Array.from(sectionIds));
        }

        const { data: windows, error: winErr } = await windowsQuery.order('open_at', { ascending: false });

        if (winErr) throw winErr;

        if (!windows || windows.length === 0) {
          setEvaluations([]);
          setLoading(false);
          return;
        }

        // 4. Fetch active class records to match subject names
        const { data: classRecords } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            faculty_id,
            section_id,
            subjects ( code, name )
          `)
          .eq('status', 'active');

        // Map `facultyId_sectionId` or `facultyId` -> subject details
        const facultySubjectMap = {};
        classRecords?.forEach(cr => {
          if (cr.subjects && cr.faculty_id) {
            if (cr.section_id) {
              facultySubjectMap[`${cr.faculty_id}_${cr.section_id}`] = cr.subjects;
            }
            if (!facultySubjectMap[cr.faculty_id]) {
              facultySubjectMap[cr.faculty_id] = cr.subjects;
            }
          }
        });

        // 5. Check student's submission status in `evaluation_responses`
        const { data: directResponses } = await supabase
          .from('evaluation_responses')
          .select('window_id, student_id')
          .eq('student_id', user.id);

        const submittedWindowIds = new Set(directResponses?.map(r => r.window_id) || []);

        // Also check hashed anonymous tokens
        for (const win of windows) {
          if (!submittedWindowIds.has(win.window_id)) {
            try {
              const token = await sha256(`${user.id}_${win.window_id}`);
              const { data: anonResp } = await supabase
                .from('evaluation_responses')
                .select('response_id')
                .eq('window_id', win.window_id)
                .eq('anonymous_token', token)
                .maybeSingle();

              if (anonResp) {
                submittedWindowIds.add(win.window_id);
              }
            } catch {
              // Ignore token hash check error
            }
          }
        }

        // 6. Map and build the final evaluations list
        const nowObj = new Date();

        const list = windows.map((win, idx) => {
          const hasSubmitted = submittedWindowIds.has(win.window_id);
          const subj = facultySubjectMap[`${win.faculty_id}_${win.section_id}`] || 
                       facultySubjectMap[win.faculty_id] || 
                       { code: 'ACAD', name: 'Academic Course' };

          const openDate = new Date(win.open_at);
          const closeDate = new Date(win.close_at);
          
          const isUpcoming = nowObj < openDate;
          const isExpired = nowObj > closeDate || win.is_closed;
          const isOpen = !isUpcoming && !isExpired;
          
          const daysLeft = Math.max(0, Math.ceil((closeDate - nowObj) / (1000 * 60 * 60 * 24)));

          const instructorName = win.faculty 
            ? `Prof. ${win.faculty.first_name} ${win.faculty.last_name}` 
            : 'Assigned Faculty';

          // Assign deterministic avatar colors
          const avatarColors = [
            'bg-sage-100 text-sage-800 border-sage-200',
            'bg-emerald-100 text-emerald-850 border-emerald-200',
            'bg-indigo-100 text-indigo-850 border-indigo-200',
            'bg-sky-100 text-sky-850 border-sky-200'
          ];
          const colorClass = avatarColors[idx % avatarColors.length];

          let displayStatus = 'Pending';
          if (hasSubmitted) {
            displayStatus = 'Submitted';
          } else if (isUpcoming) {
            displayStatus = 'Upcoming';
          } else if (isExpired) {
            displayStatus = 'Late Allowed';
          }

          return {
            id: win.window_id,
            subjectCode: subj.code,
            subjectName: subj.name,
            instructor: instructorName,
            sectionName: win.sections?.name || 'Assigned Section',
            templateTitle: win.evaluation_forms?.title || 'Faculty Appraisal',
            status: displayStatus,
            hasSubmitted,
            isUpcoming,
            isOpen,
            isExpired,
            openDateStr: openDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            deadline: closeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            daysLeft,
            avatarBg: colorClass
          };
        });

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
          <p className="text-sm text-slate-500 font-medium font-sans">Loading evaluation surveys...</p>
        </div>
      </div>
    );
  }

  const pendingCount = evaluations.filter(e => !e.hasSubmitted).length;

  return (
    <>
      <PageHeader title="Faculty Evaluations" breadcrumb="Student Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Info Header Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 items-start">
          <MessageSquare className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-slate-900">Student Faculty Feedback Surveys</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your feedback is used to evaluate faculty instructional delivery. Per DYCI Fairness & Anonymity policies, responses are cryptographically anonymized. Completing all evaluations signs your semester clearance.
            </p>
          </div>
        </div>

        {/* Evaluation list container */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            {termLabel ? (
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide font-mono">{termLabel}</h3>
            ) : (
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide font-mono">Academic Load Evaluations</h3>
            )}
            <span className="text-xs font-medium text-slate-500">
              {pendingCount > 0 ? (
                <span className="text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  {pendingCount} Pending Survey{pendingCount > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  ✓ All Surveys Completed
                </span>
              )}
            </span>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {evaluations.map((evalItem) => (
              <div 
                key={evalItem.id} 
                className={cn(
                  "p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-sm",
                  evalItem.hasSubmitted 
                    ? "bg-slate-50/50 border-slate-200" 
                    : "bg-white border-slate-200 hover:border-sage-300"
                )}
              >
                {/* Faculty Info Block */}
                <div className="flex gap-4 items-center min-w-0">
                  <div className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center font-bold font-display text-xs border shrink-0 shadow-xs",
                    evalItem.avatarBg
                  )}>
                    {evalItem.instructor.replace('Prof. ', '').split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold font-mono text-slate-400">{evalItem.subjectCode}</span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {evalItem.sectionName}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 truncate">{evalItem.instructor}</h4>
                    <p className="text-xs text-slate-500 truncate">{evalItem.subjectName}</p>
                  </div>
                </div>

                {/* Status Column */}
                <div className="flex items-center gap-4 sm:gap-6 justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                  
                  {/* Deadline & Status Details */}
                  <div className="text-left sm:text-right">
                    {evalItem.hasSubmitted ? (
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Survey State</span>
                        <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1 sm:justify-end">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Submitted
                        </div>
                      </div>
                    ) : evalItem.isOpen ? (
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Deadline</span>
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1 sm:justify-end">
                          <Clock className="h-3.5 w-3.5 text-amber-500" /> Closes in {evalItem.daysLeft} {evalItem.daysLeft === 1 ? 'day' : 'days'}
                        </div>
                      </div>
                    ) : evalItem.isUpcoming ? (
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Opens On</span>
                        <div className="text-xs font-semibold text-slate-600 flex items-center gap-1 sm:justify-end">
                          <Calendar className="h-3.5 w-3.5 text-blue-500" /> {evalItem.openDateStr}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wide block">Late Submission</span>
                        <div className="text-xs font-semibold text-rose-700 flex items-center gap-1 sm:justify-end">
                          <AlertCircle className="h-3.5 w-3.5 text-rose-500" /> Closed ({evalItem.deadline})
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  {evalItem.hasSubmitted ? (
                    <button
                      disabled
                      className="px-4 py-2 text-xs font-bold bg-slate-100 text-slate-400 rounded-lg border border-slate-200/60 cursor-not-allowed"
                    >
                      Done
                    </button>
                  ) : evalItem.isUpcoming ? (
                    <button
                      disabled
                      className="px-4 py-2 text-xs font-bold bg-slate-100 text-slate-400 rounded-lg border border-slate-200/60 cursor-not-allowed"
                    >
                      Upcoming
                    </button>
                  ) : evalItem.isOpen ? (
                    <Link 
                      to={`/student/evalform?id=${evalItem.id}`}
                      className="px-4 py-2 text-xs font-bold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                    >
                      Evaluate <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link 
                      to={`/student/evalform?id=${evalItem.id}`}
                      className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                      title="Late evaluation unlocks semester clearance"
                    >
                      Evaluate (Late) <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}

                </div>

              </div>
            ))}

            {evaluations.length === 0 && (
              <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
                <CheckCircle2 className="h-10 w-10 text-slate-350 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-900">No active evaluation surveys found</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  There are no scheduled evaluation windows for your enrolled subjects at this time. When your college opens feedback periods, surveys will appear here.
                </p>
              </div>
            )}
          </div>

        </div>

      </div>
    </>
  );
}
