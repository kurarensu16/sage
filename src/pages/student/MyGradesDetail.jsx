import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  ChevronRight, 
  ChevronDown, 
  AlertCircle 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getTransmutedGrade, calculateSemestralGrade } from '../../lib/gradingMath';

export default function MyGradesDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const classRecordId = new URLSearchParams(location.search).get('id');
  const [activeTab, setActiveTab] = useState('Prelim');
  const [isCsExpanded, setIsCsExpanded] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState(null);

  const [loading, setLoading] = useState(true);
  const [classInfo, setClassInfo] = useState(null);
  
  // Dynamic grade data
  const [termData, setTermData] = useState({
    Prelim: { rating: 0, grade: '—', status: 'Draft', overallPct: 0, components: [], missingScores: [] },
    Midterm: { rating: 0, grade: '—', status: 'Draft', overallPct: 0, components: [], missingScores: [] },
    'Semi-Final': { rating: 0, grade: '—', status: 'Draft', overallPct: 0, components: [], missingScores: [] },
    Final: { rating: 0, grade: '—', status: 'Draft', overallPct: 0, components: [], missingScores: [] }
  });

  const [finalCalculations, setFinalCalculations] = useState({
    mr: 0,
    tfr: 0,
    sg: 0,
    finalGwa: '—',
    remarks: '—'
  });

  useEffect(() => {
    async function loadGradeBreakdown() {
      if (!user) return;

      let targetClassRecordId = classRecordId;
      
      setLoading(true);
      try {
        // If no classRecordId provided, try to find the student's first active enrollment
        if (!targetClassRecordId) {
          const { data: enrolls } = await supabase
            .from('enrollments')
            .select('section_id, subject_id')
            .eq('student_id', user.id)
            .limit(1);

          if (enrolls && enrolls.length > 0) {
            const { data: cr } = await supabase
              .from('class_records')
              .select('class_record_id')
              .eq('section_id', enrolls[0].section_id)
              .eq('subject_id', enrolls[0].subject_id)
              .eq('status', 'active')
              .limit(1);

            if (cr && cr.length > 0) {
              targetClassRecordId = cr[0].class_record_id;
            }
          }
        }

        if (!targetClassRecordId) {
          setLoading(false);
          return;
        }

        // 1. Fetch Class Record Details
        const { data: crInfo, error: crErr } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            status,
            school_year,
            semester,
            subject_id,
            subjects ( code, name, units, computation_id ),
            faculty:users!faculty_id ( first_name, last_name )
          `)
          .eq('class_record_id', targetClassRecordId)
          .single();

        if (crErr) throw crErr;

        if (crInfo?.subjects?.computation_id) {
          try {
            const { data: compData } = await supabase
              .from('grade_computations')
              .select('name, description, grade_computation_components ( * )')
              .eq('computation_id', crInfo.subjects.computation_id)
              .maybeSingle();

            if (compData && crInfo.subjects) {
              crInfo.subjects.grade_computations = compData;
            }
          } catch (compErr) {
            console.warn('Could not fetch grade_computations for student view:', compErr);
          }
        }

        setClassInfo(crInfo);

        // 2. Fetch Columns Max Score Setup
        const { data: cols } = await supabase
          .from('class_grading_columns')
          .select('*')
          .eq('class_record_id', targetClassRecordId);

        // 3. Fetch Raw scores
        const { data: scores } = await supabase
          .from('student_term_scores')
          .select('*')
          .eq('class_record_id', targetClassRecordId)
          .eq('student_id', user.id);

        // 4. Fetch Posted grades
        const { data: posted } = await supabase
          .from('posted_grades')
          .select('*')
          .eq('class_record_id', targetClassRecordId)
          .eq('student_id', user.id);

        // 4. Fetch dynamic custom activities & individual student scores from Supabase
        let dynamicActivities = [];
        let studentScoresByActivity = {};
        try {
          const { data: acts } = await supabase
            .from('class_activities')
            .select('*')
            .eq('class_record_id', targetClassRecordId)
            .order('created_at', { ascending: true });

          if (acts && acts.length > 0) {
            dynamicActivities = acts;
            const { data: actScores } = await supabase
              .from('student_activity_scores')
              .select('*')
              .eq('student_id', user.id)
              .in('activity_id', acts.map(a => a.activity_id));

            (actScores || []).forEach(sc => {
              studentScoresByActivity[sc.activity_id] = parseFloat(sc.score);
            });
          }
        } catch (actErr) {
          console.warn('Could not load dynamic activities, fallback to term scores:', actErr);
        }

        // Construct maps
        const defaultMax = { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };
        const colsMap = {};
        cols?.forEach(c => {
          colsMap[c.term] = {
            act1: c.act1_max,
            act2: c.act2_max,
            act3: c.act3_max,
            act4: c.act4_max,
            act5: c.act5_max,
            act6: c.act6_max,
            exam: c.exam_max
          };
        });

        const scoresMap = {};
        scores?.forEach(s => {
          scoresMap[s.term] = {
            act1: s.act1,
            act2: s.act2,
            act3: s.act3,
            act4: s.act4,
            act5: s.act5,
            act6: s.act6,
            char: s.char_rating,
            exam: s.exam
          };
        });

        const postedMap = {};
        posted?.forEach(p => {
          // grade_period in DB: prelim, midterm, semi_final, final
          const termKey = p.grade_period === 'prelim' ? 'Prelim' 
                        : p.grade_period === 'midterm' ? 'Midterm'
                        : p.grade_period === 'semi_final' ? 'Semi-Final'
                        : 'Final';
          postedMap[termKey] = p;
        });

        // Compute results for each term
        const newTermData = {};
        const isSummer = crInfo?.semester === 'Summer' || crInfo?.semester?.toLowerCase().includes('summer');
        const terms = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

        terms.forEach(term => {
          const max = colsMap[term] || defaultMax;
          const studScores = scoresMap[term] || { act1: null, act2: null, act3: null, act4: null, act5: null, act6: null, char: null, exam: null };
          
          const char = studScores.char !== null ? studScores.char : 0;
          const exam = studScores.exam !== null ? studScores.exam : 0;

          // Check if custom dynamic activities exist for this term
          const termActs = dynamicActivities.filter(a => a.term === term);
          let csSum = 0;
          let csMax = 0;

          const compList = crInfo?.subjects?.grade_computations?.grade_computation_components || [];
          const templateActs = compList.filter(c => c.is_multiple);

          const csBreakdown = termActs.length > 0 
            ? termActs.map(act => {
                const score = studentScoresByActivity[act.activity_id] ?? 0;
                csSum += score;
                csMax += (parseFloat(act.max_score) || 20);
                return {
                  name: act.name,
                  obtained: score,
                  max: parseFloat(act.max_score) || 20,
                  description: act.description || ''
                };
              })
            : (() => {
                // Keep formative list blank unless the instructor has officially configured custom activities in DB
                return [];
              })();

          const csPct = csMax > 0 ? (csSum / csMax) * 50 : 0;

          // Char
          const charPct = char * 0.1;

          // Exam
          const examMax = max.exam;
          const examPct = examMax > 0 ? (exam / examMax) * 40 : 0;

          // Total Raw computed Rating
          const calculatedRating = Math.min(100, Math.max(0, Math.round(csPct + charPct + examPct)));
          
          // Check if posted
          const postedRow = postedMap[term];
          const isPosted = !!postedRow;
          
          const hasScores = 
            (studScores.act1 !== undefined && studScores.act1 !== null && studScores.act1 > 0) ||
            (studScores.act2 !== undefined && studScores.act2 !== null && studScores.act2 > 0) ||
            (studScores.act3 !== undefined && studScores.act3 !== null && studScores.act3 > 0) ||
            (studScores.act4 !== undefined && studScores.act4 !== null && studScores.act4 > 0) ||
            (studScores.act5 !== undefined && studScores.act5 !== null && studScores.act5 > 0) ||
            (studScores.act6 !== undefined && studScores.act6 !== null && studScores.act6 > 0) ||
            (studScores.char !== undefined && studScores.char !== null && studScores.char > 0) ||
            (studScores.exam !== undefined && studScores.exam !== null && studScores.exam > 0) ||
            csSum > 0;

          const finalRating = isPosted 
            ? parseFloat(postedRow.computed_grade) 
            : (hasScores ? calculatedRating : null);

          const finalGrade = finalRating !== null 
            ? (isPosted && postedRow.effective_grade !== null ? postedRow.effective_grade.toFixed(2) : getTransmutedGrade(finalRating).toFixed(2))
            : '—';
          
          const status = isPosted ? 'Posted' : 'Draft';

          // Components array for detailed view
          const components = [
            {
              name: 'Class Standing (Formative Assessments)',
              weight: 50,
              obtained: csSum,
              max: csMax,
              contribution: csPct,
              breakdown: csBreakdown
            },
            { name: 'Character Rating', weight: 10, obtained: char, max: 100, contribution: charPct },
            { name: 'Examination', weight: 40, obtained: exam, max: examMax, contribution: examPct }
          ];

          // Check missing scores only if officially posted
          const missingScores = [];
          if (isPosted) {
            if (termActs.length > 0) {
              termActs.forEach(act => {
                if (studentScoresByActivity[act.activity_id] === undefined || studentScoresByActivity[act.activity_id] === null) {
                  missingScores.push(act.name);
                }
              });
            } else {
              if (studScores.act1 === null) missingScores.push('Formative Assessment 1');
              if (studScores.act2 === null) missingScores.push('Formative Assessment 2');
              if (studScores.act3 === null) missingScores.push('Formative Assessment 3');
              if (studScores.act4 === null) missingScores.push('Formative Assessment 4');
              if (studScores.act5 === null) missingScores.push('Formative Assessment 5');
              if (studScores.act6 === null) missingScores.push('Formative Assessment 6');
            }
            if (studScores.exam === null) missingScores.push(`${term} Exam`);
          }

          newTermData[term] = {
            rating: finalRating,
            grade: finalGrade,
            status,
            overallPct: finalRating !== null ? csPct + charPct + examPct : 0,
            components,
            missingScores
          };
        });

        setTermData(newTermData);

        // Final Calculations (MR, TFR, SG, GWA, Remarks)
        const calcResult = calculateSemestralGrade({
          prelim: newTermData['Prelim']?.rating,
          midterm: newTermData['Midterm']?.rating,
          semiFinal: newTermData['Semi-Final']?.rating,
          final: newTermData['Final']?.rating,
          isSummer
        });

        let remarks = calcResult.remarks;
        if (postedMap['Final'] && postedMap['Final'].remarks) {
          const finalPosted = postedMap['Final'];
          remarks = finalPosted.remarks.charAt(0).toUpperCase() + finalPosted.remarks.slice(1);
        }

        setFinalCalculations({
          mr: calcResult.mr,
          tfr: calcResult.tfr,
          sg: calcResult.sg,
          finalGwa: calcResult.gwa,
          remarks
        });

        // Determine latest active term tab (has posted grades or entered draft scores)
        let latestActive = isSummer ? 'Midterm' : 'Prelim';
        for (const t of terms) {
          if (newTermData[t] && newTermData[t].grade !== '—') {
            latestActive = t;
          }
        }
        setActiveTab(latestActive);

      } catch (err) {
        console.error('Error loading grade breakdown:', err);
      } finally {
        setLoading(false);
      }
    }

    loadGradeBreakdown();
  }, [user, classRecordId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading grade breakdown...</p>
        </div>
      </div>
    );
  }

  if (!classInfo) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500 font-sans">No enrolled class records found.</p>
      </div>
    );
  }

  const activeData = termData[activeTab] || { rating: 0, grade: '—', status: 'Draft', overallPct: 0, components: [], missingScores: [] };
  const isSummer = classInfo?.sections?.semester === 'Summer' || classInfo?.sections?.semester?.toLowerCase().includes('summer') || classInfo?.semester === 'Summer';
  const periodsList = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
  const subjectCode = classInfo.subjects?.code || '—';
  const subjectName = classInfo.subjects?.name || '—';
  const credits = classInfo.subjects?.units || 0;
  const professor = classInfo.faculty ? `Prof. ${classInfo.faculty.first_name} ${classInfo.faculty.last_name}` : 'TBA';

  return (
    <>
      <PageHeader title="Grade Breakdown" breadcrumb="Student Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Navigation Breadcrumb detail */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/student/mygradeslist')}>
            My Grades
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">{subjectCode} Breakdown</span>
        </div>

        {/* Subject Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold font-mono text-sage-600 bg-sage-50 border border-sage-200 px-2.5 py-1 rounded-md">{subjectCode}</span>
            <h2 className="text-2xl font-bold font-display text-slate-900 mt-2">{subjectName}</h2>
            <p className="text-xs text-slate-500 mt-1">Instructor: <strong className="text-slate-700">{professor}</strong> • Credits: {credits.toFixed(1)} Units</p>
          </div>

          <div className="flex items-baseline gap-1 bg-slate-50 border border-slate-200 p-4 rounded-xl text-center md:text-right w-fit">
            <div className="text-left md:text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Running GWA Grade</span>
              <div className="mt-1 flex items-baseline gap-1 justify-center md:justify-end">
                <span className="text-3xl font-extrabold font-mono text-slate-950">{activeData.grade}</span>
                <span className="text-xs text-slate-400 font-medium">{activeTab}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex border-b border-slate-200">
          {periodsList.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-6 py-3 text-sm font-semibold transition-all relative border-b-2 -mb-px",
                activeTab === tab 
                  ? "border-sage-600 text-sage-700" 
                  : "border-transparent text-slate-400 hover:text-slate-700"
              )}
            >
              {tab} Period
            </button>
          ))}
        </div>

        {/* Tab content panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Detailed Component Table (2/3 width) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden md:col-span-2 flex flex-col justify-between">
            <div className="table-container overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-4 py-3">Component</th>
                    <th className="px-4 py-3 text-center">Weight</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3 text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {activeData.components.map((item, idx) => {
                    const isCs = item.name.includes('Class Standing');
                    return (
                      <React.Fragment key={idx}>
                        <tr 
                          className={cn(
                            "hover:bg-slate-50/50 transition-colors",
                            isCs && "cursor-pointer"
                          )}
                          onClick={() => isCs && setIsCsExpanded(!isCsExpanded)}
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900 flex items-center gap-2">
                            {isCs && (
                              isCsExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />
                            )}
                            <span>{item.name}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-500 font-mono">{item.weight}%</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">
                            {item.obtained} <span className="text-slate-400 font-normal">/ {item.max}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sage-600 font-bold">
                            {item.contribution.toFixed(2)}%
                          </td>
                        </tr>

                        {/* CS Sub-activities breakdown */}
                        {isCs && isCsExpanded && item.breakdown && (
                          <tr>
                            <td colSpan={4} className="p-0 bg-slate-50/40">
                              <div className="px-8 py-3 border-b border-slate-100/80 space-y-2">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Individual Formative Assessments Breakdown</div>
                                <div className="bg-white border border-slate-250 rounded-xl divide-y divide-slate-100 overflow-hidden shadow-xs">
                                  {item.breakdown.length === 0 ? (
                                    <div className="px-4 py-6 text-center text-xs text-slate-400 font-medium">
                                      No formative assessments have been configured or assigned for this period yet.
                                    </div>
                                  ) : (
                                    item.breakdown.map((act, aIdx) => (
                                      <div 
                                        key={aIdx} 
                                        onClick={() => setSelectedActivity(act)}
                                        className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/70 transition-colors cursor-pointer"
                                        title="Click to view details"
                                      >
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-slate-800 font-sans hover:text-sage-700">{act.name}</span>
                                          <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">
                                            {act.description ? '📝 Click to view description' : 'Formative Assessment Item'}
                                          </span>
                                        </div>
                                        <span className="text-sm font-bold font-mono text-slate-850">
                                          {act.obtained} <span className="text-xs font-normal text-slate-400">/ {act.max}</span>
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Footer row */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center text-xs font-bold">
              <span className="text-slate-500">Period Score Sum Total</span>
              <span className="font-mono text-sm text-slate-950 font-extrabold">{activeData.overallPct.toFixed(2)}%</span>
            </div>
          </div>

          {/* Side Performance Widget */}
          <div className="space-y-6">
            
            {/* Status overview */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Period Evaluation</h3>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sage-50 text-sage-600 flex items-center justify-center font-mono font-bold text-lg">
                  {activeData.grade}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{parseFloat(activeData.grade) <= 3.00 ? 'Passed' : 'At-Risk'}</h4>
                  <p className="text-[10px] text-slate-450">Computed grade for period</p>
                </div>
              </div>

              {activeData.status === 'Posted' ? (
                <div className="bg-emerald-50 text-emerald-800 text-[10px] font-bold p-3 rounded-lg border border-emerald-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Officially Verified & Posted
                </div>
              ) : (
                <div className="bg-amber-50 text-amber-800 text-[10px] font-bold p-3 rounded-lg border border-amber-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span> Unverified Draft Score
                </div>
              )}
            </div>

            {/* Missing Scores list - only displayed for officially posted grades */}
            {activeData.status === 'Posted' && activeData.missingScores?.length > 0 && (
              <div className="bg-rose-50 text-rose-800 rounded-xl p-4 border border-rose-100 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <AlertCircle className="h-4 w-4 text-rose-600" /> Missing Submissions
                </div>
                <ul className="list-disc list-inside text-[10px] text-rose-700 space-y-1">
                  {activeData.missingScores.map((score, i) => (
                    <li key={i}>{score} (No score entered)</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 🎓 Semestral Summary Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-705 uppercase tracking-wide">Semestral Summary</h3>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-bold border font-sans",
                  finalCalculations.remarks === 'Passed' 
                    ? "bg-emerald-50 text-emerald-705 border-emerald-200" 
                    : "bg-rose-50 text-rose-705 border-rose-200"
                )}>
                  {finalCalculations.remarks}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-[9px] text-slate-400 block uppercase tracking-wide">Midterm Rating</span>
                  <span className="text-sm font-bold font-mono text-slate-800">{finalCalculations.mr !== null ? `${finalCalculations.mr}%` : '—'}</span>
                </div>
                <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-[9px] text-slate-400 block uppercase tracking-wide">Final Rating</span>
                  <span className="text-sm font-bold font-mono text-slate-800">{finalCalculations.tfr !== null ? `${finalCalculations.tfr}%` : '—'}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-450 block uppercase tracking-wide">Semestral GWA</span>
                  <span className="text-2xl font-black font-mono text-sage-600 mt-1 block">{finalCalculations.finalGwa}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-450 block uppercase tracking-wide">Calculated Rating</span>
                  <span className="text-sm font-bold font-mono text-slate-750 mt-1 block">{finalCalculations.sg !== null ? `${finalCalculations.sg}%` : '—'}</span>
                </div>
              </div>
            </div>

          </div>

        </div>

      {/* 📋 Activity Details Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs text-left">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-150">
            <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-1" />
            <div className="px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                <span>📋 Assessment Details</span>
              </h3>
              <button 
                onClick={() => setSelectedActivity(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-lg font-semibold cursor-pointer p-1"
              >
                &times;
              </button>
            </div>
            
            <div className="p-5 sm:p-6 space-y-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Activity Name</span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">{selectedActivity.name}</span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Coverage / Description</span>
                <span className="text-xs text-slate-600 block mt-1 leading-relaxed whitespace-pre-wrap">
                  {selectedActivity.description || 'No description provided for this activity.'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Your Score</span>
                  <span className="text-sm font-extrabold text-slate-900 block mt-0.5">{selectedActivity.obtained}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Maximum Points</span>
                  <span className="text-sm font-bold text-slate-500 block mt-0.5">{selectedActivity.max}</span>
                </div>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button 
                type="button"
                onClick={() => setSelectedActivity(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-sage-800 hover:bg-sage-900 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </>
  );
}
