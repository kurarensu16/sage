import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Search, UserCheck, CheckCircle2, 
  BookOpen, Plus, Trash2, Layers, Check, X, ShieldAlert, 
  ArrowRight, Loader2, GraduationCap,
  AlertCircle, BookCheck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';

export default function StudentSections() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryStudentId = searchParams.get('studentId');

  // Search & Student selection state
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Feedback states
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Enrolled Subjects for Selected Student
  const [enrolledSubjects, setEnrolledSubjects] = useState([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  // Available Classrooms for Department (Subject Load Builder)
  const [availableClassrooms, setAvailableClassrooms] = useState([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  const [selectedClassroomIds, setSelectedClassroomIds] = useState([]);
  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [enrollingBatch, setEnrollingBatch] = useState(false);

  // Modal confirmation state
  const [confirmConfig, setConfirmConfig] = useState(null);

  // 1. Fetch sections in the admin's department scope
  useEffect(() => {
    async function loadSections() {
      if (!profile?.department_id) return;
      try {
        const { data, error } = await supabase
          .from('sections')
          .select('*')
          .eq('department_id', profile.department_id)
          .order('name');
        
        if (error) throw error;
        setSections(data || []);
      } catch (err) {
        console.error('Failed to load sections:', err);
      }
    }
    loadSections();
  }, [profile?.department_id]);

  // 2. Search Students Handler
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, sections(name)')
        .eq('role', 'student')
        .eq('department_id', profile?.department_id)
        .or(`email.ilike.%${searchTerm.trim()}%,first_name.ilike.%${searchTerm.trim()}%,last_name.ilike.%${searchTerm.trim()}%,user_number.ilike.%${searchTerm.trim()}%`);

      if (error) throw error;
      setStudents(data || []);
      
      if (!data || data.length === 0) {
        setErrorMsg('No students found matching search term in your department.');
      }
    } catch (err) {
      console.error('Student search failed:', err);
      setErrorMsg('Search error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Load single student by query param if present
  useEffect(() => {
    async function loadStudentFromParam() {
      if (!queryStudentId || !profile?.department_id) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*, sections(name)')
          .eq('user_id', queryStudentId)
          .single();

        if (error) throw error;
        if (data) {
          setSelectedStudent(data);
          setStudents([data]);
        }
      } catch (err) {
        console.error('Failed to load student from param:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStudentFromParam();
  }, [queryStudentId, profile?.department_id]);

  // 4. Load Enrolled Subjects & Available Department Classrooms for Selected Student
  const loadStudentAcademicLoad = async (studentId) => {
    if (!studentId || !profile?.department_id) return;
    setLoadingEnrollments(true);
    setLoadingClassrooms(true);

    try {
      // A. Fetch current student enrollments
      const { data: dbEnrollments, error: enrollErr } = await supabase
        .from('enrollments')
        .select(`
          enrollment_id,
          student_id,
          subject_id,
          section_id,
          status,
          enrolled_at,
          subjects:subject_id ( subject_id, code, name, units ),
          sections:section_id ( section_id, name, school_year, semester )
        `)
        .eq('student_id', studentId);

      if (enrollErr) throw enrollErr;

      // B. Fetch all active department classrooms to resolve instructors and available classes
      const { data: dbClassrooms, error: classErr } = await supabase
        .from('class_records')
        .select(`
          class_record_id,
          subject_id,
          section_id,
          school_year,
          semester,
          status,
          subjects ( subject_id, code, name, units, department_id ),
          sections ( section_id, name, department_id ),
          faculty:users!faculty_id ( user_id, first_name, last_name )
        `)
        .eq('status', 'active');

      if (classErr) throw classErr;

      // Filter classrooms belonging to staff's department
      const deptClassrooms = (dbClassrooms || []).filter(
        c => c.sections?.department_id === profile.department_id || c.subjects?.department_id === profile.department_id
      );

      // C. Map enrolled subjects with faculty instructor details
      const mappedEnrolled = (dbEnrollments || []).map(e => {
        const matchingClass = deptClassrooms.find(
          c => c.subject_id === e.subject_id && c.section_id === e.section_id
        );
        return {
          enrollmentId: e.enrollment_id,
          subjectId: e.subject_id,
          subjectCode: e.subjects?.code || 'N/A',
          subjectName: e.subjects?.name || 'Untitled Subject',
          units: Number(e.subjects?.units) || 3,
          sectionId: e.section_id,
          sectionName: e.sections?.name || 'Irregular',
          facultyName: matchingClass?.faculty 
            ? `${matchingClass.faculty.first_name} ${matchingClass.faculty.last_name}` 
            : 'Unassigned',
          status: e.status || 'active',
          enrolledAt: e.enrolled_at
        };
      });

      setEnrolledSubjects(mappedEnrolled);

      // D. Filter out classrooms the student is ALREADY enrolled in
      const enrolledPairKeys = new Set(
        (dbEnrollments || []).map(e => `${e.subject_id}_${e.section_id}`)
      );

      const available = deptClassrooms.filter(
        c => !enrolledPairKeys.has(`${c.subject_id}_${c.section_id}`)
      ).map(c => ({
        id: c.class_record_id,
        subjectId: c.subject_id,
        subjectCode: c.subjects?.code || '',
        subjectName: c.subjects?.name || '',
        units: Number(c.subjects?.units) || 3,
        sectionId: c.section_id,
        sectionName: c.sections?.name || '',
        facultyName: c.faculty ? `${c.faculty.first_name} ${c.faculty.last_name}` : 'Unassigned',
        schoolYear: c.school_year,
        semester: c.semester
      }));

      setAvailableClassrooms(available);
      setSelectedClassroomIds([]);
    } catch (err) {
      console.error('Failed to load academic load:', err);
      setErrorMsg('Failed to load student course load: ' + err.message);
    } finally {
      setLoadingEnrollments(false);
      setLoadingClassrooms(false);
    }
  };

  useEffect(() => {
    if (selectedStudent?.user_id) {
      loadStudentAcademicLoad(selectedStudent.user_id);
    } else {
      setEnrolledSubjects([]);
      setAvailableClassrooms([]);
      setSelectedClassroomIds([]);
    }
  }, [selectedStudent?.user_id]);

  // 5. Section / Irregular Modifier
  const handleUpdateSection = async (studentId, sectionName) => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let targetSectionId = null;
      let logMsg = '';

      if (sectionName !== 'Irregular') {
        const matchedSec = sections.find(s => s.name === sectionName);
        if (!matchedSec) throw new Error('Selected section is invalid.');
        targetSectionId = matchedSec.section_id;
        logMsg = `Transferred student to block section ${sectionName}`;
      } else {
        logMsg = `Assigned student to Irregular status (Unassigned block)`;
      }

      const { error } = await supabase
        .from('users')
        .update({ section_id: targetSectionId })
        .eq('user_id', studentId);

      if (error) throw error;

      const updatedStudent = {
        ...selectedStudent,
        section_id: targetSectionId,
        sections: targetSectionId ? { name: sectionName } : null
      };

      setStudents(prev => prev.map(s => s.user_id === studentId ? updatedStudent : s));
      setSelectedStudent(updatedStudent);
      setSuccessMsg('Student section status updated successfully!');

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Section Modification',
        `${logMsg} for student ${selectedStudent.first_name} ${selectedStudent.last_name} (${selectedStudent.email}).`,
        actorName
      );
    } catch (err) {
      console.error('Update section failed:', err);
      setErrorMsg('Modification failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // 6. Batch Multi-Subject Enrollment Execution
  const executeBatchEnroll = async () => {
    if (!selectedStudent || selectedClassroomIds.length === 0) return;
    setEnrollingBatch(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const selectedClasses = availableClassrooms.filter(c => selectedClassroomIds.includes(c.id));
      if (selectedClasses.length === 0) throw new Error('No classrooms selected.');

      const inserts = selectedClasses.map(c => ({
        student_id: selectedStudent.user_id,
        subject_id: c.subjectId,
        section_id: c.sectionId,
        status: 'active',
        imported_by: user?.id || null
      }));

      const { error: insertErr } = await supabase
        .from('enrollments')
        .insert(inserts);

      if (insertErr) throw insertErr;

      const actorName = resolveActorName(profile, user);
      const subjectCodesStr = selectedClasses.map(c => `${c.subjectCode} (${c.sectionName})`).join(', ');

      await logActivity(
        'Batch Subject Enrollment',
        `Enrolled student ${selectedStudent.first_name} ${selectedStudent.last_name} (${selectedStudent.user_number || selectedStudent.email}) into ${selectedClasses.length} subject(s): ${subjectCodesStr}.`,
        actorName
      );

      setSuccessMsg(`Successfully enrolled student in ${selectedClasses.length} subject(s)!`);
      setSelectedClassroomIds([]);
      await loadStudentAcademicLoad(selectedStudent.user_id);
    } catch (err) {
      console.error('Batch enrollment failed:', err);
      setErrorMsg('Failed to enroll subjects: ' + err.message);
    } finally {
      setEnrollingBatch(false);
      setConfirmConfig(null);
    }
  };

  // 7. Single Subject Drop Execution
  const executeDropSubject = async (enrollment) => {
    if (!selectedStudent || !enrollment) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { error: delErr } = await supabase
        .from('enrollments')
        .delete()
        .eq('enrollment_id', enrollment.enrollmentId);

      if (delErr) throw delErr;

      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Subject Dropped',
        `Dropped subject ${enrollment.subjectCode} (${enrollment.sectionName}) for student ${selectedStudent.first_name} ${selectedStudent.last_name}.`,
        actorName
      );

      setSuccessMsg(`Subject ${enrollment.subjectCode} dropped successfully.`);
      await loadStudentAcademicLoad(selectedStudent.user_id);
    } catch (err) {
      console.error('Failed to drop subject:', err);
      setErrorMsg('Failed to drop subject: ' + err.message);
    } finally {
      setConfirmConfig(null);
    }
  };

  // Filtered available classrooms for multi-select list
  const filteredAvailableClassrooms = useMemo(() => {
    if (!classSearchTerm.trim()) return availableClassrooms;
    const term = classSearchTerm.toLowerCase().trim();
    return availableClassrooms.filter(c => 
      c.subjectCode.toLowerCase().includes(term) ||
      c.subjectName.toLowerCase().includes(term) ||
      c.sectionName.toLowerCase().includes(term) ||
      c.facultyName.toLowerCase().includes(term)
    );
  }, [availableClassrooms, classSearchTerm]);

  // Compute total units for current load and selected batch
  const totalEnrolledUnits = useMemo(() => {
    return enrolledSubjects.reduce((sum, item) => sum + (Number(item.units) || 0), 0);
  }, [enrolledSubjects]);

  const totalSelectedUnits = useMemo(() => {
    const selected = availableClassrooms.filter(c => selectedClassroomIds.includes(c.id));
    return selected.reduce((sum, item) => sum + (Number(item.units) || 0), 0);
  }, [availableClassrooms, selectedClassroomIds]);

  // Toggle single classroom selection
  const handleToggleClassroom = (classId) => {
    setSelectedClassroomIds(prev => 
      prev.includes(classId) 
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  // Select all / Deselect all
  const handleToggleSelectAll = () => {
    if (selectedClassroomIds.length === filteredAvailableClassrooms.length && filteredAvailableClassrooms.length > 0) {
      setSelectedClassroomIds([]);
    } else {
      setSelectedClassroomIds(filteredAvailableClassrooms.map(c => c.id));
    }
  };

  return (
    <>
      <PageHeader 
        title="Student Sections & Subject Load Builder" 
        breadcrumb="College Office Portal" 
      />

      <div className="p-8 overflow-y-auto flex-1 max-w-6xl mx-auto w-full space-y-6">
        
        {/* Status Notification Alerts */}
        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg('')} className="p-1 hover:bg-rose-100 rounded-md">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-100 rounded-md">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 1: SEARCH BAR & HEADER                                            */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-sage-50 text-sage-600 rounded-xl">
                <Layers className="h-6 w-6" />
              </div>
              <div className="text-left">
                <h3 className="text-base font-bold text-slate-900 font-display">Student Lookup & Subject Load Matrix</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-sans">
                  Assign irregular student subject schedules across multiple classrooms matching their Certificate of Registration (COR).
                </p>
              </div>
            </div>

            {selectedStudent && (
              <button
                onClick={() => {
                  setSelectedStudent(null);
                  setSearchParams({});
                }}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-colors shrink-0"
              >
                Change Student
              </button>
            )}
          </div>

          {/* Search Bar */}
          {!selectedStudent && (
            <form onSubmit={handleSearch} className="flex gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search student by Name, Student Number (e.g. 2026-00001), or Email..."
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-sage-500/20 font-sans"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-sage-600 hover:bg-sage-700 disabled:bg-sage-400 text-white rounded-xl text-sm font-bold transition-all shadow-xs flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <span>Search Student</span>
                )}
              </button>
            </form>
          )}

          {/* Search Results List */}
          {!selectedStudent && students.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs mt-4">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Matching Students ({students.length})</span>
                <span className="text-[10px] text-slate-400 font-normal">Click a student to view and build their subject load</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                {students.map(stud => (
                  <div
                    key={stud.user_id}
                    onClick={() => setSelectedStudent(stud)}
                    className="p-4 hover:bg-sage-50/40 cursor-pointer flex items-center justify-between text-left transition-colors"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700 font-mono">
                        {stud.first_name[0]}{stud.last_name[0]}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900 font-display">
                          {stud.last_name}, {stud.first_name} {stud.middle_name || ''}
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">
                          {stud.user_number || 'No ID Number'} • {stud.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500 font-sans">
                        {stud.year_level || '1st Year'}
                      </span>
                      <span className={cn(
                        "px-2.5 py-1 text-[11px] font-bold rounded-full border",
                        stud.sections?.name 
                          ? "bg-slate-100 text-slate-700 border-slate-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      )}>
                        {stud.sections?.name || 'Irregular'}
                      </span>
                      <ArrowRight className="h-4 w-4 text-slate-300" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: SELECTED STUDENT PROFILE & SECTION MODIFIER                    */}
        {/* ========================================================================= */}
        {selectedStudent && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-6">
              
              {/* Student Identification */}
              <div className="flex items-start gap-4">
                <div className="p-3.5 bg-sage-50 text-sage-600 rounded-2xl shrink-0">
                  <UserCheck className="h-7 w-7" />
                </div>
                <div className="text-left space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-900 font-display">
                      {selectedStudent.last_name}, {selectedStudent.first_name} {selectedStudent.middle_name || ''}
                    </h3>
                    <span className={cn(
                      "px-2.5 py-0.5 text-xs font-bold rounded-full border",
                      selectedStudent.sections?.name
                        ? "bg-slate-100 text-slate-700 border-slate-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    )}>
                      {selectedStudent.sections?.name ? `Block: ${selectedStudent.sections.name}` : 'Irregular Student'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs font-mono text-slate-500 flex-wrap">
                    <span>ID: <strong className="text-slate-800 font-semibold">{selectedStudent.user_number || 'N/A'}</strong></span>
                    <span>•</span>
                    <span>Email: <strong className="text-slate-800 font-semibold">{selectedStudent.email}</strong></span>
                    <span>•</span>
                    <span>Level: <strong className="text-slate-800 font-semibold">{selectedStudent.year_level || '1st Year'}</strong></span>
                  </div>
                </div>
              </div>

              {/* Block Section / Irregular Switcher */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-left space-y-2 min-w-[280px]">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">
                  Block Section Reassignment
                </label>
                <div className="flex items-center gap-2">
                  <select
                    disabled={saving}
                    value={selectedStudent.sections?.name || 'Irregular'}
                    onChange={(e) => handleUpdateSection(selectedStudent.user_id, e.target.value)}
                    className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 focus:border-sage-500 outline-none transition-all cursor-pointer shadow-2xs"
                  >
                    <option value="Irregular">Irregular (Unassigned Block)</option>
                    {sections.map(sec => (
                      <option key={sec.section_id} value={sec.name}>{sec.name}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight font-sans">
                  {selectedStudent.sections?.name 
                    ? `Enrolled in block ${selectedStudent.sections.name}. Irregular students should be set to "Irregular".`
                    : `Irregular status active. Use the course builder below to assign their individual subjects.`
                  }
                </p>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 3: CURRENT ENROLLED SUBJECTS (COR ROSTER)                         */}
            {/* ========================================================================= */}
            <div className="space-y-4 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
                    <BookCheck className="h-4.5 w-4.5 text-sage-600" />
                    <span>Current Enrolled Subject Load</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono font-bold">
                      {enrolledSubjects.length} {enrolledSubjects.length === 1 ? 'Subject' : 'Subjects'}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Official subjects the student is actively taking this semester.
                  </p>
                </div>

                {/* Total Units Summary Badge */}
                <div className="flex items-center gap-2 bg-sage-50/70 border border-sage-200 px-3.5 py-1.5 rounded-xl text-xs font-bold text-sage-800 shrink-0">
                  <GraduationCap className="h-4 w-4 text-sage-600" />
                  <span>Total Enrolled Units:</span>
                  <span className="font-mono text-sm text-sage-900 font-extrabold">{totalEnrolledUnits.toFixed(1)}</span>
                </div>
              </div>

              {loadingEnrollments ? (
                <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-sage-600" />
                  <span>Loading enrolled subjects...</span>
                </div>
              ) : enrolledSubjects.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs bg-slate-50/50 space-y-1">
                  <p className="font-bold text-slate-600 text-sm font-display">No enrolled subjects found</p>
                  <p className="text-slate-400 max-w-md mx-auto">
                    This student currently has 0 active classroom enrollments. Select subjects from the catalog below to build their schedule.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Mobile Enrolled Subjects Card Feed */}
                  <div className="md:hidden space-y-2.5">
                    {enrolledSubjects.map((sub) => (
                      <div key={sub.enrollmentId} className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 font-mono text-xs">{sub.subjectCode}</span>
                              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[10px] font-bold text-slate-700">
                                {sub.sectionName}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 truncate">{sub.subjectName}</p>
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            Active
                          </span>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <div className="text-slate-500 text-[11px] truncate max-w-[180px]">
                            {sub.facultyName}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-700 text-xs">{sub.units.toFixed(1)} Units</span>
                            <button
                              onClick={() => {
                                setConfirmConfig({
                                  title: 'Drop Subject Enrollment',
                                  message: (
                                    <span>
                                      Are you sure you want to drop <strong className="text-slate-800 font-semibold">{sub.subjectCode} ({sub.sectionName})</strong> for <strong className="text-slate-800 font-semibold">{selectedStudent.first_name} {selectedStudent.last_name}</strong>? This will remove the student from the instructor's gradebook.
                                    </span>
                                  ),
                                  confirmText: 'Drop Subject',
                                  confirmBg: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500',
                                  onConfirm: () => executeDropSubject(sub)
                                });
                              }}
                              className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg font-bold text-[10px] transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Drop Subject"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Drop</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Subject Code &amp; Description</th>
                          <th className="px-4 py-3">Section</th>
                          <th className="px-4 py-3">Instructor</th>
                          <th className="px-4 py-3 text-center">Units</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {enrolledSubjects.map((sub) => (
                          <tr key={sub.enrollmentId} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-800 font-mono">{sub.subjectCode}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{sub.subjectName}</div>
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-700">
                              <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md font-mono text-[11px]">
                                {sub.sectionName}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 font-medium">
                              {sub.facultyName}
                            </td>
                            <td className="px-4 py-3 text-center font-mono font-bold text-slate-700">
                              {sub.units.toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Active
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => {
                                  setConfirmConfig({
                                    title: 'Drop Subject Enrollment',
                                    message: (
                                      <span>
                                        Are you sure you want to drop <strong className="text-slate-800 font-semibold">{sub.subjectCode} ({sub.sectionName})</strong> for <strong className="text-slate-800 font-semibold">{selectedStudent.first_name} {selectedStudent.last_name}</strong>? This will remove the student from the instructor's gradebook.
                                      </span>
                                    ),
                                    confirmText: 'Drop Subject',
                                    confirmBg: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500',
                                    onConfirm: () => executeDropSubject(sub)
                                  });
                                }}
                                className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md font-bold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="Drop Subject"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Drop</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* ========================================================================= */}
            {/* SECTION 4: MULTI-SUBJECT ENROLLMENT BUILDER (COR ASSIGNMENT CHECKLIST)     */}
            {/* ========================================================================= */}
            <div className="space-y-4 pt-6 border-t border-slate-100 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
                    <BookOpen className="h-4.5 w-4.5 text-sage-600" />
                    <span>Multi-Subject Enrollment Builder</span>
                    <span className="text-[10px] bg-sage-50 text-sage-700 border border-sage-200 font-bold px-2 py-0.5 rounded-full">
                      COR Matrix
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5 font-sans">
                    Select multiple classrooms simultaneously to assign this student's full semester schedule in one batch.
                  </p>
                </div>

                {/* Filter / Search input for available classes */}
                <div className="relative min-w-[240px]">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={classSearchTerm}
                    onChange={(e) => setClassSearchTerm(e.target.value)}
                    placeholder="Filter by Code, Title, Section..."
                    className="w-full pl-8.5 pr-3 py-1.5 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none transition-all font-sans"
                  />
                </div>
              </div>

              {/* Classrooms Checklist Table */}
              {loadingClassrooms ? (
                <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-sage-600" />
                  <span>Loading available department classrooms...</span>
                </div>
              ) : availableClassrooms.length === 0 ? (
                <div className="py-8 text-center border border-slate-200 rounded-xl text-slate-400 text-xs bg-slate-50/50">
                  No other classrooms available in your department for enrollment.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="text-xs font-bold text-sage-600 hover:text-sage-700 hover:underline flex items-center gap-1"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {selectedClassroomIds.length === filteredAvailableClassrooms.length && filteredAvailableClassrooms.length > 0
                          ? 'Deselect All'
                          : 'Select All Available'
                        }
                      </button>
                      <span className="text-slate-300">|</span>
                      <span className="text-slate-500 font-medium">
                        Showing {filteredAvailableClassrooms.length} of {availableClassrooms.length} available classes
                      </span>
                    </div>

                    {selectedClassroomIds.length > 0 && (
                      <div className="font-bold text-slate-700 text-[11px]">
                        <span className="text-sage-600 font-extrabold">{selectedClassroomIds.length}</span> selected (+{totalSelectedUnits.toFixed(1)} units)
                      </div>
                    )}
                  </div>

                  <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 bg-white">
                    {filteredAvailableClassrooms.map((c) => {
                      const isSelected = selectedClassroomIds.includes(c.id);
                      return (
                        <div
                          key={c.id}
                          onClick={() => handleToggleClassroom(c.id)}
                          className={cn(
                            "px-4 py-3 flex items-center justify-between cursor-pointer transition-colors text-xs",
                            isSelected ? "bg-sage-50/40 hover:bg-sage-50/60" : "hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-center gap-3.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by parent div
                              className="h-4 w-4 rounded border-slate-300 text-sage-600 focus:ring-sage-500 cursor-pointer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 font-mono">{c.subjectCode}</span>
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold font-mono">
                                  {c.sectionName}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{c.subjectName}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-right hidden sm:block">
                              <div className="text-[11px] font-semibold text-slate-700">{c.facultyName}</div>
                              <div className="text-[10px] text-slate-400 font-sans">{c.schoolYear} • {c.semester}</div>
                            </div>

                            <div className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-center font-mono font-bold text-slate-700 min-w-[50px]">
                              {c.units.toFixed(1)} u
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Action / Submission Bar */}
              {selectedClassroomIds.length > 0 && (
                <div className="p-4 bg-sage-50 border border-sage-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-sage-600 text-white rounded-lg">
                      <BookCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-sage-900 font-display">
                        Ready to enroll in {selectedClassroomIds.length} subject(s)
                      </div>
                      <div className="text-xs text-sage-700 mt-0.5">
                        Will add <strong className="font-bold">+{totalSelectedUnits.toFixed(1)} units</strong> (New Total: {(totalEnrolledUnits + totalSelectedUnits).toFixed(1)} units).
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedClassroomIds([])}
                      className="px-4 py-2 border border-slate-200 hover:bg-white text-slate-600 rounded-xl text-xs font-bold transition-colors"
                    >
                      Clear Selection
                    </button>
                    <button
                      type="button"
                      disabled={enrollingBatch}
                      onClick={() => {
                        const selectedClasses = availableClassrooms.filter(c => selectedClassroomIds.includes(c.id));
                        setConfirmConfig({
                          title: `Confirm Batch Enrollment (${selectedClasses.length} Subjects)`,
                          message: (
                            <div className="space-y-3">
                              <p>
                                Are you sure you want to enroll <strong className="text-slate-800 font-semibold">{selectedStudent.first_name} {selectedStudent.last_name}</strong> into the following <strong className="text-slate-800 font-semibold">{selectedClasses.length} classroom(s)</strong>?
                              </p>
                              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-[160px] overflow-y-auto space-y-1.5 text-xs text-left">
                                {selectedClasses.map(c => (
                                  <div key={c.id} className="flex justify-between items-center py-0.5">
                                    <span className="font-bold text-slate-800 font-mono">{c.subjectCode} — {c.sectionName}</span>
                                    <span className="text-slate-500 font-medium">{c.units.toFixed(1)} units</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ),
                          confirmText: `Enroll in ${selectedClasses.length} Subjects`,
                          confirmBg: 'bg-sage-600 hover:bg-sage-700 focus:ring-sage-500',
                          onConfirm: executeBatchEnroll
                        });
                      }}
                      className="px-6 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-sage-400 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2"
                    >
                      {enrollingBatch ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Enrolling...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          <span>Enroll Selected Subjects ({selectedClassroomIds.length})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* GENERIC CONFIRMATION MODAL                                                */}
      {/* ========================================================================= */}
      {confirmConfig && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-sage-50 text-sage-600 rounded-xl">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 font-display">
                  {confirmConfig.title}
                </h3>
              </div>

              <div className="text-xs text-slate-600 font-sans leading-relaxed">
                {confirmConfig.message}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmConfig(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmConfig.onConfirm}
                  className={cn(
                    "px-5 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-xs focus:ring-2 focus:ring-offset-2 outline-none",
                    confirmConfig.confirmBg || "bg-sage-600 hover:bg-sage-700 focus:ring-sage-500"
                  )}
                >
                  {confirmConfig.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
