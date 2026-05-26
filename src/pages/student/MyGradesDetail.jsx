import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Award, HelpCircle, AlertCircle, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function MyGradesDetail() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Midterm');

  // Breakdown datasets per period tab
  const periodData = {
    Prelim: {
      overallPct: 91.5,
      grade: '1.50',
      status: 'Posted',
      components: [
        { name: 'Written Work (Quizzes)', weight: 30, obtained: 88, max: 100, contribution: 26.4 },
        { name: 'Performance Tasks (Lab exercises)', weight: 20, obtained: 95, max: 100, contribution: 19.0 },
        { name: 'Prelim Examination', weight: 50, obtained: 92, max: 100, contribution: 46.0 }
      ],
      missingScores: []
    },
    Midterm: {
      overallPct: 94.7,
      grade: '1.25',
      status: 'Posted',
      components: [
        { name: 'Written Work (Quizzes)', weight: 30, obtained: 92, max: 100, contribution: 27.6 },
        { name: 'Performance Tasks (Lab exercises)', weight: 20, obtained: 98, max: 100, contribution: 19.6 },
        { name: 'Midterm Examination', weight: 50, obtained: 95, max: 100, contribution: 47.5 }
      ],
      missingScores: []
    },
    Final: {
      overallPct: 83.5,
      grade: '2.25',
      status: 'Draft',
      components: [
        { name: 'Written Work (Quizzes)', weight: 30, obtained: 85, max: 100, contribution: 25.5 },
        { name: 'Performance Tasks (Lab exercises)', weight: 20, obtained: 90, max: 100, contribution: 18.0 },
        { name: 'Final Examination', weight: 50, obtained: 80, max: 100, contribution: 40.0 }
      ],
      missingScores: ['Lab Exercise 4']
    }
  };

  const activeData = periodData[activeTab];

  return (
    <>
      <PageHeader title="Grade Breakdown" breadcrumb="Student Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumb detail */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer" onClick={() => navigate('/student/mygradeslist')}>
            My Grades
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">IT101 Breakdown</span>
        </div>

        {/* Subject Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold font-mono text-sage-600 bg-sage-50 border border-sage-200 px-2.5 py-1 rounded-md">IT101</span>
            <h2 className="text-2xl font-bold font-display text-slate-900 mt-2">Introduction to Computing</h2>
            <p className="text-xs text-slate-500 mt-1">Instructor: <strong className="text-slate-700">Prof. Amanda Rivera</strong> • Credits: 3.0 Units</p>
          </div>

          <div className="flex items-baseline gap-1 bg-slate-50 border border-slate-200 p-4 rounded-xl text-center md:text-right w-fit">
            <div className="text-left md:text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Running GWA Grade</span>
              <div className="mt-1 flex items-baseline gap-1 justify-center md:justify-end">
                <span className="text-3xl font-extrabold font-mono text-slate-950">1.25</span>
                <span className="text-xs text-slate-400 font-medium">Midterm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex border-b border-slate-200">
          {['Prelim', 'Midterm', 'Final'].map(tab => (
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
                  {activeData.components.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td>
                      <td className="px-4 py-3 text-center text-slate-500 font-mono">{item.weight}%</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {item.obtained} <span className="text-slate-400 font-normal">/ {item.max}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sage-600 font-bold">
                        {item.contribution.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
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
                  <h4 className="text-sm font-bold text-slate-900">{activeData.overallPct >= 75 ? 'Passed' : 'At-Risk'}</h4>
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

          </div>

        </div>

      </div>
    </>
  );
}
