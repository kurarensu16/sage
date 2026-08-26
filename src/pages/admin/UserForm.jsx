import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, X, User } from 'lucide-react';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { useAuth } from '../../lib/AuthContext';

const PROGRAM_ABBREVIATIONS = {
  "Bachelor of Science in Accountancy": "BSA",
  "Bachelor of Science in Accounting Information System": "BSAIS",
  "Bachelor of Arts in Political Science": "BAPS",
  "Bachelor of Science in Business Administration": "BSBA",
  "Bachelor of Science in Business Administration Major in Human Resource Development Management": "BSBA-HRDM",
  "Bachelor of Science in Business Administration Major in Financial Management": "BSBA-FM",
  "Bachelor of Science in Business Administration Major in Operations Management": "BSBA-OM",
  "Bachelor of Science in Business Administration Major in Marketing Management": "BSBA-MM",
  "Bachelor of Science in Computer Science": "BSCS",
  "Bachelor of Science in Computer Engineering": "BSCpE",
  "Bachelor of Science in Information Technology": "BSIT",
  "Associate in Computer Technology": "ACT",
  "Bachelor of Elementary Education": "BEEd",
  "Bachelor of Secondary Education Major in Mathematics": "BSEd-Math",
  "Bachelor of Secondary Education Major in Filipino": "BSEd-Fil",
  "Bachelor of Secondary Education Major in English": "BSEd-Eng",
  "Bachelor of Secondary Education Major in Sciences": "BSEd-Sci",
  "Continuing Professional Teacher Education": "CPTE",
  "Bachelor of Science in Nursing": "BSN",
  "Bachelor of Science in Midwifery": "BSM",
  "Bachelor of Science in Hospitality Management": "BSHM",
  "Bachelor of Science in Tourism Management": "BSTM",
  "Bachelor of Science in Marine Transportation": "BSMT",
  "Bachelor of Science in Marine Engineering": "BSMarE",
  "Bachelor of Science in Mechanical Engineering": "BSME",
  "Bachelor of Arts in Psychology": "BAPsych"
};

const getProgramFromSectionName = (sectionName) => {
  if (!sectionName) return '';
  const lastHyphenIndex = sectionName.lastIndexOf('-');
  let programAbbr = '';
  if (lastHyphenIndex !== -1) {
    programAbbr = sectionName.slice(0, lastHyphenIndex).toUpperCase();
  } else {
    const match = sectionName.match(/^([A-Z-]+)(\d)([A-Z]*)$/i);
    if (match) {
      programAbbr = match[1].toUpperCase();
    }
  }
  
  if (!programAbbr) return '';
  
  const programName = Object.keys(PROGRAM_ABBREVIATIONS).find(
    key => PROGRAM_ABBREVIATIONS[key].toUpperCase() === programAbbr
  );
  return programName || '';
};

