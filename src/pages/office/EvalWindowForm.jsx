import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, ChevronDown, Search, Save, Calendar, Clock, AlertCircle, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import SuccessModal from '../../components/SuccessModal';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function EvalWindowForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const params = new URLSearchParams(location.search);
  const windowId = params.get('id');

  // Department Scoping
  const userDepartmentId = profile?.department_id;
  const userDepartmentName = profile?.departments?.name || 'College of Computer Studies';

  const [templates, setTemplates] = useState([]);
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [classrooms, setClassrooms] = useState([]);

  const [formData, setFormData] = useState({
    templateId: '',
    facultyId: '',
    sectionId: '',
    openAt: '',
    closeAt: ''
  });

  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  const [schedulingMode, setSchedulingMode] = useState('single'); // single | batch

  const [isFacultyDropdownOpen, setIsFacultyDropdownOpen] = useState(false);
  const [facultySearchQuery, setFacultySearchQuery] = useState('');
  const facultyDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (facultyDropdownRef.current && !facultyDropdownRef.current.contains(event.target)) {
        setIsFacultyDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Fetch Form Templates
        const { data: tmpls } = await supabase.from('evaluation_forms').select('form_id, title');
        setTemplates(tmpls?.map(t => ({ id: t.form_id, title: t.title })) || []);

        // 2. Fetch Faculty Users (Filtered strictly to Department)
        let facQuery = supabase
          .from('users')
          .select('user_id, first_name, last_name, email, department_id, departments(name)')
          .eq('role', 'faculty')
          .eq('status', 'active');
        
        if (userDepartmentId) {
          facQuery = facQuery.eq('department_id', userDepartmentId);
        }

        const { data: facs } = await facQuery;
        setFacultyUsers(facs?.map(f => ({ 
          id: f.user_id, 
          firstName: f.first_name, 
          lastName: f.last_name,
          email: f.email,
          department: f.departments?.name || userDepartmentName,
          departmentId: f.department_id || userDepartmentId
        })) || []);

        // 3. Fetch Class Records (Filtered strictly to Department)
        const { data: classRecords } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            faculty_id,
            section_id,
            sections (section_id, name, department_id, departments(name)),
            subjects (subject_id, code, name, department_id, departments(name))
          `)
          .eq('status', 'active');

        const scopedClassrooms = (classRecords || [])
          .filter(c => {
            if (!userDepartmentId) return true;
            const secDept = c.sections?.department_id;
            const subDept = c.subjects?.department_id;
            return secDept === userDepartmentId || subDept === userDepartmentId;
          })
          .map(c => ({
            id: c.class_record_id,
            facultyId: c.faculty_id,
            sectionId: c.section_id,
            section: c.sections?.name || '',
            sectionDept: c.sections?.departments?.name || userDepartmentName,
            sectionDeptId: c.sections?.department_id || userDepartmentId,
            subjectCode: c.subjects?.code || '',
            subjectName: c.subjects?.name || '',
            subjectDept: c.subjects?.departments?.name || userDepartmentName,
            subjectDeptId: c.subjects?.department_id || userDepartmentId
          }));

        setClassrooms(scopedClassrooms);

        // 4. If in Edit Mode, fetch existing window
        if (windowId) {
          setIsEditMode(true);
          const { data: existing, error } = await supabase
            .from('evaluation_windows')
            .select('*')
            .eq('window_id', windowId)
            .single();

          if (error) throw error;
          if (existing) {
            setFormData({
              templateId: existing.form_id,
              facultyId: existing.faculty_id,
              sectionId: existing.section_id,
              openAt: existing.open_at ? existing.open_at.slice(0, 16) : '',
              closeAt: existing.close_at ? existing.close_at.slice(0, 16) : ''
            });
          }
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        setErrorMsg('Failed to load form details.');
      }
    }
    loadData();
  }, [windowId, userDepartmentId, userDepartmentName]);

  const getFacultyName = (facId) => {
    const fac = facultyUsers.find(f => f.id === facId);
    return fac ? `${fac.firstName} ${fac.lastName}` : 'Unknown';
  };

  const handleClassSectionChange = (val) => {
    if (!val) {
      setFormData(prev => ({ ...prev, sectionId: '' }));
      return;
    }
    const [sectionId, facultyId] = val.split('_');
    setFormData(prev => ({
      ...prev,
      sectionId,
      facultyId
    }));
  };

  const selectedFaculty = facultyUsers.find(f => f.id === formData.facultyId);
  const facultyClassesCount = classrooms.filter(c => c.facultyId === formData.facultyId).length;
  
  const filteredClassrooms = classrooms.filter(c => {
    if (formData.facultyId && c.facultyId !== formData.facultyId) {
      return false;
    }
    return true;
  });

  const filteredFaculty = facultyUsers.filter(fac => {
    const search = facultySearchQuery.toLowerCase();
    return (
      `${fac.firstName} ${fac.lastName}`.toLowerCase().includes(search) ||
      (fac.email && fac.email.toLowerCase().includes(search))
    );
  });

  // Unique (faculty_id, section_id) pairs in Department for batch scheduling
  const uniqueBatchPairs = [];
  const seenPairs = new Set();
  classrooms.forEach(c => {
    if (c.facultyId && c.sectionId) {
      const key = `${c.facultyId}_${c.sectionId}`;
      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        uniqueBatchPairs.push({
          facultyId: c.facultyId,
          sectionId: c.sectionId,
          section: c.section,
          subjectCode: c.subjectCode,
          subjectName: c.subjectName,
          sectionDept: c.sectionDept,
          subjectDept: c.subjectDept
        });
      }
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (schedulingMode === 'single') {
      if (!formData.templateId || !formData.facultyId || !formData.sectionId || !formData.openAt || !formData.closeAt) {
        setErrorMsg('Please complete all form fields.');
        return;
      }
    } else {
      if (!formData.templateId || !formData.openAt || !formData.closeAt) {
        setErrorMsg('Please complete all batch form fields.');
        return;
      }
      if (uniqueBatchPairs.length === 0) {
        setErrorMsg(`No active classrooms found in ${userDepartmentName} to schedule evaluations for.`);
        return;
      }
    }

    const openDate = new Date(formData.openAt);
    const closeDate = new Date(formData.closeAt);

    if (closeDate <= openDate) {
      setErrorMsg('Close Date & Time must be after the Open Date & Time.');
      return;
    }

    try {
      if (schedulingMode === 'single') {
        const windowData = {
          form_id: formData.templateId,
          faculty_id: formData.facultyId,
          section_id: formData.sectionId,
          open_at: openDate.toISOString(),
          close_at: closeDate.toISOString(),
          is_closed: false,
          created_by: user?.id
        };

        if (isEditMode) {
          const { error } = await supabase
            .from('evaluation_windows')
            .update(windowData)
            .eq('window_id', windowId);
          if (error) throw error;

          const faculty = facultyUsers.find(f => f.id === formData.facultyId);
          const facultyName = faculty ? `${faculty.firstName} ${faculty.lastName}` : 'Unknown';
          await logActivity(
            'Eval Window Update',
            `Updated evaluation window for ${facultyName} in ${userDepartmentName} (opens: ${new Date(formData.openAt).toLocaleString()}, closes: ${new Date(formData.closeAt).toLocaleString()}).`,
            resolveActorName(profile, user)
          );
        } else {
          const { error } = await supabase
            .from('evaluation_windows')
            .insert(windowData);
          if (error) throw error;

          const faculty = facultyUsers.find(f => f.id === formData.facultyId);
          const facultyName = faculty ? `${faculty.firstName} ${faculty.lastName}` : 'Unknown';
          const template = templates.find(t => t.id === formData.templateId);
          const templateTitle = template ? template.title : 'Unknown Template';
          await logActivity(
            'Eval Window Creation',
            `Scheduled evaluation window for ${facultyName} in ${userDepartmentName} using template "${templateTitle}" (opens: ${new Date(formData.openAt).toLocaleString()}, closes: ${new Date(formData.closeAt).toLocaleString()}).`,
            resolveActorName(profile, user)
          );
        }
        setSuccessModalMessage(isEditMode ? "Evaluation window updated successfully!" : "Evaluation window scheduled successfully!");
      } else {
        // Batch Mode scheduling for Department
        const insertData = uniqueBatchPairs.map(pair => ({
          form_id: formData.templateId,
          faculty_id: pair.facultyId,
          section_id: pair.sectionId,
          open_at: openDate.toISOString(),
          close_at: closeDate.toISOString(),
          is_closed: false,
          created_by: user?.id
        }));

        const { error } = await supabase
          .from('evaluation_windows')
          .insert(insertData);
        if (error) throw error;

        const template = templates.find(t => t.id === formData.templateId);
        const templateTitle = template ? template.title : 'Unknown Template';

        await logActivity(
          'Eval Window Batch Creation',
          `Scheduled batch evaluations for ${userDepartmentName} (Total: ${uniqueBatchPairs.length} classes) using template "${templateTitle}" (opens: ${new Date(formData.openAt).toLocaleString()}, closes: ${new Date(formData.closeAt).toLocaleString()}).`,
          resolveActorName(profile, user)
        );

        setSuccessModalMessage(`Successfully scheduled evaluations for ${uniqueBatchPairs.length} active classes in ${userDepartmentName}!`);
      }
      setIsSuccessModalOpen(true);
    } catch (err) {
      console.error('Error saving window(s):', err);
      setErrorMsg('Error saving window(s): ' + err.message);
    }
  };

  return (
    <>
      <PageHeader 
        title={isEditMode ? "Modify Evaluation Window" : "Schedule Evaluation Window"} 
        breadcrumb="College Office Portal" 
      />

      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/office/evalwindowlist')}>
            Evaluation Windows
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">
            {isEditMode ? "Edit Scheduler" : "Create Scheduler"}
          </span>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="p-2 bg-sage-50 text-sage-600 rounded-lg">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-slate-900">Evaluation Window Scheduler</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-sans">Set availability periods for student feedback submissions.</p>
            </div>
          </div>

          <div className="space-y-4">
            
            {/* Department Locked Scope */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Department Scope:</span>
              <span className="font-semibold text-sage-800 bg-sage-50 px-2.5 py-1 rounded-md border border-sage-200 flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-sage-600" />
                {userDepartmentName}
              </span>
            </div>

            {/* Mode Toggle Switch */}
            {!isEditMode && (
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setSchedulingMode('single');
                    setErrorMsg('');
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    schedulingMode === 'single'
                      ? 'bg-white text-slate-800 shadow-sm border border-slate-150'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Single Class Window
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSchedulingMode('batch');
                    setErrorMsg('');
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    schedulingMode === 'batch'
                      ? 'bg-white text-slate-800 shadow-sm border border-slate-150'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Batch Schedule Department
                </button>
              </div>
            )}

            {/* Select Template */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Evaluation Form Template <span className="text-rose-500">*</span></label>
              <select
                required
                value={formData.templateId}
                onChange={(e) => setFormData({...formData, templateId: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer font-sans"
              >
                <option value="">Select evaluation template...</option>
                {templates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>{tmpl.title}</option>
                ))}
              </select>
            </div>

            {schedulingMode === 'single' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Select Faculty */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Instructor <span className="text-rose-500">*</span></label>
                    <div className="relative" ref={facultyDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsFacultyDropdownOpen(!isFacultyDropdownOpen)}
                        className="w-full flex items-center justify-between bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 outline-none transition-all cursor-pointer text-left font-sans"
                      >
                        {selectedFaculty ? (
                          <span className="text-slate-900 font-medium">
                            Prof. {selectedFaculty.firstName} {selectedFaculty.lastName}
                          </span>
                        ) : (
                          <span className="text-slate-400">Select instructor...</span>
                        )}
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      </button>

                      {isFacultyDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden flex flex-col max-h-72">
                          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <input
                              type="text"
                              value={facultySearchQuery}
                              onChange={(e) => setFacultySearchQuery(e.target.value)}
                              placeholder="Search department faculty..."
                              className="w-full bg-transparent border-none text-xs outline-none focus:ring-0 placeholder-slate-400 text-slate-700 font-sans"
                              autoFocus
                            />
                            {facultySearchQuery && (
                              <button 
                                type="button" 
                                onClick={() => setFacultySearchQuery('')}
                                className="text-xs text-slate-400 hover:text-slate-600 font-bold px-1"
                              >
                                Clear
                              </button>
                            )}
                          </div>

                          <div className="overflow-y-auto flex-1 max-h-56 divide-y divide-slate-50 table-container">
                            {filteredFaculty.length > 0 ? (
                              filteredFaculty.map((fac) => {
                                const initials = `${fac.firstName?.[0] || ''}${fac.lastName?.[0] || ''}`.toUpperCase();
                                const isSelected = formData.facultyId === fac.id;
                                return (
                                  <button
                                    key={fac.id}
                                    type="button"
                                    onClick={() => {
                                      setFormData(prev => ({ ...prev, facultyId: fac.id, sectionId: '' }));
                                      setIsFacultyDropdownOpen(false);
                                      setFacultySearchQuery('');
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors ${
                                      isSelected ? 'bg-sage-50' : ''
                                    }`}
                                  >
                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold font-display flex-shrink-0 ${
                                      isSelected ? 'bg-sage-600 text-white' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {initials}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className={`text-xs font-semibold truncate ${
                                        isSelected ? 'text-sage-800' : 'text-slate-800'
                                      }`}>
                                        Prof. {fac.firstName} {fac.lastName}
                                      </p>
                                      <p className="text-[10px] text-slate-400 truncate mt-0.5 font-sans">
                                        {fac.email}
                                      </p>
                                    </div>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="p-4 text-center text-xs text-slate-400 font-sans">
                                No instructors found in {userDepartmentName}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Select Section */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Class Section <span className="text-rose-500">*</span></label>
                    <select
                      required
                      value={formData.sectionId && formData.facultyId ? `${formData.sectionId}_${formData.facultyId}` : ''}
                      onChange={(e) => handleClassSectionChange(e.target.value)}
                      className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer font-sans"
                    >
                      <option value="">Select department class section...</option>
                      {filteredClassrooms.map((cls) => (
                        <option key={cls.id} value={`${cls.sectionId}_${cls.facultyId}`}>
                          {cls.section} - {cls.subjectCode} ({cls.subjectName}){!formData.facultyId ? ` — Prof. ${getFacultyName(cls.facultyId)}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Selected Instructor Details Card */}
                {selectedFaculty && (
                  <div className="bg-sage-50/50 border border-sage-100 rounded-xl p-4 flex items-center justify-between gap-4 animate-fade-in transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-sage-600 text-white flex items-center justify-center font-bold font-display text-sm flex-shrink-0">
                        {`${selectedFaculty.firstName?.[0] || ''}${selectedFaculty.lastName?.[0] || ''}`.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-850 truncate">Prof. {selectedFaculty.firstName} {selectedFaculty.lastName}</h4>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5 font-sans">{selectedFaculty.email}</p>
                        <p className="text-[10px] text-sage-600 font-semibold mt-1 font-sans">{userDepartmentName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="bg-white border border-slate-150 rounded-lg px-3 py-1.5 shadow-sm text-center">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide font-sans">Assigned Classes</span>
                        <span className="block text-sm font-extrabold font-mono text-slate-700">{facultyClassesCount}</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => {
                          setFormData(prev => ({ ...prev, facultyId: '', sectionId: '' }));
                        }}
                        className="text-xs text-slate-400 hover:text-rose-600 font-medium px-2 py-1 rounded border border-slate-200 hover:border-rose-200 hover:bg-rose-50/50 transition-colors font-sans"
                      >
                        Clear Choice
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Batch Roster Preview for the Department */
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    {userDepartmentName} Target Classes ({uniqueBatchPairs.length})
                  </h4>
                  <span className="text-[10px] bg-sage-50 text-sage-600 font-semibold px-2.5 py-0.5 rounded-full font-sans">
                    Department Active Roster
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 p-3">
                  <div className="max-h-64 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2.5 p-0.5">
                    {uniqueBatchPairs.length > 0 ? (
                      uniqueBatchPairs.map((pair, idx) => {
                        const rawName = getFacultyName(pair.facultyId);
                        const cleanName = rawName.replace('Prof. ', '');
                        const previewInitials = `${cleanName?.[0] || ''}${cleanName.split(' ')[1]?.[0] || ''}`.toUpperCase();
                        return (
                          <div key={idx} className="flex items-center justify-between p-3 text-xs bg-white rounded-xl border border-slate-200 shadow-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold font-sans text-xs flex-shrink-0">
                                {previewInitials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate">Prof. {cleanName}</p>
                                <p className="text-[10px] text-slate-500 truncate mt-0.5 font-sans">
                                  <span className="font-mono font-semibold text-slate-700">{pair.section}</span> • {pair.subjectCode} ({pair.subjectName})
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] text-sage-700 font-bold whitespace-nowrap bg-sage-50 border border-sage-200 px-2 py-0.5 rounded font-sans shrink-0 ml-2">
                              To schedule
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-2 p-6 text-center text-xs text-slate-400 font-sans">
                        No active classes found in {userDepartmentName}.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Open Time */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Open Date & Time <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="datetime-local" 
                  required
                  value={formData.openAt}
                  onChange={(e) => setFormData({...formData, openAt: e.target.value})}
                  className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                />
              </div>

              {/* Close Time */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Close Date & Time <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="datetime-local" 
                  required
                  value={formData.closeAt}
                  onChange={(e) => setFormData({...formData, closeAt: e.target.value})}
                  className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-xs text-slate-500 leading-normal">
            <AlertCircle className="h-5 w-5 text-sage-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Scheduler Notice:</strong> Re-scheduling an active window will immediately modify access rules for enrolled students in {userDepartmentName}. Notifications will be dispatched to students informing them of changed timelines.
            </div>
          </div>

          {/* Form Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button 
              type="button" 
              onClick={() => navigate('/office/evalwindowlist')}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Save className="h-4 w-4" /> Save Scheduler
            </button>
          </div>
        </form>

      </div>

      <SuccessModal
        isOpen={isSuccessModalOpen}
        message={successModalMessage}
        onClose={() => {
          setIsSuccessModalOpen(false);
          navigate('/office/evalwindowlist');
        }}
      />
    </>
  );
}
