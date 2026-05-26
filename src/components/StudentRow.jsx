import React, { useState } from 'react';
import { cn } from "../lib/utils";
import { Check, Save } from 'lucide-react';

export default function StudentRow({ student }) {
  const [activity, setActivity] = useState(student.activity || 0);
  const [quiz, setQuiz] = useState(student.quiz || 0);
  const [exam, setExam] = useState(student.exam || 0);
  const [isSaved, setIsSaved] = useState(false);

  // Compute running percentage score based on standard CCS weights:
  // Activity (20%), Quiz (30%), Exam (50%)
  const rawScore = (activity * 0.2) + (quiz * 0.3) + (exam * 0.5);
  
  // Transmute percentage to university grade scale
  const getTransmutedGrade = (pct) => {
    if (pct >= 97) return '1.00';
    if (pct >= 94) return '1.25';
    if (pct >= 91) return '1.50';
    if (pct >= 88) return '1.75';
    if (pct >= 85) return '2.00';
    if (pct >= 82) return '2.25';
    if (pct >= 79) return '2.50';
    if (pct >= 75) return '2.75';
    if (pct >= 70) return '3.00';
    return '5.00';
  };

  const grade = getTransmutedGrade(rawScore);

  // Determine status color and indicator
  const getStatus = (pct) => {
    if (pct >= 75) return { label: 'Safe', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500 shadow-emerald-500/40' };
    if (pct >= 70) return { label: 'At-Risk', color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500 shadow-amber-500/40' };
    return { label: 'Failing', color: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500 shadow-rose-500/40 animate-pulse' };
  };

  const statusInfo = getStatus(rawScore);

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <tr className={cn(
      "transition-colors",
      statusInfo.label === 'Safe' && "hover:bg-slate-50/60",
      statusInfo.label === 'At-Risk' && "bg-amber-50/10 hover:bg-amber-50/30",
      statusInfo.label === 'Failing' && "bg-rose-50/10 hover:bg-rose-50/30 border-l-2 border-l-rose-400"
    )}>
      <td className="px-4 py-3 text-sm font-semibold text-slate-900 sticky left-0 bg-white border-r border-slate-100">
        {student.name}
      </td>
      
      {/* Activity Input */}
      <td className="px-4 py-3">
        <input 
          type="number" 
          min="0"
          max="100"
          value={activity} 
          onChange={(e) => {
            setActivity(Number(e.target.value));
            setIsSaved(false);
          }}
          className="w-16 px-2 py-1 text-sm font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none transition-all" 
        />
      </td>

      {/* Quiz Input */}
      <td className="px-4 py-3">
        <input 
          type="number" 
          min="0"
          max="100"
          value={quiz} 
          onChange={(e) => {
            setQuiz(Number(e.target.value));
            setIsSaved(false);
          }}
          className="w-16 px-2 py-1 text-sm font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none transition-all" 
        />
      </td>

      {/* Exam Input */}
      <td className="px-4 py-3">
        <input 
          type="number" 
          min="0"
          max="100"
          value={exam} 
          onChange={(e) => {
            setExam(Number(e.target.value));
            setIsSaved(false);
          }}
          className="w-16 px-2 py-1 text-sm font-mono border border-slate-200 rounded focus:border-sage-400 focus:ring-1 focus:ring-sage-400 outline-none transition-all" 
        />
      </td>

      {/* Running Grade (Computed, Read-only, Mono, Color-Coded) */}
      <td className="px-4 py-3 text-right bg-slate-50/30 border-l border-slate-100">
        <span className={cn("font-mono text-sm font-bold", 
          grade === '5.00' ? 'text-rose-600' : grade === '3.00' || grade === '2.75' ? 'text-amber-600' : 'text-emerald-700'
        )}>
          {grade}
        </span>
      </td>

      {/* Status Dot with Hover Tooltip */}
      <td className="px-4 py-3 text-center bg-slate-50/30">
        <div className="inline-flex items-center justify-center relative group cursor-help">
          <div className={cn("h-3 w-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]", statusInfo.dot)}></div>
          
          {/* Tooltip on Hover showing exact running percentage */}
          <div className="absolute bottom-full mb-2 hidden group-hover:block w-max bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg z-20 font-semibold">
            {statusInfo.label} ({rawScore.toFixed(1)}%)
          </div>
        </div>
      </td>

      {/* Inline Save Action Button */}
      <td className="px-4 py-3 text-center">
        <button
          onClick={handleSave}
          className={cn(
            "p-1.5 rounded transition-all flex items-center justify-center mx-auto border",
            isSaved 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : "bg-white text-slate-500 hover:text-sage-700 border-slate-200 hover:border-sage-300"
          )}
          title="Save this row"
        >
          {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        </button>
      </td>

    </tr>
  );
}
