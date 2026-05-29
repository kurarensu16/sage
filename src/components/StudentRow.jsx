import React, { useState, useEffect, useRef } from 'react';
import { cn } from "../lib/utils";
import { Check, Lock, MessageSquare, CloudUpload } from 'lucide-react';



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

  // Prelim scores state
  const [pAct1, setPAct1] = useState(p.act1 ?? 0);
  const [pAct2, setPAct2] = useState(p.act2 ?? 0);
  const [pAct3, setPAct3] = useState(p.act3 ?? 0);
  const [pAct4, setPAct4] = useState(p.act4 ?? 0);
  const [pAct5, setPAct5] = useState(p.act5 ?? 0);
  const [pAct6, setPAct6] = useState(p.act6 ?? 0);
  const [pChar, setPChar] = useState(p.char ?? 0);
  const [pExam, setPExam] = useState(p.exam ?? 0);

  // Midterm scores state
  const [mAct1, setMAct1] = useState(m.act1 ?? 0);
  const [mAct2, setMAct2] = useState(m.act2 ?? 0);
  const [mAct3, setMAct3] = useState(m.act3 ?? 0);
  const [mAct4, setMAct4] = useState(m.act4 ?? 0);
  const [mAct5, setMAct5] = useState(m.act5 ?? 0);
  const [mAct6, setMAct6] = useState(m.act6 ?? 0);
  const [mChar, setMChar] = useState(m.char ?? 0);
  const [mExam, setMExam] = useState(m.exam ?? 0);

  // Semi-Final scores state
  const [sfAct1, setSfAct1] = useState(sf.act1 ?? 0);
  const [sfAct2, setSfAct2] = useState(sf.act2 ?? 0);
  const [sfAct3, setSfAct3] = useState(sf.act3 ?? 0);
  const [sfAct4, setSfAct4] = useState(sf.act4 ?? 0);
  const [sfAct5, setSfAct5] = useState(sf.act5 ?? 0);
  const [sfAct6, setSfAct6] = useState(sf.act6 ?? 0);
  const [sfChar, setSfChar] = useState(sf.char ?? 0);
  const [sfExam, setSfExam] = useState(sf.exam ?? 0);

  // Final scores state
  const [fAct1, setFAct1] = useState(f.act1 ?? 0);
  const [fAct2, setFAct2] = useState(f.act2 ?? 0);
  const [fAct3, setFAct3] = useState(f.act3 ?? 0);
  const [fAct4, setFAct4] = useState(f.act4 ?? 0);
  const [fAct5, setFAct5] = useState(f.act5 ?? 0);
  const [fAct6, setFAct6] = useState(f.act6 ?? 0);
  const [fChar, setFChar] = useState(f.char ?? 0);
  const [fExam, setFExam] = useState(f.exam ?? 0);


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
  ]);


  // Helper change handler for ratings calculation per term using dynamic max items
  const calcPeriodRating = (act1, act2, act3, act4, act5, act6, char, exam, term) => {
    const termMax = maxItems[term] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };
    const totalActMax = termMax.act1 + termMax.act2 + termMax.act3 + termMax.act4 + termMax.act5 + termMax.act6;
    const csTotal = act1 + act2 + act3 + act4 + act5 + act6;
    
    // Percentage based on dynamic total points
    const csPercent = totalActMax > 0 ? (csTotal / totalActMax) * 50 : 0;
    const charPercent = termMax.char > 0 ? (char / termMax.char) * 10 : 0; // Weighted at 10%
    const examPercent = termMax.exam > 0 ? (exam / termMax.exam) * 40 : 0; // Weighted at 40%
    
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

  // Grade displayed is affected by remark override:
  // - INC: show the actual computed (failing) grade as recorded
  // - Passed override (on a failing grade): cap display to 3.00 (passing threshold)
  // - All other cases: show raw computed grade
  const grade = (() => {
    if (remarks === 'INC') return rawGrade;           // INC retains the raw failing grade
    if (remarks === 'Passed' && parseFloat(rawGrade) > 3.00) return '3.00'; // grace pass capped at 3.00
    return rawGrade;
  })();

  // Helper: is the remark one that implies a non-passing / flagged status
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

  const isPrelimLocked = readOnly || lockedMilestones.includes('Prelim') || lockedMilestones.includes('Midterm Rating') || lockedMilestones.includes('Semestral Grade');
  const isMidtermLocked = readOnly || lockedMilestones.includes('Midterm') || lockedMilestones.includes('Midterm Rating') || lockedMilestones.includes('Semestral Grade');
  const isSemiFinalLocked = readOnly || lockedMilestones.includes('Semi-Final') || lockedMilestones.includes('Tentative Final Rating') || lockedMilestones.includes('Semestral Grade');
  const isFinalLocked = readOnly || lockedMilestones.includes('Final') || lockedMilestones.includes('Tentative Final Rating') || lockedMilestones.includes('Semestral Grade');

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
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
        {student.id === 11 ? '2025-1001' : student.id === 12 ? '2025-1002' : student.id === 13 ? '2025-1003' : `2025-100${student.id}`}
      </td>
      
      {/* Student Name (Sticky on Left) */}
      <td className="px-4 py-3 text-left font-semibold text-slate-900 sticky left-0 bg-white border-r border-slate-200 z-10 w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
        {student.name}
      </td>
      
      {/* ==================== PRELIMINARY GRADE ==================== */}
      {(viewMode === 'All' || viewMode === 'Prelim') && (
        <>
          <td className="p-1 border-r border-slate-100 w-12">
            {isPrelimLocked ? <span className="font-mono text-xs">{pAct1}</span> : (
              <input type="number" min="0" max={pMax.act1} value={pAct1} onChange={(e) => { setPAct1(Math.max(0, Math.min(pMax.act1, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isPrelimLocked ? <span className="font-mono text-xs">{pAct2}</span> : (
              <input type="number" min="0" max={pMax.act2} value={pAct2} onChange={(e) => { setPAct2(Math.max(0, Math.min(pMax.act2, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isPrelimLocked ? <span className="font-mono text-xs">{pAct3}</span> : (
              <input type="number" min="0" max={pMax.act3} value={pAct3} onChange={(e) => { setPAct3(Math.max(0, Math.min(pMax.act3, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isPrelimLocked ? <span className="font-mono text-xs">{pAct4}</span> : (
              <input type="number" min="0" max={pMax.act4} value={pAct4} onChange={(e) => { setPAct4(Math.max(0, Math.min(pMax.act4, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isPrelimLocked ? <span className="font-mono text-xs">{pAct5}</span> : (
              <input type="number" min="0" max={pMax.act5} value={pAct5} onChange={(e) => { setPAct5(Math.max(0, Math.min(pMax.act5, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isPrelimLocked ? <span className="font-mono text-xs">{pAct6}</span> : (
              <input type="number" min="0" max={pMax.act6} value={pAct6} onChange={(e) => { setPAct6(Math.max(0, Math.min(pMax.act6, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{prelimResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{prelimResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">
            {isPrelimLocked ? <span className="font-mono text-xs">{pChar}</span> : (
              <input type="number" min="0" max={pMax.char} value={pChar} onChange={(e) => { setPChar(Math.max(0, Math.min(pMax.char, Number(e.target.value)))); setIsSaved(false); }} className="w-16 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isPrelimLocked ? <span className="font-mono text-xs">{pExam}</span> : (
              <input type="number" min="0" max={pMax.exam} value={pExam} onChange={(e) => { setPExam(Math.max(0, Math.min(pMax.exam, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{prelimResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-sky-50 border-r border-slate-200 text-sky-850 w-14 text-center">{prelimResult.rating}</td>
        </>
      )}
      
      {/* ==================== MIDTERM GRADE ==================== */}
      {(viewMode === 'All' || viewMode === 'Midterm') && (
        <>
          <td className="p-1 border-r border-slate-100 w-12">
            {isMidtermLocked ? <span className="font-mono text-xs">{mAct1}</span> : (
              <input type="number" min="0" max={mMax.act1} value={mAct1} onChange={(e) => { setMAct1(Math.max(0, Math.min(mMax.act1, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isMidtermLocked ? <span className="font-mono text-xs">{mAct2}</span> : (
              <input type="number" min="0" max={mMax.act2} value={mAct2} onChange={(e) => { setMAct2(Math.max(0, Math.min(mMax.act2, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isMidtermLocked ? <span className="font-mono text-xs">{mAct3}</span> : (
              <input type="number" min="0" max={mMax.act3} value={mAct3} onChange={(e) => { setMAct3(Math.max(0, Math.min(mMax.act3, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isMidtermLocked ? <span className="font-mono text-xs">{mAct4}</span> : (
              <input type="number" min="0" max={mMax.act4} value={mAct4} onChange={(e) => { setMAct4(Math.max(0, Math.min(mMax.act4, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isMidtermLocked ? <span className="font-mono text-xs">{mAct5}</span> : (
              <input type="number" min="0" max={mMax.act5} value={mAct5} onChange={(e) => { setMAct5(Math.max(0, Math.min(mMax.act5, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isMidtermLocked ? <span className="font-mono text-xs">{mAct6}</span> : (
              <input type="number" min="0" max={mMax.act6} value={mAct6} onChange={(e) => { setMAct6(Math.max(0, Math.min(mMax.act6, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{midtermResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{midtermResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">
            {isMidtermLocked ? <span className="font-mono text-xs">{mChar}</span> : (
              <input type="number" min="0" max={mMax.char} value={mChar} onChange={(e) => { setMChar(Math.max(0, Math.min(mMax.char, Number(e.target.value)))); setIsSaved(false); }} className="w-16 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isMidtermLocked ? <span className="font-mono text-xs">{mExam}</span> : (
              <input type="number" min="0" max={mMax.exam} value={mExam} onChange={(e) => { setMExam(Math.max(0, Math.min(mMax.exam, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
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
          <td className="p-1 border-r border-slate-100 w-12">
            {isSemiFinalLocked ? <span className="font-mono text-xs">{sfAct1}</span> : (
              <input type="number" min="0" max={sfMax.act1} value={sfAct1} onChange={(e) => { setSfAct1(Math.max(0, Math.min(sfMax.act1, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isSemiFinalLocked ? <span className="font-mono text-xs">{sfAct2}</span> : (
              <input type="number" min="0" max={sfMax.act2} value={sfAct2} onChange={(e) => { setSfAct2(Math.max(0, Math.min(sfMax.act2, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isSemiFinalLocked ? <span className="font-mono text-xs">{sfAct3}</span> : (
              <input type="number" min="0" max={sfMax.act3} value={sfAct3} onChange={(e) => { setSfAct3(Math.max(0, Math.min(sfMax.act3, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isSemiFinalLocked ? <span className="font-mono text-xs">{sfAct4}</span> : (
              <input type="number" min="0" max={sfMax.act4} value={sfAct4} onChange={(e) => { setSfAct4(Math.max(0, Math.min(sfMax.act4, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isSemiFinalLocked ? <span className="font-mono text-xs">{sfAct5}</span> : (
              <input type="number" min="0" max={sfMax.act5} value={sfAct5} onChange={(e) => { setSfAct5(Math.max(0, Math.min(sfMax.act5, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-250 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isSemiFinalLocked ? <span className="font-mono text-xs">{sfAct6}</span> : (
              <input type="number" min="0" max={sfMax.act6} value={sfAct6} onChange={(e) => { setSfAct6(Math.max(0, Math.min(sfMax.act6, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{semiFinalResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{semiFinalResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">
            {isSemiFinalLocked ? <span className="font-mono text-xs">{sfChar}</span> : (
              <input type="number" min="0" max={sfMax.char} value={sfChar} onChange={(e) => { setSfChar(Math.max(0, Math.min(sfMax.char, Number(e.target.value)))); setIsSaved(false); }} className="w-16 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isSemiFinalLocked ? <span className="font-mono text-xs">{sfExam}</span> : (
              <input type="number" min="0" max={sfMax.exam} value={sfExam} onChange={(e) => { setSfExam(Math.max(0, Math.min(sfMax.exam, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{semiFinalResult.examPercent.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-amber-50 border-r border-slate-200 text-amber-800 w-14 text-center">{semiFinalResult.rating}</td>
        </>
      )}
      
      {/* ==================== FINAL GRADE ==================== */}
      {(viewMode === 'All' || viewMode === 'Final') && (
        <>
          <td className="p-1 border-r border-slate-100 w-12">
            {isFinalLocked ? <span className="font-mono text-xs">{fAct1}</span> : (
              <input type="number" min="0" max={fMax.act1} value={fAct1} onChange={(e) => { setFAct1(Math.max(0, Math.min(fMax.act1, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isFinalLocked ? <span className="font-mono text-xs">{fAct2}</span> : (
              <input type="number" min="0" max={fMax.act2} value={fAct2} onChange={(e) => { setFAct2(Math.max(0, Math.min(fMax.act2, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isFinalLocked ? <span className="font-mono text-xs">{fAct3}</span> : (
              <input type="number" min="0" max={fMax.act3} value={fAct3} onChange={(e) => { setFAct3(Math.max(0, Math.min(fMax.act3, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isFinalLocked ? <span className="font-mono text-xs">{fAct4}</span> : (
              <input type="number" min="0" max={fMax.act4} value={fAct4} onChange={(e) => { setFAct4(Math.max(0, Math.min(fMax.act4, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isFinalLocked ? <span className="font-mono text-xs">{fAct5}</span> : (
              <input type="number" min="0" max={fMax.act5} value={fAct5} onChange={(e) => { setFAct5(Math.max(0, Math.min(fMax.act5, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isFinalLocked ? <span className="font-mono text-xs">{fAct6}</span> : (
              <input type="number" min="0" max={fMax.act6} value={fAct6} onChange={(e) => { setFAct6(Math.max(0, Math.min(fMax.act6, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{finalResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{finalResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">
            {isFinalLocked ? <span className="font-mono text-xs">{fChar}</span> : (
              <input type="number" min="0" max={fMax.char} value={fChar} onChange={(e) => { setFChar(Math.max(0, Math.min(fMax.char, Number(e.target.value)))); setIsSaved(false); }} className="w-16 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {isFinalLocked ? <span className="font-mono text-xs">{fExam}</span> : (
              <input type="number" min="0" max={fMax.exam} value={fExam} onChange={(e) => { setFExam(Math.max(0, Math.min(fMax.exam, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
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
