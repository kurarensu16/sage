import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Search, Plus, UserCheck, Archive, X, Check, AlertTriangle, 
  BookOpen, Users, UserPlus, UserMinus, MoreVertical, RotateCcw,
  Filter, CheckCircle2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function SubjectAssignmentList() {
  const { user, profile } = useAuth();
  const [classrooms, setClassrooms] = useState([]);
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState('active'); // active | archived
  const [activeDropdownId, setActiveDropdownId] = useState(null);
  const [confirmModalConfig, setConfirmModalConfig] = useState(null);

  // Advanced Filters State
  const [selectedSchoolYear, setSelectedSchoolYear] = useState('all');
  const [selectedSemester, setSelectedSemester] = useState('all');
  const [selectedYearLevel, setSelectedYearLevel] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [selectedFacultyFilter, setSelectedFacultyFilter] = useState('all');
  const [selectedEnrollmentFilter, setSelectedEnrollmentFilter] = useState('all');

  // Reassignment Modal State
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [targetFacultyId, setTargetFacultyId] = useState('');

  // Manage Students Modal State
  const [isManageStudentsOpen, setIsManageStudentsOpen] = useState(false);
  const [selectedClassForStudents, setSelectedClassForStudents] = useState(null);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [allStudents, setAllStudents] = useState([]);
  const [_enrollments, setEnrollments] = useState([]);
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
          schoolYear: c.school_year || '',
          semester: c.semester || '',
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

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (activeDropdownId && !e.target.closest('.dropdown-trigger') && !e.target.closest('.dropdown-menu')) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [activeDropdownId]);

  const handleOpenReassign = (cls) => {
    setSelectedClass(cls);
    setTargetFacultyId(cls.facultyId || '');
    setIsReassignOpen(true);
  };

  const executeSaveReassignment = async () => {
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

  const triggerReassignConfirm = () => {
    if (!selectedClass || !targetFacultyId) return;
    const targetFac = facultyUsers.find(f => f.id === targetFacultyId);
    
    setConfirmModalConfig({
      title: 'Confirm Faculty Reassignment',
      message: (
        <span>
          Are you sure you want to reassign{' '}
          <strong className="text-slate-800 font-semibold">Prof. {targetFac?.firstName} {targetFac?.lastName}</strong> to teach{' '}
          <strong className="text-slate-800 font-semibold">{selectedClass.subjectCode} ({selectedClass.section})</strong>?
        </span>
      ),
      confirmText: 'Confirm Assignment',
      confirmBg: 'bg-sage-600 hover:bg-sage-700 focus:ring-sage-500',
      icon: <UserCheck className="h-6 w-6 text-sage-600" />,
      iconBg: 'bg-sage-50',
      onConfirm: async () => {
        setConfirmModalConfig(null);
        await executeSaveReassignment();
      }
    });
  };

  const triggerArchiveConfirm = (cls) => {
    setConfirmModalConfig({
      title: 'Archive Classroom',
      message: (
        <span>
          Are you sure you want to archive{' '}
          <strong className="text-slate-800 font-semibold">{cls.subjectCode} &mdash; {cls.section}</strong>? It will no longer appear on active teacher dashboards.
        </span>
      ),
      confirmText: 'Archive Class',
      confirmBg: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500',
      icon: <Archive className="h-6 w-6 text-rose-600" />,
      iconBg: 'bg-rose-50',
      onConfirm: async () => {
        setConfirmModalConfig(null);
        try {
          const { error } = await supabase
            .from('class_records')
            .update({ status: 'archived' })
            .eq('class_record_id', cls.id);
          if (error) throw error;

          const actorName = resolveActorName(profile, user);
          await logActivity(
            'Classroom Archived',
            `Archived classroom ${cls.subjectCode} (${cls.section}).`,
            actorName
          );

          loadData();
        } catch (err) {
          console.error('Failed to archive class:', err);
          alert('Failed to archive classroom: ' + err.message);
        }
      }
    });
  };

  const triggerRestoreConfirm = (cls) => {
    setConfirmModalConfig({
      title: 'Restore Classroom',
      message: (
        <span>
          Restore <strong className="text-slate-800 font-semibold">{cls.subjectCode} &mdash; {cls.section}</strong> to active status?
        </span>
      ),
      confirmText: 'Restore Class',
      confirmBg: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
      icon: <RotateCcw className="h-6 w-6 text-emerald-600" />,
      iconBg: 'bg-emerald-50',
      onConfirm: async () => {
        setConfirmModalConfig(null);
        try {
          const { error } = await supabase
            .from('class_records')
            .update({ status: 'active' })
            .eq('class_record_id', cls.id);
          if (error) throw error;

          const actorName = resolveActorName(profile, user);
          await logActivity(
            'Classroom Restored',
            `Restored classroom ${cls.subjectCode} (${cls.section}) to active status.`,
            actorName
          );

          loadData();
        } catch (err) {
          console.error('Failed to restore class:', err);
          alert('Failed to restore classroom: ' + err.message);
        }
      }
    });
  };

  // Manage Students Modal Handlers
  const handleOpenManageStudents = (cls) => {
    setSelectedClassForStudents(cls);
    setStudentSearchTerm('');
    setSelectedStudentIdsToEnroll([]);
    setIsManageStudentsOpen(true);
  };

  const isStudentEnrolled = (student, cls) => {
    if (!cls) return false;
    // 1. Regular block student: section matches class section
    if (student.sectionId && student.sectionId === cls.sectionId) return true;
    if (student.section && student.section === cls.section && student.section !== 'Irregular') return true;
    // 2. Manual subject enrollment
    if (cls.manualStudentIds && cls.manualStudentIds.includes(student.id)) return true;
    return false;
  };

  const executeEnrollSelected = async () => {
    if (!selectedClassForStudents || selectedStudentIdsToEnroll.length === 0) return;

    try {
      // Create enrollments rows
      const rows = selectedStudentIdsToEnroll.map(studId => ({
        student_id: studId,
        subject_id: selectedClassForStudents.subjectId,
        section_id: selectedClassForStudents.sectionId,
        enrollment_date: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('enrollments')
        .upsert(rows, { onConflict: 'student_id,subject_id,section_id' });
      if (error) throw error;

      const actorName = resolveActorName(profile, user);
      for (const studId of selectedStudentIdsToEnroll) {
        const stud = allStudents.find(s => s.id === studId);
        if (stud) {
          await logActivity(
            'Manual Student Enrollment',
            `Manually enrolled irregular student ${stud.firstName} ${stud.lastName} into class ${selectedClassForStudents.subjectCode} (${selectedClassForStudents.section}).`,
            actorName
          );
        }
      }

      setSelectedStudentIdsToEnroll([]);
      loadData();
      setIsManageStudentsOpen(false);
    } catch (err) {
      console.error('Failed to enroll students:', err);
      alert('Failed to enroll students: ' + err.message);
    }
  };

  const triggerEnrollSelectedConfirm = () => {
    if (!selectedClassForStudents || selectedStudentIdsToEnroll.length === 0) return;
    setConfirmModalConfig({
      title: 'Enroll Students to Classroom',
      message: (
        <span>
          Are you sure you want to enroll the <strong className="text-slate-800 font-semibold">{selectedStudentIdsToEnroll.length} selected student(s)</strong> into{' '}
          <strong className="text-slate-800 font-semibold">{selectedClassForStudents.subjectCode} ({selectedClassForStudents.section})</strong>?
        </span>
      ),
      confirmText: 'Confirm Enrollment',
      confirmBg: 'bg-sage-600 hover:bg-sage-700 focus:ring-sage-500',
      icon: <UserPlus className="h-6 w-6 text-sage-600" />,
      iconBg: 'bg-sage-50',
      onConfirm: async () => {
        setConfirmModalConfig(null);
        await executeEnrollSelected();
      }
    });
  };

  const executeRemoveStudent = async (studentId) => {
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

      loadData();
    } catch (err) {
      console.error('Failed to remove student:', err);
      alert('Failed to remove student: ' + err.message);
    }
  };

  const triggerRemoveStudentConfirm = (studentId) => {
    if (!selectedClassForStudents) return;
    const stud = allStudents.find(s => s.id === studentId);
    
    setConfirmModalConfig({
      title: 'Remove Student from Classroom',
      message: (
        <span>
          Are you sure you want to drop{' '}
          <strong className="text-slate-800 font-semibold">{stud?.firstName} {stud?.lastName}</strong> from{' '}
          <strong className="text-slate-800 font-semibold">{selectedClassForStudents.subjectCode} ({selectedClassForStudents.section})</strong>?
        </span>
      ),
      confirmText: 'Remove Student',
      confirmBg: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500',
      icon: <UserMinus className="h-6 w-6 text-rose-600" />,
      iconBg: 'bg-rose-50',
      onConfirm: async () => {
        setConfirmModalConfig(null);
        await executeRemoveStudent(studentId);
      }
    });
  };

  const toggleStudentSelection = (studentId) => {
    setSelectedStudentIdsToEnroll(prev => 
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  // Helper to extract year level from section name (e.g. BSIT-1A -> 1st Year)
  const getYearLevelFromSection = (sectionName) => {
    if (!sectionName) return null;
    const match = sectionName.match(/[1-4]/);
    if (match) {
      const digit = match[0];
      const suffix = digit === '1' ? 'st' : digit === '2' ? 'nd' : digit === '3' ? 'rd' : 'th';
      return `${digit}${suffix} Year`;
    }
    return null;
  };

  // Dynamic filter options derived from loaded classrooms
  const availableSchoolYears = useMemo(() => {
    const years = [...new Set(classrooms.map(c => c.schoolYear).filter(Boolean))];
    return years.sort().reverse();
  }, [classrooms]);

  const availableSections = useMemo(() => {
    const secs = [...new Set(classrooms.map(c => c.section).filter(Boolean))];
    return secs.sort();
  }, [classrooms]);

  const availableFaculty = useMemo(() => {
    const map = new Map();
    classrooms.forEach(c => {
      if (c.facultyId && c.facultyName && c.facultyName !== 'Unassigned') {
        map.set(c.facultyId, c.facultyName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [classrooms]);

  // Filter classrooms multi-criteria
  const filteredClassrooms = useMemo(() => {
    return classrooms.filter(cls => {
      // 1. Status Tab (Active vs Archived)
      if (cls.status !== statusTab) return false;

      // 2. Search Term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesSearch = 
          cls.subjectCode.toLowerCase().includes(query) ||
          cls.subjectName.toLowerCase().includes(query) ||
          cls.section.toLowerCase().includes(query) ||
          cls.facultyName.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // 3. School Year
      if (selectedSchoolYear !== 'all' && cls.schoolYear !== selectedSchoolYear) {
        return false;
      }

      // 4. Semester
      if (selectedSemester !== 'all' && cls.semester !== selectedSemester) {
        return false;
      }

      // 5. Year Level
      if (selectedYearLevel !== 'all') {
        const yl = getYearLevelFromSection(cls.section);
        if (yl !== selectedYearLevel) return false;
      }

      // 6. Section
      if (selectedSection !== 'all' && cls.section !== selectedSection) {
        return false;
      }

      // 7. Faculty Filter
      if (selectedFacultyFilter === 'unassigned' && cls.facultyName !== 'Unassigned') {
        return false;
      }
      if (selectedFacultyFilter === 'assigned' && cls.facultyName === 'Unassigned') {
        return false;
      }
      if (selectedFacultyFilter !== 'all' && selectedFacultyFilter !== 'assigned' && selectedFacultyFilter !== 'unassigned') {
        if (cls.facultyId !== selectedFacultyFilter) return false;
      }

      // 8. Enrollment Filter
      if (selectedEnrollmentFilter === 'with_students' && cls.enrolledCount === 0) {
        return false;
      }
      if (selectedEnrollmentFilter === 'empty' && cls.enrolledCount > 0) {
        return false;
      }

      return true;
    });
  }, [
    classrooms,
    statusTab,
    searchTerm,
    selectedSchoolYear,
    selectedSemester,
    selectedYearLevel,
    selectedSection,
    selectedFacultyFilter,
    selectedEnrollmentFilter
  ]);

  // Has any active filter check
  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm.trim() !== '' ||
      selectedSchoolYear !== 'all' ||
      selectedSemester !== 'all' ||
      selectedYearLevel !== 'all' ||
      selectedSection !== 'all' ||
      selectedFacultyFilter !== 'all' ||
      selectedEnrollmentFilter !== 'all'
    );
  }, [
    searchTerm,
    selectedSchoolYear,
    selectedSemester,
    selectedYearLevel,
    selectedSection,
    selectedFacultyFilter,
    selectedEnrollmentFilter
  ]);

  const resetAllFilters = () => {
    setSearchTerm('');
    setSelectedSchoolYear('all');
    setSelectedSemester('all');
    setSelectedYearLevel('all');
    setSelectedSection('all');
    setSelectedFacultyFilter('all');
    setSelectedEnrollmentFilter('all');
  };

  // Metrics summary for the currently filtered view
  const metrics = useMemo(() => {
    const total = filteredClassrooms.length;
    const assigned = filteredClassrooms.filter(c => c.facultyName !== 'Unassigned').length;
    const unassigned = total - assigned;
    const totalEnrolled = filteredClassrooms.reduce((sum, c) => sum + (c.enrolledCount || 0), 0);
    return { total, assigned, unassigned, totalEnrolled };
  }, [filteredClassrooms]);

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
      <PageHeader title="Subject Assignments" breadcrumb="College Office Portal">
        <Link 
          to="/office/subjectassignmentform" 
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Create Classroom
        </Link>
      </PageHeader>

      <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Top Control Bar: Search & Status Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-9 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors shadow-2xs" 
              placeholder="Search code, subject, section, or teacher..." 
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 shadow-2xs">
            <button 
              onClick={() => setStatusTab('active')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                statusTab === 'active' ? 'bg-sage-50 text-sage-800 border border-sage-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Classes
            </button>
            <button 
              onClick={() => setStatusTab('archived')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                statusTab === 'archived' ? 'bg-sage-50 text-sage-800 border border-sage-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Archived Records
            </button>
          </div>
        </div>

        {/* ── ADVANCED FILTERS PANEL ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-sage-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                Classroom Filters
              </span>
              {hasActiveFilters && (
                <span className="text-[10px] font-bold text-sage-700 bg-sage-50 border border-sage-200 px-2 py-0.5 rounded-full font-mono">
                  Filtered
                </span>
              )}
            </div>

            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            
            {/* Filter 1: School Year */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide">
                School Year
              </label>
              <select
                value={selectedSchoolYear}
                onChange={(e) => setSelectedSchoolYear(e.target.value)}
                className="w-full text-xs bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-800 outline-none focus:border-sage-500 transition-colors"
              >
                <option value="all">All School Years</option>
                {availableSchoolYears.map(sy => (
                  <option key={sy} value={sy}>AY {sy}</option>
                ))}
              </select>
            </div>

            {/* Filter 2: Semester */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide">
                Semester
              </label>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="w-full text-xs bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-800 outline-none focus:border-sage-500 transition-colors"
              >
                <option value="all">All Semesters</option>
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="Summer">Summer Term</option>
              </select>
            </div>

            {/* Filter 3: Year Level */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide">
                Year Level
              </label>
              <select
                value={selectedYearLevel}
                onChange={(e) => setSelectedYearLevel(e.target.value)}
                className="w-full text-xs bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-800 outline-none focus:border-sage-500 transition-colors"
              >
                <option value="all">All Year Levels</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
              </select>
            </div>

            {/* Filter 4: Section */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide">
                Section
              </label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full text-xs bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-800 outline-none focus:border-sage-500 transition-colors"
              >
                <option value="all">All Sections</option>
                {availableSections.map(sec => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
            </div>

            {/* Filter 5: Faculty Assignment */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide">
                Faculty Assignment
              </label>
              <select
                value={selectedFacultyFilter}
                onChange={(e) => setSelectedFacultyFilter(e.target.value)}
                className="w-full text-xs bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-800 outline-none focus:border-sage-500 transition-colors"
              >
                <option value="all">All Faculty</option>
                <option value="assigned">✓ Assigned Faculty Only</option>
                <option value="unassigned">⚠️ Unassigned Only (Needs Teacher)</option>
                <optgroup label="Specific Instructors">
                  {availableFaculty.map(f => (
                    <option key={f.id} value={f.id}>Prof. {f.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Filter 6: Enrolled Students */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide">
                Roster Load
              </label>
              <select
                value={selectedEnrollmentFilter}
                onChange={(e) => setSelectedEnrollmentFilter(e.target.value)}
                className="w-full text-xs bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-800 outline-none focus:border-sage-500 transition-colors"
              >
                <option value="all">All Class Sizes</option>
                <option value="with_students">With Enrolled Students (&gt; 0)</option>
                <option value="empty">Empty Roster (0 Enrolled)</option>
              </select>
            </div>

          </div>
        </div>

        {/* ── QUICK METRICS COUNTER BAR ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Matching Classes</span>
              <span className="text-base font-bold font-mono text-slate-900">{metrics.total}</span>
            </div>
            <BookOpen className="h-5 w-5 text-slate-400" />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Faculty</span>
              <span className="text-base font-bold font-mono text-emerald-700">{metrics.assigned}</span>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Unassigned (Alert)</span>
              <span className={`text-base font-bold font-mono ${metrics.unassigned > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                {metrics.unassigned}
              </span>
            </div>
            <AlertTriangle className={`h-5 w-5 ${metrics.unassigned > 0 ? 'text-amber-500' : 'text-slate-300'}`} />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Enrolled</span>
              <span className="text-base font-bold font-mono text-indigo-700">{metrics.totalEnrolled}</span>
            </div>
            <Users className="h-5 w-5 text-indigo-400" />
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
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Term</th>
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                          {cls.section}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                        {cls.schoolYear ? `AY ${cls.schoolYear} (${cls.semester} Sem)` : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {cls.facultyName === 'Unassigned' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="h-3 w-3 text-amber-500" /> Unassigned
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 font-medium text-slate-900">
                            <div className="w-6 h-6 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-[10px] flex items-center justify-center font-mono shrink-0">
                              {cls.facultyName.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('')}
                            </div>
                            <span className="truncate">Prof. {cls.facultyName}</span>
                          </div>
                        )}
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
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                        <div className="inline-block text-left">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdownId(activeDropdownId === cls.id ? null : cls.id);
                            }}
                            className="dropdown-trigger p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                            aria-label="Actions"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>

                          {activeDropdownId === cls.id && (
                            <div className="dropdown-menu absolute right-6 mt-1 w-52 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-40 text-left">
                              {cls.status === 'active' ? (
                                <>
                                  <button
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      handleOpenManageStudents(cls);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Users className="h-3.5 w-3.5 text-blue-500" />
                                    Manage Students ({cls.enrolledCount})
                                  </button>

                                  <button
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      handleOpenReassign(cls);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <UserCheck className="h-3.5 w-3.5 text-sage-600" />
                                    Reassign Faculty
                                  </button>

                                  <div className="border-t border-slate-100 my-1"></div>

                                  <button
                                    onClick={() => triggerArchiveConfirm(cls)}
                                    className="w-full text-left px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50/50 flex items-center gap-2"
                                  >
                                    <Archive className="h-3.5 w-3.5 text-rose-500" />
                                    Archive Classroom
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => triggerRestoreConfirm(cls)}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50/50 flex items-center gap-2"
                                >
                                  <RotateCcw className="h-3.5 w-3.5 text-emerald-500" />
                                  Restore Classroom
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-500">
                      <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-700">No classrooms found matching your filters</p>
                      <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or resetting filters.</p>
                      {hasActiveFilters && (
                        <button
                          onClick={resetAllFilters}
                          className="mt-3 px-3 py-1.5 text-xs font-semibold bg-sage-50 text-sage-700 border border-sage-200 rounded-lg hover:bg-sage-100 transition-colors inline-flex items-center gap-1.5"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
                        </button>
                      )}
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
                                  onClick={() => triggerRemoveStudentConfirm(stud.id)}
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
                  onClick={triggerEnrollSelectedConfirm}
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
                const subjectDept = classSubjectObj?.departments?.name || '';
                const facultyDept = targetFacultyObj?.department || '';
                const isMismatched = targetFacultyObj && classSubjectObj && subjectDept && facultyDept && subjectDept !== facultyDept;
                if (!isMismatched) return null;
                return (
                  <div className="bg-amber-50 border border-amber-250 text-amber-800 p-3 rounded-lg text-xs flex items-start gap-2 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Department Mismatch Warning</span>
                      <span className="text-[11px] leading-relaxed block mt-0.5">
                        The subject belongs to "{subjectDept}", but Prof. {targetFacultyObj.firstName} {targetFacultyObj.lastName} belongs to "{facultyDept}".
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
                onClick={triggerReassignConfirm}
                disabled={!targetFacultyId}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <Check className="h-4 w-4" /> Save Reassignment
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Dynamic Action Confirmation Modal */}
      {confirmModalConfig && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5 text-center animate-in zoom-in-95 duration-200 max-w-sm w-full">
            <div className={`mx-auto w-14 h-14 rounded-full ${confirmModalConfig.iconBg} flex items-center justify-center shadow-xs animate-pulse duration-[2000ms]`}>
              {confirmModalConfig.icon}
            </div>
            <div className="space-y-1.5 text-center">
              <h3 className="text-base font-bold text-slate-900 font-display">{confirmModalConfig.title}</h3>
              <div className="text-xs text-slate-500 leading-relaxed font-sans font-medium">
                {confirmModalConfig.message}
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalConfig(null)}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all duration-150 outline-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModalConfig.onConfirm}
                className={`flex-1 px-4 py-2.5 text-xs font-semibold text-white ${confirmModalConfig.confirmBg} rounded-xl shadow-xs transition-all duration-150 transform hover:scale-[1.02] active:scale-[0.98] outline-none cursor-pointer`}
              >
                {confirmModalConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
