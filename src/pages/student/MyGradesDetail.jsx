import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  ChevronRight, 
  ChevronDown, 
  HelpCircle, 
  AlertCircle, 
  Table, 
  Maximize2, 
  Minimize2 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

export default function MyGradesDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const classRecordId = new URLSearchParams(location.search).get('id');
  const [activeTab, setActiveTab] = useState('Prelim');
  const [isCsExpanded, setIsCsExpanded] = useState(true);
  const [isSpreadsheetFullScreen, setIsSpreadsheetFullScreen] = useState(false);
  const [spreadsheetViewMode, setSpreadsheetViewMode] = useState('All');

  const [loading, setLoading] = useState(true);
  const [classInfo, setClassInfo] = useState(null);
  
  // Dynamic grade data
  const [termData, setTermData] = useState({
    Prelim: { rating: 0, grade: '—', status: 'Draft', overallPct: 0, components: [], missingScores: [] },
    Midterm: { rating: 0, grade: '—', status: 'Draft', overallPct: 0, components: [], missingScores: [] },
    'Semi-Final': { rating: 0, grade: '—', status: 'Draft', overallPct: 0, components: [], missingScores: [] },
    Final: { rating: 0, grade: '—', status: 'Draft', overallPct: 0, components: [], missingScores: [] }
  });

  const [spreadsheetRow, setSpreadsheetRow] = useState({
    Prelim: { act1: 0, act2: 0, act3: 0, act4: 0, act5: 0, act6: 0, csSum: 0, csPct: 0, char: 0, exam: 0, examPct: 0, rating: 0 },
    Midterm: { act1: 0, act2: 0, act3: 0, act4: 0, act5: 0, act6: 0, csSum: 0, csPct: 0, char: 0, exam: 0, examPct: 0, rating: 0 },
    'Semi-Final': { act1: 0, act2: 0, act3: 0, act4: 0, act5: 0, act6: 0, csSum: 0, csPct: 0, char: 0, exam: 0, examPct: 0, rating: 0 },
    Final: { act1: 0, act2: 0, act3: 0, act4: 0, act5: 0, act6: 0, csSum: 0, csPct: 0, char: 0, exam: 0, examPct: 0, rating: 0 }
  });

  const [finalCalculations, setFinalCalculations] = useState({
    mr: 0,
    tfr: 0,
    sg: 0,
    finalGwa: '—',
    remarks: '—'
  });

  const getTransmutedGrade = (score) => {
    if (score >= 98) return '1.00';
    if (score >= 95) return '1.25';
    if (score >= 92) return '1.50';
    if (score >= 89) return '1.75';
    if (score >= 86) return '2.00';
    if (score >= 83) return '2.25';
    if (score >= 80) return '2.50';
    if (score >= 77) return '2.75';
    if (score >= 75) return '3.00';
    return '5.00';
  };

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
            subjects ( code, name, units ),
            faculty:users!faculty_id ( first_name, last_name )
          `)
          .eq('class_record_id', targetClassRecordId)
          .single();

        if (crErr) throw crErr;
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
        const newSpreadsheet = {};
        const terms = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

        terms.forEach(term => {
          const max = colsMap[term] || defaultMax;
          const studScores = scoresMap[term] || { act1: null, act2: null, act3: null, act4: null, act5: null, act6: null, char: null, exam: null };
          
          const act1 = studScores.act1 !== null ? studScores.act1 : 0;
          const act2 = studScores.act2 !== null ? studScores.act2 : 0;
          const act3 = studScores.act3 !== null ? studScores.act3 : 0;
          const act4 = studScores.act4 !== null ? studScores.act4 : 0;
          const act5 = studScores.act5 !== null ? studScores.act5 : 0;
          const act6 = studScores.act6 !== null ? studScores.act6 : 0;
          const char = studScores.char !== null ? studScores.char : 0;
          const exam = studScores.exam !== null ? studScores.exam : 0;

          // CS
          const csSum = act1 + act2 + act3 + act4 + act5 + act6;
          const csMax = max.act1 + max.act2 + max.act3 + max.act4 + max.act5 + max.act6;
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
            (studScores.exam !== undefined && studScores.exam !== null && studScores.exam > 0);

          const finalRating = isPosted 
            ? parseFloat(postedRow.computed_grade) 
            : (hasScores ? calculatedRating : null);

          const finalGrade = finalRating !== null 
            ? (isPosted && postedRow.effective_grade !== null ? postedRow.effective_grade.toFixed(2) : getTransmutedGrade(finalRating))
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
              breakdown: [
                { name: 'Formative Assessment 1', obtained: act1, max: max.act1 },
                { name: 'Formative Assessment 2', obtained: act2, max: max.act2 },
                { name: 'Formative Assessment 3', obtained: act3, max: max.act3 },
                { name: 'Formative Assessment 4', obtained: act4, max: max.act4 },
                { name: 'Formative Assessment 5', obtained: act5, max: max.act5 },
                { name: 'Formative Assessment 6', obtained: act6, max: max.act6 }
              ]
            },
            { name: 'Character Rating', weight: 10, obtained: char, max: 100, contribution: charPct },
            { name: 'Examination', weight: 40, obtained: exam, max: examMax, contribution: examPct }
          ];

          // Check missing scores
          const missingScores = [];
          if (studScores.act1 === null) missingScores.push('Formative Assessment 1');
          if (studScores.act2 === null) missingScores.push('Formative Assessment 2');
          if (studScores.act3 === null) missingScores.push('Formative Assessment 3');
          if (studScores.act4 === null) missingScores.push('Formative Assessment 4');
          if (studScores.act5 === null) missingScores.push('Formative Assessment 5');
          if (studScores.act6 === null) missingScores.push('Formative Assessment 6');
          if (studScores.exam === null) missingScores.push(`${term} Exam`);

          newTermData[term] = {
            rating: finalRating,
            grade: finalGrade,
            status,
            overallPct: finalRating !== null ? csPct + charPct + examPct : 0,
            components,
            missingScores
          };

          newSpreadsheet[term] = {
            act1, act2, act3, act4, act5, act6,
            csSum, csPct, char, exam, examPct,
            rating: finalRating
          };
        });

        setTermData(newTermData);
        setSpreadsheetRow(newSpreadsheet);

        // Final Calculations (MR, TFR, SG, GWA, Remarks)
        const prelimRating = newTermData['Prelim'].rating;
        const midtermRating = newTermData['Midterm'].rating;
        
        const hasPrelim = prelimRating !== null && newTermData['Prelim'].grade !== '—';
        const hasMidterm = midtermRating !== null && newTermData['Midterm'].grade !== '—';
        const mr = (hasPrelim && hasMidterm) ? Math.round((prelimRating + midtermRating) / 2) : null;

        const sfRating = newTermData['Semi-Final'].rating;
        const finalRatingVal = newTermData['Final'].rating;
        const hasSemifinal = sfRating !== null && newTermData['Semi-Final'].grade !== '—';
        const hasFinal = finalRatingVal !== null && newTermData['Final'].grade !== '—';
        const tfr = (hasSemifinal && hasFinal) ? Math.round((sfRating + finalRatingVal) / 2) : null;

        const sg = (mr !== null && tfr !== null) ? Math.round((mr + tfr) / 2) : null;
        const finalGwa = sg !== null ? getTransmutedGrade(sg) : '—';

        // Remarks
        let remarks = '—';
        if (sg !== null) {
          remarks = parseFloat(finalGwa) <= 3.00 ? 'Passed' : 'Failed';
          if (postedMap['Final']) {
            const finalPosted = postedMap['Final'];
            if (finalPosted.remarks) {
              remarks = finalPosted.remarks.charAt(0).toUpperCase() + finalPosted.remarks.slice(1);
            }
          }
        }

        setFinalCalculations({
          mr, tfr, sg, finalGwa, remarks
        });

        // Determine latest active term tab (has posted grades or entered draft scores)
        let latestActive = 'Prelim';
        const termOrder = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
        for (const t of termOrder) {
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
                                  {item.breakdown.map((act, aIdx) => (
                                    <div key={aIdx} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                      <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-800 font-sans">{act.name}</span>
                                        <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">Formative Assessment Item</span>
                                      </div>
                                      <span className="text-sm font-bold font-mono text-slate-850">
                                        {act.obtained} <span className="text-xs font-normal text-slate-400">/ {act.max}</span>
                                      </span>
                                    </div>
                                  ))}
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

            {/* Missing Scores list */}
            {activeData.missingScores.length > 0 && (
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

        {/* Complete Semestral Grade Record Spreadsheet View */}
        {isSpreadsheetFullScreen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSpreadsheetFullScreen(false)} />}
        
        <div className={cn(
          "bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all",
          isSpreadsheetFullScreen ? "fixed inset-4 z-50 rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : "flex flex-col"
        )}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Table className="h-4.5 w-4.5 text-sage-600" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wider font-display">Complete Semestral Grade Record (Spreadsheet View)</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                {['All', 'Prelim', 'Midterm', 'Semi-Final', 'Final'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setSpreadsheetViewMode(mode)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all",
                      spreadsheetViewMode === mode
                        ? "bg-white text-sage-700 shadow-sm border border-slate-200"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {mode === 'Semi-Final' ? 'Semi' : mode}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setIsSpreadsheetFullScreen(!isSpreadsheetFullScreen)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sage-50 hover:border-sage-300 text-slate-500 hover:text-sage-700 transition-all"
                title={isSpreadsheetFullScreen ? 'Exit fullscreen' : 'View fullscreen'}
              >
                {isSpreadsheetFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
          
          <div className={cn("table-container overflow-auto", isSpreadsheetFullScreen ? "flex-1" : "max-h-[300px]")}>
            <table className={cn("w-full text-left border-collapse text-center text-xs", spreadsheetViewMode === 'All' ? 'min-w-[1500px]' : 'min-w-[500px]')}>
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold text-xs">
                  {/* Prelim Period */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Prelim') && (
                    <th colSpan={12} className="px-4 py-3 border-r border-slate-200 bg-sky-50 text-sky-900 text-center font-bold tracking-wide text-xs">
                      PRELIMINARY PERIOD
                    </th>
                  )}
                  
                  {/* Midterm Period */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Midterm') && (
                    <th colSpan={12} className="px-4 py-3 border-r border-slate-200 bg-indigo-50 text-indigo-900 text-center font-bold tracking-wide text-xs">
                      MIDTERM PERIOD
                    </th>
                  )}
                  
                  {/* Midterm Rating */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Midterm') && (
                    <th className="px-4 py-3 border-r border-slate-200 bg-indigo-150 text-indigo-950 font-bold uppercase w-20 text-xs">
                      MR
                    </th>
                  )}
                  
                  {/* Semi-Final Period */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Semi-Final') && (
                    <th colSpan={12} className="px-4 py-3 border-r border-slate-200 bg-amber-50 text-amber-900 text-center font-bold tracking-wide text-xs">
                      SEMI-FINAL PERIOD
                    </th>
                  )}
                  
                  {/* Final Period */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Final') && (
                    <th colSpan={12} className="px-4 py-3 border-r border-slate-200 bg-orange-50 text-orange-950 text-center font-bold tracking-wide text-xs">
                      FINAL PERIOD
                    </th>
                  )}
                  
                  {/* Tentative Final Rating */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Final') && (
                    <th className="px-4 py-3 border-r border-slate-200 bg-orange-150 text-orange-950 font-bold uppercase w-20 text-xs">
                      TFR
                    </th>
                  )}
                  
                  {/* Semestral Grade - only in All view */}
                  {spreadsheetViewMode === 'All' && (
                    <>
                      <th className="px-4 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-900 font-extrabold uppercase w-20 text-xs">
                        SG
                      </th>
                      <th className="px-4 py-3 border-r border-slate-200 bg-emerald-200/60 text-emerald-950 font-extrabold uppercase w-20 text-xs">
                        GWA
                      </th>
                      <th className="px-4 py-3 bg-emerald-200/60 text-emerald-950 font-extrabold uppercase w-24 text-xs">
                        Remarks
                      </th>
                    </>
                  )}
                </tr>
                
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-550 font-bold text-[10px]">
                  {/* Prelim sub-headers */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Prelim') && (
                    <>
                      {['1', '2', '3', '4', '5', '6'].map(a => <th key={`p-${a}`} className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">FA {a}</th>)}
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Total</th>
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">CS %</th>
                      <th className="px-2 py-2 border-r border-slate-100 w-16 font-mono font-bold">Char</th>
                      <th className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Exam</th>
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Exam %</th>
                      <th className="px-3 py-2 border-r border-slate-200 bg-sky-100/40 font-extrabold w-16 text-slate-800 font-mono">Rating</th>
                    </>
                  )}

                  {/* Midterm sub-headers */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Midterm') && (
                    <>
                      {['1', '2', '3', '4', '5', '6'].map(a => <th key={`m-${a}`} className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">FA {a}</th>)}
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Total</th>
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">CS %</th>
                      <th className="px-2 py-2 border-r border-slate-100 w-16 font-mono font-bold">Char</th>
                      <th className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Exam</th>
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Exam %</th>
                      <th className="px-3 py-2 border-r border-slate-200 bg-indigo-100/40 font-extrabold w-16 text-slate-800 font-mono">Rating</th>
                    </>
                  )}

                  {/* MR dummy th */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Midterm') && (
                    <th className="border-r border-slate-200 bg-indigo-50/30"></th>
                  )}

                  {/* Semi-Final sub-headers */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Semi-Final') && (
                    <>
                      {['1', '2', '3', '4', '5', '6'].map(a => <th key={`sf-${a}`} className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">FA {a}</th>)}
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Total</th>
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">CS %</th>
                      <th className="px-2 py-2 border-r border-slate-100 w-16 font-mono font-bold">Char</th>
                      <th className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Exam</th>
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Exam %</th>
                      <th className="px-3 py-2 border-r border-slate-200 bg-amber-100/40 font-extrabold w-16 text-slate-800 font-mono">Rating</th>
                    </>
                  )}

                  {/* Final sub-headers */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Final') && (
                    <>
                      {['1', '2', '3', '4', '5', '6'].map(a => <th key={`f-${a}`} className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">FA {a}</th>)}
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Total</th>
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">CS %</th>
                      <th className="px-2 py-2 border-r border-slate-100 w-16 font-mono font-bold">Char</th>
                      <th className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Exam</th>
                      <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Exam %</th>
                      <th className="px-3 py-2 border-r border-slate-200 bg-orange-100/40 font-extrabold w-16 text-slate-800 font-mono">Rating</th>
                    </>
                  )}

                  {/* TFR dummy th */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Final') && (
                    <th className="border-r border-slate-200 bg-orange-50/30"></th>
                  )}

                  {/* SG, GWA, Remarks dummy ths - only in All view */}
                  {spreadsheetViewMode === 'All' && (
                    <>
                      <th className="border-r border-slate-200 bg-emerald-50/30"></th>
                      <th className="border-r border-slate-200 bg-emerald-100/30"></th>
                      <th className="bg-emerald-100/30"></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-slate-800 font-semibold font-mono text-xs">
                <tr className="hover:bg-slate-50/80 transition-colors">
                  {/* Prelim scores */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Prelim') && (
                    <>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Prelim.act1}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Prelim.act2}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Prelim.act3}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Prelim.act4}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Prelim.act5}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Prelim.act6}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 font-bold text-slate-900">{spreadsheetRow.Prelim.csSum}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">{spreadsheetRow.Prelim.csPct.toFixed(1)}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Prelim.char}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Prelim.exam}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">{spreadsheetRow.Prelim.examPct.toFixed(1)}</td>
                      <td className="py-4 border-r border-slate-200 bg-sky-100/40 font-bold text-sky-900 text-sm">{spreadsheetRow.Prelim.rating !== null ? spreadsheetRow.Prelim.rating : '—'}</td>
                    </>
                  )}

                  {/* Midterm scores */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Midterm') && (
                    <>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Midterm.act1}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Midterm.act2}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Midterm.act3}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Midterm.act4}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Midterm.act5}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Midterm.act6}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 font-bold text-slate-900">{spreadsheetRow.Midterm.csSum}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">{spreadsheetRow.Midterm.csPct.toFixed(1)}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Midterm.char}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Midterm.exam}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">{spreadsheetRow.Midterm.examPct.toFixed(1)}</td>
                      <td className="py-4 border-r border-slate-200 bg-indigo-100/40 font-bold text-indigo-900 text-sm">{spreadsheetRow.Midterm.rating !== null ? spreadsheetRow.Midterm.rating : '—'}</td>
                    </>
                  )}

                  {/* MR */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Midterm') && (
                    <td className="py-4 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-extrabold text-sm">{finalCalculations.mr !== null ? finalCalculations.mr : '—'}</td>
                  )}

                  {/* Semi-Final scores */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Semi-Final') && (
                    <>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow['Semi-Final'].act1}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow['Semi-Final'].act2}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow['Semi-Final'].act3}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow['Semi-Final'].act4}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow['Semi-Final'].act5}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow['Semi-Final'].act6}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 font-bold text-slate-900">{spreadsheetRow['Semi-Final'].csSum}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">{spreadsheetRow['Semi-Final'].csPct.toFixed(1)}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow['Semi-Final'].char}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow['Semi-Final'].exam}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">{spreadsheetRow['Semi-Final'].examPct.toFixed(1)}</td>
                      <td className="py-4 border-r border-slate-200 bg-amber-100/40 font-bold text-amber-900 text-sm">{spreadsheetRow['Semi-Final'].rating !== null ? spreadsheetRow['Semi-Final'].rating : '—'}</td>
                    </>
                  )}

                  {/* Final scores */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Final') && (
                    <>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Final.act1}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Final.act2}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Final.act3}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Final.act4}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Final.act5}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Final.act6}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 font-bold text-slate-900">{spreadsheetRow.Final.csSum}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">{spreadsheetRow.Final.csPct.toFixed(1)}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Final.char}</td>
                      <td className="py-4 border-r border-slate-100">{spreadsheetRow.Final.exam}</td>
                      <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">{spreadsheetRow.Final.examPct.toFixed(1)}</td>
                      <td className="py-4 border-r border-slate-200 bg-orange-100/40 font-bold text-orange-950 text-sm">{spreadsheetRow.Final.rating !== null ? spreadsheetRow.Final.rating : '—'}</td>
                    </>
                  )}

                  {/* TFR */}
                  {(spreadsheetViewMode === 'All' || spreadsheetViewMode === 'Final') && (
                    <td className="py-4 border-r border-slate-200 bg-orange-100 text-orange-950 font-extrabold text-sm">{finalCalculations.tfr !== null ? finalCalculations.tfr : '—'}</td>
                  )}

                  {/* SG, GWA, Remarks - only in All view */}
                  {spreadsheetViewMode === 'All' && (
                    <>
                      <td className="py-4 border-r border-slate-200 bg-emerald-50 text-emerald-850 font-extrabold text-sm">{finalCalculations.sg !== null ? finalCalculations.sg : '—'}</td>
                      <td className="py-4 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold text-sm">
                        <span className="px-3 py-1 rounded bg-white shadow-sm border border-emerald-250 text-emerald-700">
                          {finalCalculations.finalGwa}
                        </span>
                      </td>
                      <td className="py-4 bg-emerald-150 font-bold text-emerald-900 font-sans text-sm">{finalCalculations.remarks}</td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><HelpCircle className="h-3.5 w-3.5" /> Formula: CS % (50%) + Char % (10%) + Exam % (40%) = Rating. Semestral Grade (SG) = (MR + TFR) / 2.</span>
          </div>
        </div>

      </div>
    </>
  );
}
