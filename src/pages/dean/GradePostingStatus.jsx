import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Search, ClipboardCheck, Filter, Users } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function GradePostingStatus() {
  const [classrooms, setClassrooms] = useState([]);
  const [postedGrades, setPostedGrades] = useState([]);
  
  // Filters
  const [deptFilter, setDeptFilter] = useState('');
  const [semFilter, setSemFilter] = useState('2nd');
  const [syFilter, setSyFilter] = useState('2025-2026');
  const [searchTerm, setSearchTerm] = useState('');

  const [triggerRefresh, setTriggerRefresh] = useState(0);
  const [selectedOverrideClass, setSelectedOverrideClass] = useState('BSITCPR323');
  const [lockedMilestones, setLockedMilestones] = useState([]);

  useEffect(() => {
    setClassrooms(mockDb.getClassrooms().filter(c => c.status === 'active'));
    setPostedGrades(mockDb.getPostedGrades());

    const locked = JSON.parse(localStorage.getItem(`locked_milestones_${selectedOverrideClass}`) || '[]');
    setLockedMilestones(locked);
  }, [triggerRefresh, selectedOverrideClass]);

  const handleApproveUnlock = (classCode, milestone) => {
    // 1. Remove from locked milestones
    const locked = JSON.parse(localStorage.getItem(`locked_milestones_${classCode}`) || '[]');
    const updatedLocks = locked.filter(m => m !== milestone);
    localStorage.setItem(`locked_milestones_${classCode}`, JSON.stringify(updatedLocks));
    
    // 2. Remove from pending unlock requests
    const reqs = JSON.parse(localStorage.getItem(`unlock_requests_${classCode}`) || '[]');
    const updatedReqs = reqs.filter(m => m !== milestone);
    localStorage.setItem(`unlock_requests_${classCode}`, JSON.stringify(updatedReqs));
    
    // Refresh UI
    setTriggerRefresh(prev => prev + 1);
  };

  const getStatusBadge = (classId, period) => {
    const classroom = classrooms.find(cl => cl.id === classId);
    const classCode = classroom ? classroom.subjectCode : '';
    
    const lockedMilestones = JSON.parse(localStorage.getItem(`locked_milestones_${classCode}`) || '[]');
    const unlockRequests = JSON.parse(localStorage.getItem(`unlock_requests_${classCode}`) || '[]');
    
    const normalizedPeriod = period === 'prelim' ? 'Prelim' : period === 'midterm' ? 'Midterm' : period === 'final' ? 'Final' : period;
    const isPosted = lockedMilestones.includes(normalizedPeriod) || lockedMilestones.includes('Semestral Grade');
    const isRequested = unlockRequests.includes(normalizedPeriod);
    
    if (isPosted) {
      return (
        <div className="flex flex-col items-center gap-1.5 justify-center">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Posted
          </span>
          {isRequested && (
            <button
              onClick={() => handleApproveUnlock(classCode, normalizedPeriod)}
              className="px-2 py-0.5 text-[9px] font-extrabold bg-amber-500 hover:bg-amber-600 text-white rounded shadow-sm transition-colors flex items-center gap-1 animate-pulse outline-none"
              title="Click to approve faculty request and unlock registry"
            >
              🔓 Approve Request
            </button>
          )}
        </div>
      );
    }
    
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
        Pending
      </span>
    );
  };

  // Filter classrooms
  const filteredClasses = classrooms.filter(c => {
    const matchesSearch = 
      c.facultyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.subjectCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.section.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesSem = !semFilter || c.semester === semFilter;
    const matchesSy = !syFilter || c.schoolYear === syFilter;
    
    // Simulate department mapping: IT prefix goes to IT department
    const isItDept = c.subjectCode.startsWith('IT') || c.subjectCode.startsWith('CS');
    const matchesDept = !deptFilter || 
      (deptFilter === 'IT' && isItDept) || 
      (deptFilter === 'CS' && c.subjectCode.startsWith('CS')) ||
      (deptFilter === 'Non-IT' && !isItDept);

    return matchesSearch && matchesSem && matchesSy && matchesDept;
  });

  return (
    <>
      <PageHeader title="Grade Posting Status" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* 🔑 Dean's Administrative Registry Override Dashboard */}
        <div className="bg-amber-50/45 border border-amber-205 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>🔑 Dean's Administrative Registry Overrides</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Select a class record to bypass registry locks and manually unlock any term milestone score entries.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Select</label>
              <select
                value={selectedOverrideClass}
                onChange={(e) => setSelectedOverrideClass(e.target.value)}
                className="bg-white border border-slate-200 hover:border-amber-300 px-3 py-1.5 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all cursor-pointer text-slate-700 shadow-sm"
              >
                <option value="BSITCPR323">BSITCPR323 - Capstone 1</option>
                <option value="IT101">IT101 - Intro to Computing</option>
                <option value="IT201">IT201 - Data Structures</option>
                <option value="CS301">CS301 - Artificial Intelligence</option>
              </select>
            </div>
          </div>

          <div className="p-4 bg-white rounded-lg border border-amber-100/70 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Registry Locks</span>
              <div className="flex flex-wrap gap-1">
                {lockedMilestones.length === 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-250">
                    No active locks
                  </span>
                ) : (
                  lockedMilestones.map(m => (
                    <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                      🔒 {m}
                    </span>
                  ))
                )}
              </div>
            </div>

            {lockedMilestones.length === 0 ? (
              <p className="text-xs font-semibold text-slate-450 italic text-center py-2">This class currently has no locked milestones.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                {lockedMilestones.map(milestone => (
                  <div key={milestone} className="flex justify-between items-center bg-slate-50/50 p-2.5 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800">{milestone}</span>
                      <span className="text-[9px] text-slate-405 font-mono mt-0.5">Status: LOCKED</span>
                    </div>
                    <button
                      onClick={() => handleApproveUnlock(selectedOverrideClass, milestone)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors shadow-sm outline-none"
                    >
                      🔓 Unlock Override
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filters Toolbar */}
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
                placeholder="Search faculty or subject..."
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-slate-50/20 focus:bg-white transition-colors"
              />
            </div>

            {/* Department */}
            <div className="flex flex-col gap-1">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All Departments</option>
                <option value="IT">Information Technology</option>
                <option value="CS">Computer Science</option>
                <option value="Non-IT">General Education / Other</option>
              </select>
            </div>

            {/* Semester */}
            <div className="flex flex-col gap-1">
              <select
                value={semFilter}
                onChange={(e) => setSemFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All Semesters</option>
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="summer">Summer</option>
              </select>
            </div>

            {/* School Year */}
            <div className="flex flex-col gap-1">
              <select
                value={syFilter}
                onChange={(e) => setSyFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All School Years</option>
                <option value="2025-2026">2025-2026</option>
                <option value="2026-2027">2026-2027</option>
              </select>
            </div>

          </div>
        </div>

        {/* Status Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Faculty</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject & Title</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Prelim Grades</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Midterm Grades</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Final Grades</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredClasses.length > 0 ? (
                  filteredClasses.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-[10px] flex items-center justify-center font-mono">
                          {c.facultyName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span>Prof. {c.facultyName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-slate-900">{c.subjectCode}</span>
                          <span className="text-xs text-slate-500 truncate max-w-xs">{c.subjectName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {c.section}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(c.id, 'prelim')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(c.id, 'midterm')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(c.id, 'final')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No matching class posting status reports found.
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
