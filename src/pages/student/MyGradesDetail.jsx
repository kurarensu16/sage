import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, ChevronDown, Award, HelpCircle, AlertCircle, FileText, ChevronUp, Table, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function MyGradesDetail() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Midterm');
  const [isCsExpanded, setIsCsExpanded] = useState(true);
  const [isSpreadsheetFullScreen, setIsSpreadsheetFullScreen] = useState(false);

  // Breakdown datasets per period tab
  const periodData = {
    Prelim: {
      overallPct: 90.9,
      grade: '1.75',
      status: 'Posted',
      rating: 91,
      components: [
        { 
          name: 'Class Standing (Quizzes/Activities)', 
          weight: 50, 
          obtained: 101, 
          max: 110, 
          contribution: 45.91,
          breakdown: [
            { name: 'Activity 1', obtained: 18, max: 20 },
            { name: 'Activity 2', obtained: 19, max: 20 },
            { name: 'Activity 3', obtained: 17, max: 20 },
            { name: 'Activity 4', obtained: 20, max: 20 },
            { name: 'Activity 5', obtained: 18, max: 20 },
            { name: 'Activity 6', obtained: 9, max: 10 }
          ]
        },
        { name: 'Character Rating', weight: 10, obtained: 100, max: 100, contribution: 10.00 },
        { name: 'Prelim Examination', weight: 40, obtained: 35, max: 40, contribution: 35.00 }
      ],
      missingScores: []
    },
    Midterm: {
      overallPct: 87.3,
      grade: '2.00',
      status: 'Posted',
      rating: 87,
      components: [
        { 
          name: 'Class Standing (Quizzes/Activities)', 
          weight: 50, 
          obtained: 93, 
          max: 110, 
          contribution: 42.27,
          breakdown: [
            { name: 'Activity 1', obtained: 15, max: 20 },
            { name: 'Activity 2', obtained: 14, max: 20 },
            { name: 'Activity 3', obtained: 17, max: 20 },
            { name: 'Activity 4', obtained: 20, max: 20 },
            { name: 'Activity 5', obtained: 18, max: 20 },
            { name: 'Activity 6', obtained: 9, max: 10 }
          ]
        },
        { name: 'Character Rating', weight: 10, obtained: 100, max: 100, contribution: 10.00 },
        { name: 'Midterm Examination', weight: 40, obtained: 35, max: 40, contribution: 35.00 }
      ],
      missingScores: []
    },
    'Semi-Final': {
      overallPct: 90.9,
      grade: '1.75',
      status: 'Posted',
      rating: 91,
      components: [
        { 
          name: 'Class Standing (Quizzes/Activities)', 
          weight: 50, 
          obtained: 101, 
          max: 110, 
          contribution: 45.91,
          breakdown: [
            { name: 'Activity 1', obtained: 18, max: 20 },
            { name: 'Activity 2', obtained: 19, max: 20 },
            { name: 'Activity 3', obtained: 17, max: 20 },
            { name: 'Activity 4', obtained: 20, max: 20 },
            { name: 'Activity 5', obtained: 18, max: 20 },
            { name: 'Activity 6', obtained: 9, max: 10 }
          ]
        },
        { name: 'Character Rating', weight: 10, obtained: 100, max: 100, contribution: 10.00 },
        { name: 'Semi-Final Examination', weight: 40, obtained: 35, max: 40, contribution: 35.00 }
      ],
      missingScores: []
    },
    Final: {
      overallPct: 90.9,
      grade: '1.75',
      status: 'Draft',
      rating: 91,
      components: [
        { 
          name: 'Class Standing (Quizzes/Activities)', 
          weight: 50, 
          obtained: 101, 
          max: 110, 
          contribution: 45.91,
          breakdown: [
            { name: 'Activity 1', obtained: 18, max: 20 },
            { name: 'Activity 2', obtained: 19, max: 20 },
            { name: 'Activity 3', obtained: 17, max: 20 },
            { name: 'Activity 4', obtained: 20, max: 20 },
            { name: 'Activity 5', obtained: 18, max: 20 },
            { name: 'Activity 6', obtained: 9, max: 10 }
          ]
        },
        { name: 'Character Rating', weight: 10, obtained: 100, max: 100, contribution: 10.00 },
        { name: 'Final Examination', weight: 40, obtained: 35, max: 40, contribution: 35.00 }
      ],
      missingScores: []
    }
  };

  const activeData = periodData[activeTab];

  // Helper values for Semestral Spreadsheet View (representing Gabriel/Sarah's exact grades)
  const getRating = (tab) => periodData[tab].rating;
  const prelimRating = getRating('Prelim');
  const midtermRating = getRating('Midterm');
  const mr = Math.round((prelimRating + midtermRating) / 2);
  const semiFinalRating = getRating('Semi-Final');
  const finalRating = getRating('Final');
  const tfr = Math.round((semiFinalRating + finalRating) / 2);
  const sg = Math.round((mr + tfr) / 2);
  const finalGwa = '1.75';
  const remarks = 'Passed';

  return (
    <>
      <PageHeader title="Grade Breakdown" breadcrumb="Student Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 max-w-5xl mx-auto w-full space-y-6">
        
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
                <span className="text-3xl font-extrabold font-mono text-slate-950">{activeData.grade}</span>
                <span className="text-xs text-slate-400 font-medium">{activeTab}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex border-b border-slate-200">
          {['Prelim', 'Midterm', 'Semi-Final', 'Final'].map(tab => (
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
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Individual Activities Breakdown</div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  {item.breakdown.map((act, aIdx) => (
                                    <div key={aIdx} className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm flex flex-col justify-center">
                                      <span className="text-[10px] text-slate-400 uppercase font-mono">{act.name}</span>
                                      <span className="text-sm font-bold font-mono text-slate-800 mt-1">
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

        {/* Complete Semestral Grade Record Spreadsheet View */}
        {isSpreadsheetFullScreen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSpreadsheetFullScreen(false)} />}
        
        <div className={cn(
          "bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all",
          isSpreadsheetFullScreen ? "fixed inset-4 z-50 rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : "flex flex-col"
        )}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Table className="h-4.5 w-4.5 text-sage-600" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wider">Complete Semestral Grade Record (Spreadsheet View)</h3>
            </div>
            <button
              onClick={() => setIsSpreadsheetFullScreen(!isSpreadsheetFullScreen)}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sage-50 hover:border-sage-300 text-slate-500 hover:text-sage-700 transition-all"
              title={isSpreadsheetFullScreen ? 'Exit fullscreen' : 'View fullscreen'}
            >
              {isSpreadsheetFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
          
          <div className={cn("table-container overflow-auto", isSpreadsheetFullScreen ? "flex-1" : "max-h-[300px]")}>
            <table className="w-full min-w-[1500px] text-left border-collapse text-center text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold text-xs">
                  {/* Prelim Period */}
                  <th colSpan={12} className="px-4 py-3 border-r border-slate-200 bg-sky-50 text-sky-900 text-center font-bold tracking-wide text-xs">
                    PRELIMINARY PERIOD
                  </th>
                  
                  {/* Midterm Period */}
                  <th colSpan={12} className="px-4 py-3 border-r border-slate-200 bg-indigo-50 text-indigo-900 text-center font-bold tracking-wide text-xs">
                    MIDTERM PERIOD
                  </th>
                  
                  {/* Midterm Rating */}
                  <th className="px-4 py-3 border-r border-slate-200 bg-indigo-150 text-indigo-950 font-bold uppercase w-20 text-xs">
                    MR
                  </th>
                  
                  {/* Semi-Final Period */}
                  <th colSpan={12} className="px-4 py-3 border-r border-slate-200 bg-amber-50 text-amber-900 text-center font-bold tracking-wide text-xs">
                    SEMI-FINAL PERIOD
                  </th>
                  
                  {/* Final Period */}
                  <th colSpan={12} className="px-4 py-3 border-r border-slate-200 bg-orange-50 text-orange-950 text-center font-bold tracking-wide text-xs">
                    FINAL PERIOD
                  </th>
                  
                  {/* Tentative Final Rating */}
                  <th className="px-4 py-3 border-r border-slate-200 bg-orange-150 text-orange-950 font-bold uppercase w-20 text-xs">
                    TFR
                  </th>
                  
                  {/* Semestral Grade */}
                  <th className="px-4 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-900 font-extrabold uppercase w-20 text-xs">
                    SG
                  </th>
                  
                  {/* Equivalent (GWA) */}
                  <th className="px-4 py-3 border-r border-slate-200 bg-emerald-200/60 text-emerald-950 font-extrabold uppercase w-20 text-xs">
                    GWA
                  </th>
                  
                  {/* Remarks */}
                  <th className="px-4 py-3 bg-emerald-200/60 text-emerald-950 font-extrabold uppercase w-24 text-xs">
                    Remarks
                  </th>
                </tr>
                
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-550 font-bold text-[10px]">
                  {/* Prelim sub-headers */}
                  {['1', '2', '3', '4', '5', '6'].map(a => <th key={`p-${a}`} className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Act {a}</th>)}
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Total</th>
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">CS %</th>
                  <th className="px-2 py-2 border-r border-slate-100 w-16 font-mono font-bold">Char</th>
                  <th className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Exam</th>
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Exam %</th>
                  <th className="px-3 py-2 border-r border-slate-200 bg-sky-100/40 font-extrabold w-16 text-slate-800 font-mono">Rating</th>

                  {/* Midterm sub-headers */}
                  {['1', '2', '3', '4', '5', '6'].map(a => <th key={`m-${a}`} className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Act {a}</th>)}
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Total</th>
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">CS %</th>
                  <th className="px-2 py-2 border-r border-slate-100 w-16 font-mono font-bold">Char</th>
                  <th className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Exam</th>
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Exam %</th>
                  <th className="px-3 py-2 border-r border-slate-200 bg-indigo-100/40 font-extrabold w-16 text-slate-800 font-mono">Rating</th>

                  {/* MR dummy th */}
                  <th className="border-r border-slate-200 bg-indigo-50/30"></th>

                  {/* Semi-Final sub-headers */}
                  {['1', '2', '3', '4', '5', '6'].map(a => <th key={`sf-${a}`} className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Act {a}</th>)}
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Total</th>
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">CS %</th>
                  <th className="px-2 py-2 border-r border-slate-100 w-16 font-mono font-bold">Char</th>
                  <th className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Exam</th>
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Exam %</th>
                  <th className="px-3 py-2 border-r border-slate-200 bg-amber-100/40 font-extrabold w-16 text-slate-800 font-mono">Rating</th>

                  {/* Final sub-headers */}
                  {['1', '2', '3', '4', '5', '6'].map(a => <th key={`f-${a}`} className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Act {a}</th>)}
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Total</th>
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">CS %</th>
                  <th className="px-2 py-2 border-r border-slate-100 w-16 font-mono font-bold">Char</th>
                  <th className="px-2 py-2 border-r border-slate-100 w-12 font-mono font-bold">Exam</th>
                  <th className="px-2 py-2 border-r border-slate-100 bg-slate-100/60 w-14 font-mono font-bold">Exam %</th>
                  <th className="px-3 py-2 border-r border-slate-200 bg-orange-100/40 font-extrabold w-16 text-slate-800 font-mono">Rating</th>

                  {/* TFR, SG, GWA, Remarks dummy ths */}
                  <th className="border-r border-slate-200 bg-orange-50/30"></th>
                  <th className="border-r border-slate-200 bg-emerald-50/30"></th>
                  <th className="border-r border-slate-200 bg-emerald-100/30"></th>
                  <th className="bg-emerald-100/30"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-slate-800 font-semibold font-mono text-xs">
                <tr className="hover:bg-slate-50/80 transition-colors">
                  {/* Prelim scores */}
                  <td className="py-4 border-r border-slate-100">18</td>
                  <td className="py-4 border-r border-slate-100">19</td>
                  <td className="py-4 border-r border-slate-100">17</td>
                  <td className="py-4 border-r border-slate-100">20</td>
                  <td className="py-4 border-r border-slate-100">18</td>
                  <td className="py-4 border-r border-slate-100">9</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 font-bold text-slate-900">101</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">45.9</td>
                  <td className="py-4 border-r border-slate-100">100</td>
                  <td className="py-4 border-r border-slate-100">35</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">35.0</td>
                  <td className="py-4 border-r border-slate-200 bg-sky-100/40 font-bold text-sky-900 text-sm">{prelimRating}</td>

                  {/* Midterm scores */}
                  <td className="py-4 border-r border-slate-100">15</td>
                  <td className="py-4 border-r border-slate-100">14</td>
                  <td className="py-4 border-r border-slate-100">17</td>
                  <td className="py-4 border-r border-slate-100">20</td>
                  <td className="py-4 border-r border-slate-100">18</td>
                  <td className="py-4 border-r border-slate-100">9</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 font-bold text-slate-900">93</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">42.3</td>
                  <td className="py-4 border-r border-slate-100">100</td>
                  <td className="py-4 border-r border-slate-100">35</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">35.0</td>
                  <td className="py-4 border-r border-slate-200 bg-indigo-100/40 font-bold text-indigo-900 text-sm">{midtermRating}</td>

                  {/* MR */}
                  <td className="py-4 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-extrabold text-sm">{mr}</td>

                  {/* Semi-Final scores */}
                  <td className="py-4 border-r border-slate-100">18</td>
                  <td className="py-4 border-r border-slate-100">19</td>
                  <td className="py-4 border-r border-slate-100">17</td>
                  <td className="py-4 border-r border-slate-100">20</td>
                  <td className="py-4 border-r border-slate-100">18</td>
                  <td className="py-4 border-r border-slate-100">9</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 font-bold text-slate-900">101</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">45.9</td>
                  <td className="py-4 border-r border-slate-100">100</td>
                  <td className="py-4 border-r border-slate-100">35</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">35.0</td>
                  <td className="py-4 border-r border-slate-200 bg-amber-100/40 font-bold text-amber-900 text-sm">{semiFinalRating}</td>

                  {/* Final scores */}
                  <td className="py-4 border-r border-slate-100">18</td>
                  <td className="py-4 border-r border-slate-100">19</td>
                  <td className="py-4 border-r border-slate-100">17</td>
                  <td className="py-4 border-r border-slate-100">20</td>
                  <td className="py-4 border-r border-slate-100">18</td>
                  <td className="py-4 border-r border-slate-100">9</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 font-bold text-slate-900">101</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">45.9</td>
                  <td className="py-4 border-r border-slate-100">100</td>
                  <td className="py-4 border-r border-slate-100">35</td>
                  <td className="py-4 border-r border-slate-100 bg-slate-100/30 text-slate-600">35.0</td>
                  <td className="py-4 border-r border-slate-200 bg-orange-100/40 font-bold text-orange-950 text-sm">{finalRating}</td>

                  {/* TFR */}
                  <td className="py-4 border-r border-slate-200 bg-orange-100 text-orange-950 font-extrabold text-sm">{tfr}</td>

                  {/* SG */}
                  <td className="py-4 border-r border-slate-200 bg-emerald-50 text-emerald-850 font-extrabold text-sm">{sg}</td>

                  {/* GWA */}
                  <td className="py-4 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold text-sm">
                    <span className="px-3 py-1 rounded bg-white shadow-sm border border-emerald-250 text-emerald-700">
                      {finalGwa}
                    </span>
                  </td>

                  {/* Remarks */}
                  <td className="py-4 bg-emerald-150 font-bold text-emerald-900 font-sans text-sm">{remarks}</td>
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
