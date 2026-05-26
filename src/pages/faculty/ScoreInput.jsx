import React, { useState } from 'react';
import StudentRow from '../../components/StudentRow';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, FileSpreadsheet, ChevronDown, Check } from 'lucide-react';

export default function ScoreInput() {
  const [selectedClass, setSelectedClass] = useState('IT101');
  const [selectedPeriod, setSelectedPeriod] = useState('Midterm');
  const [showBulkSavedMessage, setShowBulkSavedMessage] = useState(false);

  // Class record data mapping
  const classesList = [
    { code: 'IT101', label: 'IT101 - BSIT-1A (Intro to Computing)' },
    { code: 'IT201', label: 'IT201 - BSIT-2B (Data Structures)' },
    { code: 'CS301', label: 'CS301 - BSCS-3A (Artificial Intelligence)' }
  ];

  const periodsList = ['Prelim', 'Midterm', 'Final'];

  // Student score mock datasets depending on active class
  const classStudents = {
    IT101: [
      { id: 1, name: 'Dela Cruz, Juan M.', activity: 95, quiz: 88, exam: 90 },
      { id: 2, name: 'Santos, Maria A.', activity: 75, quiz: 68, exam: 70 },
      { id: 3, name: 'Reyes, Mark T.', activity: 82, quiz: 55, exam: 65 },
      { id: 4, name: 'Villanueva, Anna C.', activity: 98, quiz: 92, exam: 95 },
    ],
    IT201: [
      { id: 5, name: 'Bautista, Kevin L.', activity: 88, quiz: 84, exam: 80 },
      { id: 6, name: 'Gomez, Elena R.', activity: 70, quiz: 65, exam: 62 },
      { id: 7, name: 'Pascual, Jaime F.', activity: 92, quiz: 90, exam: 89 },
    ],
    CS301: [
      { id: 8, name: 'Aquino, Teresa S.', activity: 95, quiz: 92, exam: 94 },
      { id: 9, name: 'Lim, Dexter J.', activity: 60, quiz: 58, exam: 55 },
      { id: 10, name: 'Cruz, Patricia N.', activity: 85, quiz: 80, exam: 82 },
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

            {/* Grading Period Selector */}
            <div className="flex flex-col gap-1 w-40">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grading Period</label>
              <div className="relative">
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700"
                >
                  {periodsList.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
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
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Weights (CCS Standard)</p>
                <p className="text-xs font-mono font-bold text-emerald-700 mt-0.5">20% / 30% / 50%</p>
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
          <div className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col">
              <div className="table-container overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                      <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200 z-10 w-64">Student Name</th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[120px]">
                                  Activity <br/><span className="text-slate-400 font-mono font-normal">20%</span>
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[120px]">
                                  Quiz <br/><span className="text-slate-400 font-mono font-normal">30%</span>
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[120px]">
                                  Exam <br/><span className="text-slate-400 font-mono font-normal">50%</span>
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-l border-slate-200 text-right">
                                  Running Grade <br/><span className="text-slate-400 font-normal capitalize">Real-time</span>
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-center w-24">
                                  Status
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-center w-20">
                                  Action
                              </th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {activeStudents.map(student => (
                            <StudentRow key={student.id} student={student} />
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
          
      </div>
    </>
  );
}

