import React, { useState, useEffect } from 'react';
import StudentRow from '../../components/StudentRow';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, FileSpreadsheet, ChevronDown, Check, Maximize2, Minimize2 } from 'lucide-react';

export default function ScoreInput() {
  const [selectedClass, setSelectedClass] = useState('BSITCPR323');
  const [showBulkSavedMessage, setShowBulkSavedMessage] = useState(false);
  const [viewMode, setViewMode] = useState('All');
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Maximum items configuration for activities and exams per period
  const [maxItems, setMaxItems] = useState({
    Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Final: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 }
  });

  const [editingColumn, setEditingColumn] = useState(null); // { period, key, label, value }

  const handleConfirmMaxItem = (value) => {
    if (editingColumn) {
      updateMaxItem(editingColumn.period, editingColumn.key, value);
      setEditingColumn(null);
    }
  };

  const updateMaxItem = (period, key, value) => {
    setMaxItems(prev => ({
      ...prev,
      [period]: {
        ...prev[period],
        [key]: Math.max(1, value)
      }
    }));
  };

  // Escape key closes fullscreen
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setIsFullScreen(false); };
    if (isFullScreen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullScreen]);

  // Class record data mapping
  const classesList = [
    { code: 'BSITCPR323', label: 'BSITCPR323 - IT3A (Capstone and Research 1)' },
    { code: 'IT101', label: 'IT101 - BSIT-1A (Intro to Computing)' },
    { code: 'IT201', label: 'IT201 - BSIT-2B (Data Structures)' },
    { code: 'CS301', label: 'CS301 - BSCS-3A (Artificial Intelligence)' }
  ];

  const periodsList = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

  // Helper to generate mock period scores for standard students
  const generateMockStudentPeriods = (id, baseActTotal, baseChar, baseExam) => {
    const distributeCS = (total) => {
      let remaining = total;
      const act6 = Math.min(10, Math.round(total * (10 / 110)));
      remaining -= act6;
      const baseAct = Math.floor(remaining / 5);
      const acts = [baseAct, baseAct, baseAct, baseAct, baseAct];
      let diff = remaining - (baseAct * 5);
      for (let i = 0; i < diff; i++) {
        acts[i] += 1;
      }
      return {
        act1: acts[0],
        act2: acts[1],
        act3: acts[2],
        act4: acts[3],
        act5: acts[4],
        act6: act6
      };
    };

    const periods = {};
    periodsList.forEach((period, idx) => {
      const actTotal = Math.max(50, Math.min(110, baseActTotal - (idx % 2) * 5));
      const cs = distributeCS(actTotal);
      periods[period] = {
        ...cs,
        char: Math.max(50, Math.min(100, baseChar - (idx % 2) * 5)),
        exam: Math.max(0, Math.min(40, baseExam - (idx % 2) * 2))
      };
    });
    return periods;
  };

  // Student score mock datasets depending on active class
  const classStudents = {
    BSITCPR323: [
      {
        id: 11,
        name: 'Gabriel, John Christian C.',
        periods: {
          Prelim: { act1: 18, act2: 19, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 35 },
          Midterm: { act1: 15, act2: 14, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 35 },
          'Semi-Final': { act1: 18, act2: 19, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 35 },
          Final: { act1: 18, act2: 19, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 35 }
        }
      },
      {
        id: 12,
        name: 'Santiago, Mark Angelo',
        periods: {
          Prelim: { act1: 20, act2: 18, act3: 20, act4: 17, act5: 15, act6: 5, char: 80, exam: 40 },
          Midterm: { act1: 19, act2: 17, act3: 18, act4: 19, act5: 17, act6: 10, char: 90, exam: 37 },
          'Semi-Final': { act1: 20, act2: 18, act3: 20, act4: 17, act5: 15, act6: 5, char: 85, exam: 30 },
          Final: { act1: 15, act2: 14, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 25 }
        }
      },
      {
        id: 13,
        name: 'Celestino, Carlo',
        periods: {
          Prelim: { act1: 19, act2: 17, act3: 18, act4: 19, act5: 17, act6: 10, char: 95, exam: 30 },
          Midterm: { act1: 20, act2: 18, act3: 20, act4: 17, act5: 15, act6: 5, char: 85, exam: 40 },
          'Semi-Final': { act1: 15, act2: 14, act3: 17, act4: 20, act5: 18, act6: 9, char: 95, exam: 33 },
          Final: { act1: 18, act2: 19, act3: 17, act4: 20, act5: 18, act6: 9, char: 100, exam: 29 }
        }
      },
      {
        id: 14,
        name: 'Reyes, Mark T.',
        periods: {
          Prelim: { act1: 12, act2: 12, act3: 12, act4: 12, act5: 12, act6: 10, char: 60, exam: 30 },
          Midterm: { act1: 11, act2: 11, act3: 11, act4: 11, act5: 11, act6: 10, char: 70, exam: 29 },
          'Semi-Final': { act1: 10, act2: 10, act3: 10, act4: 10, act5: 10, act6: 10, char: 60, exam: 27 },
          Final: { act1: 9, act2: 9, act3: 9, act4: 9, act5: 10, act6: 9, char: 60, exam: 25 }
        }
      },
      {
        id: 15,
        name: 'Villanueva, Anna C.',
        periods: {
          Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 38 },
          Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 38 },
          'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 38 },
          Final: { act1: 19, act2: 19, act3: 19, act4: 19, act5: 20, act6: 9, char: 100, exam: 38 }
        }
      }
    ],
    IT101: [
      { id: 1, name: 'Dela Cruz, Juan M.', periods: generateMockStudentPeriods(1, 95, 88, 36) },
      { id: 2, name: 'Santos, Maria A.', periods: generateMockStudentPeriods(2, 75, 68, 28) },
      { id: 3, name: 'Reyes, Mark T.', periods: generateMockStudentPeriods(3, 82, 55, 26) },
      { id: 4, name: 'Villanueva, Anna C.', periods: generateMockStudentPeriods(4, 98, 92, 38) },
    ],
    IT201: [
      { id: 5, name: 'Bautista, Kevin L.', periods: generateMockStudentPeriods(5, 88, 84, 32) },
      { id: 6, name: 'Gomez, Elena R.', periods: generateMockStudentPeriods(6, 70, 65, 25) },
      { id: 7, name: 'Pascual, Jaime F.', periods: generateMockStudentPeriods(7, 92, 90, 36) },
    ],
    CS301: [
      { id: 8, name: 'Aquino, Teresa S.', periods: generateMockStudentPeriods(8, 95, 92, 38) },
      { id: 9, name: 'Lim, Dexter J.', periods: generateMockStudentPeriods(9, 60, 58, 22) },
      { id: 10, name: 'Cruz, Patricia N.', periods: generateMockStudentPeriods(10, 85, 80, 33) },
    ]
  };

  const activeStudents = classStudents[selectedClass] || classStudents.IT101;

  const handleBulkSave = () => {
    setShowBulkSavedMessage(true);
    setTimeout(() => setShowBulkSavedMessage(false), 2500);
  };

  return (
    <>
      {/* Header */}
      <PageHeader title="Log Class Scores" breadcrumb="Faculty Portal">
        <button className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Export CSV Template
        </button>
        <button 
          onClick={handleBulkSave}
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-2 shadow-sm"
        >
            <Save className="h-4 w-4" /> Save All Drafts
        </button>
      </PageHeader>

      {/* Content */}
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
          
          {/* selectors bar */}
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            
            {/* Class Record Selector */}
            <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Record</label>
              <div className="relative">
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700"
                >
                  {classesList.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

            {/* View Mode Selector */}
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">View Period</label>
              <div className="relative">
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value)}
                  className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700"
                >
                  <option value="All">All Terms (Side-by-Side)</option>
                  <option value="Prelim">Preliminary Grade</option>
                  <option value="Midterm">Midterm Grade</option>
                  <option value="Semi-Final">Semi-Final Grade</option>
                  <option value="Final">Final Grade</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

            {/* Stats Overview */}
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Enrolled</p>
                <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">{activeStudents.length} Students</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Spreadsheet Mode</p>
                <p className="text-xs font-mono font-bold text-emerald-700 mt-0.5">
                  {viewMode === 'All' ? 'All 4 Terms (Side-by-Side)' : `${viewMode} View`}
                </p>
              </div>
            </div>

          </div>

          {/* Bulk Saved Alert */}
          {showBulkSavedMessage && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2 text-emerald-800 text-xs font-semibold animate-in fade-in duration-200">
              <Check className="h-4 w-4" /> All student score updates saved locally to draft record.
            </div>
          )}

          {/* Data Table Card */}
          {isFullScreen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFullScreen(false)} />}
          <div className={isFullScreen ? "fixed inset-4 z-50 rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : "rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col"}>
              {/* Fullscreen header bar */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-sage-600" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {isFullScreen ? classesList.find(c => c.code === selectedClass)?.label : 'Class Record'}
                  </span>
                  {isFullScreen && (
                    <span className="text-[10px] font-medium text-slate-400 ml-2">
                      {viewMode === 'All' ? 'All Terms' : `${viewMode} View`} · {activeStudents.length} students
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sage-50 hover:border-sage-300 text-slate-500 hover:text-sage-700 transition-all"
                  title={isFullScreen ? 'Exit fullscreen' : 'View fullscreen'}
                >
                  {isFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className={isFullScreen ? "table-container overflow-auto flex-1" : "table-container overflow-x-auto"}>
                  <table className={`w-full min-w-max text-left border-collapse ${isFullScreen ? 'fullscreen-table' : ''}`}>
                      <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold text-center">
                              <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-10">
                                No.
                              </th>
                              <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-24">
                                Student No.
                              </th>
                              <th rowSpan={2} className="px-4 py-3 text-left font-bold uppercase tracking-wider sticky left-0 bg-slate-50 border-r border-slate-200 z-20 w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                                Student Name
                              </th>
                              
                              {/* Prelim Period */}
                              {(viewMode === 'All' || viewMode === 'Prelim') && (
                                <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-sky-50 text-sky-850">
                                  PRELIMINARY GRADE
                                </th>
                              )}
                              
                              {/* Midterm Period */}
                              {(viewMode === 'All' || viewMode === 'Midterm') && (
                                <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-indigo-50 text-indigo-850">
                                  MIDTERM GRADE
                                </th>
                              )}
                              
                              {/* Midterm Rating */}
                              {(viewMode === 'All' || viewMode === 'Midterm') && (
                                <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-bold uppercase tracking-wider w-16">
                                  Midterm Rating (MR)
                                </th>
                              )}
                              
                              {/* Semi-Final Period */}
                              {(viewMode === 'All' || viewMode === 'Semi-Final') && (
                                <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-amber-50 text-amber-850">
                                  SEMI-FINAL GRADE
                                </th>
                              )}
                              
                              {/* Final Period */}
                              {(viewMode === 'All' || viewMode === 'Final') && (
                                <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-orange-50 text-orange-850">
                                  FINAL GRADE
                                </th>
                              )}
                              
                              {/* Tentative Final Rating */}
                              {(viewMode === 'All' || viewMode === 'Final') && (
                                <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-orange-100 text-orange-950 font-bold uppercase tracking-wider w-16">
                                  Tentative Final Rating (TFR)
                                </th>
                              )}
                              
                              {/* Semestral Grade */}
                              {(viewMode === 'All' || viewMode === 'Final') && (
                                <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-extrabold uppercase tracking-wider w-16">
                                  Semestral Grade (SG)
                                </th>
                              )}
                              
                              {/* Equivalent (GWA) */}
                              {(viewMode === 'All' || viewMode === 'Final') && (
                                <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-16">
                                  Equivalent GWA
                                </th>
                              )}
                              
                              {/* Remarks */}
                              {(viewMode === 'All' || viewMode === 'Final') && (
                                <th rowSpan={2} className="px-4 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-20">
                                  Remarks
                                </th>
                              )}
                              
                              {/* Action */}
                              <th rowSpan={2} className="px-4 py-3 w-20">
                                Action
                              </th>
                          </tr>
                                                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[9px] font-bold text-center">
                             {/* text-slate-600 text-[9px] font-bold text-center */}
                             {/* Prelim sub-headers */}
                             {(viewMode === 'All' || viewMode === 'Prelim') && (
                               <>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                 <th className="px-2 py-1.5 border-r border-slate-200 bg-sky-100/30 font-bold w-14 text-slate-800">Rating</th>
                               </>
                             )}

                             {/* Midterm sub-headers */}
                             {(viewMode === 'All' || viewMode === 'Midterm') && (
                               <>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                 <th className="px-2 py-1.5 border-r border-slate-200 bg-indigo-100/30 font-bold w-14 text-slate-800">Rating</th>
                               </>
                             )}

                             {/* Semi-Final sub-headers */}
                             {(viewMode === 'All' || viewMode === 'Semi-Final') && (
                               <>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                 <th className="px-2 py-1.5 border-r border-slate-200 bg-amber-100/30 font-bold w-14 text-slate-800">Rating</th>
                               </>
                             )}

                             {/* Final sub-headers */}
                             {(viewMode === 'All' || viewMode === 'Final') && (
                               <>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                                 <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                                 <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                 <th className="px-2 py-1.5 border-r border-slate-200 bg-orange-100/30 font-bold w-14 text-slate-800">Rating</th>
                               </>
                             )}
                           </tr>
                      </thead>                      <tbody className="divide-y divide-slate-100">
                          {/* 📐 Max Column Items Configuration Row */}
                          <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-750 font-semibold h-11 select-none">
                            <td className="px-2 py-3 border-r border-slate-200 bg-slate-50/80"></td>
                            <td className="px-2 py-3 border-r border-slate-200 bg-slate-50/80"></td>
                            <td className="px-4 py-3 text-left font-bold text-slate-800 sticky left-0 bg-slate-50 border-r border-slate-200 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                              <div className="flex items-center gap-1 text-sage-800 font-bold uppercase tracking-wider text-[10px]">
                                📐 Max Column Items
                              </div>
                            </td>

                            {/* Prelim Period */}
                            {(viewMode === 'All' || viewMode === 'Prelim') && (
                              <>
                                <td onClick={() => setEditingColumn({ period: 'Prelim', key: 'act1', label: 'Quiz / Activity 1', value: maxItems.Prelim.act1 })} className="p-1 border-r border-slate-100 w-12 bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Prelim.act1}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Prelim', key: 'act2', label: 'Quiz / Activity 2', value: maxItems.Prelim.act2 })} className="p-1 border-r border-slate-100 w-12 bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Prelim.act2}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Prelim', key: 'act3', label: 'Quiz / Activity 3', value: maxItems.Prelim.act3 })} className="p-1 border-r border-slate-100 w-12 bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Prelim.act3}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Prelim', key: 'act4', label: 'Quiz / Activity 4', value: maxItems.Prelim.act4 })} className="p-1 border-r border-slate-100 w-12 bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Prelim.act4}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Prelim', key: 'act5', label: 'Quiz / Activity 5', value: maxItems.Prelim.act5 })} className="p-1 border-r border-slate-100 w-12 bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Prelim.act5}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Prelim', key: 'act6', label: 'Quiz / Activity 6', value: maxItems.Prelim.act6 })} className="p-1 border-r border-slate-100 w-12 bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Prelim.act6}
                                </td>
                                <td className="px-1.5 py-3 font-mono font-bold bg-slate-100/80 border-r border-slate-200 text-slate-700 w-12 text-center text-[10px]">
                                  {maxItems.Prelim.act1 + maxItems.Prelim.act2 + maxItems.Prelim.act3 + maxItems.Prelim.act4 + maxItems.Prelim.act5 + maxItems.Prelim.act6}
                                </td>
                                <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">50%</td>
                                <td onClick={() => setEditingColumn({ period: 'Prelim', key: 'char', label: 'Character Rating', value: maxItems.Prelim.char })} className="p-1 border-r border-slate-100 w-16 bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Prelim.char}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Prelim', key: 'exam', label: 'Exam Max Score', value: maxItems.Prelim.exam })} className="p-1 border-r border-slate-100 w-12 bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Prelim.exam}
                                </td>
                                <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">40%</td>
                                <td className="px-2 py-3 font-mono font-bold bg-sky-100/80 border-r border-slate-200 text-sky-900 w-14 text-center text-[10px]">100%</td>
                              </>
                            )}

                            {/* Midterm Period */}
                            {(viewMode === 'All' || viewMode === 'Midterm') && (
                              <>
                                <td onClick={() => setEditingColumn({ period: 'Midterm', key: 'act1', label: 'Quiz / Activity 1', value: maxItems.Midterm.act1 })} className="p-1 border-r border-slate-100 w-12 bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Midterm.act1}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Midterm', key: 'act2', label: 'Quiz / Activity 2', value: maxItems.Midterm.act2 })} className="p-1 border-r border-slate-100 w-12 bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Midterm.act2}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Midterm', key: 'act3', label: 'Quiz / Activity 3', value: maxItems.Midterm.act3 })} className="p-1 border-r border-slate-100 w-12 bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Midterm.act3}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Midterm', key: 'act4', label: 'Quiz / Activity 4', value: maxItems.Midterm.act4 })} className="p-1 border-r border-slate-100 w-12 bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Midterm.act4}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Midterm', key: 'act5', label: 'Quiz / Activity 5', value: maxItems.Midterm.act5 })} className="p-1 border-r border-slate-100 w-12 bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Midterm.act5}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Midterm', key: 'act6', label: 'Quiz / Activity 6', value: maxItems.Midterm.act6 })} className="p-1 border-r border-slate-100 w-12 bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Midterm.act6}
                                </td>
                                <td className="px-1.5 py-3 font-mono font-bold bg-slate-100/80 border-r border-slate-200 text-slate-700 w-12 text-center text-[10px]">
                                  {maxItems.Midterm.act1 + maxItems.Midterm.act2 + maxItems.Midterm.act3 + maxItems.Midterm.act4 + maxItems.Midterm.act5 + maxItems.Midterm.act6}
                                </td>
                                <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">50%</td>
                                <td onClick={() => setEditingColumn({ period: 'Midterm', key: 'char', label: 'Character Rating', value: maxItems.Midterm.char })} className="p-1 border-r border-slate-100 w-16 bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Midterm.char}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Midterm', key: 'exam', label: 'Exam Max Score', value: maxItems.Midterm.exam })} className="p-1 border-r border-slate-100 w-12 bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Midterm.exam}
                                </td>
                                <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">40%</td>
                                <td className="px-2 py-3 font-mono font-bold bg-indigo-100/80 border-r border-slate-200 text-indigo-900 w-14 text-center text-[10px]">100%</td>
                              </>
                            )}

                            {/* Midterm Rating (MR) */}
                            {(viewMode === 'All' || viewMode === 'Midterm') && (
                              <td className="px-3 py-3 border-r border-slate-200 bg-indigo-100/40 text-center"></td>
                            )}

                            {/* Semi-Final Period */}
                            {(viewMode === 'All' || viewMode === 'Semi-Final') && (
                              <>
                                <td onClick={() => setEditingColumn({ period: 'Semi-Final', key: 'act1', label: 'Quiz / Activity 1', value: maxItems['Semi-Final'].act1 })} className="p-1 border-r border-slate-100 w-12 bg-amber-50/30 hover:bg-amber-105/55 hover:text-amber-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems['Semi-Final'].act1}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Semi-Final', key: 'act2', label: 'Quiz / Activity 2', value: maxItems['Semi-Final'].act2 })} className="p-1 border-r border-slate-100 w-12 bg-amber-50/30 hover:bg-amber-105/55 hover:text-amber-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems['Semi-Final'].act2}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Semi-Final', key: 'act3', label: 'Quiz / Activity 3', value: maxItems['Semi-Final'].act3 })} className="p-1 border-r border-slate-100 w-12 bg-amber-50/30 hover:bg-amber-105/55 hover:text-amber-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems['Semi-Final'].act3}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Semi-Final', key: 'act4', label: 'Quiz / Activity 4', value: maxItems['Semi-Final'].act4 })} className="p-1 border-r border-slate-100 w-12 bg-amber-50/30 hover:bg-amber-105/55 hover:text-amber-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems['Semi-Final'].act4}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Semi-Final', key: 'act5', label: 'Quiz / Activity 5', value: maxItems['Semi-Final'].act5 })} className="p-1 border-r border-slate-100 w-12 bg-amber-50/30 hover:bg-amber-105/55 hover:text-amber-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems['Semi-Final'].act5}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Semi-Final', key: 'act6', label: 'Quiz / Activity 6', value: maxItems['Semi-Final'].act6 })} className="p-1 border-r border-slate-100 w-12 bg-amber-50/30 hover:bg-amber-105/55 hover:text-amber-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems['Semi-Final'].act6}
                                </td>
                                <td className="px-1.5 py-3 font-mono font-bold bg-slate-100/80 border-r border-slate-200 text-slate-700 w-12 text-center text-[10px]">
                                  {maxItems['Semi-Final'].act1 + maxItems['Semi-Final'].act2 + maxItems['Semi-Final'].act3 + maxItems['Semi-Final'].act4 + maxItems['Semi-Final'].act5 + maxItems['Semi-Final'].act6}
                                </td>
                                <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">50%</td>
                                <td onClick={() => setEditingColumn({ period: 'Semi-Final', key: 'char', label: 'Character Rating', value: maxItems['Semi-Final'].char })} className="p-1 border-r border-slate-100 w-16 bg-amber-50/30 hover:bg-amber-105/55 hover:text-amber-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems['Semi-Final'].char}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Semi-Final', key: 'exam', label: 'Exam Max Score', value: maxItems['Semi-Final'].exam })} className="p-1 border-r border-slate-100 w-12 bg-amber-50/30 hover:bg-amber-105/55 hover:text-amber-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems['Semi-Final'].exam}
                                </td>
                                <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">40%</td>
                                <td className="px-2 py-3 font-mono font-bold bg-amber-100/85 border-r border-slate-200 text-amber-900 w-14 text-center text-[10px]">100%</td>
                              </>
                            )}

                            {/* Final Period */}
                            {(viewMode === 'All' || viewMode === 'Final') && (
                              <>
                                <td onClick={() => setEditingColumn({ period: 'Final', key: 'act1', label: 'Quiz / Activity 1', value: maxItems.Final.act1 })} className="p-1 border-r border-slate-100 w-12 bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Final.act1}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Final', key: 'act2', label: 'Quiz / Activity 2', value: maxItems.Final.act2 })} className="p-1 border-r border-slate-100 w-12 bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Final.act2}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Final', key: 'act3', label: 'Quiz / Activity 3', value: maxItems.Final.act3 })} className="p-1 border-r border-slate-100 w-12 bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Final.act3}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Final', key: 'act4', label: 'Quiz / Activity 4', value: maxItems.Final.act4 })} className="p-1 border-r border-slate-100 w-12 bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Final.act4}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Final', key: 'act5', label: 'Quiz / Activity 5', value: maxItems.Final.act5 })} className="p-1 border-r border-slate-100 w-12 bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Final.act5}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Final', key: 'act6', label: 'Quiz / Activity 6', value: maxItems.Final.act6 })} className="p-1 border-r border-slate-100 w-12 bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Final.act6}
                                </td>
                                <td className="px-1.5 py-3 font-mono font-bold bg-slate-100/80 border-r border-slate-200 text-slate-700 w-12 text-center text-[10px]">
                                  {maxItems.Final.act1 + maxItems.Final.act2 + maxItems.Final.act3 + maxItems.Final.act4 + maxItems.Final.act5 + maxItems.Final.act6}
                                </td>
                                <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">50%</td>
                                <td onClick={() => setEditingColumn({ period: 'Final', key: 'char', label: 'Character Rating', value: maxItems.Final.char })} className="p-1 border-r border-slate-100 w-16 bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Final.char}
                                </td>
                                <td onClick={() => setEditingColumn({ period: 'Final', key: 'exam', label: 'Exam Max Score', value: maxItems.Final.exam })} className="p-1 border-r border-slate-100 w-12 bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-center font-mono text-xs font-bold text-slate-800 transition-colors">
                                  {maxItems.Final.exam}
                                </td>
                                <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">40%</td>
                                <td className="px-2 py-3 font-mono font-bold bg-orange-100/80 border-r border-slate-200 text-orange-900 w-14 text-center text-[10px]">100%</td>
                              </>
                            )}

                            {/* Final calculations placeholders */}
                            {(viewMode === 'All' || viewMode === 'Final') && (
                              <>
                                <td className="px-3 py-3 border-r border-slate-200 bg-orange-100/40 text-center"></td>
                                <td className="px-3 py-3 border-r border-slate-200 bg-emerald-50/40 text-center"></td>
                                <td className="px-3 py-3 border-r border-slate-200 bg-emerald-100/40 text-center"></td>
                                <td className="px-4 py-3 border-r border-slate-200 bg-emerald-100/40 text-center"></td>
                              </>
                            )}

                            {/* Action cell placeholder */}
                            <td className="px-4 py-3 bg-slate-50/80"></td>
                          </tr>

                          {activeStudents.map((student, idx) => (
                            <StudentRow 
                              key={student.id} 
                              student={student} 
                              rowNo={idx + 1}
                              initialPeriods={student.periods}
                              viewMode={viewMode}
                              maxItems={maxItems}
                            />
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
          
      </div>

      {/* 📐 Accidental Edit Prevention Confirmation Modal */}
      {editingColumn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-250 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>📐 Update Column Maximum Score</span>
              </h3>
              <button 
                onClick={() => setEditingColumn(null)}
                className="text-slate-400 hover:text-slate-650 transition-colors text-lg font-semibold"
              >
                &times;
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grading Term & Column</p>
                <p className="text-sm font-bold text-slate-800 mt-1">
                  {editingColumn.period} Period — {editingColumn.label}
                </p>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maximum Points</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    autoFocus
                    defaultValue={editingColumn.value}
                    id="max-items-modal-input"
                    className="block w-28 border border-slate-200 rounded-lg px-3.5 py-2 text-sm font-mono text-center font-bold text-slate-800 focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-all outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = Number(e.currentTarget.value);
                        if (val > 0) handleConfirmMaxItem(val);
                      }
                    }}
                  />
                  <span className="text-xs text-slate-500 font-semibold font-mono">pts</span>
                </div>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-[11px] text-amber-805 leading-relaxed">
                <strong>⚠️ Warning:</strong> Confirming this change will instantly update the maximum score for this column and immediately recalculate the grades and ratings of all enrolled students.
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingColumn(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('max-items-modal-input');
                  if (input) {
                    const val = Number(input.value);
                    if (val > 0) handleConfirmMaxItem(val);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

