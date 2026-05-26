import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { FileText, Printer, FileDown, Filter, Calendar } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function SummaryReports() {
  const [reportType, setReportType] = useState('grade-distribution');
  const [deptFilter, setDeptFilter] = useState('College of IT');
  const [semFilter, setSemFilter] = useState('2nd');
  const [syFilter, setSyFilter] = useState('2025-2026');

  const [reportData, setReportData] = useState([]);

  useEffect(() => {
    const classrooms = mockDb.getClassrooms().filter(c => c.status === 'active');
    const users = mockDb.getUsers();
    const postedGrades = mockDb.getPostedGrades();

    if (reportType === 'grade-distribution') {
      // Map class sections to passing/average metrics
      const list = classrooms.map(c => {
        const grades = postedGrades.filter(g => g.classRecordId === c.id);
        const sum = grades.reduce((acc, curr) => acc + curr.computedGrade, 0);
        const avg = grades.length > 0 ? sum / grades.length : 1.75; // Default average
        const passedCount = grades.filter(g => g.computedGrade <= 3.00).length;
        
        return {
          code: c.subjectCode,
          name: c.subjectName,
          section: c.section,
          faculty: c.facultyName,
          enrolled: c.enrolledCount,
          averageGwa: avg,
          passed: grades.length > 0 ? passedCount : c.enrolledCount - 1
        };
      });
      setReportData(list);
    } else if (reportType === 'faculty-evaluation') {
      // Map faculty users to evaluation averages
      const facultyUsers = users.filter(u => u.role === 'faculty');
      const list = facultyUsers.map(f => {
        const classesCount = classrooms.filter(c => c.facultyId === f.id).length;
        let rating = 4.50;
        if (f.id === 'usr-003') rating = 4.75;
        if (f.id === 'usr-004') rating = 4.18;

        return {
          name: `${f.firstName} ${f.lastName}`,
          email: f.email,
          dept: f.department,
          sections: classesCount,
          rating: rating
        };
      });
      setReportData(list);
    } else {
      // At-risk student audit
      const studentUsers = users.filter(u => u.role === 'student');
      const list = studentUsers.map(s => {
        const grades = postedGrades.filter(g => g.studentId === s.id);
        let gwa = 1.75;
        if (grades.length > 0) {
          const sum = grades.reduce((acc, curr) => acc + curr.computedGrade, 0);
          gwa = sum / grades.length;
        } else {
          if (s.id === 'usr-006') gwa = 3.25;
        }

        let risk = 'Low Risk';
        if (gwa > 3.00) risk = 'High Risk';
        else if (gwa >= 2.75 && gwa <= 3.00) risk = 'Medium Risk';

        return {
          name: `${s.firstName} ${s.lastName}`,
          email: s.email,
          dept: s.department,
          gwa: gwa,
          risk: risk
        };
      }).filter(s => s.risk !== 'Low Risk' || s.gwa > 2.50); // Show warnings
      setReportData(list);
    }
  }, [reportType, deptFilter, semFilter, syFilter]);

  const handlePrint = () => {
    window.print();
  };

  const getReportTitle = () => {
    switch (reportType) {
      case 'grade-distribution':
        return 'Academic Grade Distribution Summary Report';
      case 'faculty-evaluation':
        return 'Faculty Evaluation Cumulative Performance Audit';
      default:
        return 'Student Academic At-Risk Warning Ledger';
    }
  };

  return (
    <>
      {/* Injecting CSS media print styling for clean printing directly */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 24px;
            margin: 0;
            box-shadow: none;
            border: none;
          }
        }
      `}</style>

      <PageHeader title="Summary Reports Exporter" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Settings and Filters Grid */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 no-print">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-sage-600" /> Document Configuration
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            
            {/* Report Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Report Category</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer font-bold text-slate-800"
              >
                <option value="grade-distribution">Grade Distribution summary</option>
                <option value="faculty-evaluation">Faculty Performance ratings</option>
                <option value="at-risk-audit">At-Risk Student Audit</option>
              </select>
            </div>

            {/* Department */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Department</label>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="College of IT">College of IT</option>
                <option value="College of CS">College of CS</option>
              </select>
            </div>

            {/* Semester */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Semester</label>
              <select
                value={semFilter}
                onChange={(e) => setSemFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
              </select>
            </div>

            {/* School Year */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Academic Year</label>
              <select
                value={syFilter}
                onChange={(e) => setSyFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="2025-2026">2025-2026</option>
                <option value="2026-2027">2026-2027</option>
              </select>
            </div>

          </div>

          {/* Export Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button 
              onClick={handlePrint}
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" /> Print / Export as PDF
            </button>
          </div>
        </div>

        {/* Live A4 Print Preview Sheet */}
        <div className="flex justify-center bg-slate-100 p-6 rounded-xl border border-slate-200 no-print">
          <div 
            id="print-area" 
            className="w-full max-w-[800px] bg-white border border-slate-350 shadow-md p-8 md:p-12 space-y-8 rounded-md font-sans text-black"
          >
            {/* Institution header */}
            <div className="text-center space-y-1.5 border-b-2 border-slate-900 pb-5">
              <h2 className="text-base font-bold uppercase tracking-wider">Dr. Yanga's Colleges, Inc.</h2>
              <p className="text-[10px] text-slate-500 font-mono">Wakas, Bocaue, Bulacan, Philippines</p>
              <p className="text-xs font-bold text-slate-700">Office of the Dean, IT & Computer Studies</p>
            </div>

            {/* Document Details */}
            <div className="flex justify-between items-start text-xs border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <p className="font-bold text-slate-800 text-sm">{getReportTitle()}</p>
                <p className="text-slate-500 font-medium">Department: {deptFilter}</p>
                <p className="text-slate-500 font-medium">A.Y. {syFilter} &bull; {semFilter} Semester</p>
              </div>
              <div className="text-right space-y-1 font-mono text-[10px] text-slate-400">
                <p>Generated: {new Date().toLocaleDateString()}</p>
                <p>Author: Dean Carlos Valdes</p>
                <p>Security Class: Restricted</p>
              </div>
            </div>

            {/* Report Data Table Preview */}
            <div className="overflow-x-auto">
              {reportType === 'grade-distribution' && (
                <table className="min-w-full divide-y divide-slate-300 text-xs">
                  <thead>
                    <tr className="font-bold text-slate-700 text-left">
                      <th className="py-2.5">Subject</th>
                      <th className="py-2.5">Section</th>
                      <th className="py-2.5">Instructor</th>
                      <th className="py-2.5 text-center">Enrolled</th>
                      <th className="py-2.5 text-center">Passed (%)</th>
                      <th className="py-2.5 text-center">Average GWA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className="text-slate-700">
                        <td className="py-2.5 font-bold">{row.code}</td>
                        <td className="py-2.5">{row.section}</td>
                        <td className="py-2.5">Prof. {row.faculty}</td>
                        <td className="py-2.5 text-center font-mono">{row.enrolled}</td>
                        <td className="py-2.5 text-center font-mono">
                          {row.passed} ({Math.round((row.passed / row.enrolled) * 100)}%)
                        </td>
                        <td className="py-2.5 text-center font-mono font-bold">{row.averageGwa.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportType === 'faculty-evaluation' && (
                <table className="min-w-full divide-y divide-slate-300 text-xs">
                  <thead>
                    <tr className="font-bold text-slate-700 text-left">
                      <th className="py-2.5">Faculty Name</th>
                      <th className="py-2.5">Department</th>
                      <th className="py-2.5 text-center">Sections Taught</th>
                      <th className="py-2.5 text-center">Student Evaluation Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className="text-slate-700">
                        <td className="py-2.5 font-bold">Prof. {row.name}</td>
                        <td className="py-2.5">{row.dept}</td>
                        <td className="py-2.5 text-center font-mono">{row.sections}</td>
                        <td className="py-2.5 text-center font-mono font-bold text-sage-700">{row.rating.toFixed(2)} / 5.00</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportType === 'at-risk-audit' && (
                <table className="min-w-full divide-y divide-slate-300 text-xs">
                  <thead>
                    <tr className="font-bold text-slate-700 text-left">
                      <th className="py-2.5">Student Name</th>
                      <th className="py-2.5">Department</th>
                      <th className="py-2.5 text-center">Running GWA</th>
                      <th className="py-2.5 text-center">Risk Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className="text-slate-700">
                        <td className="py-2.5 font-bold">{row.name}</td>
                        <td className="py-2.5">{row.dept}</td>
                        <td className="py-2.5 text-center font-mono font-bold">{row.gwa.toFixed(2)}</td>
                        <td className="py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.risk === 'High Risk' 
                              ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {row.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Signature Block */}
            <div className="pt-12 flex justify-end">
              <div className="text-center w-56 border-t border-slate-900 pt-2 text-xs">
                <p className="font-bold text-slate-950">Carlos Valdes, MIT</p>
                <p className="text-slate-500 mt-0.5">Dean, College of IT & CS</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
