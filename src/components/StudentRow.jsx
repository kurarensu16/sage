import React, { useState } from 'react';
import { cn } from "../lib/utils";
import { Check, Save, Lock } from 'lucide-react';

export default function StudentRow({ student, rowNo, initialPeriods, readOnly = false, viewMode = 'All' }) {
  // Prelim scores state
  const [pAct1, setPAct1] = useState(initialPeriods?.Prelim?.act1 ?? 0);
  const [pAct2, setPAct2] = useState(initialPeriods?.Prelim?.act2 ?? 0);
  const [pAct3, setPAct3] = useState(initialPeriods?.Prelim?.act3 ?? 0);
  const [pAct4, setPAct4] = useState(initialPeriods?.Prelim?.act4 ?? 0);
  const [pAct5, setPAct5] = useState(initialPeriods?.Prelim?.act5 ?? 0);
  const [pAct6, setPAct6] = useState(initialPeriods?.Prelim?.act6 ?? 0);
  const [pChar, setPChar] = useState(initialPeriods?.Prelim?.char ?? 0);
  const [pExam, setPExam] = useState(initialPeriods?.Prelim?.exam ?? 0);

  // Midterm scores state
  const [mAct1, setMAct1] = useState(initialPeriods?.Midterm?.act1 ?? 0);
  const [mAct2, setMAct2] = useState(initialPeriods?.Midterm?.act2 ?? 0);
  const [mAct3, setMAct3] = useState(initialPeriods?.Midterm?.act3 ?? 0);
  const [mAct4, setMAct4] = useState(initialPeriods?.Midterm?.act4 ?? 0);
  const [mAct5, setMAct5] = useState(initialPeriods?.Midterm?.act5 ?? 0);
  const [mAct6, setMAct6] = useState(initialPeriods?.Midterm?.act6 ?? 0);
  const [mChar, setMChar] = useState(initialPeriods?.Midterm?.char ?? 0);
  const [mExam, setMExam] = useState(initialPeriods?.Midterm?.exam ?? 0);

  // Semi-Final scores state
  const [sfAct1, setSfAct1] = useState(initialPeriods?.['Semi-Final']?.act1 ?? initialPeriods?.SemiFinal?.act1 ?? 0);
  const [sfAct2, setSfAct2] = useState(initialPeriods?.['Semi-Final']?.act2 ?? initialPeriods?.SemiFinal?.act2 ?? 0);
  const [sfAct3, setSfAct3] = useState(initialPeriods?.['Semi-Final']?.act3 ?? initialPeriods?.SemiFinal?.act3 ?? 0);
  const [sfAct4, setSfAct4] = useState(initialPeriods?.['Semi-Final']?.act4 ?? initialPeriods?.SemiFinal?.act4 ?? 0);
  const [sfAct5, setSfAct5] = useState(initialPeriods?.['Semi-Final']?.act5 ?? initialPeriods?.SemiFinal?.act5 ?? 0);
  const [sfAct6, setSfAct6] = useState(initialPeriods?.['Semi-Final']?.act6 ?? initialPeriods?.SemiFinal?.act6 ?? 0);
  const [sfChar, setSfChar] = useState(initialPeriods?.['Semi-Final']?.char ?? initialPeriods?.SemiFinal?.char ?? 0);
  const [sfExam, setSfExam] = useState(initialPeriods?.['Semi-Final']?.exam ?? initialPeriods?.SemiFinal?.exam ?? 0);

  // Final scores state
  const [fAct1, setFAct1] = useState(initialPeriods?.Final?.act1 ?? 0);
  const [fAct2, setFAct2] = useState(initialPeriods?.Final?.act2 ?? 0);
  const [fAct3, setFAct3] = useState(initialPeriods?.Final?.act3 ?? 0);
  const [fAct4, setFAct4] = useState(initialPeriods?.Final?.act4 ?? 0);
  const [fAct5, setFAct5] = useState(initialPeriods?.Final?.act5 ?? 0);
  const [fAct6, setFAct6] = useState(initialPeriods?.Final?.act6 ?? 0);
  const [fChar, setFChar] = useState(initialPeriods?.Final?.char ?? 0);
  const [fExam, setFExam] = useState(initialPeriods?.Final?.exam ?? 0);

  const [isSaved, setIsSaved] = useState(false);

  // Helper change handler for ratings calculation per term
  const calcPeriodRating = (act1, act2, act3, act4, act5, act6, char, exam) => {
    const csTotal = act1 + act2 + act3 + act4 + act5 + act6;
    const csPercent = (csTotal / 110) * 50;
    const charPercent = char * 0.1;
    const examPercent = exam; // exam raw score acts as exam weight score (exam/40 * 40 => exam)
    const totalScore = csPercent + charPercent + examPercent;
    const rating = Math.min(100, Math.max(0, Math.round(totalScore)));
    return { csTotal, csPercent, examPercent, rating };
  };

  // Computations for all 4 periods
  const prelimResult = calcPeriodRating(pAct1, pAct2, pAct3, pAct4, pAct5, pAct6, pChar, pExam);
  const midtermResult = calcPeriodRating(mAct1, mAct2, mAct3, mAct4, mAct5, mAct6, mChar, mExam);
  const semiFinalResult = calcPeriodRating(sfAct1, sfAct2, sfAct3, sfAct4, sfAct5, sfAct6, sfChar, sfExam);
  const finalResult = calcPeriodRating(fAct1, fAct2, fAct3, fAct4, fAct5, fAct6, fChar, fExam);

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

  const grade = getTransmutedGrade(sg);
  const remarks = parseFloat(grade) <= 3.00 ? 'Passed' : 'Failed';

  // Determine status indicators
  const getStatus = (score) => {
    if (score >= 80) return { label: 'Safe', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500 shadow-emerald-500/40' };
    if (score >= 75) return { label: 'At-Risk', color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500 shadow-amber-500/40' };
    return { label: 'Failing', color: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500 shadow-rose-500/40 animate-pulse' };
  };

  const statusInfo = getStatus(sg);

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
            {readOnly ? <span className="font-mono text-xs">{pAct1}</span> : (
              <input type="number" min="0" max="20" value={pAct1} onChange={(e) => { setPAct1(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{pAct2}</span> : (
              <input type="number" min="0" max="20" value={pAct2} onChange={(e) => { setPAct2(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{pAct3}</span> : (
              <input type="number" min="0" max="20" value={pAct3} onChange={(e) => { setPAct3(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{pAct4}</span> : (
              <input type="number" min="0" max="20" value={pAct4} onChange={(e) => { setPAct4(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{pAct5}</span> : (
              <input type="number" min="0" max="20" value={pAct5} onChange={(e) => { setPAct5(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{pAct6}</span> : (
              <input type="number" min="0" max="10" value={pAct6} onChange={(e) => { setPAct6(Math.max(0, Math.min(10, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{prelimResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{prelimResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">
            {readOnly ? <span className="font-mono text-xs">{pChar}</span> : (
              <input type="number" min="0" max="100" value={pChar} onChange={(e) => { setPChar(Math.max(0, Math.min(100, Number(e.target.value)))); setIsSaved(false); }} className="w-16 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{pExam}</span> : (
              <input type="number" min="0" max="40" value={pExam} onChange={(e) => { setPExam(Math.max(0, Math.min(40, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{pExam.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-sky-50 border-r border-slate-200 text-sky-850 w-14 text-center">{prelimResult.rating}</td>
        </>
      )}
      
      {/* ==================== MIDTERM GRADE ==================== */}
      {(viewMode === 'All' || viewMode === 'Midterm') && (
        <>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{mAct1}</span> : (
              <input type="number" min="0" max="20" value={mAct1} onChange={(e) => { setMAct1(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{mAct2}</span> : (
              <input type="number" min="0" max="20" value={mAct2} onChange={(e) => { setMAct2(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{mAct3}</span> : (
              <input type="number" min="0" max="20" value={mAct3} onChange={(e) => { setMAct3(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{mAct4}</span> : (
              <input type="number" min="0" max="20" value={mAct4} onChange={(e) => { setMAct4(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{mAct5}</span> : (
              <input type="number" min="0" max="20" value={mAct5} onChange={(e) => { setMAct5(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{mAct6}</span> : (
              <input type="number" min="0" max="10" value={mAct6} onChange={(e) => { setMAct6(Math.max(0, Math.min(10, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{midtermResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{midtermResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">
            {readOnly ? <span className="font-mono text-xs">{mChar}</span> : (
              <input type="number" min="0" max="100" value={mChar} onChange={(e) => { setMChar(Math.max(0, Math.min(100, Number(e.target.value)))); setIsSaved(false); }} className="w-16 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{mExam}</span> : (
              <input type="number" min="0" max="40" value={mExam} onChange={(e) => { setMExam(Math.max(0, Math.min(40, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{mExam.toFixed(1)}</td>
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
            {readOnly ? <span className="font-mono text-xs">{sfAct1}</span> : (
              <input type="number" min="0" max="20" value={sfAct1} onChange={(e) => { setSfAct1(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{sfAct2}</span> : (
              <input type="number" min="0" max="20" value={sfAct2} onChange={(e) => { setSfAct2(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{sfAct3}</span> : (
              <input type="number" min="0" max="20" value={sfAct3} onChange={(e) => { setSfAct3(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{sfAct4}</span> : (
              <input type="number" min="0" max="20" value={sfAct4} onChange={(e) => { setSfAct4(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{sfAct5}</span> : (
              <input type="number" min="0" max="20" value={sfAct5} onChange={(e) => { setSfAct5(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{sfAct6}</span> : (
              <input type="number" min="0" max="10" value={sfAct6} onChange={(e) => { setSfAct6(Math.max(0, Math.min(10, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{semiFinalResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{semiFinalResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">
            {readOnly ? <span className="font-mono text-xs">{sfChar}</span> : (
              <input type="number" min="0" max="100" value={sfChar} onChange={(e) => { setSfChar(Math.max(0, Math.min(100, Number(e.target.value)))); setIsSaved(false); }} className="w-16 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{sfExam}</span> : (
              <input type="number" min="0" max="40" value={sfExam} onChange={(e) => { setSfExam(Math.max(0, Math.min(40, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{sfExam.toFixed(1)}</td>
          <td className="px-2 py-3 font-mono font-bold bg-amber-50 border-r border-slate-200 text-amber-800 w-14 text-center">{semiFinalResult.rating}</td>
        </>
      )}
      
      {/* ==================== FINAL GRADE ==================== */}
      {(viewMode === 'All' || viewMode === 'Final') && (
        <>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{fAct1}</span> : (
              <input type="number" min="0" max="20" value={fAct1} onChange={(e) => { setFAct1(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{fAct2}</span> : (
              <input type="number" min="0" max="20" value={fAct2} onChange={(e) => { setFAct2(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{fAct3}</span> : (
              <input type="number" min="0" max="20" value={fAct3} onChange={(e) => { setFAct3(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{fAct4}</span> : (
              <input type="number" min="0" max="20" value={fAct4} onChange={(e) => { setFAct4(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{fAct5}</span> : (
              <input type="number" min="0" max="20" value={fAct5} onChange={(e) => { setFAct5(Math.max(0, Math.min(20, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{fAct6}</span> : (
              <input type="number" min="0" max="10" value={fAct6} onChange={(e) => { setFAct6(Math.max(0, Math.min(10, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono font-semibold bg-slate-50/50 border-r border-slate-100 text-slate-650 w-12">{finalResult.csTotal}</td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{finalResult.csPercent.toFixed(1)}</td>
          <td className="p-1 border-r border-slate-100 w-16">
            {readOnly ? <span className="font-mono text-xs">{fChar}</span> : (
              <input type="number" min="0" max="100" value={fChar} onChange={(e) => { setFChar(Math.max(0, Math.min(100, Number(e.target.value)))); setIsSaved(false); }} className="w-16 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="p-1 border-r border-slate-100 w-12">
            {readOnly ? <span className="font-mono text-xs">{fExam}</span> : (
              <input type="number" min="0" max="40" value={fExam} onChange={(e) => { setFExam(Math.max(0, Math.min(40, Number(e.target.value)))); setIsSaved(false); }} className="w-12 px-1 py-0.5 text-center font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none text-xs" />
            )}
          </td>
          <td className="px-1.5 py-3 font-mono text-[11px] bg-slate-50/50 border-r border-slate-100 text-slate-500 w-12">{fExam.toFixed(1)}</td>
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
            remarks === 'Failed' ? "text-rose-600 border-rose-200" : "text-emerald-700 border-emerald-250"
          )}>
            {grade}
          </span>
        </td>
      )}
      
      {/* ==================== REMARKS ==================== */}
      {(viewMode === 'All' || viewMode === 'Final') && (
        <td className="px-4 py-3 border-r border-slate-200 bg-emerald-100/30 w-20 text-center font-bold text-xs">
          <span className={remarks === 'Failed' ? "text-rose-600" : "text-emerald-700"}>
            {remarks}
          </span>
        </td>
      )}
      
      {/* Inline Save Action Button */}
      <td className="px-4 py-3 text-center">
        {readOnly ? (
          <Lock className="h-3.5 w-3.5 text-slate-400 mx-auto" />
        ) : (
          <button
            onClick={handleSave}
            className={cn(
              "p-1.5 rounded transition-all flex items-center justify-center mx-auto border",
              isSaved 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-white text-slate-500 hover:text-sage-700 border-slate-200 hover:border-sage-300"
            )}
            title="Save row draft"
          >
            {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          </button>
        )}
      </td>
    </tr>
  );
}
