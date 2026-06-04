import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, X, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';
import SuccessModal from '../../components/SuccessModal';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

const getYearDigit = (yl) => {
  if (yl === '1st Year') return '1';
  if (yl === '2nd Year') return '2';
  if (yl === '3rd Year') return '3';
  if (yl === '4th Year') return '4';
  return '';
};

export default function UserForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const params = new URLSearchParams(location.search);
  const userId = params.get('id');

  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    middleName: '',
    email: '',
    role: 'student',
    userNumber: '',
    department: 'College of Computer Studies',
    program: 'Bachelor of Science in Information Technology',
    section: '',
    yearLevel: '1st Year',
    status: 'active'
  });
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  const [allSections, setAllSections] = useState([]);
  const [allDepartments, setAllDepartments] = useState([]);

  useEffect(() => {
    async function loadFormDependencies() {
      const { data: depts } = await supabase.from('departments').select('*');
      if (depts) setAllDepartments(depts);

      const { data: secs } = await supabase.from('sections').select('*');
      if (secs) setAllSections(secs);
    }
    loadFormDependencies();
  }, []);

  const availableSections = allSections.filter(sec => {
    // Basic filter matching for legacy support, ideally we'd use department_id
    const deptMatches = allDepartments.find(d => d.name === formData.department);
    const matchesDept = sec.department_id === deptMatches?.department_id;
    const yearDigit = getYearDigit(formData.yearLevel);
    const matchesYear = yearDigit ? (sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit)) : true;
    return matchesDept && matchesYear;
  });

  useEffect(() => {
    if (userId) {
      setIsEditMode(true);
      async function loadUser() {
        const { data: existingUser } = await supabase
          .from('users')
          .select('*, departments(name)')
          .eq('user_id', userId)
          .single();
          
        if (existingUser) {
          let sectionName = '';
          if (existingUser.section_id) {
            const { data: secObj } = await supabase
              .from('sections')
              .select('name')
              .eq('section_id', existingUser.section_id)
              .single();
            if (secObj) sectionName = secObj.name;
          }

          setFormData({
            lastName: existingUser.last_name,
            firstName: existingUser.first_name,
            middleName: existingUser.middle_name || '',
            email: existingUser.email,
            role: existingUser.role,
            userNumber: existingUser.user_number || '',
            department: existingUser.departments?.name || 'College of Computer Studies',
            program: '',
            section: sectionName,
            yearLevel: existingUser.year_level || '1st Year',
            status: existingUser.status || 'active'
          });
        } else {
          setErrorMsg('User not found in database.');
        }
      }
      loadUser();
    }
  }, [userId]);

  const executeSubmit = async () => {
    setErrorMsg('');
    setLoading(true);

    const actorName = resolveActorName(profile, user);

    try {
      const deptMatch = allDepartments.find(d => d.name === formData.department);
      if (!deptMatch) throw new Error('Department not found in database.');

      const sectionMatch = allSections.find(s => s.name === formData.section);

      if (isEditMode) {
        const { error: updateErr } = await supabase.from('users').update({
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          middle_name: formData.middleName.trim(),
          role: formData.role,
          department_id: deptMatch.department_id,
          year_level: formData.role === 'student' ? formData.yearLevel : null,
          section_id: formData.role === 'student' ? (sectionMatch?.section_id || null) : null,
          status: formData.status,
          user_number: formData.userNumber.trim()
        }).eq('user_id', userId);
        
        if (updateErr) throw updateErr;

        await logActivity(
          'User Update',
          `Updated ${formData.role} account for ${formData.lastName}, ${formData.firstName} (${formData.email}) — Role: ${formData.role}, Department: ${formData.department}, Status: ${formData.status}.`,
          actorName
        );
      } else {
        // Create new user via Edge Function
        const { data, error: invokeErr } = await supabase.functions.invoke('create-admin-user', {
          body: {
            email: formData.email.trim().toLowerCase(),
            password: 'DemoPassword123!',
            firstName: formData.firstName.trim(),
            lastName: formData.lastName.trim(),
            middleName: formData.middleName.trim(),
            role: formData.role,
            departmentId: deptMatch.department_id,
            yearLevel: formData.role === 'student' ? formData.yearLevel : null,
            sectionId: formData.role === 'student' ? (sectionMatch?.section_id || null) : null,
            userNumber: formData.userNumber.trim()
          }
        });

        if (invokeErr) {
          throw new Error('Failed to create user. Ensure Edge Functions are running.');
        }
        if (data?.error) {
          throw new Error(data.error);
        }

        // Client-side fallback update to ensure user_number is persisted in public.users
        if (data?.user?.id) {
          const { error: updateErr } = await supabase
            .from('users')
            .update({ user_number: formData.userNumber.trim() })
            .eq('user_id', data.user.id);
          if (updateErr) {
            console.error('Failed to set user number on new user profile client-side:', updateErr);
          }
        }

        await logActivity(
          'User Creation',
          `Registered new ${formData.role} account: ${formData.lastName}, ${formData.firstName} (${formData.email.trim().toLowerCase()}) — College: ${formData.department}${formData.role === 'student' ? `, Section: ${formData.section}, Year: ${formData.yearLevel}` : ''}.`,
          actorName
        );
      }

      setSuccessModalMessage(isEditMode ? "User account updated successfully!" : "User registered successfully!");
      setIsSuccessModalOpen(true);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const suggestUserNumber = async (role) => {
    try {
      const year = new Date().getFullYear();
      const prefix = role === 'student' ? '' : role === 'admin' ? 'ADM-' : role === 'faculty' ? 'FAC-' : 'DN-';
      
      const { data, error } = await supabase
        .from('users')
        .select('user_number')
        .eq('role', role)
        .not('user_number', 'is', null);
        
      if (error) throw error;
      
      const existingNumbers = new Set(data.map(u => u.user_number));
      
      let seq = 1;
      let suggested = '';
      while (true) {
        const seqStr = String(seq).padStart(5, '0');
        suggested = `${prefix}${year}-${seqStr}`;
        if (!existingNumbers.has(suggested)) {
          break;
        }
        seq++;
      }
      return suggested;
    } catch (e) {
      console.error('Failed to suggest user number:', e);
      const randomSeq = String(Math.floor(Math.random() * 90000) + 10000);
      const prefix = role === 'student' ? '' : role === 'admin' ? 'ADM-' : role === 'faculty' ? 'FAC-' : 'DN-';
      return `${prefix}${new Date().getFullYear()}-${randomSeq}`;
    }
  };

  useEffect(() => {
    if (!isEditMode && formData.role) {
      suggestUserNumber(formData.role).then(num => {
        setFormData(prev => ({ ...prev, userNumber: num }));
      });
    }
  }, [formData.role, isEditMode]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      if (!formData.lastName.trim() || !formData.firstName.trim() || !formData.email.trim()) {
        throw new Error('Please fill in all required fields.');
      }

      if (!formData.userNumber.trim()) {
        throw new Error('Please enter the ID Number.');
      }

      if (formData.role === 'student') {
        const studentIdRegex = /^\d{4}-\d{5}$/;
        if (!studentIdRegex.test(formData.userNumber.trim())) {
          throw new Error('Student Number must follow the format YYYY-XXXXX (e.g. 2025-00001).');
        }
      } else {
        const employeeIdRegex = /^(ADM|FAC|DN)-\d{4}-\d{5}$/;
        if (!employeeIdRegex.test(formData.userNumber.trim())) {
          throw new Error('Employee ID must follow the format ADM-YYYY-XXXXX, FAC-YYYY-XXXXX, or DN-YYYY-XXXXX depending on their role.');
        }
      }

      if (formData.role === 'student' && !formData.section) {
        throw new Error('Please assign a section to the student.');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        throw new Error('Please enter a valid email address.');
      }

      setShowConfirmModal(true);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <>
      <PageHeader 
        title={isEditMode ? "Edit User Account" : "Register New User"} 
        breadcrumb="Admin Portal" 
      />

      <div className="p-8 overflow-y-auto flex-1 max-w-2xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumb detail */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/admin/userlist')}>
            User Management
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">
            {isEditMode ? "Edit Account" : "Register User"}
          </span>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm font-semibold flex items-center gap-2">
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="p-2 bg-sage-50 text-sage-600 rounded-lg">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-slate-900">User Identification</h3>
              <p className="text-xs text-slate-500 mt-0.5">Please provide exact academic record credentials.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* First Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">First Name <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                required
                value={formData.firstName}
                onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder="e.g. Amanda"
              />
            </div>

            {/* Middle Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Middle Name</label>
              <input 
                type="text" 
                value={formData.middleName}
                onChange={(e) => setFormData({...formData, middleName: e.target.value})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder="e.g. Santos"
              />
            </div>

            {/* Last Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Last Name <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                required
                value={formData.lastName}
                onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder="e.g. Rivera"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-750 uppercase tracking-wide">Email Address <span className="text-rose-500">*</span></label>
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-350 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder="e.g. user@sage.edu.ph"
              />
            </div>

            {/* Role */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-750 uppercase tracking-wide">Portal Role</label>
              <select
                value={formData.role}
                onChange={(e) => {
                  const nextRole = e.target.value;
                  const yearDigit = getYearDigit(formData.yearLevel || '1st Year');
                  const deptObj = allDepartments.find(d => d.name === formData.department);
                  const filteredSecs = allSections.filter(
                    sec => sec.department_id === deptObj?.department_id && 
                           (yearDigit ? (sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit)) : true)
                  );
                  setFormData({
                    ...formData,
                    role: nextRole,
                    section: nextRole === 'student' && filteredSecs.length > 0 ? filteredSecs[0].name : ''
                  });
                }}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-350 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
              >
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="dean">Dean</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            {/* ID Number / Student Number */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-750 uppercase tracking-wide">
                {formData.role === 'student' ? 'Student Number' : 'Employee ID'} <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text" 
                required
                value={formData.userNumber}
                onChange={(e) => setFormData({...formData, userNumber: e.target.value})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-350 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder={formData.role === 'student' ? 'e.g. 2026-00001' : 'e.g. FAC-2026-00001'}
              />
            </div>
          </div>

          {/* Department / College */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">College / School <span className="text-rose-500">*</span></label>
            <select
              value={formData.department}
              onChange={(e) => {
                const selectedCollege = e.target.value;
                const defaultProgram = DYCI_ACADEMIC_PROGRAMS[selectedCollege]?.[0] || '';
                const yearDigit = getYearDigit(formData.yearLevel || '1st Year');
                const deptObj = allDepartments.find(d => d.name === selectedCollege);
                const filteredSecs = allSections.filter(
                  sec => sec.department_id === deptObj?.department_id && 
                         (yearDigit ? (sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit)) : true)
                );
                setFormData({
                  ...formData,
                  department: selectedCollege,
                  program: defaultProgram,
                  section: filteredSecs.length > 0 ? filteredSecs[0].name : ''
                });
              }}
              className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
            >
              {Object.keys(DYCI_ACADEMIC_PROGRAMS).map(college => (
                <option key={college} value={college}>{college}</option>
              ))}
            </select>
          </div>

          {/* Dynamic Degree Program & Section Selection for Students */}
          {formData.role === 'student' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Degree Program <span className="text-rose-500">*</span></label>
                <select
                  value={formData.program}
                  onChange={(e) => {
                    const nextProgram = e.target.value;
                    const yearDigit = getYearDigit(formData.yearLevel);
                    const deptObj = allDepartments.find(d => d.name === formData.department);
                    const filteredSecs = allSections.filter(
                      sec => sec.department_id === deptObj?.department_id && 
                             (yearDigit ? (sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit)) : true)
                    );
                    setFormData({
                      ...formData,
                      program: nextProgram,
                      section: filteredSecs.length > 0 ? filteredSecs[0].name : ''
                    });
                  }}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
                >
                  {(DYCI_ACADEMIC_PROGRAMS[formData.department] || []).map(prog => (
                    <option key={prog} value={prog}>{prog}</option>
                  ))}
                </select>
              </div>

              {/* Year Level Select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Year Level <span className="text-rose-500">*</span></label>
                <select
                  value={formData.yearLevel}
                  onChange={(e) => {
                    const nextYear = e.target.value;
                    const yearDigit = getYearDigit(nextYear);
                    const deptObj = allDepartments.find(d => d.name === formData.department);
                    const filteredSecs = allSections.filter(
                      sec => sec.department_id === deptObj?.department_id && 
                             (yearDigit ? (sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit)) : true)
                    );
                    setFormData({
                      ...formData,
                      yearLevel: nextYear,
                      section: filteredSecs.length > 0 ? filteredSecs[0].name : ''
                    });
                  }}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-350 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Assigned Section <span className="text-rose-500">*</span></label>
                {availableSections.length > 0 ? (
                  <select
                    value={formData.section}
                    onChange={(e) => setFormData({...formData, section: e.target.value})}
                    className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
                  >
                    <option value="">-- Select Section --</option>
                    {availableSections.map(sec => (
                      <option key={sec.id} value={sec.name}>{sec.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex flex-col gap-1">
                    <span>No active sections preloaded for this year/program.</span>
                    <span className="text-[10px] text-slate-500">
                      Please create a section in the{' '}
                      <button
                        type="button"
                        onClick={() => navigate('/admin/sections')}
                        className="text-sage-600 font-semibold underline hover:text-sage-700"
                      >
                        Sections Database
                      </button>{' '}
                      first.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button 
              type="button" 
              onClick={() => navigate('/admin/userlist')}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:border-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {loading ? "Saving..." : (isEditMode ? "Save Changes" : "Register User")}
            </button>
          </div>
        </form>

      </div>

      {/* Custom Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl border border-slate-200 max-w-sm w-full shadow-lg p-6 space-y-4 text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto w-12 h-12 rounded-full bg-sage-50 text-sage-600 flex items-center justify-center">
              <User className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 font-display">
                {isEditMode ? "Confirm Save Changes" : "Confirm Registration"}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {isEditMode ? (
                  <>
                    Are you sure you want to save changes for user <span className="font-bold text-slate-800">{formData.firstName} {formData.lastName}</span>?
                  </>
                ) : (
                  <>
                    Are you sure you want to register a new <span className="font-bold text-slate-850 uppercase font-mono">{formData.role}</span> account for <span className="font-bold text-slate-800">{formData.firstName} {formData.lastName}</span> ({formData.email})?
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  executeSubmit();
                }}
                className="flex-1 px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <SuccessModal
        isOpen={isSuccessModalOpen}
        message={successModalMessage}
        onClose={() => navigate('/admin/userlist')}
      />
    </>
  );
}
