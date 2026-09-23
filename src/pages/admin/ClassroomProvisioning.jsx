import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Search, 
  Plus, 
  Copy, 
  Check, 
  Trash2, 
  Users, 
  GraduationCap, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Loader2,
  Filter
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { provisionClassroomByAdmin, getOrCreateJoinCode } from '../../lib/classRoomService';
import { cn } from '../../lib/utils';

function getProgramAbbreviation(program) {
  if (!program) return '';
  if (typeof program === 'object' && program.abbreviation) return program.abbreviation;
  const programName = typeof program === 'string' ? program : (program.name || '');
  if (!programName) return '';
  if (programName.includes('Psychology')) return 'BAPSYCH';
  if (programName.includes('Computer Engineering')) return 'BSCpE';
  if (programName.includes('Human Resource')) return 'BSBA-HRDM';
  if (programName.includes('Financial Management')) return 'BSBA-FM';
  if (programName.includes('Operations Management')) return 'BSBA-OM';
  if (programName.includes('Marketing Management')) return 'BSBA-MM';
  if (programName.includes('Accounting Information')) return 'BSAIS';
  const stopWords = new Set(['of', 'in', 'and', 'for', 'major', 'the']);
  return programName
    .split(/\s+/)
    .filter(w => !stopWords.has(w.toLowerCase()))
    .map(w => w[0].toUpperCase())
    .join('');
}

