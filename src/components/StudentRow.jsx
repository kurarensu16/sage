import { useState, useEffect, useRef } from 'react';
import { cn } from "../lib/utils";
import { Check, MessageSquare, CloudUpload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTransmutedGrade } from '../lib/gradingMath';

export default function StudentRow({ 
  student, 
  rowNo, 
  initialPeriods, 
  readOnly = false, 
  lockedMilestones = [],
  viewMode = 'All',
  classCode = 'default',
  studentLocked,
  periodsList,
  maxItems = {
    Prelim: { exam: 40 },
    Midterm: { exam: 40 },
    'Semi-Final': { exam: 40 },
    Final: { exam: 40 }
  },
  activities = {
    Prelim: [],
    Midterm: [],
    'Semi-Final': [],
    Final: []
  }
}) {
  const STORAGE_KEY = `sage_scores_${classCode}_${student?.id ?? rowNo}`;

  // Restore from localStorage if available, else fall back to initialPeriods
  const [scores, setScores] = useState(() => {
    const savedRaw = localStorage.getItem(STORAGE_KEY);
    if (savedRaw) {
      try {
        return JSON.parse(savedRaw);
      } catch (e) {
        console.error("Failed to parse cached scores:", e);
      }
    }
    return {
      Prelim: initialPeriods?.Prelim || {},
      Midterm: initialPeriods?.Midterm || {},
      'Semi-Final': initialPeriods?.['Semi-Final'] || {},
      Final: initialPeriods?.Final || {},
      customRemarks: '',
      remarksNote: ''
    };
  });

  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [showNoteInput, setShowNoteInput] = useState(Boolean(scores.remarksNote));
  const debounceRef = useRef(null);
  const isFirstRender = useRef(true);

  // Auto-save effect
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));

      try {
        const { data: authUser } = await supabase.auth.getUser();
        const savedByUuid = authUser?.user?.id || null;
        
        const upsertRows = [];
        const periods = periodsList || ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
        
        periods.forEach(term => {
          const tScores = scores[term] || {};
          // Maintain compatibility with core Supabase schema act1-act6 columns
          upsertRows.push({
            class_record_id: classCode,
            student_id: student.id,
            term: term,
            act1: Number(tScores.act1) || 0,
            act2: Number(tScores.act2) || 0,
            act3: Number(tScores.act3) || 0,
            act4: Number(tScores.act4) || 0,
            act5: Number(tScores.act5) || 0,
            act6: Number(tScores.act6) || 0,
            char_rating: Number(tScores.char) || 0,
            exam: Number(tScores.exam) || 0,
            saved_by: savedByUuid
          });
        });

        const { error } = await supabase
          .from('student_term_scores')
          .upsert(upsertRows, { onConflict: 'class_record_id,student_id,term' });

        if (error) throw error;

        // Also sync dynamic activities to student_activity_scores table if UUIDs exist
        const dynamicScoreUpserts = [];
        periods.forEach(term => {
          const tScores = scores[term] || {};
          const tActs = activities[term] || [];
          tActs.forEach(act => {
            if (act.id && typeof act.id === 'string' && act.id.length > 20) {
              dynamicScoreUpserts.push({
                student_id: student.id,
                activity_id: act.id,
                score: Number(tScores[act.id]) || 0
              });
            }
          });
        });

        if (dynamicScoreUpserts.length > 0) {
          try {
            await supabase
              .from('student_activity_scores')
              .upsert(dynamicScoreUpserts, { onConflict: 'student_id,activity_id' });
          } catch(scoreErr) {
            console.warn('Could not sync to student_activity_scores:', scoreErr);
          }
        }

        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to sync scores draft:', err);
        setSaveStatus('idle');
      }
    }, 1200);
  }, [scores]);

  const handleCellChange = (term, key, val) => {
    setScores(prev => ({
      ...prev,
      [term]: {
        ...(prev[term] || {}),
        [key]: val
      }
    }));
  };

  // Computes ratings dynamically based on dynamic activities list
  const calcPeriodRating = (term) => {
    const termScores = scores[term] || {};
    const termActivities = activities[term] || [];
    
    let csTotal = 0;
    let totalActMax = 0;
    termActivities.forEach(act => {
      const score = Number(termScores[act.id]) || 0;
      csTotal += score;
      totalActMax += (act.max || 0);
    });

    const csPercent = totalActMax > 0 ? (csTotal / totalActMax) * 50 : 0;
    
    const charVal = Number(termScores.char) || 0;
    const charPercent = (charVal / 100) * 10;

    const examVal = Number(termScores.exam) || 0;
    const examMax = Number(maxItems[term]?.exam) || 40;
    const examPercent = examMax > 0 ? (examVal / examMax) * 40 : 0;

    const totalScore = csPercent + charPercent + examPercent;
    const rating = Math.min(100, Math.max(0, Math.round(totalScore)));

    return {
      csTotal,
      csPercent: totalActMax > 0 ? (csTotal / totalActMax) * 100 : 0,
      examPercent: examMax > 0 ? (examVal / examMax) * 100 : 0,
      rating
    };
  };

  const prelimResult = calcPeriodRating('Prelim');
  const midtermResult = calcPeriodRating('Midterm');
  const semiFinalResult = calcPeriodRating('Semi-Final');
  const finalResult = calcPeriodRating('Final');

  const mr = Math.round((prelimResult.rating + midtermResult.rating) / 2);
  const tfr = Math.round((semiFinalResult.rating + finalResult.rating) / 2);
  const sg = Math.round((mr + tfr) / 2);

  const storedAbsences = localStorage.getItem(`sage_absences_${classCode}_${student.id}`);
  const absences = storedAbsences !== null ? parseInt(storedAbsences) : 0;
  const isFDA = absences >= 4;

  const rawGrade = getTransmutedGrade(sg).toFixed(2);
  const autoRemarks = isFDA ? 'FDA' : (parseFloat(rawGrade) <= 3.00 ? 'Passed' : 'Failed');
  const remarks = isFDA ? 'FDA' : (scores.customRemarks || autoRemarks);

  const grade = (() => {
    if (remarks === 'FDA') return '5.00';
    if (remarks === 'INC') return rawGrade;
    if (remarks === 'Passed' && parseFloat(rawGrade) > 3.00) return '3.00';
    return rawGrade;
  })();

  const isNonPassing = ['Failed', 'INC', 'FDA', 'Dropped'].includes(remarks);

  const getStatus = (score) => {
    if (remarks === 'FDA') return { label: 'Failing', color: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500 shadow-rose-500/40 animate-pulse' };
    if (score >= 80) return { label: 'Safe', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500 shadow-emerald-500/40' };
    if (score >= 75) return { label: 'At-Risk', color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-emerald-500 shadow-emerald-500/40' };
    return { label: 'Failing', color: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500 shadow-rose-500/40 animate-pulse' };
  };

  const statusInfo = getStatus(sg);

  const isLocked = readOnly || (studentLocked !== undefined ? studentLocked : (lockedMilestones.includes('Semestral Grade') || lockedMilestones.includes('Final')));

  const renderInputCell = (term, key, maxVal, isTermLocked, widthClass = "w-12") => {
    const value = scores[term]?.[key] ?? '';
    if (isTermLocked) {
      return <span className="font-mono text-xs">{value === '' ? '0' : value}</span>;
    }
    return (
      <input
        type="number"
        min="0"
        max={maxVal}
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const val = e.target.value === '' ? '' : Math.max(0, Math.min(maxVal, Number(e.target.value)));
          handleCellChange(term, key, val);
        }}
        className={cn(
          widthClass,
          "px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs"
        )}
      />
    );
  };

  const stickyBgClass = cn(
    statusInfo.label === 'Safe' && "bg-white group-hover:bg-slate-50",
    statusInfo.label === 'At-Risk' && "bg-[#fffdf5] group-hover:bg-[#fff9e6]",
    statusInfo.label === 'Failing' && "bg-[#fff8f8] group-hover:bg-[#ffebeb]"
  );

  return (
    <tr className={cn(
      "group transition-colors text-center text-xs text-slate-700",
      statusInfo.label === 'Safe' && "hover:bg-slate-50/60 bg-white",
      statusInfo.label === 'At-Risk' && "bg-amber-50/10 hover:bg-amber-50/30",
      statusInfo.label === 'Failing' && "bg-rose-50/10 hover:bg-rose-50/30 border-l-2 border-l-rose-400"
    )}>
      <td className={cn("px-2 py-3 border-r border-slate-200 text-slate-500 font-mono text-[11px] w-10 sticky left-0 z-10", stickyBgClass)}>
        {rowNo}
      </td>
      <td className={cn("px-2 py-3 border-r border-slate-200 text-slate-500 font-mono text-[11px] w-24 sticky left-[40px] z-10", stickyBgClass)}>
        {student.studentNo || student.id}
      </td>
      <td className={cn("px-4 py-3 text-left font-semibold text-slate-900 sticky left-[136px] border-r border-slate-200 z-10 w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]", stickyBgClass)}>
        {student.name}
      </td>
      
      {/* PRELIM */}
      {((!periodsList || periodsList.includes('Prelim')) && (viewMode === 'All' || viewMode === 'Prelim' || viewMode === 'MidtermBatch')) && (
        <>
          {(activities.Prelim || []).map(act => {
            const isConfigured = !!act.name;
            const cellLocked = isLocked || !isConfigured;
            return (
              <td key={act.id} className="p-1 border-r border-slate-100 w-12 relative">
                {renderInputCell('Prelim', act.id, act.max, cellLocked)}
                {!isConfigured && !isLocked && (
                  <div className="absolute inset-0 bg-slate-100/50 flex items-center justify-center pointer-events-none" title="Configure column header first">
                    <span className="text-[9px] text-slate-400 select-none">🔒</span>
                  </div>
                )}
              </td>
            );
          })}
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{prelimResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{prelimResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">{renderInputCell('Prelim', 'char', 100, isLocked, "w-16")}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell('Prelim', 'exam', maxItems.Prelim?.exam || 40, isLocked)}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{prelimResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-sky-50 border-r border-slate-200 text-sky-850 w-14 text-center">{prelimResult.rating}</td>
        </>
      )}
 
      {/* MIDTERM */}
      {(viewMode === 'All' || viewMode === 'Midterm' || viewMode === 'MidtermBatch') && (
        <>
          {(activities.Midterm || []).map(act => {
            const isConfigured = !!act.name;
            const cellLocked = isLocked || !isConfigured;
            return (
              <td key={act.id} className="p-1 border-r border-slate-100 w-12 relative">
                {renderInputCell('Midterm', act.id, act.max, cellLocked)}
                {!isConfigured && !isLocked && (
                  <div className="absolute inset-0 bg-slate-100/50 flex items-center justify-center pointer-events-none" title="Configure column header first">
                    <span className="text-[9px] text-slate-400 select-none">🔒</span>
                  </div>
                )}
              </td>
            );
          })}
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{midtermResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{midtermResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">{renderInputCell('Midterm', 'char', 100, isLocked, "w-16")}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell('Midterm', 'exam', maxItems.Midterm?.exam || 40, isLocked)}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{midtermResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-indigo-50 border-r border-slate-200 text-indigo-800 w-14 text-center">{midtermResult.rating}</td>
        </>
      )}
 
      {(viewMode === 'All' || viewMode === 'Midterm' || viewMode === 'MidtermBatch' || viewMode === 'Summary') && (
        <td className="px-3 py-3 font-mono font-extrabold bg-indigo-100 border-r border-slate-200 text-indigo-955 w-16 text-center text-sm">{mr}</td>
      )}
 
      {/* SEMI-FINAL */}
      {((!periodsList || periodsList.includes('Semi-Final')) && (viewMode === 'All' || viewMode === 'Semi-Final' || viewMode === 'FinalBatch')) && (
        <>
          {(activities['Semi-Final'] || []).map(act => {
            const isConfigured = !!act.name;
            const cellLocked = isLocked || !isConfigured;
            return (
              <td key={act.id} className="p-1 border-r border-slate-100 w-12 relative">
                {renderInputCell('Semi-Final', act.id, act.max, cellLocked)}
                {!isConfigured && !isLocked && (
                  <div className="absolute inset-0 bg-slate-100/50 flex items-center justify-center pointer-events-none" title="Configure column header first">
                    <span className="text-[9px] text-slate-400 select-none">🔒</span>
                  </div>
                )}
              </td>
            );
          })}
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{semiFinalResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{semiFinalResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">{renderInputCell('Semi-Final', 'char', 100, isLocked, "w-16")}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell('Semi-Final', 'exam', maxItems['Semi-Final']?.exam || 40, isLocked)}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{semiFinalResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-amber-50 border-r border-slate-200 text-amber-800 w-14 text-center">{semiFinalResult.rating}</td>
        </>
      )}
 
      {/* FINAL */}
      {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'FinalBatch') && (
        <>
          {(activities.Final || []).map(act => {
            const isConfigured = !!act.name;
            const cellLocked = isLocked || !isConfigured;
            return (
              <td key={act.id} className="p-1 border-r border-slate-100 w-12 relative">
                {renderInputCell('Final', act.id, act.max, cellLocked)}
                {!isConfigured && !isLocked && (
                  <div className="absolute inset-0 bg-slate-100/50 flex items-center justify-center pointer-events-none" title="Configure column header first">
                    <span className="text-[9px] text-slate-400 select-none">🔒</span>
                  </div>
                )}
              </td>
            );
          })}
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{finalResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{finalResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">{renderInputCell('Final', 'char', 100, isLocked, "w-16")}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell('Final', 'exam', maxItems.Final?.exam || 40, isLocked)}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{finalResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-orange-50 border-r border-slate-200 text-orange-850 w-14 text-center">{finalResult.rating}</td>
        </>
      )}

      {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'FinalBatch' || viewMode === 'Summary') && (
        <td className="px-3 py-3 font-mono font-extrabold bg-orange-100 border-r border-slate-200 text-orange-955 w-16 text-center text-sm">{tfr}</td>
      )}
      {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'Summary') && (
        <td className="px-3 py-3 font-mono font-extrabold bg-emerald-50 border-r border-slate-200 text-emerald-800 w-16 text-center text-sm">{sg}</td>
      )}
      {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'Summary') && (
        <td className="px-3 py-3 border-r border-slate-200 bg-emerald-100/50 w-16 text-center">
          <span className={cn(
            "px-2 py-0.5 rounded font-mono font-bold text-xs border bg-white shadow-sm",
            isNonPassing ? "text-rose-600 border-rose-200" : "text-emerald-700 border-emerald-250"
          )}>
            {grade}
          </span>
        </td>
      )}

      {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'Summary') && (
        <td className="px-4 py-3 border-r border-slate-200 bg-emerald-100/30 w-36 text-center font-bold text-xs">
          {readOnly ? (
            <span className={cn(
              "px-2 py-0.5 rounded border text-[10px] font-bold shadow-sm",
              remarks === 'Passed' && "text-emerald-700 border-emerald-300 bg-emerald-50",
              isNonPassing && "text-rose-700 border-rose-300 bg-rose-50"
            )}>
              {remarks}
            </span>
          ) : (
            <div className="flex flex-col gap-1 items-center">
              <select
                value={remarks}
                disabled={isFDA}
                onChange={(e) => {
                  const val = e.target.value;
                  setScores(prev => ({ ...prev, customRemarks: val }));
                  setShowNoteInput(val !== autoRemarks);
                  if (val === autoRemarks) setScores(prev => ({ ...prev, remarksNote: '' }));
                }}
                className={cn(
                  "appearance-none border px-2 py-1 rounded text-[10px] font-extrabold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all w-full text-center",
                  isFDA
                    ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-white border-slate-200 hover:border-sage-300 text-slate-700 cursor-pointer"
                )}
              >
                <option value="Passed">Passed</option>
                <option value="Failed">Failed</option>
                <option value="INC">INC</option>
                <option value="FDA">FDA (Advisory)</option>
                <option value="Dropped">Dropped</option>
              </select>

              {remarks === 'FDA' && (
                <span className="block text-[8px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 mt-0.5 text-center" title="FDA Recommendation Alert.">
                  FDA Advisory (4 Absences)
                </span>
              )}

              {showNoteInput && (
                <div className="w-full mt-0.5 relative group">
                  <textarea
                    value={scores.remarksNote || ''}
                    onChange={(e) => setScores(prev => ({ ...prev, remarksNote: e.target.value }))}
                    placeholder="Reason for override…"
                    rows={2}
                    className="w-full text-[9px] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-900 placeholder-amber-400 focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none resize-none transition-all font-normal"
                  />
                  <MessageSquare className="absolute top-1.5 right-1.5 h-2.5 w-2.5 text-amber-400 pointer-events-none" />
                </div>
              )}

              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-[9px] text-slate-400 font-medium mt-1">
                  <CloudUpload className="h-2.5 w-2.5 animate-pulse" /> Saving…
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-[9px] text-emerald-600 font-semibold mt-1">
                  <Check className="h-2.5 w-2.5" /> Saved
                </span>
              )}
            </div>
          )}
        </td>
      )}
    </tr>
  );
}
