import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  MessageSquare, Clock, CheckCircle2, ChevronRight, 
  AlertCircle, Calendar, Archive, ChevronDown, ChevronUp, Lock,
  GraduationCap
} from 'lucide-react';
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
  const [activeEvaluations, setActiveEvaluations] = useState([]);
  const [archivedEvaluations, setArchivedEvaluations] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [isOfficeSigned, setIsOfficeSigned] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  useEffect(() => {
    async function loadActiveEvaluations() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. Fetch active academic term
        const { data: termData } = await supabase
          .from('academic_terms')
          .select('term_id, school_year, semester')
          .eq('is_active', true)
          .maybeSingle();

        setActiveTerm(termData || null);

        // 1b. Check if College Office officially signed student's clearance
        let officeSigned = false;
        try {
          let clrQuery = supabase
            .from('clearance_records')
            .select('status, cleared_at')
            .eq('student_id', user.id);

          if (termData?.term_id) {
            clrQuery = clrQuery.eq('term_id', termData.term_id);
          }

          const { data: clr } = await clrQuery.maybeSingle();
          if (clr && clr.status === 'SIGNED') {
            officeSigned = true;
          }
        } catch (e) {
          console.error('Error fetching clearance record:', e);
        }
        setIsOfficeSigned(officeSigned);

        // 2. Resolve student's section(s) from Profile, User Record, and Enrollments
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
          setActiveEvaluations([]);
          setArchivedEvaluations([]);
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
          `);

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

        // 6. Map and build the evaluations list
        const nowObj = new Date();

        const allMapped = windows.map((win, idx) => {
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

          const avatarColors = [
            'bg-sage-100 text-sage-800 border-sage-200',
            'bg-emerald-100 text-emerald-850 border-emerald-200',
            'bg-indigo-100 text-indigo-850 border-indigo-200',
            'bg-sky-100 text-sky-850 border-sky-200'
          ];
          const colorClass = avatarColors[idx % avatarColors.length];

          const winSy = win.sections?.school_year || termData?.school_year || '2026-2027';
          const winSem = win.sections?.semester || termData?.semester || '1st';

          // An evaluation window belongs to current term if its academic term matches activeTerm
          const isCurrentTerm = !termData || (
            winSy === termData.school_year && 
            (winSem === termData.semester || (termData.semester === '1st' && winSem === '1st') || (termData.semester === '2nd' && winSem === '2nd') || (termData.semester === 'Summer' && winSem === 'Summer'))
          );

          let displayStatus = 'Pending';
          if (hasSubmitted) {
            displayStatus = 'Submitted';
          } else if (win.is_closed) {
            displayStatus = 'Closed';
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
            schoolYear: winSy,
            semester: winSem,
            groupKey: `AY ${winSy} — ${winSem === 'Summer' ? 'Summer Term' : `${winSem === '1st' ? '1st' : '2nd'} Semester`}`,
            status: displayStatus,
            isCurrentTerm,
            isClosed: win.is_closed,
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

        // Split into active and archived
        const activeList = allMapped.filter(item => item.isCurrentTerm);
        const archivedList = allMapped.filter(item => !item.isCurrentTerm);

        setActiveEvaluations(activeList);
        setArchivedEvaluations(archivedList);

        // Auto-expand the most recent archived group if available
        if (archivedList.length > 0) {
          const firstKey = archivedList[0].groupKey;
          setExpandedGroups({ [firstKey]: true });
        }

      } catch (err) {
        console.error('Error loading active evaluations:', err);
      } finally {
        setLoading(false);
      }
    }

    loadActiveEvaluations();
  }, [user, profile]);

  // Group archived evaluations by School Year & Semester (ordered descending)
  const groupedArchived = useMemo(() => {
    const groups = {};
    archivedEvaluations.forEach(item => {
      if (!groups[item.groupKey]) {
        groups[item.groupKey] = {
          title: item.groupKey,
          schoolYear: item.schoolYear,
          semester: item.semester,
          items: []
        };
      }
      groups[item.groupKey].items.push(item);
    });

    // Helper sort function for academic terms (descending)
    return Object.values(groups).sort((a, b) => {
      const getSyYear = (sy) => parseInt((sy || '0').split('-')[0], 10) || 0;
      const getSemWeight = (sem) => (sem === 'Summer' ? 3 : sem === '2nd' ? 2 : 1);

      const syDiff = getSyYear(b.schoolYear) - getSyYear(a.schoolYear);
      if (syDiff !== 0) return syDiff;
      return getSemWeight(b.semester) - getSemWeight(a.semester);
    });
  }, [archivedEvaluations]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading faculty evaluations...</p>
        </div>
      </div>
    );
  }

  const activePendingCount = activeEvaluations.filter(e => !e.hasSubmitted).length;
  const activeCompletedCount = activeEvaluations.filter(e => e.hasSubmitted).length;
  const activeTotalCount = activeEvaluations.length;
  const activeProgressPct = activeTotalCount > 0 ? Math.round((activeCompletedCount / activeTotalCount) * 100) : 100;

  const formatSem = (sem) => (sem === '1st' ? '1st' : sem === '2nd' ? '2nd' : sem === 'Summer' ? 'Summer' : sem);
  const currentTermHeading = activeTerm
    ? `AY ${activeTerm.school_year} — ${formatSem(activeTerm.semester)} Semester`.replace('Summer Semester', 'Summer Term')
    : activeEvaluations.length > 0 && activeEvaluations[0].schoolYear && activeEvaluations[0].semester
    ? `AY ${activeEvaluations[0].schoolYear} — ${formatSem(activeEvaluations[0].semester)} Semester`.replace('Summer Semester', 'Summer Term')
    : 'Active Academic Term';

  return (
    <>
      <PageHeader title="Faculty Evaluations" breadcrumb="Student Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-6 sm:space-y-8">
        
        {/* Info Header Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 items-start shadow-xs">
          <MessageSquare className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-slate-900">Student Faculty Feedback Surveys</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your feedback is used to evaluate faculty instructional delivery. Per DYCI Fairness & Anonymity policies, responses are cryptographically anonymized. Completing all current term evaluations signs your semester clearance.
            </p>
          </div>
        </div>

        {/* ── SECTION 1: CURRENT ACTIVE TERM EVALUATIONS ── */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                  {currentTermHeading} (Current Term)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Required for your active term clearance and official grade summary viewing.
              </p>
            </div>

            {/* Clearance Badge & Progress */}
            {activeTotalCount > 0 && (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    Clearance Progress: {activeCompletedCount} of {activeTotalCount}
                  </span>
                  <div className="w-28 bg-slate-200 rounded-full h-1.5 mt-1 overflow-hidden">
                    <div 
                      className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${activeProgressPct}%` }}
                    ></div>
                  </div>
                </div>

                <span className="text-xs font-medium">
                  {isOfficeSigned ? (
                    <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Clearance Signed by Office
                    </span>
                  ) : activePendingCount > 0 ? (
                    <span className="text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                      {activePendingCount} Pending Survey{activePendingCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-sky-700 font-semibold bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-sky-600" />
                      Surveys Done — Awaiting Office Sign-off
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {activeEvaluations.map((evalItem) => (
              <div 
                key={evalItem.id} 
                className={cn(
                  "p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-xs",
                  evalItem.hasSubmitted 
                    ? "bg-slate-50/60 border-slate-200" 
                    : "bg-white border-slate-200 hover:border-sage-400 hover:shadow-sm"
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
                      <span className="text-[10px] font-bold font-mono text-slate-500">{evalItem.subjectCode}</span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {evalItem.sectionName}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 truncate">{evalItem.instructor}</h4>
                    <p className="text-xs text-slate-500 truncate">{evalItem.subjectName}</p>
                  </div>
                </div>

                {/* Status & Action Block */}
                <div className="flex items-center gap-4 sm:gap-6 justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                  
                  {/* Deadline Details */}
                  <div className="text-left sm:text-right">
                    {evalItem.hasSubmitted ? (
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Status</span>
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
                          <AlertCircle className="h-3.5 w-3.5 text-rose-500" /> Past Due ({evalItem.deadline})
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

            {activeEvaluations.length === 0 && (
              <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
                <CheckCircle2 className="h-10 w-10 text-slate-350 mx-auto mb-2.5" />
                <h3 className="text-sm font-bold text-slate-900">No active evaluation surveys for the current term</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  There are no scheduled evaluation windows for your enrolled subjects at this time. When the college opens feedback periods, surveys will appear here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 2: ARCHIVED EVALUATIONS HISTORY ── */}
        {groupedArchived.length > 0 && (
          <div className="space-y-5 pt-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-slate-500" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                  Archived Evaluations History
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium font-sans">
                {archivedEvaluations.length} past survey{archivedEvaluations.length > 1 ? 's' : ''} across {groupedArchived.length} semester{groupedArchived.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Render each semester group */}
            <div className="space-y-4">
              {groupedArchived.map((group) => {
                const isExpanded = expandedGroups[group.title] !== false; // default expanded

                return (
                  <div key={group.title} className="bg-slate-50/70 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    
                    {/* Collapsible Semester Header */}
                    <button
                      onClick={() => toggleGroup(group.title)}
                      className="w-full px-5 py-3.5 bg-slate-100/80 hover:bg-slate-100 transition-colors flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <GraduationCap className="h-4 w-4 text-sage-600" />
                        <span className="text-xs font-bold text-slate-800 font-mono tracking-tight">
                          {group.title}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                          {group.items.length} class{group.items.length > 1 ? 'es' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <span>{isExpanded ? 'Hide' : 'Show'}</span>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>

                    {/* Group Items */}
                    {isExpanded && (
                      <div className="p-4 space-y-3 divide-y divide-slate-200/60">
                        {group.items.map((item) => (
                          <div 
                            key={item.id}
                            className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] border shrink-0",
                                item.avatarBg
                              )}>
                                {item.instructor.replace('Prof. ', '').split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('')}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold font-mono text-slate-700">{item.subjectCode}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">({item.sectionName})</span>
                                </div>
                                <p className="font-semibold text-slate-800">{item.instructor}</p>
                                <p className="text-[11px] text-slate-400 truncate">{item.subjectName}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 justify-between sm:justify-end">
                              {item.hasSubmitted ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Completed (Archived)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                  <Lock className="h-3 w-3 text-slate-400" /> Closed / Expired
                                </span>
                              )}

                              <button
                                disabled
                                className="px-3 py-1.5 text-[11px] font-bold bg-slate-200/70 text-slate-400 rounded-lg border border-slate-300/60 cursor-not-allowed flex items-center gap-1"
                              >
                                <Lock className="h-3 w-3" /> Sealed
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </>
  );
}