export default function ClassroomProvisioning() {
  const { user, profile } = useAuth();

  const [classrooms, setClassrooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [academicTerms, setAcademicTerms] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [termFilter, setTermFilter] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedTargetDeptId, setSelectedTargetDeptId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState('2025-2026');
  const [selectedSemester, setSelectedSemester] = useState('1st Semester');
  
  // Program & Year Level Filters for Admin Provisioning
  const [selectedProgramFilter, setSelectedProgramFilter] = useState('');
  const [selectedYearFilter, setSelectedYearFilter] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [successBanner, setSuccessBanner] = useState(null);
  const [copiedCodeMap, setCopiedCodeMap] = useState({});

  // Identify colleges that have degree block sections
  const collegeDeptsWithSections = useMemo(() => {
    return departments.filter(d => sections.some(sec => sec.department_id === d.department_id));
  }, [departments, sections]);
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Base Reference Catalogs
      const [
        { data: deptsData },
        { data: progsData },
        { data: termsData },
        { data: subjectsData },
        { data: sectionsData },
        { data: usersData },
        { data: enrollmentsData },
        { data: joinCodesData },
        { data: postedGradesData }
      ] = await Promise.all([
        supabase.from('departments').select('*').order('name'),
        supabase.from('programs').select('*').order('name'),
        supabase.from('academic_terms').select('*').order('created_at', { ascending: false }),
        supabase.from('subjects').select('subject_id, code, name, units, department_id').order('code'),
        supabase.from('sections').select('section_id, name, department_id, school_year, semester').order('name'),
        supabase.from('users').select('user_id, first_name, last_name, email, role, department_id').eq('role', 'faculty').order('last_name'),
        supabase.from('enrollments').select('subject_id, section_id, student_id'),
        supabase.from('class_room_join_codes').select('class_record_id, join_code, is_active'),
        supabase.from('posted_grades').select('class_record_id')
      ]);

      setDepartments(deptsData || []);
      setPrograms(progsData || []);
      setSubjects(subjectsData || []);
      setSections(sectionsData || []);
      setFacultyUsers(usersData || []);
      setAcademicTerms(termsData || []);

      const active = (termsData || []).find(t => t.is_active) || (termsData || [])[0];
      if (active) {
        setActiveTerm(active);
        setSelectedSchoolYear(active.school_year);
        setSelectedSemester(active.semester);
      }

      // 2. Fetch Class Records with joins
      const { data: classRecordsData, error: crErr } = await supabase
        .from('class_records')
        .select(`
          class_record_id,
          subject_id,
          section_id,
          faculty_id,
          school_year,
          semester,
          status,
          created_at,
          subjects ( subject_id, code, name, units, department_id, departments ( name ) ),
          sections ( section_id, name, department_id, departments ( name ) ),
          faculty:users!faculty_id ( user_id, first_name, last_name, email, departments ( name ) )
        `)
        .order('created_at', { ascending: false });

      if (crErr) throw crErr;

      // Map join codes and enrollments
      const joinCodeMap = {};
      (joinCodesData || []).forEach(c => {
        if (c.is_active) joinCodeMap[c.class_record_id] = c.join_code;
      });

      const enrollCountMap = {};
      (enrollmentsData || []).forEach(e => {
        const key = `${e.section_id}|${e.subject_id}`;
        enrollCountMap[key] = (enrollCountMap[key] || 0) + 1;
      });

      const postedClassIds = new Set((postedGradesData || []).map(g => g.class_record_id));

      const enriched = await Promise.all((classRecordsData || []).map(async (c) => {
        let code = joinCodeMap[c.class_record_id];
        if (!code) {
          try {
            code = await getOrCreateJoinCode(c.class_record_id, c.subjects?.code || 'CLS', c.sections?.name || 'A');
          } catch {
            code = 'CODE';
          }
        }

        const enrolled = enrollCountMap[`${c.section_id}|${c.subject_id}`] || 0;
        const hasPostedGrades = postedClassIds.has(c.class_record_id);

        return {
          id: c.class_record_id,
          subjectCode: c.subjects?.code || '—',
          subjectName: c.subjects?.name || '—',
          units: c.subjects?.units || 3,
          departmentName: c.subjects?.departments?.name || c.sections?.departments?.name || 'General Academic',
          departmentId: c.subjects?.department_id || c.sections?.department_id || null,
          sectionName: c.sections?.name || '—',
          facultyName: c.faculty ? `Prof. ${c.faculty.first_name} ${c.faculty.last_name}` : 'Unassigned',
          facultyEmail: c.faculty?.email || '—',
          schoolYear: c.school_year,
          semester: c.semester,
          joinCode: code,
          enrolledCount: enrolled,
          status: c.status,
          hasPostedGrades,
          createdAt: c.created_at
        };
      }));

      setClassrooms(enriched);
    } catch (err) {
      console.error('Failed to load classroom provisioning data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeMap(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedCodeMap(prev => ({ ...prev, [id]: false }));
    }, 2000);
  };

  const handleOpenProvisionModal = () => {
    setModalError(null);
    if (departments.length > 0) {
      const firstDept = departments[0];
      setSelectedDeptId(firstDept.department_id);
      setSelectedTargetDeptId('');
    }
    setIsModalOpen(true);
  };

  // Determine if selected department is a service department without dedicated sections (e.g., General Education)
  const isCrossDept = selectedDeptId
    ? sections.filter(sec => sec.department_id === selectedDeptId).length === 0
    : false;

  const targetDeptIdForSections = isCrossDept
    ? (selectedTargetDeptId || (collegeDeptsWithSections[0]?.department_id || ''))
    : selectedDeptId;

  // Derived programs for the target section college
  const deptPrograms = useMemo(() => {
    if (!targetDeptIdForSections) return programs;
    return programs.filter(p => p.department_id === targetDeptIdForSections);
  }, [programs, targetDeptIdForSections]);

  // Active program abbreviation for filtering
  const activeProgramAbbr = useMemo(() => {
    if (!selectedProgramFilter) return '';
    return getProgramAbbreviation(selectedProgramFilter) || selectedProgramFilter;
  }, [selectedProgramFilter]);

  // Reset filters when department or target department changes
  useEffect(() => {
    setSelectedProgramFilter('');
    setSelectedYearFilter('');
  }, [selectedDeptId, targetDeptIdForSections]);

  // Cascading dropdown filters for Modal
  const modalFilteredSubjects = useMemo(() => {
    let list = selectedDeptId 
      ? subjects.filter(s => s.department_id === selectedDeptId)
      : subjects;

    // 1. Program-specific Course Filtering
    if (activeProgramAbbr) {
      const abbrUpper = activeProgramAbbr.toUpperCase();
      const matches = list.filter(s => {
        const codeUpper = (s.code || '').toUpperCase();
        const nameUpper = (s.name || '').toUpperCase();

        // Always keep General Education (GE) subjects available
        if (codeUpper.startsWith('GE')) return true;

        if (abbrUpper === 'BSME') {
          // Mechanical Engineering specific
          return codeUpper.startsWith('ME') || codeUpper.startsWith('THE') || codeUpper.startsWith('MACH') || codeUpper.startsWith('PHY') || codeUpper.startsWith('CAL');
        } else if (abbrUpper === 'BSCS' || abbrUpper === 'BSIT' || abbrUpper === 'ACT' || abbrUpper === 'BSCPE') {
          // Computing & Engineering specific
          return (
            codeUpper.startsWith('CS') || 
            codeUpper.startsWith('IT') || 
            codeUpper.startsWith('ITC') || 
            codeUpper.startsWith('ITP') || 
            codeUpper.startsWith('WEB') || 
            codeUpper.startsWith('CAL') || 
            codeUpper.startsWith('DMS') || 
            codeUpper.startsWith('DSA') || 
            codeUpper.startsWith('DBMS') || 
            codeUpper.startsWith('SOE') || 
            codeUpper.startsWith('CPR') || 
            codeUpper.startsWith('SAD') || 
            codeUpper.startsWith('IAS') || 
            codeUpper.startsWith('PRO') || 
            codeUpper.startsWith('FRE') || 
            codeUpper.startsWith('OOP') || 
            codeUpper.startsWith('NAC') ||
            codeUpper.startsWith('ICT')
          );
        }

        return codeUpper.includes(abbrUpper) || nameUpper.includes(abbrUpper);
      });

      if (matches.length > 0) list = matches;
    }

    // 2. Year Level Course Filter
    if (selectedYearFilter) {
      const yearDigit = 
        selectedYearFilter === '1st Year' ? '1' :
        selectedYearFilter === '2nd Year' ? '2' :
        selectedYearFilter === '3rd Year' ? '3' :
        selectedYearFilter === '4th Year' ? '4' : selectedYearFilter;
      
      if (yearDigit) {
        const yrMatched = list.filter(s => {
          const numbers = (s.code || '').replace(/[^0-9]/g, '');
          return numbers.length > 0 ? numbers.startsWith(yearDigit) : true;
        });
        if (yrMatched.length > 0) list = yrMatched;
      }
    }

    return list;
  }, [subjects, selectedDeptId, activeProgramAbbr, selectedYearFilter]);

  const modalFilteredSections = useMemo(() => {
    let list = targetDeptIdForSections
      ? sections.filter(s => s.department_id === targetDeptIdForSections)
      : sections;

    if (activeProgramAbbr) {
      const progAbbrUpper = activeProgramAbbr.toUpperCase();
      const progMatched = list.filter(sec => 
        sec.name.toUpperCase().startsWith(`${progAbbrUpper}-`) || 
        sec.name.toUpperCase().startsWith(progAbbrUpper)
      );
      if (progMatched.length > 0) list = progMatched;
    }

    if (selectedYearFilter) {
      const yearDigit = 
        selectedYearFilter === '1st Year' ? '1' :
        selectedYearFilter === '2nd Year' ? '2' :
        selectedYearFilter === '3rd Year' ? '3' :
        selectedYearFilter === '4th Year' ? '4' : selectedYearFilter;
      
      if (yearDigit) {
        const yrMatched = list.filter(sec => sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit));
        if (yrMatched.length > 0) list = yrMatched;
      }
    }

    return list;
  }, [sections, targetDeptIdForSections, activeProgramAbbr, selectedYearFilter]);

  const matchedFaculty = selectedDeptId ? facultyUsers.filter(f => f.department_id === selectedDeptId) : facultyUsers;
  const modalFilteredFaculty = matchedFaculty.length > 0 ? matchedFaculty : facultyUsers;

  // Auto-select first matching target college when General Education or service dept is picked
  useEffect(() => {
    if (isCrossDept && !selectedTargetDeptId && collegeDeptsWithSections.length > 0) {
      setSelectedTargetDeptId(collegeDeptsWithSections[0].department_id);
    }
  }, [selectedDeptId, isCrossDept, collegeDeptsWithSections, selectedTargetDeptId]);

  // Auto-select first matching option when department or target college changes
  useEffect(() => {
    const filteredSubs = selectedDeptId ? subjects.filter(s => s.department_id === selectedDeptId) : subjects;
    const filteredSecs = targetDeptIdForSections ? sections.filter(s => s.department_id === targetDeptIdForSections) : sections;
    const deptFacs = selectedDeptId ? facultyUsers.filter(f => f.department_id === selectedDeptId) : facultyUsers;
    const filteredFacs = deptFacs.length > 0 ? deptFacs : facultyUsers;

    setSelectedSubjectId(filteredSubs.length > 0 ? filteredSubs[0].subject_id : (subjects[0]?.subject_id || ''));
    setSelectedSectionId(filteredSecs.length > 0 ? filteredSecs[0].section_id : (sections[0]?.section_id || ''));
    setSelectedFacultyId(filteredFacs.length > 0 ? filteredFacs[0].user_id : (facultyUsers[0]?.user_id || ''));
  }, [selectedDeptId, targetDeptIdForSections, subjects, sections, facultyUsers]);

  const handleProvisionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSubjectId || !selectedSectionId || !selectedFacultyId) {
      setModalError('Please select Subject, Section, and Faculty.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const result = await provisionClassroomByAdmin({
        subjectId: selectedSubjectId,
        sectionId: selectedSectionId,
        facultyId: selectedFacultyId,
        schoolYear: selectedSchoolYear,
        semester: selectedSemester
      });

      await logActivity(
        resolveActorName(user, profile),
        'Classroom Provisioned',
        `Provisioned ${result.subject?.code} for ${result.section?.name} (Join Code: ${result.join_code})`
      );

      setSuccessBanner({
        title: 'Classroom Provisioned Successfully',
        message: `Created classroom ${result.subject?.code} (${result.section?.name}) with Classroom Code: ${result.join_code}`
      });

      setTimeout(() => setSuccessBanner(null), 6000);
      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      console.error('Provisioning error:', err);
      setModalError(err.message || 'Failed to provision classroom.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClassroom = async (cls) => {
    if (cls.hasPostedGrades) {
      alert('Cannot delete this classroom because official grades have already been posted.');
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete classroom ${cls.subjectCode} (${cls.sectionName})? This will archive the classroom and invalidate code ${cls.joinCode}.`
    );
    if (!confirmDelete) return;

    try {
      const { error: delErr } = await supabase
        .from('class_records')
        .delete()
        .eq('class_record_id', cls.id);

      if (delErr) throw delErr;

      await logActivity(
        resolveActorName(user, profile),
        'Classroom Deleted',
        `Deleted classroom ${cls.subjectCode} (${cls.sectionName})`
      );

      setClassrooms(prev => prev.filter(c => c.id !== cls.id));
    } catch (err) {
      alert('Failed to delete classroom: ' + err.message);
    }
  };

  // Filtered Classrooms
  const filteredClassrooms = classrooms.filter(c => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      c.subjectCode.toLowerCase().includes(searchLower) ||
      c.subjectName.toLowerCase().includes(searchLower) ||
      c.sectionName.toLowerCase().includes(searchLower) ||
      c.facultyName.toLowerCase().includes(searchLower) ||
      c.joinCode.toLowerCase().includes(searchLower);

    const matchesDept = !deptFilter || c.departmentName === deptFilter;
    const matchesTerm = !termFilter || `${c.schoolYear} ${c.semester}`.includes(termFilter);

    return matchesSearch && matchesDept && matchesTerm;
  });

  const totalEnrolled = classrooms.reduce((acc, c) => acc + c.enrolledCount, 0);
  const uniqueFaculty = new Set(classrooms.map(c => c.facultyName)).size;
  const uniqueSections = new Set(classrooms.map(c => c.sectionName)).size;

  return (
    <>
      <PageHeader title="Classroom Provisioning & Faculty Loading" breadcrumb="Admin Portal">
        {activeTerm && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-sage-50 border border-sage-200 rounded-lg text-xs font-mono font-medium text-sage-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            AY {activeTerm.school_year} • {activeTerm.semester}
          </div>
        )}
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6 text-left">
        
        {/* Success Banner */}
        {successBanner && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <strong className="block">{successBanner.title}</strong>
                <span>{successBanner.message}</span>
              </div>
            </div>
            <button 
              onClick={() => setSuccessBanner(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Stats Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Active Classrooms</span>
              <span className="text-2xl font-extrabold font-mono text-slate-900">{classrooms.length}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sage-50 text-sage-600 flex items-center justify-center">
              <GraduationCap className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Handled Sections</span>
              <span className="text-2xl font-extrabold font-mono text-slate-900">{uniqueSections}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Assigned Faculty</span>
              <span className="text-2xl font-extrabold font-mono text-slate-900">{uniqueFaculty}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Code Enrollees</span>
              <span className="text-2xl font-extrabold font-mono text-emerald-700">{totalEnrolled}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search subject code, section, faculty, or join code..."
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-slate-50/20 focus:bg-white transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-500 transition-colors"
              >
                <option value="">All Colleges</option>
                {departments.map(d => (
                  <option key={d.department_id} value={d.name}>{d.name}</option>
                ))}
              </select>

              <select
                value={termFilter}
                onChange={e => setTermFilter(e.target.value)}
                className="border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-500 transition-colors"
              >
                <option value="">All Terms</option>
                {academicTerms.map(t => (
                  <option key={t.term_id} value={`${t.school_year} ${t.semester}`}>
                    {t.school_year} • {t.semester} {t.is_active ? '(Active)' : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleOpenProvisionModal}
                className="px-4 py-2 bg-sage-800 hover:bg-sage-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Provision Classroom</span>
              </button>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
            <span className="text-sm text-slate-500 font-medium">Loading classroom master catalog…</span>
          </div>
        ) : (
          /* Desktop Table View */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Course / Subject</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">College</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Faculty</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Classroom Code</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Students</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredClassrooms.length > 0 ? (
                    filteredClassrooms.map(cls => (
                      <tr key={cls.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <span className="font-bold text-sm text-slate-900 block font-mono">{cls.subjectCode}</span>
                            <span className="text-xs text-slate-500">{cls.subjectName} ({cls.units} Units)</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 font-medium">
                          {cls.departmentName}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                            {cls.sectionName}
                          </span>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <span className="text-xs font-bold text-slate-900 block">{cls.facultyName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{cls.facultyEmail}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 font-mono font-bold text-xs text-indigo-900">
                            <span>{cls.joinCode}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(cls.joinCode, cls.id)}
                              className="text-indigo-600 hover:text-indigo-800 p-0.5 cursor-pointer"
                              title="Copy join code"
                            >
                              {copiedCodeMap[cls.id] ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold",
                            cls.enrolledCount > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500"
                          )}>
                            {cls.enrolledCount} Enrolled
                          </span>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteClassroom(cls)}
                            disabled={cls.hasPostedGrades}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors cursor-pointer",
                              cls.hasPostedGrades 
                                ? "text-slate-300 cursor-not-allowed" 
                                : "text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            )}
                            title={cls.hasPostedGrades ? "Cannot delete classroom with posted grades" : "Delete Classroom"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center">
                        <GraduationCap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-500 font-medium">No classrooms match the selected filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* PROVISION NEW CLASSROOM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-sage-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Provision Official Classroom</h3>
                  <p className="text-[11px] text-slate-500">Assign curriculum subject &amp; block section to a faculty instructor</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleProvisionSubmit} className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
              
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed">
                Provisioning creates the official class record with <strong>0 initial students</strong> and auto-generates a unique <strong>Classroom Code</strong>. Students will self-enroll using this code on Day 1.
              </div>

              {/* Department Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">College / Department</label>
                <select
                  value={selectedDeptId}
                  onChange={e => setSelectedDeptId(e.target.value)}
                  className="w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-600 font-medium"
                >
                  {departments.map(d => (
                    <option key={d.department_id} value={d.department_id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Program & Year Level Filters */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-sage-600" />
                    Refine Catalog Filters
                  </span>
                  {(selectedProgramFilter || selectedYearFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProgramFilter('');
                        setSelectedYearFilter('');
                      }}
                      className="text-[10px] font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                <div className={deptPrograms.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : "block"}>
                  {/* Program Filter (Only rendered if college offers > 1 program) */}
                  {deptPrograms.length > 1 && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500">Filter by Program</label>
                      <select
                        value={selectedProgramFilter}
                        onChange={e => setSelectedProgramFilter(e.target.value)}
                        className="w-full border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs bg-white outline-none focus:border-sage-600 font-medium cursor-pointer"
                      >
                        <option value="">All Programs ({deptPrograms.length})</option>
                        {deptPrograms.map(p => {
                          const abbr = getProgramAbbreviation(p);
                          return (
                            <option key={p.program_id} value={p.name}>
                              {abbr ? `[${abbr}] ${p.name}` : p.name}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {/* Year Level Filter */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Filter by Year Level</label>
                    <select
                      value={selectedYearFilter}
                      onChange={e => setSelectedYearFilter(e.target.value)}
                      className="w-full border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs bg-white outline-none focus:border-sage-600 font-medium cursor-pointer"
                    >
                      <option value="">All Year Levels</option>
                      <option value="1">1st Year</option>
                      <option value="2">2nd Year</option>
                      <option value="3">3rd Year</option>
                      <option value="4">4th Year</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Course / Subject Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                  Course / Subject <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={e => setSelectedSubjectId(e.target.value)}
                  className="w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-600 font-medium"
                >
                  {modalFilteredSubjects.map(s => (
                    <option key={s.subject_id} value={s.subject_id}>{s.code} — {s.name} ({s.units} units)</option>
                  ))}
                </select>
              </div>

              {/* Secondary Target College Selector for Cross-Department / General Education */}
              {isCrossDept && (
                <div className="space-y-1.5 p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                      Target College for Block Section <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[9px] bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded font-semibold">
                      General Education / Service Course
                    </span>
                  </div>
                  <select
                    value={targetDeptIdForSections}
                    onChange={e => setSelectedTargetDeptId(e.target.value)}
                    className="w-full border border-amber-300 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-600 font-medium"
                  >
                    {collegeDeptsWithSections.map(d => (
                      <option key={d.department_id} value={d.department_id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Section Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                  Target Block Section <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedSectionId}
                  onChange={e => setSelectedSectionId(e.target.value)}
                  className="w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-600 font-medium font-mono"
                >
                  {modalFilteredSections.map(sec => (
                    <option key={sec.section_id} value={sec.section_id}>{sec.name}</option>
                  ))}
                </select>
              </div>

              {/* Faculty Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                  Assigned Faculty Instructor <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedFacultyId}
                  onChange={e => setSelectedFacultyId(e.target.value)}
                  className="w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-600 font-medium"
                >
                  {modalFilteredFaculty.map(f => (
                    <option key={f.user_id} value={f.user_id}>Prof. {f.first_name} {f.last_name} ({f.email})</option>
                  ))}
                </select>
              </div>

              {/* Active Term Indicator (Locked to Active Academic Term) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Target Academic Term</label>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Locked to Active Term
                  </span>
                </div>
                <div className="w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-slate-50 font-mono text-slate-800 flex items-center justify-between">
                  <span>AY {selectedSchoolYear} • {selectedSemester}</span>
                  <span className="text-[10px] text-slate-400 font-sans">Active Term</span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sage-800 hover:bg-sage-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Provisioning…</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Provision Classroom</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </>
  );
}
