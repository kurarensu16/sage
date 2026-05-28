import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronDown, Eye, FileText, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function MyGradesList() {
  const [selectedSemester, setSelectedSemester] = useState('First Semester, AY 2025-2026');

  const semesters = [
    'First Semester, AY 2025-2026',
    'Second Semester, AY 2024-2025',
    'First Semester, AY 2024-2025'
  ];

  // Subject list data
  const grades = [
    { code: 'IT101', name: 'Introduction to Computing', credits: 3, instructor: 'Prof. Amanda Rivera', latestPeriod: 'Midterm', status: 'Posted', grade: '2.00' },
    { code: 'IT201', name: 'Data Structures and Algorithms', credits: 3, instructor: 'Prof. Amanda Rivera', latestPeriod: 'Prelim', status: 'Posted', grade: '1.50' },
    { code: 'CS301', name: 'Artificial Intelligence', credits: 3, instructor: 'Prof. Amanda Rivera', latestPeriod: 'Prelim', status: 'Draft', grade: '—' },
    { code: 'MATH104', name: 'Discrete Mathematics', credits: 3, instructor: 'Dr. Carlos Valdes', latestPeriod: 'Midterm', status: 'Posted', grade: '1.75' }
  ];

  return (
    <>
      <PageHeader title="My Grades" breadcrumb="Student Portal">
        <div className="relative">
          <select 
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="appearance-none bg-white border border-slate-200 hover:border-sage-300 text-slate-700 px-4 py-2 pr-10 rounded-lg text-sm font-medium focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer"
          >
            {semesters.map((sem, idx) => (
              <option key={idx} value={sem}>{sem}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* GPA Summary box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-sage-600" />
            <span className="text-xs text-slate-500">Academic Standing: <strong className="text-slate-800">Excellent</strong></span>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Total Units Taken: <strong className="text-slate-850 font-mono text-sm">12.0</strong>
          </span>
        </div>

        {/* Subjects List Grid */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 text-xs font-semibold tracking-wider">
                  <th className="px-6 py-4 font-medium">Subject Code & Description</th>
                  <th className="px-6 py-4 font-medium">Instructor</th>
                  <th className="px-6 py-4 font-medium text-center">Units</th>
                  <th className="px-6 py-4 font-medium">Latest Posted Period</th>
                  <th className="px-6 py-4 font-medium text-center">Grade</th>
                  <th className="px-6 py-4 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {grades.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 text-sm">{item.code}</div>
                      <div className="text-slate-400 font-normal mt-0.5">{item.name}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{item.instructor}</td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-slate-800">{item.credits.toFixed(1)}</td>
                    <td className="px-6 py-4">
                      {item.status === 'Posted' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {item.latestPeriod} Posted
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                          {item.latestPeriod} Draft
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "font-mono text-sm font-bold",
                        item.grade === '—' ? 'text-slate-400' : 'text-sage-700'
                      )}>
                        {item.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        to="/student/mygradesdetail"
                        className="px-3 py-1.5 border border-slate-200 hover:border-sage-300 text-slate-600 hover:text-slate-900 bg-white rounded-lg transition-colors flex items-center justify-center gap-1.5 w-fit ml-auto"
                      >
                        <Eye className="h-3.5 w-3.5" /> View Breakdown
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}
