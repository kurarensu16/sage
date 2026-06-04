import { useState, useEffect, useRef } from 'react';
import { cn } from "../lib/utils";
import { Check, MessageSquare, CloudUpload } from 'lucide-react';

export default function StudentRow({ 
  student, 
  rowNo, 
  initialPeriods, 
  readOnly = false, 
  lockedMilestones = [],
  viewMode = 'All',
  classCode = 'default',
  maxItems = {
    Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Final: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 }
  }
}) {
  // localStorage key is unique per student per class
  const STORAGE_KEY = `sage_scores_${classCode}_${student?.id ?? rowNo}`;

  // Restore from localStorage if available, else fall back to initialPeriods
  const savedRaw = localStorage.getItem(STORAGE_KEY);
  const saved = savedRaw ? JSON.parse(savedRaw) : null;
  const p = saved?.Prelim       || initialPeriods?.Prelim       || {};
  const m = saved?.Midterm      || initialPeriods?.Midterm      || {};
  const sf = saved?.['Semi-Final'] || initialPeriods?.['Semi-Final'] || {};
  const f = saved?.Final        || initialPeriods?.Final        || {};

  // Prelim scores state (initialize 0 or undefined to empty string)
  const [pAct1, setPAct1] = useState(p.act1 || '');
  const [pAct2, setPAct2] = useState(p.act2 || '');
  const [pAct3, setPAct3] = useState(p.act3 || '');
  const [pAct4, setPAct4] = useState(p.act4 || '');
  const [pAct5, setPAct5] = useState(p.act5 || '');
  const [pAct6, setPAct6] = useState(p.act6 || '');
  const [pChar, setPChar] = useState(p.char || '');
  const [pExam, setPExam] = useState(p.exam || '');

  // Midterm scores state
  const [mAct1, setMAct1] = useState(m.act1 || '');
  const [mAct2, setMAct2] = useState(m.act2 || '');
  const [mAct3, setMAct3] = useState(m.act3 || '');
  const [mAct4, setMAct4] = useState(m.act4 || '');
  const [mAct5, setMAct5] = useState(m.act5 || '');
  const [mAct6, setMAct6] = useState(m.act6 || '');
  const [mChar, setMChar] = useState(m.char || '');
  const [mExam, setMExam] = useState(m.exam || '');

  // Semi-Final scores state
  const [sfAct1, setSfAct1] = useState(sf.act1 || '');
  const [sfAct2, setSfAct2] = useState(sf.act2 || '');
  const [sfAct3, setSfAct3] = useState(sf.act3 || '');
  const [sfAct4, setSfAct4] = useState(sf.act4 || '');
  const [sfAct5, setSfAct5] = useState(sf.act5 || '');
  const [sfAct6, setSfAct6] = useState(sf.act6 || '');
  const [sfChar, setSfChar] = useState(sf.char || '');
  const [sfExam, setSfExam] = useState(sf.exam || '');

  // Final scores state
  const [fAct1, setFAct1] = useState(f.act1 || '');
  const [fAct2, setFAct2] = useState(f.act2 || '');
  const [fAct3, setFAct3] = useState(f.act3 || '');
  const [fAct4, setFAct4] = useState(f.act4 || '');
  const [fAct5, setFAct5] = useState(f.act5 || '');
  const [fAct6, setFAct6] = useState(f.act6 || '');
  const [fChar, setFChar] = useState(f.char || '');
  const [fExam, setFExam] = useState(f.exam || '');

  const [customRemarks, setCustomRemarks] = useState(saved?.customRemarks ?? '');
  const [remarksNote, setRemarksNote] = useState(saved?.remarksNote ?? '');
  const [showNoteInput, setShowNoteInput] = useState(!!(saved?.customRemarks));

  // Auto-save indicator
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const debounceRef = useRef(null);
  const isFirstRender = useRef(true);

  // ── Auto-save: fires 800ms after any score/remark change ──────────────────
  useEffect(() => {
    // Skip the very first render so we don't flash "Saving" on mount
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (readOnly) return;

    setSaveStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const payload = {
        Prelim:       { act1: pAct1, act2: pAct2, act3: pAct3, act4: pAct4, act5: pAct5, act6: pAct6, char: pChar, exam: pExam },
        Midterm:      { act1: mAct1, act2: mAct2, act3: mAct3, act4: mAct4, act5: mAct5, act6: mAct6, char: mChar, exam: mExam },
        'Semi-Final': { act1: sfAct1, act2: sfAct2, act3: sfAct3, act4: sfAct4, act5: sfAct5, act6: sfAct6, char: sfChar, exam: sfExam },
        Final:        { act1: fAct1, act2: fAct2, act3: fAct3, act4: fAct4, act5: fAct5, act6: fAct6, char: fChar, exam: fExam },
        customRemarks,
        remarksNote,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSaveStatus('saved');
      // Reset back to idle after 2s
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [
    pAct1, pAct2, pAct3, pAct4, pAct5, pAct6, pChar, pExam,
    mAct1, mAct2, mAct3, mAct4, mAct5, mAct6, mChar, mExam,
    sfAct1, sfAct2, sfAct3, sfAct4, sfAct5, sfAct6, sfChar, sfExam,
    fAct1, fAct2, fAct3, fAct4, fAct5, fAct6, fChar, fExam,
    customRemarks, remarksNote,
    readOnly, STORAGE_KEY
  ]);

  // Helper change handler for ratings calculation per term using dynamic max items
  const calcPeriodRating = (act1, act2, act3, act4, act5, act6, char, exam, term) => {
    const termMax = maxItems[term] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };
    const totalActMax = termMax.act1 + termMax.act2 + termMax.act3 + termMax.act4 + termMax.act5 + termMax.act6;
    
    const val1 = Number(act1) || 0;
    const val2 = Number(act2) || 0;
    const val3 = Number(act3) || 0;
    const val4 = Number(act4) || 0;
    const val5 = Number(act5) || 0;
    const val6 = Number(act6) || 0;
    const charVal = Number(char) || 0;
    const examVal = Number(exam) || 0;

    const csTotal = val1 + val2 + val3 + val4 + val5 + val6;
    
    // Percentage based on dynamic total points
    const csPercent = totalActMax > 0 ? (csTotal / totalActMax) * 50 : 0;
    const charPercent = termMax.char > 0 ? (charVal / termMax.char) * 10 : 0; // Weighted at 10%
    const examPercent = termMax.exam > 0 ? (examVal / termMax.exam) * 40 : 0; // Weighted at 40%
    
    const totalScore = csPercent + charPercent + examPercent;
    const rating = Math.min(100, Math.max(0, Math.round(totalScore)));
    return { csTotal, csPercent, examPercent, rating };
  };

  // Computations for all 4 periods
  const prelimResult = calcPeriodRating(pAct1, pAct2, pAct3, pAct4, pAct5, pAct6, pChar, pExam, 'Prelim');
  const midtermResult = calcPeriodRating(mAct1, mAct2, mAct3, mAct4, mAct5, mAct6, mChar, mExam, 'Midterm');
  const semiFinalResult = calcPeriodRating(sfAct1, sfAct2, sfAct3, sfAct4, sfAct5, sfAct6, sfChar, sfExam, 'Semi-Final');
  const finalResult = calcPeriodRating(fAct1, fAct2, fAct3, fAct4, fAct5, fAct6, fChar, fExam, 'Final');

  // Semestral rating chain computations (Excel standard)
  const mr = Math.round((prelimResult.rating + midtermResult.rating) / 2);
  const tfr = Math.round((semiFinalResult.rating + finalResult.rating) / 2);
  const sg = Math.round((mr + tfr) / 2);

  // Transmute semestral grade to university GWA (DYCI Standard)
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

  const rawGrade = getTransmutedGrade(sg);
  const autoRemarks = parseFloat(rawGrade) <= 3.00 ? 'Passed' : 'Failed';
  const remarks = customRemarks || autoRemarks;

  // Grade displayed is affected by remark override
  const grade = (() => {
    if (remarks === 'INC') return rawGrade;
    if (remarks === 'Passed' && parseFloat(rawGrade) > 3.00) return '3.00';
    return rawGrade;
  })();

  const isNonPassing = ['Failed', 'INC', 'FDA', 'Dropped'].includes(remarks);

  // Determine status indicators
  const getStatus = (score) => {
    if (score >= 80) return { label: 'Safe', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500 shadow-emerald-500/40' };
    if (score >= 75) return { label: 'At-Risk', color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500 shadow-amber-500/40' };
    return { label: 'Failing', color: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500 shadow-rose-500/40 animate-pulse' };
  };

  const pMax = maxItems.Prelim || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };
  const mMax = maxItems.Midterm || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };
  const sfMax = maxItems['Semi-Final'] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };
  const fMax = maxItems.Final || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };

  const statusInfo = getStatus(sg);

  const isLocked = readOnly || lockedMilestones.includes('Semestral Grade') || lockedMilestones.includes('Final');
  const isPrelimLocked = isLocked;
  const isMidtermLocked = isLocked;
  const isSemiFinalLocked = isLocked;
  const isFinalLocked = isLocked;

  // Input Cell Renderer Helper (replaces raw input elements, adds onFocus select, cap checks and formatting)
  const renderInputCell = (value, setValue, maxVal, isLocked, widthClass = "w-12") => {
    if (isLocked) {
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
          setValue(val);
        }}
        className={cn(
          widthClass,
          "px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs"
        )}
      />
    );
  };

  return (
    <tr className={cn(
      "transition-colors text-center text-xs text-slate-700",
      statusInfo.label === 'Safe' && "hover:bg-slate-50/60",
      statusInfo.label === 'At-Risk' && "bg-amber-50/10 hover:bg-amber-50/30",
      statusInfo.label === 'Failing' && "bg-rose-50/10 hover:bg-rose-50/30 border-l-2 border-l-rose-400"
    )}>
      {/* Row Number */}
      <td className="px-2 py-3 border-r border-slate-200 text-slate-500 font-mono text-[11px] w-10">
        {rowNo}
      </td>
      
      {/* Student Number */}
      <td className="px-2 py-3 border-r border-slate-200 text-slate-500 font-mono text-[11px] w-24">
        {student.studentNo || student.id}
      </td>
      
      {/* Student Name (Sticky on Left) */}
      <td className="px-4 py-3 text-left font-semibold text-slate-900 sticky left-0 bg-white border-r border-slate-200 z-10 w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
        {student.name}
      </td>
      
      {/* ==================== PRELIMINARY GRADE ==================== */}
      {(viewMode === 'All' || viewMode === 'Prelim') && (
        <>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(pAct1, setPAct1, pMax.act1, isPrelimLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(pAct2, setPAct2, pMax.act2, isPrelimLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(pAct3, setPAct3, pMax.act3, isPrelimLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(pAct4, setPAct4, pMax.act4, isPrelimLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(pAct5, setPAct5, pMax.act5, isPrelimLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(pAct6, setPAct6, pMax.act6, isPrelimLocked)}</td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{prelimResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{prelimResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">{renderInputCell(pChar, setPChar, pMax.char, isPrelimLocked, "w-16")}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(pExam, setPExam, pMax.exam, isPrelimLocked)}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{prelimResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-sky-50 border-r border-slate-200 text-sky-850 w-14 text-center">{prelimResult.rating}</td>
        </>
      )}
      
      {/* ==================== MIDTERM GRADE ==================== */}
      {(viewMode === 'All' || viewMode === 'Midterm') && (
        <>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(mAct1, setMAct1, mMax.act1, isMidtermLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(mAct2, setMAct2, mMax.act2, isMidtermLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(mAct3, setMAct3, mMax.act3, isMidtermLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(mAct4, setMAct4, mMax.act4, isMidtermLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(mAct5, setMAct5, mMax.act5, isMidtermLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(mAct6, setMAct6, mMax.act6, isMidtermLocked)}</td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{midtermResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{midtermResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">{renderInputCell(mChar, setMChar, mMax.char, isMidtermLocked, "w-16")}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(mExam, setMExam, mMax.exam, isMidtermLocked)}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{midtermResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-indigo-50 border-r border-slate-200 text-indigo-800 w-14 text-center">{midtermResult.rating}</td>
        </>
      )}
      
      {/* ==================== MIDTERM RATING (MR) ==================== */}
      {(viewMode === 'All' || viewMode === 'Midterm') && (
        <td className="px-3 py-3 font-mono font-extrabold bg-indigo-100 border-r border-slate-200 text-indigo-950 w-16 text-center text-sm">{mr}</td>
      )}
      
      {/* ==================== SEMI-FINAL GRADE ==================== */}
      {(viewMode === 'All' || viewMode === 'Semi-Final') && (
        <>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(sfAct1, setSfAct1, sfMax.act1, isSemiFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(sfAct2, setSfAct2, sfMax.act2, isSemiFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(sfAct3, setSfAct3, sfMax.act3, isSemiFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(sfAct4, setSfAct4, sfMax.act4, isSemiFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(sfAct5, setSfAct5, sfMax.act5, isSemiFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(sfAct6, setSfAct6, sfMax.act6, isSemiFinalLocked)}</td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{semiFinalResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{semiFinalResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">{renderInputCell(sfChar, setSfChar, sfMax.char, isSemiFinalLocked, "w-16")}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(sfExam, setSfExam, sfMax.exam, isSemiFinalLocked)}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{semiFinalResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-amber-50 border-r border-slate-200 text-amber-800 w-14 text-center">{semiFinalResult.rating}</td>
        </>
      )}
      
      {/* ==================== FINAL GRADE ==================== */}
      {(viewMode === 'All' || viewMode === 'Final') && (
        <>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(fAct1, setFAct1, fMax.act1, isFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(fAct2, setFAct2, fMax.act2, isFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(fAct3, setFAct3, fMax.act3, isFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(fAct4, setFAct4, fMax.act4, isFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(fAct5, setFAct5, fMax.act5, isFinalLocked)}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(fAct6, setFAct6, fMax.act6, isFinalLocked)}</td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{finalResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{finalResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">{renderInputCell(fChar, setFChar, fMax.char, isFinalLocked, "w-16")}</td>
          <td className="p-1 border-r border-slate-100 w-12">{renderInputCell(fExam, setFExam, fMax.exam, isFinalLocked)}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{finalResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-orange-50 border-r border-slate-200 text-orange-850 w-14 text-center">{finalResult.rating}</td>
        </>
      )}
      
      {/* ==================== TENTATIVE FINAL RATING (TFR) ==================== */}
      {(viewMode === 'All' || viewMode === 'Final') && (
        <td className="px-3 py-3 font-mono font-extrabold bg-orange-100 border-r border-slate-200 text-orange-950 w-16 text-center text-sm">{tfr}</td>
      )}
      
      {/* ==================== SEMESTRAL GRADE (SG) ==================== */}
      {(viewMode === 'All' || viewMode === 'Final') && (
        <td className="px-3 py-3 font-mono font-extrabold bg-emerald-50 border-r border-slate-200 text-emerald-800 w-16 text-center text-sm">{sg}</td>
      )}
      
      {/* ==================== EQUIVALENT GWA ==================== */}
      {(viewMode === 'All' || viewMode === 'Final') && (
        <td className="px-3 py-3 border-r border-slate-200 bg-emerald-100/50 w-16 text-center">
          <span className={cn(
            "px-2 py-0.5 rounded font-mono font-bold text-xs border bg-white shadow-sm",
            isNonPassing ? "text-rose-600 border-rose-200" : "text-emerald-700 border-emerald-250"
          )}>
            {grade}
          </span>
        </td>
      )}
      
      {/* ==================== REMARKS ==================== */}
      {(viewMode === 'All' || viewMode === 'Final') && (
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
              {/* Remark selector */}
              <select
                value={remarks}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomRemarks(val);
                  // Show note input whenever faculty manually picks a non-auto remark
                  setShowNoteInput(val !== autoRemarks);
                  if (val === autoRemarks) setRemarksNote('');
                }}
                className="appearance-none bg-white border border-slate-200 hover:border-sage-300 px-2 py-1 rounded text-[10px] font-extrabold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700 w-full text-center"
              >
                <option value="Passed">Passed</option>
                <option value="Failed">Failed</option>
                <option value="INC">INC</option>
                <option value="FDA">FDA</option>
                <option value="Dropped">Dropped</option>
              </select>

              {/* Optional note — appears only when remark is manually overridden */}
              {showNoteInput && (
                <div className="w-full mt-0.5 relative group">
                  <textarea
                    value={remarksNote}
                    onChange={(e) => setRemarksNote(e.target.value)}
                    placeholder="Reason for override…"
                    rows={2}
                    className="w-full text-[9px] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-900 placeholder-amber-400 focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none resize-none transition-all font-normal"
                  />
                  <MessageSquare className="absolute top-1.5 right-1.5 h-2.5 w-2.5 text-amber-400 pointer-events-none" />
                </div>
              )}

              {/* Auto-save status indicator */}
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
