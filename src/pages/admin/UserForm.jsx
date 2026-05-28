import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, X, User } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';

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

  const allSections = mockDb.getSections();
  const availableSections = allSections.filter(sec => {
    const matchesDept = sec.department === formData.department;
    const matchesProg = sec.program === formData.program;
    const yearDigit = getYearDigit(formData.yearLevel);
    const matchesYear = yearDigit ? (sec.name.includes(`-${yearDigit}`) || sec.name.includes(yearDigit)) : true;
    return matchesDept && matchesProg && matchesYear;
  });

  useEffect(() => {
    if (userId) {
      setIsEditMode(true);
      const users = mockDb.getUsers();
      const existingUser = users.find(u => u.id === userId);
      if (existingUser) {
        let dept = existingUser.department;
        let prog = existingUser.program;
        if (dept === 'College of IT') {
          dept = 'College of Computer Studies';
          prog = prog || 'Bachelor of Science in Information Technology';
        } else if (dept === 'College of CS') {
          dept = 'College of Computer Studies';
          prog = prog || 'Bachelor of Science in Computer Science';
        }
        setFormData({
          lastName: existingUser.lastName,
          firstName: existingUser.firstName,
          middleName: existingUser.middleName || '',
          email: existingUser.email,
          role: existingUser.role,
          department: dept || 'College of Computer Studies',
          program: prog || (DYCI_ACADEMIC_PROGRAMS[dept]?.[0] || ''),
          section: existingUser.section || '',
          yearLevel: existingUser.yearLevel || '1st Year',
          status: existingUser.status
        });
      } else {
        setErrorMsg('User not found in database.');
      }
    }
  }, [userId]);

  const handleSubmit = (e) => {
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

    // Uniqueness validation (check duplicate email for other users)
    const users = mockDb.getUsers();
    const emailExists = users.some(u => u.email.toLowerCase() === formData.email.toLowerCase().trim() && u.id !== userId);
    if (emailExists) {
      setErrorMsg('Email address already registered to another user.');
      return;
    }

    // Save and redirect
    const userToSave = {
      ...formData,
      lastName: formData.lastName.trim(),
      firstName: formData.firstName.trim(),
      middleName: formData.middleName.trim(),
      email: formData.email.toLowerCase().trim()
    };

    if (isEditMode) {
      userToSave.id = userId;
    }

    mockDb.saveUser(userToSave);
    navigate('/admin/userlist');
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
                           sec.program === formData.program &&
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
                           sec.program === defaultProgram &&
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

            {/* Status Status */}
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
                             sec.program === nextProgram &&
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
                                 sec.program === formData.program &&
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
