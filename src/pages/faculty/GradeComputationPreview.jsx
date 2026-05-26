import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, AlertTriangle, Send, Download } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function GradeComputationPreview() {
  const navigate = useNavigate();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const students = [
    { id: 1, name: 'Dela Cruz, Juan M.', activity: 95, quiz: 88, exam: 90, computed: 90.4, grade: '1.25', status: 'Passed' },
    { id: 2, name: 'Santos, Maria A.', activity: 75, quiz: 68, exam: 70, computed: 70.4, grade: '2.75', status: 'Passed' },
    { id: 3, name: 'Reyes, Mark T.', activity: 82, quiz: 0, exam: 65, computed: 48.9, grade: '5.00', status: 'Failed' },
    { id: 4, name: 'Villanueva, Anna C.', activity: 98, quiz: 92, exam: 95, computed: 94.7, grade: '1.00', status: 'Passed' },
    { id: 5, name: 'Bautista, Kevin L.', activity: 85, quiz: 80, exam: 75, computed: 78.5, grade: '2.25', status: 'Passed' },
  ];

  const handlePostGrades = () => {
    setShowConfirmModal(false);
    navigate('/faculty/postedgradesview');
  };

  return (
    <>
      <PageHeader title="Computation Preview" breadcrumb="Faculty Portal">
        <button className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:border-sage-300 rounded-lg transition-colors bg-white flex items-center gap-2">
            <Download className="h-4 w-4" /> Export Report
        </button>
        <button 
          onClick={() => setShowConfirmModal(true)}
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-2 shadow-sm"
        >
            <Send className="h-4 w-4" /> Post Grades
        </button>
      </PageHeader>
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6 relative">
        
        {/* Info Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
                <h4 className="text-sm font-bold text-amber-800">Review Before Posting</h4>
                <p className="text-sm text-amber-700 mt-1">
                    Please review the computed grades carefully. Once you click <strong>Post Grades</strong>, they will be locked and visible to students. Any changes will require a formal Admin Grade Override.
                </p>
            </div>
        </div>

        {/* Header Info */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/faculty/classrecordslist" className="hover:text-sage-600 transition-colors">Class Records</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-slate-900">IT101 - BSIT-3A (Midterm)</span>
        </div>

        {/* Data Table */}
        <div className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col">
            <div className="table-container overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sticky left-0 bg-slate-50 border-r border-slate-200 z-10 w-64">Student Name</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">
                                Activity <br/><span className="text-slate-400 font-mono font-normal">20%</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">
                                Quiz <br/><span className="text-slate-400 font-mono font-normal">30%</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">
                                Exam <br/><span className="text-slate-400 font-mono font-normal">50%</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-sage-50 text-sage-800 border-l border-sage-200 text-right">
                                Computed (%)
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-900 bg-sage-100 border-l border-sage-200 text-center w-32">
                                Final Transmuted
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {students.map((student) => (
                            <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="px-4 py-3 text-sm font-medium text-slate-900 sticky left-0 bg-white border-r border-slate-100 group-hover:bg-slate-50/50">
                                    {student.name}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-600 font-mono text-right">{student.activity}</td>
                                <td className="px-4 py-3 text-sm text-slate-600 font-mono text-right">{student.quiz}</td>
                                <td className="px-4 py-3 text-sm text-slate-600 font-mono text-right">{student.exam}</td>
                                <td className="px-4 py-3 text-sm font-mono font-semibold text-sage-700 bg-sage-50/30 border-l border-slate-100 text-right">
                                    {student.computed.toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-center bg-sage-50/50 border-l border-slate-100">
                                    <span className={cn(
                                        "inline-flex items-center justify-center px-2.5 py-1 rounded-md text-sm font-bold font-mono min-w-[3rem] border",
                                        student.status === 'Failed' ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    )}>
                                        {student.grade}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
        
        {/* Confirmation Modal */}
        {showConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-6">
                        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                        <h3 className="text-xl font-bold font-display text-slate-900">Post Final Grades?</h3>
                        <p className="text-sm text-slate-500 mt-2">
                            You are about to post the Midterm grades for <strong>IT101 - BSIT-3A</strong>. Once posted, you will no longer be able to edit these scores without an administrative override.
                        </p>
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                        <button 
                            onClick={() => setShowConfirmModal(false)}
                            className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handlePostGrades}
                            className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors shadow-sm"
                        >
                            Yes, Post Grades Now
                        </button>
                    </div>
                </div>
            </div>
        )}


      </div>
    </>
  );
}
