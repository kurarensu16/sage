import { getTransmutedGrade } from '../../lib/gradingMath';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronDown, Eye, CheckCircle, Award, ChevronRight, Lock, ShieldCheck, MessageSquare, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

// Helper to check pending evaluations for clearance sign-off
const checkPendingEvals = async (studentId, sectionId) => {
  let isOfficeSigned = false;

  // 1. Check if explicit clearance record is signed by Office in clearance_records
  try {
    const { data: activeTerm } = await supabase
      .from('academic_terms')
      .select('term_id')
      .eq('is_active', true)
      .maybeSingle();

    let clrQuery = supabase
      .from('clearance_records')
      .select('status')
      .eq('student_id', studentId);

    if (activeTerm?.term_id) {
      clrQuery = clrQuery.eq('term_id', activeTerm.term_id);
    }

    const { data: clr } = await clrQuery.maybeSingle();
    if (clr && clr.status === 'SIGNED') {
      isOfficeSigned = true;
    }
  } catch {
    // Ignore error if table not queried
  }

  if (!sectionId) return { totalWindows: 0, pendingCount: 0, isOfficeSigned };
  const now = new Date().toISOString();

  // 2. Query active evaluation windows for section
  const { data: windows } = await supabase
    .from('evaluation_windows')
    .select('window_id')
    .eq('section_id', sectionId)
    .lte('open_at', now)
    .gte('close_at', now)
    .eq('is_closed', false);

  if (!windows || windows.length === 0) {
    return { totalWindows: 0, pendingCount: 0, isOfficeSigned };
  }

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

  return {
    totalWindows: windows.length,
    pendingCount,
    isOfficeSigned
  };
};

// Helper to transmute raw scores to DYCI standard grades


// Helper to calculate term ratings from draft scores
const calculateTermRating = (draftScores, maxSetup) => {
  if (!draftScores) return null;
  const max = maxSetup || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };

  const act1 = draftScores.act1 !== null ? draftScores.act1 : 0;
  const act2 = draftScores.act2 !== null ? draftScores.act2 : 0;
  const act3 = draftScores.act3 !== null ? draftScores.act3 : 0;
  const act4 = draftScores.act4 !== null ? draftScores.act4 : 0;
  const act5 = draftScores.act5 !== null ? draftScores.act5 : 0;
  const act6 = draftScores.act6 !== null ? draftScores.act6 : 0;
  const char = draftScores.char_rating !== null ? draftScores.char_rating : 0;
  const exam = draftScores.exam !== null ? draftScores.exam : 0;

  // Class Standing (50%)
  const csSum = act1 + act2 + act3 + act4 + act5 + act6;
  const csMax = max.act1 + max.act2 + max.act3 + max.act4 + max.act5 + max.act6;
  const csPct = csMax > 0 ? (csSum / csMax) * 50 : 0;

  // Character Rating (10%)
  const charPct = char * 0.1;

  // Term Exam (40%)
  const examMax = max.exam;
  const examPct = examMax > 0 ? (exam / examMax) * 40 : 0;

  return Math.min(100, Math.max(0, Math.round(csPct + charPct + examPct)));
};

