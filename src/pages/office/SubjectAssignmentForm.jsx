import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, Upload, X, Check, Users, AlertCircle, FileSpreadsheet, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SuccessModal from '../../components/SuccessModal';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { dispatchNotifications } from '../../lib/notificationDispatcher';

const isSubjectMatchingSection = (sub, sectionObj) => {
  if (!sectionObj) return true;

  // If the subject belongs to the Department of General Education, bypass matching rules
  if (sub.departments?.name === 'Department of General Education') {
    return true;
  }

  // Extract year level from section name (e.g. BSIT-1A -> Year 1)
  let sectionYearDigit = '';
  const yearMatch = sectionObj.name.match(/-(\d)/);
  if (yearMatch) sectionYearDigit = yearMatch[1];
  else {
    const digitMatch = sectionObj.name.match(/(\d)/);
    if (digitMatch) sectionYearDigit = digitMatch[1];
  }

  // Extract semester from section
  let sectionSemDigit = '1';
  if (sectionObj.semester === '2nd' || sectionObj.semester === '2nd Semester' || sectionObj.semester === '2nd') sectionSemDigit = '2';
  else if (sectionObj.semester === 'Summer') sectionSemDigit = '0';

  // Extract details from subject code (e.g. IT123 or ITC123)
  const codeMatch = sub.code.match(/^([A-Z-]*?)(\d)(\d)?(\d)?$/i);
  if (!codeMatch) return false;

  const subYearDigit = codeMatch[2] || '1';
  const subSemDigit = codeMatch[3] || '1';

  // Compare year and semester digits directly
  const yearMatches = subYearDigit === sectionYearDigit;
  const semMatches = subSemDigit === sectionSemDigit;

  return yearMatches && semMatches;
};

