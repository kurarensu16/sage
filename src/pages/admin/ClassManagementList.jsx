import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter, Plus, UserCheck, Archive, X, Check, AlertTriangle, BookOpen, Users, UserPlus, UserMinus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function ClassManagementList() {
  const { user, profile } = useAuth();
  const [classrooms, setClassrooms] = useState([]);
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState('active'); // active | archived

  // Reassignment Modal State
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [targetFacultyId, setTargetFacultyId] = useState('');

  // Manage Students Modal State
  const [isManageStudentsOpen, setIsManageStudentsOpen] = useState(false);
  const [selectedClassForStudents, setSelectedClassForStudents] = useState(null);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [allStudents, setAllStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedStudentIdsToEnroll, setSelectedStudentIdsToEnroll] = useState([]);

  // Load classrooms and faculty list from Supabase
  const loadData = async () => {
    try {
      // 1. Fetch classrooms
      const { data: dbClassrooms, error: classErr } = await supabase
        .from('class_records')
        .select(`
          class_record_id,
          school_year,
          semester,
          status,
          subject_id,
          section_id,
          subjects ( subject_id, code, name, department_id, departments(name) ),
          sections ( section_id, name ),
          faculty:users!faculty_id ( user_id, first_name, last_name, department_id, departments(name) )
        `);
      if (classErr) throw classErr;

      // 2. Fetch faculty list
      const { data: dbFaculty, error: facErr } = await supabase
        .from('users')
        .select('user_id, first_name, last_name, department_id, departments(name)')
        .eq('role', 'faculty')
        .eq('status', 'active');
      if (facErr) throw facErr;

      const mappedFaculties = (dbFaculty || []).map(u => ({
        id: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        department: u.departments?.name || '',
        departmentId: u.department_id
      }));
      setFacultyUsers(mappedFaculties);

      // 3. Fetch subjects
      const { data: dbSubjects, error: subErr } = await supabase
        .from('subjects')
        .select('subject_id, code, name, department_id, departments(name)');
      if (subErr) throw subErr;
      setSubjects(dbSubjects || []);

      // 4. Fetch students
      const { data: dbStudents, error: studErr } = await supabase
        .from('users')
        .select('user_id, user_number, first_name, last_name, email, role, section_id, sections(name), status')
        .eq('role', 'student')
        .eq('status', 'active');
      if (studErr) throw studErr;

      const mappedStudents = (dbStudents || []).map(u => ({
        id: u.user_id,
        userNumber: u.user_number || '',
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        role: u.role,
        section: u.sections?.name || 'Irregular',
        sectionId: u.section_id,
        status: u.status
      }));
      setAllStudents(mappedStudents);

      // 5. Fetch enrollments
      const { data: dbEnrollments, error: enrollErr } = await supabase
        .from('enrollments')
        .select('student_id, subject_id, section_id');
      if (enrollErr) throw enrollErr;
      setEnrollments(dbEnrollments || []);

      // 6. Map classrooms with dynamic enrollment count
      const mappedClassrooms = (dbClassrooms || []).map(c => {
        // Enrolled count is regular block students + manual subject/section enrollments
        const regularCount = mappedStudents.filter(s => s.sectionId === c.section_id).length;
        const irregularCount = (dbEnrollments || []).filter(e => e.subject_id === c.subject_id && e.section_id === c.section_id).length;

        return {
          id: c.class_record_id,
          subjectId: c.subject_id,
          subjectCode: c.subjects?.code || '',
          subjectName: c.subjects?.name || '',
          section: c.sections?.name || '',
          sectionId: c.section_id,
          facultyName: c.faculty ? `${c.faculty.first_name} ${c.faculty.last_name}` : 'Unassigned',
          facultyId: c.faculty?.user_id || '',
          enrolledCount: regularCount + irregularCount,
          status: c.status || 'active',
          schoolYear: c.school_year,
          semester: c.semester,
          manualStudentIds: (dbEnrollments || [])
            .filter(e => e.subject_id === c.subject_id && e.section_id === c.section_id)
            .map(e => e.student_id)
        };
      });
      setClassrooms(mappedClassrooms);

    } catch (err) {
      console.error('Failed to load classrooms data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenReassign = (cls) => {
    setSelectedClass(cls);
    setTargetFacultyId(cls.facultyId || '');
    setIsReassignOpen(true);
  };

  const handleSaveReassignment = async () => {
    if (!selectedClass || !targetFacultyId) return;
    
    try {
      const { error } = await supabase
        .from('class_records')
        .update({ faculty_id: targetFacultyId })
        .eq('class_record_id', selectedClass.id);
      if (error) throw error;

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Faculty Reassignment',
        `Reassigned Prof. ${facultyUsers.find(f => f.id === targetFacultyId)?.firstName} to class ${selectedClass.subjectCode} (${selectedClass.section}).`,
        actorName
      );

      setIsReassignOpen(false);
      setSelectedClass(null);
      loadData();
    } catch (err) {
      console.error('Failed to reassign faculty:', err);
      alert('Failed to reassign faculty: ' + err.message);
    }
  };

  const handleArchiveClass = async (cls) => {
    const message = `Are you sure you want to archive ${cls.subjectCode} - ${cls.section}?\n\nWARNING: Archiving will prevent new enrollments and lock all grades for this section from further edits.`;
    
    if (confirm(message)) {
      try {
        const { error } = await supabase
          .from('class_records')
          .update({ status: 'archived' })
          .eq('class_record_id', cls.id);
        if (error) throw error;

        const actorName = resolveActorName(profile, user);
        await logActivity(
          'Class Archival',
          `Archived classroom record ${cls.subjectCode} (${cls.section}).`,
          actorName
        );
        loadData();
      } catch (err) {
        console.error('Failed to archive class:', err);
        alert('Failed to archive class: ' + err.message);
      }
    }
  };

  // Manage Students Handlers
  const handleOpenManageStudents = (cls) => {
    setSelectedClassForStudents(cls);
    setStudentSearchTerm('');
    setSelectedStudentIdsToEnroll([]);
    setIsManageStudentsOpen(true);
  };

  // Helper to determine if a student is enrolled in the selected class
  const isStudentEnrolled = (student, cls) => {
    if (!cls) return false;
    const manualIds = cls.manualStudentIds || [];
    if (manualIds.includes(student.id)) return true;
    return student.sectionId === cls.sectionId;
  };

  const handleEnrollSelected = async () => {
    if (!selectedClassForStudents || selectedStudentIdsToEnroll.length === 0) return;

    try {
      const inserts = selectedStudentIdsToEnroll.map(id => ({
        student_id: id,
        subject_id: selectedClassForStudents.subjectId,
        section_id: selectedClassForStudents.sectionId
      }));

      const { error } = await supabase
        .from('enrollments')
        .insert(inserts);
      if (error) throw error;

      const actorName = resolveActorName(profile, user);
      for (const id of selectedStudentIdsToEnroll) {
        const stud = allStudents.find(s => s.id === id);
        if (stud) {
          await logActivity(
            'Manual Student Enrollment',
            `Manually enrolled irregular student ${stud.firstName} ${stud.lastName} into class ${selectedClassForStudents.subjectCode} (${selectedClassForStudents.section}).`,
            actorName
          );
        }
      }

      // Update local classroom object in modal
      const newManualIds = [...new Set([...(selectedClassForStudents.manualStudentIds || []), ...selectedStudentIdsToEnroll])];
      setSelectedClassForStudents(prev => ({
        ...prev,
        manualStudentIds: newManualIds,
        enrolledCount: prev.enrolledCount + selectedStudentIdsToEnroll.length
      }));

      setSelectedStudentIdsToEnroll([]);
      loadData();
    } catch (err) {
      console.error('Failed to enroll students:', err);
      alert('Failed to enroll students: ' + err.message);
    }
  };

  const handleRemoveStudent = async (studentId) => {
    if (!selectedClassForStudents) return;

    try {
      const { error } = await supabase
        .from('enrollments')
        .delete()
        .eq('student_id', studentId)
        .eq('subject_id', selectedClassForStudents.subjectId)
        .eq('section_id', selectedClassForStudents.sectionId);
      if (error) throw error;

      const actorName = resolveActorName(profile, user);
      const stud = allStudents.find(s => s.id === studentId);
      if (stud) {
        await logActivity(
          'Manual Student Removal',
          `Removed manually enrolled student ${stud.firstName} ${stud.lastName} from class ${selectedClassForStudents.subjectCode} (${selectedClassForStudents.section}).`,
          actorName
        );
      }

      const newManualIds = (selectedClassForStudents.manualStudentIds || []).filter(id => id !== studentId);
      setSelectedClassForStudents(prev => ({
        ...prev,
        manualStudentIds: newManualIds,
        enrolledCount: prev.enrolledCount - 1
      }));

      loadData();
    } catch (err) {
      console.error('Failed to remove student:', err);
      alert('Failed to remove student: ' + err.message);
    }
  };

  const toggleStudentSelection = (studentId) => {
    setSelectedStudentIdsToEnroll(prev => 
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
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

  // Derived lists for Manage Students Modal
  const currentlyEnrolledList = allStudents
    .filter(s => isStudentEnrolled(s, selectedClassForStudents))
    .sort((a, b) => {
      const aIsBlock = a.sectionId === selectedClassForStudents?.sectionId || 
        (a.section && a.section === selectedClassForStudents?.section && a.section !== 'Irregular');
      const bIsBlock = b.sectionId === selectedClassForStudents?.sectionId || 
        (b.section && b.section === selectedClassForStudents?.section && b.section !== 'Irregular');
      
      if (!aIsBlock && bIsBlock) return -1;
      if (aIsBlock && !bIsBlock) return 1;
      
      const nameA = `${a.lastName || ''}, ${a.firstName || ''}`.toLowerCase();
      const nameB = `${b.lastName || ''}, ${b.firstName || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  
  const searchResultsList = allStudents.filter(s => {
    // Must NOT be enrolled
    if (isStudentEnrolled(s, selectedClassForStudents)) return false;
    
    // Only show irregular or unassigned students
    const isIrregular = s.section === 'Irregular' || !s.section;
    if (!isIrregular) return false;
    
    // Matches search input (name or email)
    const matchesQuery = 
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearchTerm.toLowerCase());
      
    return matchesQuery;
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
                                onClick={() => handleOpenManageStudents(cls)}
                                title="Manage Students"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-100 rounded-md transition-colors flex items-center gap-1"
                              >
                                <Users className="h-4 w-4" />
                              </button>
                              
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

      {/* Manage Students Modal */}
      {isManageStudentsOpen && selectedClassForStudents && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full shadow-lg flex flex-col overflow-hidden max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 flex items-center gap-2">
                  <Users className="h-5 w-5 text-sage-600" /> Manage Classroom Students
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {selectedClassForStudents.subjectCode} - {selectedClassForStudents.section} ({selectedClassForStudents.subjectName})
                </p>
              </div>
              <button 
                onClick={() => setIsManageStudentsOpen(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              
              {/* Enrolled Students Ledger */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Currently Enrolled Students ({currentlyEnrolledList.length})</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2 text-left font-mono">Student ID</th>
                        <th className="px-4 py-2 text-left">Full Name</th>
                        <th className="px-4 py-2 text-center">Home Section</th>
                        <th className="px-4 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100 font-medium">
                       {currentlyEnrolledList.map((stud) => {
                        const isBlockStudent = stud.sectionId === selectedClassForStudents.sectionId || (stud.section && stud.section === selectedClassForStudents.section && stud.section !== 'Irregular');
                        return (
                          <tr key={stud.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-mono text-slate-655">{stud.userNumber || 'N/A'}</td>
                            <td className="px-4 py-2.5 text-slate-900">{stud.lastName}, {stud.firstName}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                stud.section === 'Irregular' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-100 text-slate-650'
                              }`}>
                                {stud.section || 'Irregular'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isBlockStudent ? (
                                <span className="text-[10px] text-slate-400 italic">Block Section</span>
                              ) : (
                                <button 
                                  onClick={() => handleRemoveStudent(stud.id)}
                                  className="text-rose-600 hover:text-rose-800 text-xs font-bold flex items-center gap-0.5 ml-auto hover:underline"
                                  title="Unenroll student"
                                >
                                  <UserMinus className="h-3.5 w-3.5" /> Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {currentlyEnrolledList.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No students currently enrolled.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Enroll Irregular / Manual Students Registry */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Enroll New Students</h4>
                  <div className="relative max-w-xs w-full">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                      <Search className="h-3.5 w-3.5 text-slate-450" />
                    </div>
                    <input 
                      type="text"
                      value={studentSearchTerm}
                      onChange={(e) => setStudentSearchTerm(e.target.value)}
                      placeholder="Search name, ID or section..."
                      className="block w-full pl-8 pr-3 py-1.5 border border-slate-250 rounded-lg text-xs bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none"
                    />
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2 w-10 text-center">Select</th>
                        <th className="px-4 py-2 text-left font-mono">Student ID</th>
                        <th className="px-4 py-2 text-left">Full Name</th>
                        <th className="px-4 py-2 text-center">Home Section</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100 font-medium">
                      {searchResultsList.map((stud) => (
                        <tr key={stud.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-center">
                            <input 
                              type="checkbox"
                              checked={selectedStudentIdsToEnroll.includes(stud.id)}
                              onChange={() => toggleStudentSelection(stud.id)}
                              className="w-3.5 h-3.5 text-sage-600 border-slate-350 rounded focus:ring-sage-500"
                            />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-650">{stud.userNumber || 'N/A'}</td>
                          <td className="px-4 py-2.5 text-slate-800">{stud.lastName}, {stud.firstName}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              stud.section === 'Irregular' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {stud.section || 'Irregular'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {searchResultsList.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No students available matching your search criteria.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">
                {selectedStudentIdsToEnroll.length} selected for enrollment
              </span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsManageStudentsOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={handleEnrollSelected}
                  disabled={selectedStudentIdsToEnroll.length === 0}
                  className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                >
                  <UserPlus className="h-4 w-4" /> Enroll Selected
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

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