export default function MyGradesList() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [semestersList, setSemestersList] = useState([]);
  const [selectedSemLabel, setSelectedSemLabel] = useState('');
  const [grades, setGrades] = useState([]);
  const [evalClearance, setEvalClearance] = useState({ totalWindows: 0, pendingCount: 0, isSigned: false });

  const [officialGwa, setOfficialGwa] = useState(null);
  const [officialStanding, setOfficialStanding] = useState('No grades posted yet');

  useEffect(() => {
    async function loadSemesters() {
      if (!user) return;
      try {
        // 1. Fetch active term from central academic_terms registry
        const { data: activeTerm } = await supabase
          .from('academic_terms')
          .select('term_id, school_year, semester')
          .eq('is_active', true)
          .maybeSingle();

        // 2. Fetch student's enrollments and assigned section
        const { data: enrolls, error } = await supabase
          .from('enrollments')
          .select(`
            section_id,
            sections ( section_id, name, school_year, semester )
          `)
          .eq('student_id', user.id);

        if (error) throw error;

        const options = [];
        const seen = new Set();

        const formatLabel = (sem, sy) => {
          const syFormatted = sy?.startsWith('AY') ? sy : `AY ${sy || ''}`;
          const semName = sem === '1st' ? 'First' : sem === '2nd' ? 'Second' : sem === 'Summer' ? 'Summer' : (sem || '');
          const label = `${semName} Semester, ${syFormatted}`;
          return label.replace('Summer Semester', 'Summer Term');
        };

        const activeLabel = activeTerm ? formatLabel(activeTerm.semester, activeTerm.school_year) : '';

        if (profile?.section_id) {
          const { data: currentSec } = await supabase
            .from('sections')
            .select('*')
            .eq('section_id', profile.section_id)
            .single();

          if (currentSec) {
            const label = formatLabel(currentSec.semester, currentSec.school_year);
            seen.add(label);
            options.push({
              label,
              semester: currentSec.semester,
              school_year: currentSec.school_year,
              section_id: currentSec.section_id
            });
          }
        }

        enrolls?.forEach(e => {
          if (e.sections) {
            const label = formatLabel(e.sections.semester, e.sections.school_year);
            if (!seen.has(label)) {
              seen.add(label);
              options.push({
                label,
                semester: e.sections.semester,
                school_year: e.sections.school_year,
                section_id: e.sections.section_id
              });
            }
          }
        });

        // Ensure central active term is in options
        if (activeLabel && !seen.has(activeLabel)) {
          options.unshift({
            label: activeLabel,
            semester: activeTerm.semester,
            school_year: activeTerm.school_year,
            section_id: profile?.section_id || (enrolls?.[0]?.section_id || null)
          });
        }

        setSemestersList(options);
        if (options.length > 0) {
          // Prioritize active system term
          const matchedActive = activeLabel ? options.find(o => o.label === activeLabel) : null;
          const matchedProfile = options.find(o => o.section_id === profile?.section_id);
          const defaultOpt = matchedActive || matchedProfile || options[0];
          setSelectedSemLabel(defaultOpt.label);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading semesters:', err);
        setLoading(false);
      }
    }

    loadSemesters();
  }, [user, profile]);

  useEffect(() => {
    async function loadGradesForSem() {
      if (!user || !selectedSemLabel) return;
      setLoading(true);
      try {
        const activeOpt = semestersList.find(o => o.label === selectedSemLabel);
        if (!activeOpt) return;

        // Fetch pending evaluation count for clearance gating
        const clearanceInfo = await checkPendingEvals(user.id, activeOpt.section_id);
        setEvalClearance(clearanceInfo);

        // 1. Fetch enrollments for the selected semester
        let enrollsQuery = supabase
          .from('enrollments')
          .select(`
            subject_id,
            section_id,
            sections ( section_id, school_year, semester ),
            subjects ( subject_id, code, name, units )
          `)
          .eq('student_id', user.id);

        if (activeOpt.section_id) {
          enrollsQuery = enrollsQuery.eq('section_id', activeOpt.section_id);
        }

        const { data: enrolls } = await enrollsQuery;
        const subjectIds = enrolls?.map(e => e.subject_id) || [];
        
        // 2. Fetch class records
        let crQuery = supabase
          .from('class_records')
          .select(`
            class_record_id,
            subject_id,
            section_id,
            faculty:users!faculty_id ( first_name, last_name )
          `)
          .in('subject_id', subjectIds)
          .eq('status', 'active');

        if (activeOpt.section_id) {
          crQuery = crQuery.eq('section_id', activeOpt.section_id);
        }

        const { data: classRecords } = await crQuery;

        const classRecordIds = classRecords?.map(cr => cr.class_record_id) || [];

        // 3. Fetch posted grades
        const { data: posted } = await supabase
          .from('posted_grades')
          .select('*')
          .eq('student_id', user.id)
          .in('class_record_id', classRecordIds);

        // 4. Fetch draft scores
        const { data: drafts } = await supabase
          .from('student_term_scores')
          .select('*')
          .eq('student_id', user.id)
          .in('class_record_id', classRecordIds);

        // 5. Fetch class grading columns (max scores)
        const { data: gradingCols, error: colsErr } = await supabase
          .from('class_grading_columns')
          .select('*')
          .in('class_record_id', classRecordIds);

        if (colsErr) throw colsErr;

        // Map data structures
        const subMap = {};
        enrolls?.forEach(e => {
          if (e.subjects) {
            subMap[e.subject_id] = e.subjects;
          }
        });

        const postedMap = {};
        posted?.forEach(p => {
          if (!postedMap[p.class_record_id]) postedMap[p.class_record_id] = [];
          postedMap[p.class_record_id].push(p);
        });

        const draftsMap = {};
        drafts?.forEach(d => {
          if (!draftsMap[d.class_record_id]) draftsMap[d.class_record_id] = {};
          draftsMap[d.class_record_id][d.term] = d;
        });

        const colsMap = {};
        gradingCols?.forEach(c => {
          if (!colsMap[c.class_record_id]) colsMap[c.class_record_id] = {};
          colsMap[c.class_record_id][c.term] = {
            act1: c.act1_max,
            act2: c.act2_max,
            act3: c.act3_max,
            act4: c.act4_max,
            act5: c.act5_max,
            act6: c.act6_max,
            exam: c.exam_max
          };
        });

        let totalOfficialUnits = 0;
        let weightedOfficialSum = 0;

        const mappedGrades = (classRecords || [])
          .filter(cr => subMap[cr.subject_id])
          .map(cr => {
            const subj = subMap[cr.subject_id];

            const crPosted = postedMap[cr.class_record_id] || [];
            const crDrafts = draftsMap[cr.class_record_id] || {};
            const crCols = colsMap[cr.class_record_id] || {};

            const getTermRating = (termName) => {
              const dbTermKey = termName.toLowerCase().replace('-', '_');
              const postedRow = crPosted.find(p => p.grade_period === dbTermKey);
              if (postedRow) {
                return parseFloat(postedRow.computed_grade);
              }
              const draftRow = crDrafts[termName];
              if (draftRow) {
                const hasScores = 
                  (draftRow.act1 && draftRow.act1 > 0) ||
                  (draftRow.act2 && draftRow.act2 > 0) ||
                  (draftRow.act3 && draftRow.act3 > 0) ||
                  (draftRow.act4 && draftRow.act4 > 0) ||
                  (draftRow.act5 && draftRow.act5 > 0) ||
                  (draftRow.act6 && draftRow.act6 > 0) ||
                  (draftRow.char_rating && draftRow.char_rating > 0) ||
                  (draftRow.exam && draftRow.exam > 0);
                if (!hasScores) return null;
                return calculateTermRating(draftRow, crCols[termName]);
              }
              return null;
            };

            const prelimRating = getTermRating('Prelim');
            const midtermRating = getTermRating('Midterm');
            const semifinalRating = getTermRating('Semi-Final');
            const finalRating = getTermRating('Final');

            // Compute running rating
            let runningRating = null;
            let runningLatestPeriod = '—';
            if (finalRating !== null) {
              const mr = Math.round(((prelimRating || 0) + (midtermRating || 0)) / 2);
              const tfr = Math.round(((semifinalRating || 0) + finalRating) / 2);
              runningRating = Math.round((mr + tfr) / 2);
              runningLatestPeriod = 'Final';
            } else if (semifinalRating !== null) {
              const mr = Math.round(((prelimRating || 0) + (midtermRating || 0)) / 2);
              const tfr = semifinalRating;
              runningRating = Math.round((mr + tfr) / 2);
              runningLatestPeriod = 'Semi-Final';
            } else if (midtermRating !== null) {
              runningRating = Math.round(((prelimRating || 0) + midtermRating) / 2);
              runningLatestPeriod = 'Midterm';
            } else if (prelimRating !== null) {
              runningRating = prelimRating;
              runningLatestPeriod = 'Prelim';
            }

            const runningGrade = runningRating !== null ? getTransmutedGrade(runningRating).toFixed(2) : '—';

            // Compute official grade
            let officialGrade = '—';
            let officialLatestPeriod = '—';
            const postedTermsOrder = ['Final', 'Semi-Final', 'Midterm', 'Prelim'];
            for (const t of postedTermsOrder) {
              const dbTermKey = t.toLowerCase().replace('-', '_');
              const postRow = crPosted.find(p => p.grade_period === dbTermKey);
              if (postRow) {
                officialGrade = postRow.effective_grade !== null 
                  ? postRow.effective_grade.toFixed(2) 
                  : getTransmutedGrade(parseFloat(postRow.computed_grade)).toFixed(2);
                officialLatestPeriod = t;
                break;
              }
            }

            if (officialGrade !== '—') {
              const numGrade = parseFloat(officialGrade);
              if (!isNaN(numGrade)) {
                totalOfficialUnits += subj.units;
                weightedOfficialSum += numGrade * subj.units;
              }
            }

            return {
              class_record_id: cr.class_record_id,
              code: subj.code,
              name: subj.name,
              credits: subj.units,
              instructor: cr.faculty ? `Prof. ${cr.faculty.first_name} ${cr.faculty.last_name}` : 'TBA',
              officialLatestPeriod,
              officialGrade,
              runningLatestPeriod,
              runningGrade
            };
          });

        setGrades(mappedGrades);

        const offGwa = totalOfficialUnits > 0 ? (weightedOfficialSum / totalOfficialUnits) : null;

        setOfficialGwa(offGwa);

        const getStanding = (gwaNum) => {
          if (gwaNum === null) return 'No grades posted yet';
          if (gwaNum <= 1.45) return 'Excellent';
          if (gwaNum <= 1.75) return 'Very Good';
          if (gwaNum <= 3.00) return 'Satisfactory';
          return 'Academic warning';
        };

        setOfficialStanding(getStanding(offGwa));

      } catch (err) {
        console.error('Error loading grades details:', err);
      } finally {
        setLoading(false);
      }
    }

    loadGradesForSem();
  }, [user, selectedSemLabel, semestersList]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-xs text-slate-500 font-medium font-sans">Loading academic grades...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="My Grades" breadcrumb="Student Portal">
        <div className="relative w-full sm:w-auto">
          <select 
            value={selectedSemLabel}
            onChange={(e) => setSelectedSemLabel(e.target.value)}
            className="w-full sm:w-auto appearance-none bg-white border border-slate-200 hover:border-sage-300 text-slate-700 px-3.5 py-2 pr-9 rounded-xl text-xs font-medium focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer shadow-sm"
          >
            {semestersList.map((sem, idx) => (
              <option key={idx} value={sem.label}>{sem.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Term Clearance & Evaluation Lock Status Banner */}
        <div className={cn(
          "rounded-2xl p-4 sm:p-5 border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4",
          evalClearance.isOfficeSigned
            ? "bg-emerald-50 border-emerald-200 text-emerald-950"
            : evalClearance.totalWindows > 0 && evalClearance.pendingCount === 0
            ? "bg-sky-50 border-sky-200 text-sky-950"
            : evalClearance.pendingCount > 0
            ? "bg-amber-50 border-amber-200 text-amber-950"
            : "bg-slate-50 border-slate-200 text-slate-900"
        )}>
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={cn(
              "p-2.5 rounded-xl flex-shrink-0 mt-0.5 sm:mt-0",
              evalClearance.isOfficeSigned 
                ? "bg-emerald-100 text-emerald-700" 
                : evalClearance.totalWindows > 0 && evalClearance.pendingCount === 0
                ? "bg-sky-100 text-sky-700"
                : evalClearance.pendingCount > 0 
                ? "bg-amber-100 text-amber-700" 
                : "bg-slate-200/70 text-slate-600"
            )}>
              {evalClearance.isOfficeSigned ? (
                <ShieldCheck className="h-6 w-6" />
              ) : evalClearance.pendingCount > 0 ? (
                <Lock className="h-6 w-6" />
              ) : (
                <Clock className="h-6 w-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm sm:text-base font-display">
                  Term Clearance: {
                    evalClearance.isOfficeSigned 
                      ? 'SIGNED & CLEARED' 
                      : evalClearance.totalWindows > 0 && evalClearance.pendingCount === 0
                      ? 'AWAITING OFFICE SIGN-OFF'
                      : evalClearance.pendingCount > 0 
                      ? 'UNSIGNED (PENDING EVALUATION)' 
                      : 'PENDING EVALUATION PERIOD'
                  }
                </h4>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-extrabold border",
                  evalClearance.isOfficeSigned
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : evalClearance.totalWindows > 0 && evalClearance.pendingCount === 0
                    ? "bg-sky-100 text-sky-800 border-sky-200"
                    : evalClearance.pendingCount > 0
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-slate-200/80 text-slate-700 border-slate-300"
                )}>
                  {evalClearance.isOfficeSigned 
                    ? 'Clearance Signed by Office' 
                    : evalClearance.totalWindows > 0 && evalClearance.pendingCount === 0
                    ? 'Surveys Completed'
                    : evalClearance.pendingCount > 0 
                    ? `${evalClearance.pendingCount} Pending Eval(s)` 
                    : 'Evaluation Period Not Active'
                  }
                </span>
              </div>
              <p className="text-xs mt-1 text-slate-600">
                {evalClearance.isOfficeSigned
                  ? "Your semester clearance has been officially verified and signed off by the College Office."
                  : evalClearance.totalWindows > 0 && evalClearance.pendingCount === 0
                  ? "You have completed all faculty evaluation surveys. Your official clearance is currently being audited and finalized by the College Office."
                  : evalClearance.pendingCount > 0
                  ? `You have ${evalClearance.pendingCount} pending faculty evaluation survey(s). Complete all evaluations to qualify for clearance sign-off.`
                  : "Faculty evaluation survey period is not currently active for this semester. Clearance sign-off is pending until evaluation windows open and are completed."
                }
              </p>
            </div>
          </div>

          {evalClearance.pendingCount > 0 && (
            <Link
              to="/student/evallist"
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm whitespace-nowrap self-end sm:self-auto cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" /> Evaluate Faculty Now
            </Link>
          )}
        </div>
        
        {/* Single Official GWA Summary Metric Card */}
        <div className="bg-emerald-50/40 border border-emerald-100/90 rounded-2xl p-5 sm:p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1 text-left">
            <span className="text-[10px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wider block">Official Cumulative GWA</span>
            <div className="text-3xl sm:text-4xl font-extrabold font-mono text-emerald-950">
              {evalClearance.pendingCount > 0 ? '🔒.🔒🔒' : (officialGwa !== null ? officialGwa.toFixed(2) : '—')}
            </div>
            <p className="text-xs sm:text-sm text-emerald-700 font-medium">Official Academic Standing: <strong className="font-bold">{evalClearance.pendingCount > 0 ? 'Locked (Complete Evaluations)' : officialStanding}</strong></p>
          </div>
          <div className="p-3.5 sm:p-4 bg-emerald-100 text-emerald-700 rounded-2xl shadow-sm flex-shrink-0">
            <Award className="h-6 w-6 sm:h-8 sm:w-8" />
          </div>
        </div>

        {/* MOBILE VIEW ($\le 768px$): Single Official Course Cards List */}
        <div className="block md:hidden space-y-3">
          {grades.map((item) => {
            const hasGrade = item.officialGrade !== '—';

            return (
              <div 
                key={`mob-${item.class_record_id}`}
                className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm space-y-3 hover:border-sage-300 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-slate-400">{item.code}</span>
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {item.credits.toFixed(1)} Units
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 mt-1">{item.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{item.instructor}</p>
                  </div>

                  {/* Grade Badge */}
                  <div className={cn(
                    "flex flex-col items-end justify-center px-3 py-1.5 rounded-xl border flex-shrink-0 min-w-[64px] text-right",
                    hasGrade ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-slate-50 border-slate-200 text-slate-400"
                  )}>
                    <span className="text-[9px] font-bold uppercase tracking-wider block opacity-70">
                      GWA
                    </span>
                    <span className="font-mono text-base font-extrabold block">
                      {evalClearance.pendingCount > 0 ? '🔒' : item.officialGrade}
                    </span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    {item.officialLatestPeriod !== '—' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-100">
                        {item.officialLatestPeriod} Posted
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-400 border border-slate-100">
                        No Grades Posted
                      </span>
                    )}
                  </div>

                  <Link 
                    to={`/student/mygradesdetail?id=${item.class_record_id}`}
                    className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-1"
                  >
                    View Breakdown <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}

          {grades.length === 0 && (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6 text-slate-400 text-xs">
              No course grades found for this semester.
            </div>
          )}
        </div>

        {/* DESKTOP VIEW ($\ge 768px$): Single Full-Width Official Grades Ledger */}
        <div className="hidden md:block">
          <div className="bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-emerald-50/50 px-6 py-4 border-b border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider font-display text-left">
                  Official Academic Grades Ledger
                </h3>
              </div>
              <span className="text-xs text-emerald-700 font-semibold">
                Official Registrar Grades
              </span>
            </div>
            <div className="table-container overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-3.5 font-medium">Subject Code & Course Title</th>
                    <th className="px-4 py-3.5 font-medium">Faculty Instructor</th>
                    <th className="px-3 py-3.5 text-center font-medium">Units</th>
                    <th className="px-4 py-3.5 text-center font-medium">Latest Milestone Posted</th>
                    <th className="px-4 py-3.5 text-center font-medium">Official Grade</th>
                    <th className="px-6 py-3.5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {grades.map((item) => (
                    <tr key={`off-${item.class_record_id}`} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 text-sm">{item.code}</div>
                        <div className="text-slate-500 font-normal mt-0.5">{item.name}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-600 font-medium">{item.instructor}</td>
                      <td className="px-3 py-4 text-center font-mono text-slate-650">{item.credits.toFixed(1)}</td>
                      <td className="px-4 py-4 text-center">
                        {item.officialLatestPeriod !== '—' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {item.officialLatestPeriod} Posted
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-400 border border-slate-100">
                            No Grades Posted
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn(
                          "font-mono text-base font-extrabold",
                          evalClearance.pendingCount > 0 ? 'text-amber-600' : (item.officialGrade === '—' ? 'text-slate-350' : 'text-emerald-700')
                        )}>
                          {evalClearance.pendingCount > 0 ? '🔒' : item.officialGrade}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link 
                          to={`/student/mygradesdetail?id=${item.class_record_id}`}
                          className="px-3 py-1.5 border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 bg-white rounded-lg transition-colors inline-flex items-center justify-center gap-1 text-xs font-bold"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Breakdown
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {grades.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-slate-400 text-sm">
                        No official grades found for this semester.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