export default function SubjectAssignmentForm() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  // Filter States
  const [selectedCollege, setSelectedCollege] = useState('');
  const [allPrograms, setAllPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedYearLevel, setSelectedYearLevel] = useState('');

  const [formData, setFormData] = useState({
    subject: '',
    section: '',
    facultyId: '',
    schoolYear: '',
    semester: ''
  });

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showWarning, setShowWarning] = useState(false);
  const [warningText, setWarningText] = useState('');
  const [suggestCurriculum, setSuggestCurriculum] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  useEffect(() => {
    async function loadData() {
      const { data: users } = await supabase
        .from('users')
        .select('user_id, first_name, last_name, department_id, departments(name)')
        .eq('role', 'faculty');
      
      const mappedFaculties = (users || []).map(u => ({
        id: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        department: u.departments?.name,
        departmentId: u.department_id
      }));
      setFacultyUsers(mappedFaculties);

      const { data: dbSubjects } = await supabase
        .from('subjects')
        .select('subject_id, code, name, department_id, departments(name), computation_id')
        .order('code');

      const { data: dbSections } = await supabase
        .from('sections')
        .select('section_id, name, school_year, semester, department_id, departments(name)')
        .order('name');

      const { data: dbDepts } = await supabase
        .from('departments')
        .select('department_id, name')
        .order('name');

      const { data: dbPrograms } = await supabase
        .from('programs')
        .select('*')
        .order('name');

      setSubjects(dbSubjects || []);
      setSections(dbSections || []);
      setDepartments(dbDepts || []);
      setAllPrograms(dbPrograms || []);
    }
    loadData();
  }, []);

  // Pre-select department filter on load for office staff
  useEffect(() => {
    if (profile?.department_id) {
      setSelectedCollege(profile.department_id);
    }
  }, [profile]);

  const getYearLevelFromSectionName = (name) => {
    const match = name.match(/-(\d)/);
    if (match) {
      const year = match[1];
      switch (year) {
        case '1': return '1st Year';
        case '2': return '2nd Year';
        case '3': return '3rd Year';
        case '4': return '4th Year';
        default: return null;
      }
    }
    const digitMatch = name.match(/(\d)/);
    if (digitMatch) {
      const year = digitMatch[1];
      switch (year) {
        case '1': return '1st Year';
        case '2': return '2nd Year';
        case '3': return '3rd Year';
        case '4': return '4th Year';
        default: return null;
      }
    }
    return null;
  };

  const yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  // Derived filtered arrays
  const selectedSectionObj = formData.section ? sections.find(s => s.name === formData.section) : null;

  const filteredPrograms = allPrograms.filter(prog => {
    if (selectedCollege && prog.department_id !== selectedCollege) {
      return false;
    }
    return true;
  });

  const selectedProgramObj = selectedProgram ? allPrograms.find(p => p.name === selectedProgram) : null;

  const filteredSubjects = subjects.filter(sub => {
    // If the subject belongs to the Department of General Education, bypass college/program filters
    if (sub.departments?.name === 'Department of General Education') {
      return true;
    }
    if (selectedCollege && sub.department_id !== selectedCollege) {
      return false;
    }
    if (selectedProgramObj && sub.department_id !== selectedProgramObj.department_id) {
      return false;
    }
    return true;
  });

  const sectionMatchedSubjects = selectedSectionObj && suggestCurriculum
    ? filteredSubjects.filter(sub => isSubjectMatchingSection(sub, selectedSectionObj))
    : [];

  const finalSubjects = selectedSectionObj && suggestCurriculum && sectionMatchedSubjects.length > 0
    ? sectionMatchedSubjects
    : filteredSubjects;

  const filteredSections = sections.filter(sec => {
    if (selectedCollege && sec.department_id !== selectedCollege) {
      return false;
    }
    if (selectedProgramObj && sec.department_id !== selectedProgramObj.department_id) {
      return false;
    }
    if (selectedYearLevel) {
      const year = getYearLevelFromSectionName(sec.name);
      if (year !== selectedYearLevel) {
        return false;
      }
    }
    return true;
  });

  const filteredInstructors = facultyUsers.filter(fac => {
    let isGenEd = false;
    if (formData.subject) {
      const [subCode] = formData.subject.split('|');
      const selectedSubject = subjects.find(s => s.code === subCode);
      if (selectedSubject?.departments?.name === 'Department of General Education') {
        isGenEd = true;
      }
    }

    // 1. Filter by top toolbar college/department selection (bypass if Gen Ed subject)
    if (selectedCollege && !isGenEd && fac.departmentId !== selectedCollege) {
      return false;
    }

    // 2. Filter by selected subject's college/department (bypass if Gen Ed subject)
    if (formData.subject) {
      const [subCode] = formData.subject.split('|');
      const selectedSubject = subjects.find(s => s.code === subCode);
      if (selectedSubject && !isGenEd && fac.departmentId !== selectedSubject.department_id) {
        return false;
      }
    }

    // 3. Filter by selected section's college/department (bypass if Gen Ed subject)
    if (formData.section) {
      const selectedSec = sections.find(s => s.name === formData.section);
      if (selectedSec && !isGenEd && fac.departmentId !== selectedSec.department_id) {
        return false;
      }
    }
    return true;
  });

  // Reset selected values if they no longer exist in the filtered list
  useEffect(() => {
    if (formData.subject) {
      const [subCode] = formData.subject.split('|');
      const stillExists = finalSubjects.some(s => s.code === subCode);
      if (!stillExists) {
        setFormData(prev => ({ ...prev, subject: '' }));
      }
    }
  }, [selectedCollege, selectedProgram, formData.section, suggestCurriculum]);

  useEffect(() => {
    if (formData.section) {
      const stillExists = filteredSections.some(s => s.name === formData.section);
      if (!stillExists) {
        setFormData(prev => ({ ...prev, section: '' }));
      }
    }
  }, [selectedCollege, selectedProgram, selectedYearLevel]);

  useEffect(() => {
    if (formData.facultyId) {
      const stillExists = filteredInstructors.some(f => f.id === formData.facultyId);
      if (!stillExists) {
        setFormData(prev => ({ ...prev, facultyId: '' }));
      }
    }
  }, [selectedCollege, formData.subject, formData.section]);

  useEffect(() => {
    if (formData.subject && formData.facultyId) {
      const [subCode] = formData.subject.split('|');
      const selectedSubject = subjects.find(s => s.code === subCode);
      const selectedFaculty = facultyUsers.find(f => f.id === formData.facultyId);
      
      const subDeptName = selectedSubject?.departments?.name || '';
      const facDeptName = selectedFaculty?.department || '';
      
      if (selectedSubject && selectedFaculty && subDeptName && facDeptName && subDeptName !== facDeptName && subDeptName !== 'Department of General Education') {
        setWarningText(`The subject ${selectedSubject.code} belongs to "${subDeptName}", but Prof. ${selectedFaculty.firstName} ${selectedFaculty.lastName} belongs to "${facDeptName}".`);
        setShowWarning(true);
      } else {
        setShowWarning(false);
        setWarningText('');
      }
    } else {
      setShowWarning(false);
      setWarningText('');
    }
  }, [formData.subject, formData.facultyId, subjects, facultyUsers]);

  const handleSectionChange = (e) => {
    const selectedSecName = e.target.value;
    const secObj = sections.find(s => s.name === selectedSecName);
    if (secObj) {
      setFormData(prev => ({
        ...prev,
        section: selectedSecName,
        schoolYear: secObj.school_year || '2025-2026',
        semester: secObj.semester || '2nd'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        section: selectedSecName
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (!formData.subject || !formData.section || !formData.facultyId) {
        throw new Error('Please select a subject, section, and faculty member.');
      }

      const [subCode] = formData.subject.split('|');
      const selectedSubject = subjects.find(s => s.code === subCode);
      const selectedSection = sections.find(s => s.name === formData.section);

      if (!selectedSubject || !selectedSection) throw new Error("Invalid subject or section.");

      // Check if classroom already exists
      const { data: existing, error: checkError } = await supabase
        .from('class_records')
        .select('*')
        .eq('subject_id', selectedSubject.subject_id)
        .eq('section_id', selectedSection.section_id)
        .eq('status', 'active');
        
      if (existing && existing.length > 0) {
        throw new Error(`Active classroom for ${subCode} - ${formData.section} already exists.`);
      }

      // Query active students assigned to the selected section
      const { data: students, error: studentError } = await supabase
        .from('users')
        .select('user_id')
        .eq('role', 'student')
        .eq('section_id', selectedSection.section_id)
        .eq('status', 'active');

      if (studentError) throw studentError;

      if (!students || students.length === 0) {
        throw new Error(`No active students found in the selected section (${formData.section}). Please register students to this section first.`);
      }

      // Insert classroom record
      const { data: newClassRecord, error: insertError } = await supabase
        .from('class_records')
        .insert({
          subject_id: selectedSubject.subject_id,
          section_id: selectedSection.section_id,
          faculty_id: formData.facultyId,
          school_year: selectedSection.school_year,
          semester: selectedSection.semester,
          status: 'active'
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Auto-assign template components to class_grading_columns
      let templateToApply = null;
      if (selectedSubject.computation_id) {
        const { data: temp } = await supabase
          .from('grade_computations')
          .select('*, grade_computation_components(*)')
          .eq('computation_id', selectedSubject.computation_id)
          .single();
        if (temp) templateToApply = temp;
      }

      // Fallback to General / Professional Education Scale
      if (!templateToApply) {
        const { data: fallbackTemp } = await supabase
          .from('grade_computations')
          .select('*, grade_computation_components(*)')
          .eq('name', 'General / Professional Education Scale')
          .single();
        if (fallbackTemp) templateToApply = fallbackTemp;
      }

      if (templateToApply) {
        const comps = templateToApply.grade_computation_components || [];
        const csComp = comps.find(c => (c.name || '').toLowerCase().includes('class standing') || (c.name || '').toLowerCase().includes('formative')) || comps[0];
        const examComp = comps.find(c => (c.name || '').toLowerCase().includes('exam') || (c.name || '').toLowerCase().includes('major')) || comps[1];

        const faMax = csComp?.max_score ? parseFloat(csComp.max_score) : 20;
        const examMax = examComp?.max_score ? parseFloat(examComp.max_score) : 100;

        const termsList = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
        const upsertRows = termsList.map(term => ({
          class_record_id: newClassRecord.class_record_id,
          term,
          act1_max: faMax,
          act2_max: faMax,
          act3_max: faMax,
          act4_max: faMax,
          act5_max: faMax,
          act6_max: Math.round(faMax / 2) || 10,
          exam_max: examMax
        }));

        await supabase
          .from('class_grading_columns')
          .insert(upsertRows);
      }

      // Get currently logged-in administrator ID
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const currentAdminId = currentUser?.id || null;

      // Create enrollment records for all students in section
      const enrollmentRecords = students.map(s => ({
        student_id: s.user_id,
        section_id: selectedSection.section_id,
        subject_id: selectedSubject.subject_id,
        imported_by: currentAdminId
      }));

      const { error: enrollError } = await supabase.from('enrollments').insert(enrollmentRecords);
      if (enrollError) throw enrollError;

      const selectedFaculty = facultyUsers.find(f => f.id === formData.facultyId);
      const facultyName = selectedFaculty ? `${selectedFaculty.firstName} ${selectedFaculty.lastName}` : 'Unknown';
      const actorName = resolveActorName(profile, user);
      const subName = selectedSubject.name || '';
      
      await logActivity(
        'Classroom Creation',
        `Created classroom: ${subCode} – ${formData.section} (${formData.schoolYear}, ${formData.semester}). Instructor: ${facultyName}. Auto-enrolled ${students.length} student(s).`,
        actorName
      );

      // Dispatch notifications to Faculty, Enrolled Students, and Office Actor
      const notifList = [
        {
          recipient_id: formData.facultyId,
          type: 'class_assigned',
          message: `You have been assigned to instruct ${subCode} (${subName} - ${formData.section}) for ${formData.schoolYear} ${formData.semester}.`
        },
        ...students.map(st => ({
          recipient_id: st.user_id,
          type: 'class_enrolled',
          message: `You have been successfully registered into ${subCode} - ${subName} (${formData.section}).`
        }))
      ];
      if (user?.id) {
        notifList.push({
          recipient_id: user.id,
          type: 'assignment',
          message: `Classroom created: ${subCode} (${formData.section}) assigned to Prof. ${facultyName}.`
        });
      }
      await dispatchNotifications(notifList);
      
      setSuccessModalMessage(`Classroom created successfully and ${students.length} students enrolled.`);
      setIsSuccessModalOpen(true);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Assign Subject" breadcrumb="College Office Portal" />

      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/office/subjectassignmentlist')}>
            Classrooms
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">Create Classroom</span>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm font-semibold">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-lg text-sm font-semibold">
            {successMsg}
          </div>
        )}

        {showWarning && (
          <div className="bg-amber-50 border border-amber-250 text-amber-800 p-4 rounded-lg text-sm font-semibold flex items-start gap-2.5 shadow-sm">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Department Mismatch Warning</span>
              <span className="text-xs text-amber-700 mt-1 block leading-relaxed">{warningText}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Section 1: Subject, Section & Faculty Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="p-2 bg-sage-50 text-sage-600 rounded-lg">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-slate-900">Classroom Configuration</h3>
                <p className="text-xs text-slate-500 mt-0.5">Link a syllabus subject, targeted section, and advising faculty.</p>
              </div>
            </div>

            {/* Dynamic Filtering Panel */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                  <Filter className="h-4 w-4 text-sage-600" />
                  Filter Options
                </div>
                 {(selectedCollege || selectedProgram || selectedYearLevel) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCollege(profile?.department_id || '');
                      setSelectedProgram('');
                      setSelectedYearLevel('');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-700 font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* College / Department Filter */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">College / Department</span>
                  {profile?.department_id ? (
                    <div className="block w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-500 cursor-not-allowed font-medium">
                      {departments.find(d => d.department_id === selectedCollege)?.name || 'Loading department...'}
                    </div>
                  ) : (
                    <select
                      value={selectedCollege}
                      onChange={(e) => setSelectedCollege(e.target.value)}
                      className="block w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="">All Colleges</option>
                      {departments.map((dept) => (
                        <option key={dept.department_id} value={dept.department_id}>{dept.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Academic Program Filter */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Academic Program</span>
                  <select
                    value={selectedProgram}
                    onChange={(e) => {
                      const progName = e.target.value;
                      setSelectedProgram(progName);
                      const progObj = allPrograms.find(p => p.name === progName);
                      if (progObj && !selectedCollege) {
                        setSelectedCollege(progObj.department_id);
                      }
                    }}
                    className="block w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                  >
                    <option value="">All Programs</option>
                    {filteredPrograms.map((prog) => (
                      <option key={prog.program_id} value={prog.name}>{prog.name}</option>
                    ))}
                  </select>
                </div>

                {/* Year Level Filter */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Year Level</span>
                  <select
                    value={selectedYearLevel}
                    onChange={(e) => setSelectedYearLevel(e.target.value)}
                    className="block w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                  >
                    <option value="">All Year Levels</option>
                    {yearLevels.map((yl, idx) => (
                      <option key={idx} value={yl}>{yl}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Subject */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Subject / Course <span className="text-rose-500">*</span></label>
                  {formData.section && (
                    <label className="text-[10px] text-sage-600 font-semibold flex items-center gap-1 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={suggestCurriculum}
                        onChange={(e) => setSuggestCurriculum(e.target.checked)}
                        className="rounded text-sage-600 focus:ring-sage-500 h-3 w-3 cursor-pointer"
                      />
                      Curriculum Filter
                    </label>
                  )}
                </div>
                <select
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select subject...</option>
                  {finalSubjects.map((sub, idx) => (
                    <option key={idx} value={`${sub.code}|${sub.name}`}>{sub.code} - {sub.name}</option>
                  ))}
                </select>
                {selectedSectionObj && suggestCurriculum && sectionMatchedSubjects.length > 0 && (
                  <span className="text-[10px] text-sage-600 font-medium">
                    Filtered by {selectedSectionObj.name}'s year and semester curriculum.
                  </span>
                )}
                {selectedSectionObj && suggestCurriculum && sectionMatchedSubjects.length === 0 && (
                  <span className="text-[10px] text-slate-500 font-medium">
                    No curriculum subjects found for {selectedSectionObj.name}. Showing all subjects.
                  </span>
                )}
              </div>

              {/* Section */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Target Section <span className="text-rose-500">*</span></label>
                <select
                  required
                  value={formData.section}
                  onChange={handleSectionChange}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select section...</option>
                  {filteredSections.map((sec, idx) => (
                    <option key={idx} value={sec.name}>{sec.name}</option>
                  ))}
                </select>
              </div>

              {/* Faculty */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Assigned Instructor <span className="text-rose-500">*</span></label>
                <select
                  required
                  value={formData.facultyId}
                  onChange={(e) => setFormData({...formData, facultyId: e.target.value})}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select instructor...</option>
                  {filteredInstructors.map((fac) => (
                    <option key={fac.id} value={fac.id}>Prof. {fac.firstName} {fac.lastName} ({fac.department})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* School Year */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">School Year</label>
                <input 
                  type="text" 
                  disabled
                  value={formData.schoolYear}
                  placeholder="Select target section first..."
                  className="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-400 placeholder-slate-400 rounded-lg text-sm cursor-not-allowed font-mono"
                />
              </div>

              {/* Semester */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Semester</label>
                <input 
                  type="text" 
                  disabled
                  value={formData.semester ? (formData.semester === '1st' ? '1st Semester' : formData.semester === '2nd' ? '2nd Semester' : formData.semester) : ''}
                  placeholder="Select target section first..."
                  className="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-400 placeholder-slate-400 rounded-lg text-sm cursor-not-allowed font-mono"
                />
              </div>
            </div>
          </div>

          {/* Automated Student Enrollment Information Panel */}
          <div className="bg-sage-50 border border-sage-200 rounded-xl p-5 flex items-start gap-3 shadow-sm">
            <Users className="h-5 w-5 text-sage-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">Automated Student Enrollment</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                When you create this classroom, SAGE will automatically query the database for all active student accounts assigned to <span className="font-bold text-slate-800">{formData.section || "the selected section"}</span> and enroll them in the class. You no longer need to upload a manual student list.
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3">
            <button 
              type="button" 
              onClick={() => navigate('/office/subjectassignmentlist')}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="px-5 py-2.5 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {loading ? "Saving..." : "Save Classroom Setup"}
            </button>
          </div>

        </form>

      </div>

      <SuccessModal
        isOpen={isSuccessModalOpen}
        message={successModalMessage}
        onClose={() => navigate('/office/subjectassignmentlist')}
      />
    </>
  );
}
