import { getTransmutedGrade } from '../../lib/gradingMath';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronDown, Eye, CheckCircle, Award, ChevronRight, ShieldCheck, Clock, Plus, X, Printer } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getCachedData, setCachedData } from '../../lib/dataCache';
import { TableSkeleton } from '../../components/common/Skeleton';
import { submitJoinRequest } from '../../lib/classRoomService';

// ASPIRE v3.1: Transparent Official Milestone Ledger (No clearance locks)


export default function MyGradesList() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [semestersList, setSemestersList] = useState([]);
  const [selectedSemLabel, setSelectedSemLabel] = useState('');
  const [grades, setGrades] = useState([]);
  const [officialGwa, setOfficialGwa] = useState(null);
  const [officialStanding, setOfficialStanding] = useState('No grades posted yet');

  // Classroom Join Code State
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleJoinClassSubmit = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    setJoining(true);
    setJoinFeedback(null);
    try {
      const res = await submitJoinRequest(user.id, joinCodeInput);
      setJoinFeedback({
        type: 'success',
        message: `Successfully enrolled in ${res.classRecord?.subjects?.code || 'Course'} (${res.classRecord?.sections?.name || 'Section'})! You now have access to this classroom.`
      });
      setJoinCodeInput('');
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      setJoinFeedback({
        type: 'error',
        message: err.message || 'Failed to join classroom. Please check your code and try again.'
      });
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    async function loadSemesters() {
      if (!user) return;
      
      const semsCacheKey = `student_semesters_${user.id}`;
      const cachedSems = getCachedData(semsCacheKey, 300000);
      if (cachedSems && cachedSems.options?.length > 0) {
        setSemestersList(cachedSems.options);
        if (!selectedSemLabel && cachedSems.defaultLabel) {
          setSelectedSemLabel(cachedSems.defaultLabel);
        }
      }

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
          setCachedData(semsCacheKey, {
            options,
            defaultLabel: defaultOpt.label
          });
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading semesters:', err);
        setLoading(false);
      }
    }

    loadSemesters();
  }, [user, profile, refreshTrigger]);

  useEffect(() => {
    async function loadGradesForSem() {
      if (!user || !selectedSemLabel) return;
      
      const semCacheKey = `student_grades_${user.id}_${selectedSemLabel}`;
      const cached = getCachedData(semCacheKey, 180000);
      if (cached) {
        setGrades(cached.grades || []);
        setOfficialGwa(cached.officialGwa ?? null);
        setOfficialStanding(cached.officialStanding || 'No grades posted yet');
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const activeOpt = semestersList.find(o => o.label === selectedSemLabel);
        if (!activeOpt) return;

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
              const postedRow = crPosted.find(p => p.grade_period === dbTermKey || p.grade_period === termName.toLowerCase());
              if (postedRow) {
                return parseFloat(postedRow.computed_grade);
              }
              return null;
            };

            const prelimRating = getTermRating('Prelim');
            const midtermRating = getTermRating('Midterm');
            const semifinalRating = getTermRating('Semi-Final');
            const finalRating = getTermRating('Final');

            // 1. Midterm Rating (MR) = ROUND((Prelim + Midterm) / 2)
            const mrPostedRow = crPosted.find(p => p.grade_period === 'midterm_rating' || p.grade_period === 'mr');
            let mrGwa = '—';
            let mrRating = null;
            if (mrPostedRow) {
              mrRating = parseFloat(mrPostedRow.computed_grade);
              mrGwa = mrPostedRow.effective_grade !== null 
                ? Number(mrPostedRow.effective_grade).toFixed(2) 
                : getTransmutedGrade(mrRating).toFixed(2);
            } else if (prelimRating !== null && midtermRating !== null) {
              mrRating = Math.round((prelimRating + midtermRating) / 2);
              mrGwa = getTransmutedGrade(mrRating).toFixed(2);
            }

            // 2. Tentative Final Rating (TFR) = ROUND((Semi-Final + Final) / 2)
            const tfrPostedRow = crPosted.find(p => p.grade_period === 'tentative_final_rating' || p.grade_period === 'tfr');
            let tfrGwa = '—';
            let tfrRating = null;
            if (tfrPostedRow) {
              tfrRating = parseFloat(tfrPostedRow.computed_grade);
              tfrGwa = tfrPostedRow.effective_grade !== null 
                ? Number(tfrPostedRow.effective_grade).toFixed(2) 
                : getTransmutedGrade(tfrRating).toFixed(2);
            } else if (semifinalRating !== null && finalRating !== null) {
              tfrRating = Math.round((semifinalRating + finalRating) / 2);
              tfrGwa = getTransmutedGrade(tfrRating).toFixed(2);
            }

            // 3. Semestral Grade (SG) = ROUND((MR + TFR) / 2)
            const sgPostedRow = crPosted.find(p => p.grade_period === 'semestral_grade' || p.grade_period === 'sg');
            let sgGwa = '—';
            let sgRating = null;
            if (sgPostedRow) {
              sgRating = parseFloat(sgPostedRow.computed_grade);
              sgGwa = sgPostedRow.effective_grade !== null 
                ? Number(sgPostedRow.effective_grade).toFixed(2) 
                : getTransmutedGrade(sgRating).toFixed(2);
            } else if (mrRating !== null && tfrRating !== null) {
              sgRating = Math.round((mrRating + tfrRating) / 2);
              sgGwa = getTransmutedGrade(sgRating).toFixed(2);
            }

            // Official Grade & Latest Period
            let officialGrade = '—';
            let officialLatestPeriod = '—';

            if (sgGwa !== '—') {
              officialGrade = sgGwa;
              officialLatestPeriod = 'Semestral Grade (SG)';
            } else {
              const postedTermsOrder = ['Final', 'Semi-Final', 'Midterm', 'Prelim'];
              for (const t of postedTermsOrder) {
                const dbTermKey = t.toLowerCase().replace('-', '_');
                const postRow = crPosted.find(p => p.grade_period === dbTermKey);
                if (postRow) {
                  officialGrade = postRow.effective_grade !== null 
                    ? Number(postRow.effective_grade).toFixed(2) 
                    : getTransmutedGrade(parseFloat(postRow.computed_grade)).toFixed(2);
                  officialLatestPeriod = t;
                  break;
                }
              }
            }

            // Official Remarks
            let remarks = 'Ongoing';
            if (sgGwa !== '—') {
              const numSg = parseFloat(sgGwa);
              remarks = numSg <= 3.00 ? 'Passed' : 'Failed';
            } else if (finalRating !== null) {
              const numFinal = parseFloat(getTransmutedGrade(finalRating).toFixed(2));
              remarks = numFinal <= 3.00 ? 'Passed' : 'Failed';
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
              mrGwa,
              mrRating,
              tfrGwa,
              tfrRating,
              sgGwa,
              sgRating,
              remarks,
              officialLatestPeriod,
              officialGrade
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

        const standing = getStanding(offGwa);
        setOfficialStanding(standing);

        setCachedData(semCacheKey, {
          grades: mappedGrades,
          officialGwa: offGwa,
          officialStanding: standing
        });

      } catch (err) {
        console.error('Error loading grades details:', err);
      } finally {
        setLoading(false);
      }
    }

    loadGradesForSem();
  }, [user, selectedSemLabel, semestersList, refreshTrigger]);

  if (loading) {
    return <TableSkeleton rows={5} />;
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="My Grades" breadcrumb="Student Portal">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
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

            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              title="Print or export unofficial grade slip"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">Print Grade Slip</span>
              <span className="sm:hidden">Print</span>
            </button>

            <button
              onClick={() => {
                setIsJoinModalOpen(true);
                setJoinFeedback(null);
                setJoinCodeInput('');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Join Class with Code</span>
            </button>
          </div>
        </PageHeader>
      </div>

      {/* ========================================================================= */}
      {/* PRINT-ONLY UNOFFICIAL GRADE SLIP (DYCI Standard)                         */}
      {/* ========================================================================= */}
      <div className="hidden print:block p-8 bg-white text-slate-900 font-sans text-xs">
        <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
          <h1 className="text-base font-bold uppercase tracking-wider text-slate-900">Dr. Yanga's Colleges, Inc.</h1>
          <p className="text-xs text-slate-600">Wakas, Bocaue, Bulacan • Office of the College Registrar</p>
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-slate-900 mt-3">Student Unofficial Grade Slip</h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{selectedSemLabel}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 text-xs border border-slate-200 rounded-lg p-3 bg-slate-50/50">
          <div>
            <p><span className="font-bold text-slate-600">Student Name:</span> {profile?.first_name} {profile?.last_name}</p>
            <p className="mt-1"><span className="font-bold text-slate-600">Student ID:</span> {profile?.student_id || user?.id?.substring(0, 8).toUpperCase()}</p>
          </div>
          <div>
            <p><span className="font-bold text-slate-600">Program / Degree:</span> {profile?.course || 'BS Information Technology'}</p>
            <p className="mt-1"><span className="font-bold text-slate-600">Date Generated:</span> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <table className="w-full text-left border-collapse border border-slate-300 mb-6 text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800 text-[11px]">
              <th className="p-2 border border-slate-300">Course Code</th>
              <th className="p-2 border border-slate-300">Course Title</th>
              <th className="p-2 text-center border border-slate-300">Units</th>
              <th className="p-2 text-center border border-slate-300">Midterm (MR)</th>
              <th className="p-2 text-center border border-slate-300">Tentative Final (TFR)</th>
              <th className="p-2 text-center border border-slate-300">Semestral Grade (SG)</th>
              <th className="p-2 text-center border border-slate-300">GWA</th>
              <th className="p-2 text-center border border-slate-300">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((item) => (
              <tr key={`print-${item.class_record_id}`} className="border-b border-slate-200">
                <td className="p-2 font-mono font-bold border border-slate-300">{item.code}</td>
                <td className="p-2 border border-slate-300">{item.name}</td>
                <td className="p-2 text-center font-mono border border-slate-300">{item.credits.toFixed(1)}</td>
                <td className="p-2 text-center font-mono border border-slate-300">{item.mrGwa}</td>
                <td className="p-2 text-center font-mono border border-slate-300">{item.tfrGwa}</td>
                <td className="p-2 text-center font-mono border border-slate-300">{item.sgGwa}</td>
                <td className="p-2 text-center font-mono font-bold border border-slate-300">{item.officialGrade}</td>
                <td className="p-2 text-center font-semibold uppercase text-[10px] border border-slate-300">
                  {item.remarks}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
              <td colSpan="2" className="p-2 text-right border border-slate-300">Total Enrolled Units:</td>
              <td className="p-2 text-center font-mono border border-slate-300">
                {grades.reduce((sum, g) => sum + g.credits, 0).toFixed(1)}
              </td>
              <td colSpan="3" className="p-2 text-right border border-slate-300">Official Semestral GWA:</td>
              <td className="p-2 text-center font-mono text-sm border border-slate-300">
                {officialGwa !== null ? officialGwa.toFixed(2) : '—'}
              </td>
              <td className="p-2 text-center text-[10px] uppercase border border-slate-300">{officialStanding}</td>
            </tr>
          </tfoot>
        </table>

        <div className="text-[10px] text-slate-500 border-t border-slate-300 pt-3 mb-8 leading-relaxed">
          <strong>NOTICE:</strong> This document is an unofficial student grade slip generated via the ASPIRE Academic Portal for academic advising and tracking purposes only. It is not an official transcript of records (OTR). Any unauthorized alteration or erasure renders this slip void.
        </div>

        <div className="grid grid-cols-2 gap-12 pt-6 text-center text-xs">
          <div>
            <div className="border-b border-slate-400 pb-1 mb-1 font-bold text-slate-800">
              {profile?.first_name} {profile?.last_name}
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Student Signature</span>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-1 mb-1 font-bold text-slate-800">
              Office of the College Registrar
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Verified Official Copy</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SCREEN VIEW (DESKTOP & MOBILE)                                            */}
      {/* ========================================================================= */}
      <div className="print:hidden p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Institutional Milestone Notice */}
        <div className="rounded-xl p-4 border border-slate-200 bg-white shadow-xs flex items-center justify-between gap-4 text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 text-slate-600 rounded-lg shrink-0">
              <ShieldCheck className="h-5 w-5 text-sage-600" />
            </div>
            <div>
              <h4 className="font-bold text-xs sm:text-sm text-slate-900 font-display">
                Official Academic Milestone Ledger
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Displays official Midterm Rating (MR), Tentative Final Rating (TFR), and Semestral Grade (SG) milestones.
              </p>
            </div>
          </div>
          <Link
            to="/student/advising-inbox"
            className="text-xs font-semibold text-sage-600 hover:text-sage-700 whitespace-nowrap"
          >
            View Advising Inbox →
          </Link>
        </div>
        
        {/* Single Official GWA Summary Metric Card */}
        <div className="bg-emerald-50/40 border border-emerald-100/90 rounded-2xl p-5 sm:p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1 text-left">
            <span className="text-[10px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wider block">Official Cumulative GWA</span>
            <div className="text-3xl sm:text-4xl font-extrabold font-mono text-emerald-950">
              {officialGwa !== null ? officialGwa.toFixed(2) : '—'}
            </div>
            <p className="text-xs sm:text-sm text-emerald-700 font-medium">Official Academic Standing: <strong className="font-bold">{officialStanding}</strong></p>
          </div>
          <div className="p-3.5 sm:p-4 bg-emerald-100 text-emerald-700 rounded-2xl shadow-sm flex-shrink-0">
            <Award className="h-6 w-6 sm:h-8 sm:w-8" />
          </div>
        </div>

        {/* MOBILE VIEW (<= 768px): Single Official Course Cards List */}
        <div className="block md:hidden space-y-3">
          {grades.map((item) => {
            const hasGrade = item.officialGrade !== '—';

            return (
              <div 
                key={`mob-${item.class_record_id}`}
                className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm space-y-3 hover:border-sage-300 transition-all text-left"
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
                      {item.officialGrade}
                    </span>
                  </div>
                </div>

                {/* Milestone Summary Grid */}
                <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center text-xs">
                  <div className="bg-slate-50 rounded-lg p-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Midterm (MR)</span>
                    <span className="font-mono font-bold text-slate-800">{item.mrGwa}</span>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Tent. Final (TFR)</span>
                    <span className="font-mono font-bold text-slate-800">{item.tfrGwa}</span>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Sem. Grade (SG)</span>
                    <span className="font-mono font-bold text-slate-800">{item.sgGwa}</span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase",
                      item.remarks === 'Passed' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                      item.remarks === 'Failed' && "bg-rose-50 text-rose-700 border-rose-200",
                      item.remarks === 'Ongoing' && "bg-slate-50 text-slate-600 border-slate-200"
                    )}>
                      {item.remarks}
                    </span>
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

        {/* DESKTOP VIEW (>= 768px): Single Full-Width Official Grades Ledger */}
        <div className="hidden md:block">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display text-left">
                  Official Academic Grades Ledger
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-semibold font-mono">
                DYCI Institutional Standards
              </span>
            </div>
            <div className="table-container overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-3.5 font-medium">Subject Code & Course Title</th>
                    <th className="px-4 py-3.5 font-medium">Faculty Instructor</th>
                    <th className="px-3 py-3.5 text-center font-medium">Units</th>
                    <th className="px-3 py-3.5 text-center font-medium">Midterm (MR)</th>
                    <th className="px-3 py-3.5 text-center font-medium">Tentative Final (TFR)</th>
                    <th className="px-3 py-3.5 text-center font-medium">Semestral Grade (SG)</th>
                    <th className="px-4 py-3.5 text-center font-medium">Transmuted GWA</th>
                    <th className="px-3 py-3.5 text-center font-medium">Remarks</th>
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
                      <td className="px-3 py-4 text-center font-mono text-slate-700">
                        {item.mrGwa !== '—' ? (
                          <span className="font-bold text-slate-800">{item.mrGwa}</span>
                        ) : (
                          <span className="text-slate-350">—</span>
                        )}
                      </td>
                      <td className="px-3 py-4 text-center font-mono text-slate-700">
                        {item.tfrGwa !== '—' ? (
                          <span className="font-bold text-slate-800">{item.tfrGwa}</span>
                        ) : (
                          <span className="text-slate-350">—</span>
                        )}
                      </td>
                      <td className="px-3 py-4 text-center font-mono text-slate-700">
                        {item.sgGwa !== '—' ? (
                          <span className="font-bold text-slate-800">{item.sgGwa}</span>
                        ) : (
                          <span className="text-slate-350">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn(
                          "font-mono text-base font-extrabold",
                          item.officialGrade === '—' ? 'text-slate-350' : 'text-emerald-700'
                        )}>
                          {item.officialGrade}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-center">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          item.remarks === 'Passed' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                          item.remarks === 'Failed' && "bg-rose-50 text-rose-700 border border-rose-200",
                          item.remarks === 'Ongoing' && "bg-slate-100 text-slate-600 border border-slate-200"
                        )}>
                          {item.remarks}
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
                      <td colSpan="9" className="px-6 py-12 text-center text-slate-400 text-sm">
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

      {/* ========================================================================= */}
      {/* JOIN CLASSROOM WITH CODE MODAL                                            */}
      {/* ========================================================================= */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs text-left animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold font-display text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-sage-600" />
                <span>Join Classroom with Code</span>
              </h3>
              <button
                onClick={() => setIsJoinModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleJoinClassSubmit} className="p-5 space-y-4 text-xs font-sans">
              {joinFeedback && (
                <div className={cn(
                  "p-3 rounded-md text-xs flex items-center gap-2",
                  joinFeedback.type === 'success' 
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border border-rose-200 text-rose-700"
                )}>
                  {joinFeedback.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>{joinFeedback.message}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-600 leading-relaxed">
                Enter the official <strong>Classroom Code</strong> provided by your professor. Regular block students and irregular students will be immediately enrolled into the official class record.
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                  Classroom Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. CS3A-8X92"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-sage-600 tracking-wider"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joining || !joinCodeInput.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 active:bg-sage-800 disabled:opacity-50 rounded-md shadow-xs transition-colors cursor-pointer"
                >
                  {joining ? 'Enrolling...' : 'Enroll with Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

