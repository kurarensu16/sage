import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter, Plus, UserCheck, Archive, X, Check, AlertTriangle, BookOpen } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function ClassManagementList() {
  const [classrooms, setClassrooms] = useState([]);
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState('active'); // active | archived

  // Reassignment Modal State
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [targetFacultyId, setTargetFacultyId] = useState('');

  // Load classrooms and faculty list
  const loadData = () => {
    setClassrooms(mockDb.getClassrooms());
    setFacultyUsers(mockDb.getUsers().filter(u => u.role === 'faculty' && u.status === 'active'));
    setSubjects(mockDb.getSubjects());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenReassign = (cls) => {
    setSelectedClass(cls);
    setTargetFacultyId(cls.facultyId || '');
    setIsReassignOpen(true);
  };

  const handleSaveReassignment = () => {
    if (!selectedClass || !targetFacultyId) return;
    
    mockDb.reassignFaculty(selectedClass.id, targetFacultyId, 'Admin System Control');
    setIsReassignOpen(false);
    setSelectedClass(null);
    loadData();
  };

  const handleArchiveClass = (cls) => {
    // Show warnings as per requirements FR08: "warn Admin if unposted grades exist"
    // Since this is mock, we can show a detailed warn dialog.
    const message = `Are you sure you want to archive ${cls.subjectCode} - ${cls.section}?\n\nWARNING: Archiving will prevent new enrollments and lock all grades for this section from further edits.`;
    
    if (confirm(message)) {
      mockDb.archiveClassroom(cls.id, 'Admin System Control');
      loadData();
    }
  };

  // Filter classrooms
  const filteredClassrooms = classrooms.filter(cls => {
    const matchesSearch = 
      cls.subjectCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.section.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.facultyName.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesTab = cls.status === statusTab;
    
    return matchesSearch && matchesTab;
  });

  return (
    <>
      <PageHeader title="Classroom Management" breadcrumb="Admin Portal">
        <Link 
          to="/admin/classmanagementform" 
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Create Classroom
        </Link>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Toolbar & Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              placeholder="Search subjects, sections, or teachers..." 
            />
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1">
            <button 
              onClick={() => setStatusTab('active')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                statusTab === 'active' ? 'bg-sage-50 text-sage-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Active Classes
            </button>
            <button 
              onClick={() => setStatusTab('archived')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                statusTab === 'archived' ? 'bg-sage-50 text-sage-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Archived Records
            </button>
          </div>
        </div>

        {/* Classrooms Grid/Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Course Code</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject Description</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Faculty</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Enrolled</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredClassrooms.length > 0 ? (
                  filteredClassrooms.map((cls) => (
                    <tr key={cls.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 font-mono">
                        {cls.subjectCode}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                        {cls.subjectName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {cls.section}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-[10px] flex items-center justify-center font-mono">
                          {cls.facultyName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span>Prof. {cls.facultyName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-mono font-medium text-slate-900">
                        {cls.enrolledCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          cls.status === 'active' 
                            ? 'bg-blue-50 text-blue-700 border-blue-200' 
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {cls.status === 'active' ? 'Active' : 'Archived'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          {cls.status === 'active' ? (
                            <>
                              <button 
                                onClick={() => handleOpenReassign(cls)}
                                title="Reassign Faculty"
                                className="p-1.5 text-sage-600 hover:bg-sage-50 border border-sage-100 rounded-md transition-colors flex items-center gap-1"
                              >
                                <UserCheck className="h-4 w-4" />
                              </button>
                              
                              <button 
                                onClick={() => handleArchiveClass(cls)}
                                title="Archive Classroom"
                                className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-100 rounded-md transition-colors flex items-center gap-1"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 font-mono italic pr-2">Read Only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No classrooms found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Reassignment Modal */}
      {isReassignOpen && selectedClass && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full shadow-lg flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold font-display text-slate-900 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-sage-600" /> Reassign Classroom Faculty
              </h3>
              <button 
                onClick={() => setIsReassignOpen(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-xs space-y-1">
                <div>Classroom: <strong className="text-slate-800 font-mono">{selectedClass.subjectCode} - {selectedClass.section}</strong></div>
                <div>Course Name: <span className="text-slate-600">{selectedClass.subjectName}</span></div>
                <div>Current Faculty: <span className="text-slate-600">Prof. {selectedClass.facultyName}</span></div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Select Replacement Faculty</label>
                <select
                  value={targetFacultyId}
                  onChange={(e) => setTargetFacultyId(e.target.value)}
                  className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3.5 py-2.5 rounded-lg text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select faculty member...</option>
                  {facultyUsers.map((fac) => (
                    <option key={fac.id} value={fac.id}>
                      Prof. {fac.firstName} {fac.lastName} ({fac.department})
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const targetFacultyObj = facultyUsers.find(f => f.id === targetFacultyId);
                const classSubjectObj = subjects.find(s => s.code === selectedClass.subjectCode);
                const isMismatched = targetFacultyObj && classSubjectObj && targetFacultyObj.department !== classSubjectObj.department;
                if (!isMismatched) return null;
                return (
                  <div className="bg-amber-50 border border-amber-250 text-amber-800 p-3 rounded-lg text-xs flex items-start gap-2 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Department Mismatch Warning</span>
                      <span className="text-[11px] leading-relaxed block mt-0.5">
                        The subject belongs to "{classSubjectObj.department}", but Prof. {targetFacultyObj.firstName} {targetFacultyObj.lastName} belongs to "{targetFacultyObj.department}".
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button 
                onClick={() => setIsReassignOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveReassignment}
                disabled={!targetFacultyId}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <Check className="h-4 w-4" /> Save Reassignment
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