const matchSectionToProgram = (sec, programName) => {
  const programAbbr = PROGRAM_ABBREVIATIONS[programName] || '';
  return programAbbr 
    ? (sec.name.toUpperCase().startsWith(programAbbr.toUpperCase() + '-') || sec.name.toUpperCase().startsWith(programAbbr.toUpperCase())) 
    : true;
};

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
    department: 'College of Computer Studies',
    program: 'Bachelor of Science in Information Technology',
    section: '',
    yearLevel: '1st Year',
    status: 'active'
  });
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [allSections, setAllSections] = useState([]);

  // Fetch sections from database
  useEffect(() => {
    async function loadSections() {
      try {
        const { data, error } = await supabase
          .from('sections')
          .select(`
            section_id,
            name,
            departments ( name )
          `);
        if (error) throw error;
        if (data) {
          const mapped = data.map(s => {
            let deptName = s.departments?.name || '';
            if (deptName === 'College of IT' || deptName === 'College of CS') {
              deptName = 'College of Computer Studies';
            }
            return {
              id: s.section_id,
              name: s.name,
              program: s.program || getProgramFromSectionName(s.name) || 'Bachelor of Science in Information Technology',
              department: deptName
            };
          });
          setAllSections(mapped);
        }
      } catch (err) {
        console.error('Error fetching sections:', err);
      }
    }
    loadSections();
  }, []);

  const availableSections = allSections.filter(sec => {
    const matchesDept = sec.department === formData.department;
    const matchesProg = matchSectionToProgram(sec, formData.program);
    const yearDigit = getYearDigit(formData.yearLevel);
    const matchesYear = yearDigit ? (sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit)) : true;
    return matchesDept && matchesProg && matchesYear;
  });

  // Fetch user data if in edit mode
  useEffect(() => {
    async function fetchUserData() {
      if (!userId) return;
      setIsEditMode(true);
      try {
        const { data: existingUser, error } = await supabase
          .from('users')
          .select(`
            *,
            departments ( name ),
            sections ( name )
          `)
          .eq('user_id', userId)
          .single();

        if (error) throw error;

        if (existingUser) {
          let dept = existingUser.departments?.name || 'College of Computer Studies';
          if (dept === 'College of IT' || dept === 'College of CS') {
            dept = 'College of Computer Studies';
          }
          
          setFormData({
            lastName: existingUser.last_name || '',
            firstName: existingUser.first_name || '',
            middleName: existingUser.middle_name || '',
            email: existingUser.email || '',
            role: existingUser.role || 'student',
            department: dept,
            program: existingUser.program || getProgramFromSectionName(existingUser.sections?.name) || 'Bachelor of Science in Information Technology',
            section: existingUser.sections?.name || (existingUser.role === 'student' ? 'Irregular' : ''),
            yearLevel: existingUser.year_level || '1st Year',
            status: existingUser.status || 'active'
          });
        } else {
          setErrorMsg('User not found in database.');
        }
      } catch (err) {
        console.error('Failed to load user:', err);
        setErrorMsg('Failed to load user from database: ' + err.message);
      }
    }
    fetchUserData();
  }, [userId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // Form Validations
    if (!formData.lastName.trim() || !formData.firstName.trim() || !formData.email.trim()) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    if (formData.role === 'student' && !formData.section) {
      setErrorMsg('Please assign a section to the student.');
      return;
    }

    // Verify email structure
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    try {
      // 1. Resolve department_id
      const { data: deptData, error: deptErr } = await supabase
        .from('departments')
        .select('department_id')
        .eq('name', formData.department)
        .maybeSingle();

      if (deptErr) throw deptErr;
      const departmentId = deptData?.department_id || null;

      // 2. Resolve section_id
      let sectionId = null;
      if (formData.role === 'student' && formData.section && formData.section !== 'Irregular') {
        const { data: secData, error: secErr } = await supabase
          .from('sections')
          .select('section_id')
          .eq('name', formData.section)
          .maybeSingle();
        if (secErr) throw secErr;
        sectionId = secData?.section_id || null;
      }

      const userPayload = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        middle_name: formData.middleName.trim(),
        email: formData.email.toLowerCase().trim(),
        role: formData.role,
        password_hash: 'managed_by_supabase_auth',
        department_id: departmentId,
        section_id: sectionId,
        year_level: formData.role === 'student' ? formData.yearLevel : null,
        status: formData.status
      };

      if (isEditMode) {
        const { error } = await supabase
          .from('users')
          .update(userPayload)
          .eq('user_id', userId);
        
        if (error) throw error;

        const actorName = resolveActorName(profile, user);
        await logActivity(
          'User Update',
          `Updated account details for ${formData.lastName}, ${formData.firstName} (${formData.email})`,
          actorName
        );
      } else {
        // Generate user number
        const prefix = formData.role === 'student' ? '' : formData.role === 'admin' ? 'ADM-' : formData.role === 'faculty' ? 'FAC-' : formData.role === 'office' ? 'OFC-' : 'DN-';
        const year = new Date().getFullYear();
        
        // Fetch count to get sequence number
        const { count } = await supabase
          .from('users')
          .select('user_id', { count: 'exact', head: true })
          .eq('role', formData.role);

        const nextSeq = String((count || 0) + 1).padStart(5, '0');
        const userNumber = `${prefix}${year}-${nextSeq}`;
        
        const { data: invokeData, error: invokeErr } = await supabase.functions.invoke('create-admin-user', {
          body: {
            email: formData.email.trim().toLowerCase(),
            password: 'SagePassword123!',
            firstName: formData.firstName.trim(),
            lastName: formData.lastName.trim(),
            middleName: formData.middleName.trim(),
            role: formData.role,
            departmentId: departmentId,
            yearLevel: formData.role === 'student' ? formData.yearLevel : null,
            sectionId: sectionId,
            userNumber: userNumber
          }
        });

        if (invokeErr || invokeData?.error) {
          throw new Error(invokeErr?.message || invokeData?.error || 'Failed to register authentication account.');
        }

        // Set user number client-side fallback
        if (invokeData?.user?.id) {
          await supabase
            .from('users')
            .update({ user_number: userNumber })
            .eq('user_id', invokeData.user.id);
        }

        const actorName = resolveActorName(profile, user);
        await logActivity(
          'User Creation',
          `Created new ${formData.role} account: ${formData.lastName}, ${formData.firstName} (${formData.email})`,
          actorName
        );
      }

      navigate('/admin/userlist');
    } catch (err) {
      console.error('Error saving user:', err);
      setErrorMsg('Failed to save user: ' + err.message);
    }
  };

  return (
    <>
      <PageHeader 
        title={isEditMode ? "Edit User Account" : "Register New User"} 
        breadcrumb="Admin Portal" 
      />

      <div className="p-8 overflow-y-auto flex-1 max-w-2xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumb */}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Email Address <span className="text-rose-500">*</span></label>
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                placeholder="e.g. user@sage.edu.ph"
              />
            </div>

            {/* Role */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Portal Role</label>
              <select
                value={formData.role}
                onChange={(e) => {
                  const nextRole = e.target.value;
                  const yearDigit = getYearDigit(formData.yearLevel || '1st Year');
                  const filteredSecs = allSections.filter(
                    sec => sec.department === formData.department && 
                           matchSectionToProgram(sec, formData.program) &&
                           (yearDigit ? (sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit)) : true)
                  );
                  setFormData({
                    ...formData,
                    role: nextRole,
                    section: nextRole === 'student' && filteredSecs.length > 0 ? filteredSecs[0].name : ''
                  });
                }}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
              >
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="office">Office</option>
                <option value="dean">Dean</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Department */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">College / School <span className="text-rose-500">*</span></label>
              <select
                value={formData.department}
                onChange={(e) => {
                  const selectedCollege = e.target.value;
                  const defaultProgram = DYCI_ACADEMIC_PROGRAMS[selectedCollege]?.[0] || '';
                  const yearDigit = getYearDigit(formData.yearLevel || '1st Year');
                  const filteredSecs = allSections.filter(
                    sec => sec.department === selectedCollege && 
                           matchSectionToProgram(sec, defaultProgram) &&
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

            {/* Status Checkbox */}
            <div className="flex flex-col gap-1.5 justify-center">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Account Active Status</label>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  id="status-toggle"
                  checked={formData.status === 'active'}
                  onChange={(e) => setFormData({...formData, status: e.target.checked ? 'active' : 'inactive'})}
                  className="w-4 h-4 text-sage-600 border-slate-200 rounded focus:ring-sage-500 outline-none cursor-pointer"
                />
                <label htmlFor="status-toggle" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                  Enable account logins and portals access
                </label>
              </div>
            </div>
          </div>

          {!isEditMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Default Password</label>
                <input 
                  type="text" 
                  readOnly
                  value="SagePassword123!"
                  className="block w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500 font-mono outline-none cursor-not-allowed"
                />
                <span className="text-[10px] text-slate-400 mt-0.5">This temporary password will be assigned automatically.</span>
              </div>
            </div>
          )}

          {/* Dynamic Degree Program & Section Selection for Student/Faculty */}
          {(formData.role === 'student' || formData.role === 'faculty') && (
            <div className={`grid grid-cols-1 ${formData.role === 'student' ? 'md:grid-cols-3' : ''} gap-4`}>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Degree Program <span className="text-rose-500">*</span></label>
                <select
                  value={formData.program}
                  onChange={(e) => {
                    const nextProgram = e.target.value;
                    const yearDigit = getYearDigit(formData.yearLevel);
                    const filteredSecs = allSections.filter(
                      sec => sec.department === formData.department && 
                             matchSectionToProgram(sec, nextProgram) &&
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

              {formData.role === 'student' && (
                <>
                  {/* Year Level Select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Year Level <span className="text-rose-500">*</span></label>
                    <select
                      value={formData.yearLevel}
                      onChange={(e) => {
                        const nextYear = e.target.value;
                        const yearDigit = getYearDigit(nextYear);
                        const filteredSecs = allSections.filter(
                          sec => sec.department === formData.department && 
                                 matchSectionToProgram(sec, formData.program) &&
                                 (yearDigit ? (sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit)) : true)
                        );
                        setFormData({
                          ...formData,
                          yearLevel: nextYear,
                          section: filteredSecs.length > 0 ? filteredSecs[0].name : ''
                        });
                      }}
                      className="block w-full bg-white border border-slate-250 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Assigned Section <span className="text-rose-500">*</span></label>
                    <select
                      value={formData.section}
                      onChange={(e) => setFormData({...formData, section: e.target.value})}
                      className="block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
                    >
                      <option value="">-- Select Section --</option>
                      <option value="Irregular">Irregular Student</option>
                      {formData.section && formData.section !== 'Irregular' && !availableSections.some(sec => sec.name === formData.section) && (
                        <option value={formData.section}>{formData.section}</option>
                      )}
                      {availableSections.map(sec => (
                        <option key={sec.id} value={sec.name}>{sec.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
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
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Save className="h-4 w-4" /> {isEditMode ? "Save Changes" : "Register User"}
            </button>
          </div>
        </form>

      </div>
    </>
  );
}
