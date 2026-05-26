import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  ChevronRight, 
  Lock, 
  Search, 
  Download, 
  FileSpreadsheet, 
  AlertTriangle 
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function PostedGradesView() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  // Final locked grades mock data
  const students = [
    { id: 1, name: 'Dela Cruz, Juan M.', activity: 95, quiz: 88, exam: 90, computed: 90.4, grade: '1.25', status: 'Passed' },
    { id: 2, name: 'Santos, Maria A.', activity: 75, quiz: 68, exam: 70, computed: 70.4, grade: '2.75', status: 'Passed' },
    { id: 3, name: 'Reyes, Mark T.', activity: 82, quiz: 45, exam: 65, computed: 59.9, grade: '3.00', status: 'Passed' },
    { id: 4, name: 'Villanueva, Anna C.', activity: 98, quiz: 92, exam: 95, computed: 94.7, grade: '1.00', status: 'Passed' },
    { id: 5, name: 'Bautista, Kevin L.', activity: 85, quiz: 80, exam: 75, computed: 78.5, grade: '2.25', status: 'Passed' },
    { id: 6, name: 'Gomez, Elena R.', activity: 60, quiz: 50, exam: 40, computed: 47.0, grade: '5.00', status: 'Failed' },
  ];

  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <PageHeader title="View Posted Grades" breadcrumb="Faculty Portal">
        <button className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2">
          <Download className="h-4 w-4" /> Export PDF Report
        </button>
        <button className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Export CSV
        </button>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Navigation Breadcrumb detail */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer" onClick={() => navigate('/faculty/classrecordslist')}>
            Class Records
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">IT401 - BSIT-4A (Grades Locked)</span>
        </div>

        {/* Lock Alert Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
          <Lock className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-800">Finalized Class Record</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Grades for this class record were posted on <strong>May 24, 2026 at 10:45 AM</strong>. To edit, modify, or correct any record entries, you must submit a formal Grade Correction Form to the College Dean.
            </p>
          </div>
        </div>

        {/* Search Toolbar */}
        <div className="flex justify-between items-center gap-4">
          <div className="relative max-w-xs w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-sage-500 focus:border-sage-500 sm:text-xs transition-colors outline-none bg-white" 
              placeholder="Search student name..." 
            />
          </div>

          <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Verified Registry Lock Active
          </div>
        </div>

        {/* Locked Grades Table */}
        <div className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col">
          <div className="table-container overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200 z-10 w-64">Student Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Activity (20%)</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Quiz (30%)</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Exam (50%)</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 text-slate-600 border-l border-slate-200 text-right">Computed (%)</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-900 bg-slate-100 border-l border-slate-200 text-center w-32">Final Transmuted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900 sticky left-0 bg-white border-r border-slate-100 group-hover:bg-slate-50/50">
                        {student.name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-right">{student.activity}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-right">{student.quiz}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-right">{student.exam}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-500 bg-slate-50/30 border-l border-slate-100 text-right">
                        {student.computed.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center bg-slate-100/50 border-l border-slate-200">
                        <span className={cn(
                          "inline-flex items-center justify-center px-2.5 py-1 rounded-md text-sm font-bold font-mono min-w-[3rem] border",
                          student.status === 'Failed' ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        )}>
                          {student.grade}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="py-10 text-center text-slate-400">
                      No student records found matching search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}

