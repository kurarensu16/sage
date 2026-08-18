import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Plus, UserCheck, Archive, X, Check, AlertTriangle, BookOpen, Users, UserPlus, UserMinus, Loader2, ChevronDown, ChevronUp, MoreVertical, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function SubjectAssignmentList() {
  const [classrooms, setClassrooms] = useState([]);
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState('active'); // active | archived
  const { user, profile } = useAuth();

  // 3-dot dropdown menu
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // ─── Filter State ──────────────────────────────────────────────────────────
  const [filterCollege, setFilterCollege] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterYearLevel, setFilterYearLevel] = useState('');

  // Reassignment Modal State
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [targetFacultyId, setTargetFacultyId] = useState('');

  // Manage Students Modal State
  const [isStudentsOpen, setIsStudentsOpen] = useState(false);
  const [studentsClass, setStudentsClass] = useState(null);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [unenrolledStudents, setUnenrolledStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedToEnroll, setSelectedToEnroll] = useState([]);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollSuccess, setEnrollSuccess] = useState('');
  const [showEnrolledList, setShowEnrolledList] = useState(false);

  const loadData = async () => {
    try {
      const { data: users } = await supabase
        .from('users')
        .select('*, departments(name)')
        .eq('role', 'faculty');
        
      const mappedFaculties = (users || []).map(u => ({
        id: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        department: u.departments?.name
      }));
      setFacultyUsers(mappedFaculties);

      const { data: subs } = await supabase.from('subjects').select('*, departments(name)');
      setSubjects(subs || []);

      const { data: classes } = await supabase
        .from('class_records')
        .select(`
          class_record_id,
          status,
          faculty_id,
          subject_id,
          section_id,
          subjects ( code, name ),
          sections ( name, department_id, departments(name) ),
          users ( first_name, last_name )
        `)
        .order('created_at', { ascending: false });

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('section_id, subject_id');

      const enrolledCountsMap = {};
      (enrollments || []).forEach(e => {
        const key = `${e.section_id}|${e.subject_id}`;
        enrolledCountsMap[key] = (enrolledCountsMap[key] || 0) + 1;
      });

      const mappedClasses = (classes || []).map(cls => {
        const key = `${cls.section_id}|${cls.subject_id}`;
        const sectionName = cls.sections?.name || '';
        // Derive program prefix (e.g. "BSIT" from "BSIT-1A")
        const programPrefix = sectionName.match(/^([A-Z]+)/)?.[1] || '';
        // Derive year level from the digit in the section name (e.g. "BSIT-1A" → "1st Year")
        const yearDigit = sectionName.match(/-(\d)/)?.[1] || sectionName.match(/(\d)/)?.[1] || '';
        const yearLevelMap = { '1': '1st Year', '2': '2nd Year', '3': '3rd Year', '4': '4th Year' };
        return {
          id: cls.class_record_id,
          subjectCode: cls.subjects?.code,
          subjectName: cls.subjects?.name,
          section: sectionName,
          facultyName: cls.users ? `${cls.users.first_name} ${cls.users.last_name}` : 'Unknown',
          facultyId: cls.faculty_id,
          enrolledCount: enrolledCountsMap[key] || 0,
          status: cls.status,
          section_id: cls.section_id,
          subject_id: cls.subject_id,
          // filter fields
          college: cls.sections?.departments?.name || '',
          programPrefix,
          yearLevel: yearLevelMap[yearDigit] || ''
        };
      });
      setClassrooms(mappedClasses);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ─── Reassign Faculty ───────────────────────────────────────────────────────
  const handleOpenReassign = (cls) => {
    setSelectedClass(cls);
    setTargetFacultyId(cls.facultyId || '');
    setIsReassignOpen(true);
  };

  const handleSaveReassignment = async () => {
    if (!selectedClass || !targetFacultyId) return;

    const prevFacultyName = selectedClass.facultyName;
    const newFaculty = facultyUsers.find(f => f.id === targetFacultyId);
    const newFacultyName = newFaculty ? `${newFaculty.firstName} ${newFaculty.lastName}` : 'Unknown';
    
    await supabase.from('class_records').update({ faculty_id: targetFacultyId }).eq('class_record_id', selectedClass.id);

    const actorName = resolveActorName(profile, user);
    await logActivity(
      'Faculty Reassignment',
      `Reassigned classroom ${selectedClass.subjectCode} – ${selectedClass.section} from ${prevFacultyName} to ${newFacultyName}.`,
      actorName
    );

    setIsReassignOpen(false);
    setSelectedClass(null);
    loadData();
  };

  // ─── Archive ────────────────────────────────────────────────────────────────
  const handleArchiveClass = async (cls) => {
    const message = `Are you sure you want to archive ${cls.subjectCode} - ${cls.section}?\n\nWARNING: Archiving will prevent new enrollments and lock all grades for this section from further edits.`;
    
    if (confirm(message)) {
      await supabase.from('class_records').update({ status: 'archived' }).eq('class_record_id', cls.id);

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Classroom Archive',
        `Archived classroom ${cls.subjectCode} – ${cls.section} (Instructor: ${cls.facultyName}).`,
        actorName
      );

      loadData();
    }
  };

  // ─── Manage Students ────────────────────────────────────────────────────────
  const handleOpenStudents = async (cls) => {
    setStudentsClass(cls);
    setSelectedToEnroll([]);
    setEnrollSuccess('');
    setShowEnrolledList(false);
    setIsStudentsOpen(true);
    setStudentsLoading(true);

    try {
      // Fetch currently enrolled student IDs for this class
      const { data: enrollData, error: enrollErr } = await supabase
        .from('enrollments')
        .select('student_id, users!student_id ( user_id, first_name, last_name, email, user_number )')
        .eq('section_id', cls.section_id)
        .eq('subject_id', cls.subject_id);

      if (enrollErr) throw enrollErr;

      const enrolledIds = new Set((enrollData || []).map(e => e.student_id));
      const enrolled = (enrollData || []).map(e => ({
        id: e.users?.user_id,
        name: e.users ? `${e.users.last_name}, ${e.users.first_name}` : 'Unknown',
        email: e.users?.email || '',
        userNumber: e.users?.user_number || ''
      })).sort((a, b) => a.name.localeCompare(b.name));

      setEnrolledStudents(enrolled);

      // Fetch ALL active students in the same section
      const { data: sectionStudents, error: secErr } = await supabase
        .from('users')
        .select('user_id, first_name, last_name, email, user_number')
        .eq('role', 'student')
        .eq('status', 'active')
        .eq('section_id', cls.section_id);

      if (secErr) throw secErr;

      // Only those NOT already enrolled
      const unenrolled = (sectionStudents || [])
        .filter(s => !enrolledIds.has(s.user_id))
        .map(s => ({
          id: s.user_id,
          name: `${s.last_name}, ${s.first_name}`,
          email: s.email || '',
          userNumber: s.user_number || ''
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setUnenrolledStudents(unenrolled);
    } catch (err) {
      console.error('Error loading students:', err);
    } finally {
      setStudentsLoading(false);
    }
  };

  const toggleSelectStudent = (id) => {
    setSelectedToEnroll(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedToEnroll.length === unenrolledStudents.length) {
      setSelectedToEnroll([]);
    } else {
      setSelectedToEnroll(unenrolledStudents.map(s => s.id));
    }
  };

  const handleEnrollSelected = async () => {
    if (!studentsClass || selectedToEnroll.length === 0) return;
    setEnrolling(true);
    setEnrollSuccess('');

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const currentAdminId = currentUser?.id || null;

      const records = selectedToEnroll.map(studentId => ({
        student_id: studentId,
        section_id: studentsClass.section_id,
        subject_id: studentsClass.subject_id,
        imported_by: currentAdminId
      }));

      const { error } = await supabase.from('enrollments').insert(records);
      if (error) throw error;

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Student Enrollment',
        `Manually enrolled ${records.length} student(s) into ${studentsClass.subjectCode} – ${studentsClass.section}.`,
        actorName
      );

      setEnrollSuccess(`${records.length} student(s) successfully enrolled!`);
      setSelectedToEnroll([]);

      // Refresh the student lists inside the modal
      await handleOpenStudents(studentsClass);
      // Refresh count in the table
      loadData();
    } catch (err) {
      console.error('Enrollment error:', err);
    } finally {
      setEnrolling(false);
    }
  };

  // ─── Filtering ──────────────────────────────────────────────────────────────
  // Unique filter options derived from loaded data
  const uniqueColleges = [...new Set(classrooms.map(c => c.college).filter(Boolean))].sort();
  const uniquePrograms = [...new Set(classrooms.map(c => c.programPrefix).filter(Boolean))].sort();
  const yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  const activeFilterCount = [filterCollege, filterProgram, filterYearLevel].filter(Boolean).length;

  const clearFilters = () => {
    setFilterCollege('');
    setFilterProgram('');
    setFilterYearLevel('');
  };

  const filteredClassrooms = classrooms.filter(cls => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      cls.subjectCode?.toLowerCase().includes(q) ||
      cls.subjectName?.toLowerCase().includes(q) ||
      cls.section?.toLowerCase().includes(q) ||
      cls.facultyName?.toLowerCase().includes(q);

    const matchesTab      = cls.status === statusTab;
    const matchesCollege  = !filterCollege  || cls.college      === filterCollege;
    const matchesProgram  = !filterProgram  || cls.programPrefix === filterProgram;
    const matchesYearLvl  = !filterYearLevel || cls.yearLevel   === filterYearLevel;

    return matchesSearch && matchesTab && matchesCollege && matchesProgram && matchesYearLvl;
  });

  return (
    <>
      <PageHeader title="Subject Assignments" breadcrumb="College Office Portal">
        <Link 
          to="/office/subjectassignmentform" 
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

        {/* ── Filter Bar ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter by
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-sage-600 text-white text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* College */}
          <div className="flex flex-col gap-0.5 min-w-[180px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">College</span>
            <select
              value={filterCollege}
              onChange={e => { setFilterCollege(e.target.value); setFilterProgram(''); }}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Colleges</option>
              {uniqueColleges.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Program */}
          <div className="flex flex-col gap-0.5 min-w-[140px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Program</span>
            <select
              value={filterProgram}
              onChange={e => setFilterProgram(e.target.value)}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Programs</option>
              {uniquePrograms
                .filter(p => !filterCollege || classrooms.some(c => c.college === filterCollege && c.programPrefix === p))
                .map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
            </select>
          </div>

          {/* Year Level */}
          <div className="flex flex-col gap-0.5 min-w-[130px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Year Level</span>
            <select
              value={filterYearLevel}
              onChange={e => setFilterYearLevel(e.target.value)}
              className="bg-white border border-slate-200 hover:border-sage-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-1 focus:ring-sage-400 focus:border-sage-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Year Levels</option>
              {yearLevels.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Clear + result count */}
          <div className="ml-auto flex items-center gap-3">
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors"
              >
                <X className="h-3 w-3" /> Clear Filters
              </button>
            )}
            <span className="text-xs text-slate-400 font-mono">
              {filteredClassrooms.length} / {classrooms.filter(c => c.status === statusTab).length} shown
            </span>
          </div>
        </div>

        {/* Classrooms Table */}
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
                        <div className="flex justify-end" ref={openMenuId === cls.id ? menuRef : null}>
                          {cls.status === 'active' ? (
                            <div className="relative">
                              {/* 3-dot trigger */}
                              <button
                                onClick={() => setOpenMenuId(openMenuId === cls.id ? null : cls.id)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                title="Actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>

                              {/* Dropdown */}
                              {openMenuId === cls.id && (
                                <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                                  <div className="px-3 py-2 border-b border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cls.subjectCode} — {cls.section}</p>
                                  </div>
                                  <div className="py-1">
                                    <button
                                      onClick={() => { setOpenMenuId(null); handleOpenStudents(cls); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left"
                                    >
                                      <Users className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                      Manage Students
                                    </button>
                                    <button
                                      onClick={() => { setOpenMenuId(null); handleOpenReassign(cls); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-sage-50 hover:text-sage-700 transition-colors text-left"
                                    >
                                      <UserCheck className="h-4 w-4 text-sage-500 flex-shrink-0" />
                                      Reassign Faculty
                                    </button>
                                    <div className="my-1 border-t border-slate-100" />
                                    <button
                                      onClick={() => { setOpenMenuId(null); handleArchiveClass(cls); }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors text-left"
                                    >
                                      <Archive className="h-4 w-4 flex-shrink-0" />
                                      Archive Classroom
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
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

      {/* ── Manage Students Modal ─────────────────────────────────────────── */}
      {isStudentsOpen && studentsClass && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" /> Manage Enrolled Students
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {studentsClass.subjectCode} — {studentsClass.section}
                </p>
              </div>
              <button 
                onClick={() => { setIsStudentsOpen(false); setStudentsClass(null); }}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {studentsLoading ? (
              <div className="flex-1 flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 text-sage-500 animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* Success banner */}
                {enrollSuccess && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-4 py-3 rounded-lg flex items-center gap-2">
                    <Check className="h-4 w-4 flex-shrink-0" />
                    {enrollSuccess}
                  </div>
                )}

                {/* ── Unenrolled Students (New) ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <UserPlus className="h-4 w-4 text-blue-500" />
                        Students Not Yet Enrolled
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                          {unenrolledStudents.length}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Active students in {studentsClass.section} missing from this class record.
                      </p>
                    </div>
                  </div>

                  {unenrolledStudents.length === 0 ? (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-5 text-center">
                      <Check className="h-5 w-5 text-emerald-500 mx-auto mb-1.5" />
                      <p className="text-sm font-semibold text-emerald-700">All section students are enrolled</p>
                      <p className="text-xs text-emerald-600 mt-0.5">No missing students detected for this class.</p>
                    </div>
                  ) : (
                    <>
                      {/* Select all bar */}
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-t-lg border-b-0">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedToEnroll.length === unenrolledStudents.length && unenrolledStudents.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-slate-600">
                            {selectedToEnroll.length === 0
                              ? 'Select all'
                              : `${selectedToEnroll.length} of ${unenrolledStudents.length} selected`}
                          </span>
                        </label>
                      </div>

                      {/* Student rows */}
                      <div className="border border-slate-200 rounded-b-lg overflow-hidden divide-y divide-slate-100">
                        {unenrolledStudents.map(s => (
                          <label
                            key={s.id}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                              selectedToEnroll.includes(s.id) ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedToEnroll.includes(s.id)}
                              onChange={() => toggleSelectStudent(s.id)}
                              className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                              <p className="text-xs text-slate-400 font-mono truncate">{s.userNumber || s.email}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* ── Currently Enrolled ── */}
                <div>
                  <button
                    onClick={() => setShowEnrolledList(v => !v)}
                    className="flex items-center justify-between w-full text-left group"
                  >
                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                      <UserMinus className="h-4 w-4 text-slate-400" />
                      Currently Enrolled
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200">
                        {enrolledStudents.length}
                      </span>
                    </h4>
                    {showEnrolledList
                      ? <ChevronUp className="h-4 w-4 text-slate-400" />
                      : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </button>

                  {showEnrolledList && (
                    <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                      {enrolledStudents.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center py-4">No students enrolled yet.</p>
                      ) : (
                        enrolledStudents.map(s => (
                          <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                            <div className="w-5 h-5 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-[9px] flex items-center justify-center font-mono flex-shrink-0">
                              {s.name.split(',')[0]?.[0] || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                              <p className="text-xs text-slate-400 font-mono truncate">{s.userNumber || s.email}</p>
                            </div>
                            <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
              <p className="text-xs text-slate-400">
                {unenrolledStudents.length > 0
                  ? `${unenrolledStudents.length} student(s) found outside this class record.`
                  : 'All section students are enrolled.'}
              </p>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => { setIsStudentsOpen(false); setStudentsClass(null); }}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                >
                  Close
                </button>
                {unenrolledStudents.length > 0 && (
                  <button 
                    onClick={handleEnrollSelected}
                    disabled={selectedToEnroll.length === 0 || enrolling}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                  >
                    {enrolling
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Enrolling...</>
                      : <><UserPlus className="h-4 w-4" /> Enroll {selectedToEnroll.length > 0 ? `(${selectedToEnroll.length})` : 'Selected'}</>
                    }
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Reassignment Modal ────────────────────────────────────────────── */}
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

              {(() => {
                const classSubjectObj = subjects.find(s => s.code === selectedClass.subjectCode);
                const subjectDeptName = classSubjectObj?.departments?.name || '';
                const filteredReplacementFaculty = facultyUsers.filter(fac => {
                  if (subjectDeptName === 'Department of General Education') {
                    return true;
                  }
                  return !subjectDeptName || fac.department === subjectDeptName;
                });
                const targetFacultyObj = facultyUsers.find(f => f.id === targetFacultyId);
                const isMismatched = targetFacultyObj && subjectDeptName && subjectDeptName !== 'Department of General Education' && targetFacultyObj.department !== subjectDeptName;

                return (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Select Replacement Faculty</label>
                      <select
                        value={targetFacultyId}
                        onChange={(e) => setTargetFacultyId(e.target.value)}
                        className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3.5 py-2.5 rounded-lg text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer"
                      >
                        <option value="">Select faculty member...</option>
                        {filteredReplacementFaculty.map((fac) => (
                          <option key={fac.id} value={fac.id}>
                            Prof. {fac.firstName} {fac.lastName} ({fac.department})
                          </option>
                        ))}
                      </select>
                    </div>

                    {isMismatched && (
                      <div className="bg-amber-50 border border-amber-250 text-amber-800 p-3 rounded-lg text-xs flex items-start gap-2 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
                        <AlertTriangle className="h-4.5 w-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block">Department Mismatch Warning</span>
                          <span className="text-[11px] leading-relaxed block mt-0.5">
                            The subject belongs to "{subjectDeptName}", but Prof. {targetFacultyObj.firstName} {targetFacultyObj.lastName} belongs to "{targetFacultyObj.department}".
                          </span>
                        </div>
                      </div>
                    )}
                  </>
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
