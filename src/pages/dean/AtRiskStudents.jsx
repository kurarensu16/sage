import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Search, AlertCircle, Filter, Sparkles, BookOpen } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function AtRiskStudents() {
  const [students, setStudents] = useState([]);
  
  // Filters
  const [severityFilter, setSeverityFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const users = mockDb.getUsers().filter(u => u.role === 'student');
    const postedGrades = mockDb.getPostedGrades();

    // Map students to running grades, severity levels, and AI recommendations
    const mapped = users.map(s => {
      // Find all posted grades for this student
      const grades = postedGrades.filter(g => g.studentId === s.id);
      
      let runningGwa = 1.75; // Default average
      let failingPeriodsCount = 0;
      let targetSection = s.section || 'BSIT-1A';
      
      if (grades.length > 0) {
        const sum = grades.reduce((acc, curr) => acc + curr.computedGrade, 0);
        runningGwa = sum / grades.length;
        failingPeriodsCount = grades.filter(g => g.computedGrade > 3.00).length;
        if (!s.section) {
          targetSection = grades[0].section;
        }
      } else {
        // Mock default values for seed students if section is not explicitly set
        if (!s.section) {
          if (s.id === 'usr-006') {
            runningGwa = 3.25;
            failingPeriodsCount = 1;
            targetSection = 'BSIT-2B';
          } else if (s.id === 'usr-007') {
            runningGwa = 1.50;
            failingPeriodsCount = 0;
            targetSection = 'BSCS-3A';
          }
        } else {
          if (s.id === 'usr-006') {
            runningGwa = 3.25;
            failingPeriodsCount = 1;
          } else if (s.id === 'usr-007') {
            runningGwa = 1.50;
            failingPeriodsCount = 0;
          }
        }
      }

      // Determine severity
      let severity = 'low';
      let aiAdvisory = 'Good academic standing. Maintain current study patterns.';
      
      if (runningGwa > 3.00 || failingPeriodsCount > 0) {
        severity = 'high';
        aiAdvisory = 'Immediate academic counselor intervention advised. Failing marks recorded.';
      } else if (runningGwa >= 2.75 && runningGwa <= 3.00) {
        severity = 'medium';
        aiAdvisory = 'Provide tutoring support. Running GWA border-lining passing scale.';
      }

      return {
        ...s,
        runningGwa,
        section: targetSection,
        severity,
        aiAdvisory
      };
    });

    setStudents(mapped);
  }, []);

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'high':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
            High Risk
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
            Medium Risk
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Low Risk
          </span>
        );
    }
  };

  // Filter students list
  const filteredStudents = students.filter(s => {
    const name = `${s.firstName} ${s.lastName}`;
    const matchesSearch = 
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesSeverity = !severityFilter || s.severity === severityFilter;
    const matchesSection = !sectionFilter || s.section === sectionFilter;
    
    // Course filter: BSIT vs BSCS based on program, department or section name prefix
    const isItDept = s.program === 'Bachelor of Science in Information Technology' || 
                     s.department === 'College of IT' || 
                     (s.section && s.section.startsWith('BSIT'));
    const isCsDept = s.program === 'Bachelor of Science in Computer Science' || 
                     s.department === 'College of CS' || 
                     (s.section && s.section.startsWith('BSCS'));
    const matchesCourse = !courseFilter ||
      (courseFilter === 'BSIT' && isItDept) ||
      (courseFilter === 'BSCS' && isCsDept);

    return matchesSearch && matchesSeverity && matchesSection && matchesCourse;
  });

  return (
    <>
      <PageHeader title="At-Risk Students" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Filter Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-sage-600" /> Filter Options
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            
            {/* Search */}
            <div className="sm:col-span-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search student..."
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-slate-50/20 focus:bg-white transition-colors"
              />
            </div>

            {/* Severity */}
            <div className="flex flex-col gap-1">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All Risk Severities</option>
                <option value="high">High Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="low">Low Risk</option>
              </select>
            </div>

            {/* Course */}
            <div className="flex flex-col gap-1">
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All Degree Programs</option>
                <option value="BSIT">BS in Information Technology</option>
                <option value="BSCS">BS in Computer Science</option>
              </select>
            </div>

            {/* Section */}
            <div className="flex flex-col gap-1">
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All Sections</option>
                <option value="BSIT-1A">BSIT-1A</option>
                <option value="BSIT-2B">BSIT-2B</option>
                <option value="BSCS-3A">BSCS-3A</option>
              </select>
            </div>

          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Student Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Degree</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Running GWA</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">AI Recommendation / Advisory</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Early Warning Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-50 border border-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center font-mono">
                          {s.firstName[0]}{s.lastName[0]}
                        </div>
                        <span>{s.firstName} {s.lastName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600">
                        {s.program === 'Bachelor of Science in Information Technology' || (s.section && s.section.startsWith('BSIT')) ? 'BSIT' : 
                         s.program === 'Bachelor of Science in Computer Science' || (s.section && s.section.startsWith('BSCS')) ? 'BSCS' : 'Other'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {s.section}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-mono font-bold text-slate-900">
                        {s.runningGwa.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600 font-sans max-w-sm">
                        <div className="flex items-start gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0 mt-0.5" />
                          <span>{s.aiAdvisory}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getSeverityBadge(s.severity)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No at-risk student records match criteria.
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
