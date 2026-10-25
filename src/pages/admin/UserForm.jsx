import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { useAuth } from '../../lib/AuthContext';
import { showLocalNotification } from '../../lib/notificationService';
import { notifyAdminActivity } from '../../lib/notificationDispatcher';

// Colleges, programs, terms, and sections all come from the database and are saved by ID
// (admin setup audit 2026-10-11: C1, M1, M2, M8, M11).
const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'dean', label: 'Dean' },
  { value: 'admin', label: 'Administrator' }
];
const NUMBER_PREFIX = { student: '', faculty: 'FAC-', dean: 'DN-', admin: 'ADM-' };
const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const DEFAULT_PASSWORD = 'SagePassword123!';

const yearDigitOf = (yearLevel) => (yearLevel || '').charAt(0);
const termLabel = (sec) => `${sec.school_year} · ${sec.semester}`;
const programAbbreviation = (program) => program?.abbreviation || '';

// Section names follow "<PROGRAM ABBREVIATION>-<year digit><suffix>", e.g. BSIT-1A.
function sectionMatchesProgram(section, abbreviation) {
  if (!abbreviation) return true;
  const name = (section.name || '').toUpperCase();
  const prefix = `${abbreviation.toUpperCase()}-`;
  return name.startsWith(prefix) && /^\d/.test(name.slice(prefix.length));
}

function sectionYearDigit(section) {
  return (section.name || '').match(/-(\d)/)?.[1] || '';
}

function isActiveTermSection(section, activeTerm) {
  return Boolean(activeTerm)
    && section.school_year === activeTerm.school_year
    && section.semester === activeTerm.semester;
}

export default function UserForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const params = new URLSearchParams(location.search);
  const userId = params.get('id');
  const isEditMode = Boolean(userId);

  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    middleName: '',
    email: '',
    role: 'student',
    departmentId: '',
    programId: '',
    yearLevel: '1st Year',
    sectionId: '',
    status: 'active'
  });
  const [userNumber, setUserNumber] = useState('');
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sections, setSections] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [lookupsReady, setLookupsReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Reference data from the database.
  useEffect(() => {
    let cancelled = false;
    async function loadLookups() {
      try {
        const [deptRes, progRes, termRes, secRes] = await Promise.all([
          supabase.from('departments').select('department_id, name').order('name'),
          supabase.from('programs').select('program_id, name, abbreviation, department_id').order('name'),
          supabase.from('academic_terms').select('term_id, school_year, semester, is_active').eq('is_active', true).maybeSingle(),
          supabase.from('sections').select('section_id, name, department_id, school_year, semester').order('name')
        ]);
        const failed = [deptRes, progRes, termRes, secRes].find(res => res.error);
        if (failed) throw failed.error;
        if (cancelled) return;
        setDepartments(deptRes.data || []);
        setPrograms(progRes.data || []);
        setActiveTerm(termRes.data || null);
        setSections(secRes.data || []);
        setLookupsReady(true);
      } catch (err) {
        console.error('Failed to load colleges, programs, terms, or sections:', err);
        if (!cancelled) setErrorMsg('Could not load colleges, programs, terms, or sections. Refresh the page and try again.');
      }
    }
    loadLookups();
    return () => { cancelled = true; };
  }, []);

  // Existing user (edit mode). Runs after the reference data so the program can be derived.
  useEffect(() => {
    if (!isEditMode || !lookupsReady) return;
    let cancelled = false;
    async function fetchUserData() {
      try {
        const { data: existingUser, error } = await supabase
          .from('users')
          .select('user_id, first_name, last_name, middle_name, email, role, department_id, section_id, year_level, status, user_number')
          .eq('user_id', userId)
          .single();
        if (error) throw error;
        if (cancelled) return;

        const homeSection = sections.find(sec => sec.section_id === existingUser.section_id) || null;
        const collegeId = existingUser.department_id || homeSection?.department_id || '';
        const program = homeSection
          ? programs.find(p => p.department_id === collegeId && sectionMatchesProgram(homeSection, programAbbreviation(p)) && programAbbreviation(p))
          : null;

        setUserNumber(existingUser.user_number || '');
        setFormData({
          lastName: existingUser.last_name || '',
          firstName: existingUser.first_name || '',
          middleName: existingUser.middle_name || '',
          email: existingUser.email || '',
          role: ROLES.some(r => r.value === existingUser.role) ? existingUser.role : 'student',
          departmentId: collegeId,
          programId: program?.program_id || '',
          yearLevel: existingUser.year_level && YEAR_LEVELS.includes(existingUser.year_level) ? existingUser.year_level : '1st Year',
          sectionId: existingUser.section_id || '',
          status: existingUser.status || 'active'
        });
      } catch (err) {
        console.error('Failed to load user:', err);
        if (!cancelled) setErrorMsg('Failed to load user from database: ' + err.message);
      }
    }
    fetchUserData();
    return () => { cancelled = true; };
  }, [isEditMode, lookupsReady, userId, sections, programs]);

  const collegePrograms = useMemo(
    () => programs.filter(p => p.department_id === formData.departmentId),
    [programs, formData.departmentId]
  );
  const selectedProgram = programs.find(p => p.program_id === formData.programId) || null;

  // Sections offered: active term, this college, this program, this year level.
  const sectionOptions = useMemo(() => {
    const abbreviation = programAbbreviation(selectedProgram);
    const yearDigit = yearDigitOf(formData.yearLevel);
    return sections.filter(sec =>
      isActiveTermSection(sec, activeTerm)
      && sec.department_id === formData.departmentId
      && sectionMatchesProgram(sec, abbreviation)
      && (!yearDigit || sectionYearDigit(sec) === yearDigit)
    );
  }, [sections, activeTerm, formData.departmentId, selectedProgram, formData.yearLevel]);

  // A saved section that is no longer offered (e.g. a previous term) stays visible, clearly labeled.
  const savedSectionOutsideOptions = formData.sectionId && !sectionOptions.some(sec => sec.section_id === formData.sectionId)
    ? sections.find(sec => sec.section_id === formData.sectionId) || null
    : null;

  // Whenever college, program, or year changes, drop a selection that is no longer offered
  // instead of silently keeping a value the admin can't see.
  const updateField = (changes) => {
    setFormData(prev => {
      const next = { ...prev, ...changes };
      if ('departmentId' in changes && changes.departmentId !== prev.departmentId) {
        next.programId = '';
        next.sectionId = '';
      }
      if (('programId' in changes && changes.programId !== prev.programId)
        || ('yearLevel' in changes && changes.yearLevel !== prev.yearLevel)) {
        next.sectionId = '';
      }
      if ('role' in changes && changes.role !== 'student') {
        next.programId = '';
        next.sectionId = '';
      }
      if ('role' in changes && changes.role === 'admin') {
        next.departmentId = '';
      }
      return next;
    });
  };

  // Next unused number for the role and year (numbers are unique in the database).
  const nextUserNumber = async (role) => {
    const prefix = `${NUMBER_PREFIX[role] ?? ''}${new Date().getFullYear()}-`;
    const { data, error } = await supabase
      .from('users')
      .select('user_number')
      .like('user_number', `${prefix}%`)
      .order('user_number', { ascending: false })
      .limit(1);
    if (error) throw error;
    const last = data?.[0]?.user_number?.slice(prefix.length) || '0';
    const nextSeq = (parseInt(last, 10) || 0) + 1;
    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.lastName.trim() || !formData.firstName.trim() || !formData.email.trim()) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!ROLES.some(r => r.value === formData.role)) {
      setErrorMsg('Choose a valid role.');
      return;
    }
    if (formData.role !== 'admin' && !formData.departmentId) {
      setErrorMsg('Choose a college.');
      return;
    }
    if (formData.role === 'student') {
      if (!activeTerm) {
        setErrorMsg('No active term is set. Activate a term in Academic Terms before assigning students to sections.');
        return;
      }
      if (!formData.programId) {
        setErrorMsg('Choose a degree program.');
        return;
      }
      if (!formData.sectionId) {
        setErrorMsg('Choose a section for this student.');
        return;
      }
    }

    const isStudent = formData.role === 'student';
    const departmentId = formData.role === 'admin' ? null : formData.departmentId;
    const sectionId = isStudent ? formData.sectionId : null;
    const yearLevel = isStudent ? formData.yearLevel : null;

    setSaving(true);
    try {
      if (isEditMode) {
        // Email is not sent: changing it here would not change the login email.
        const userPayload = {
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          middle_name: formData.middleName.trim(),
          role: formData.role,
          department_id: departmentId,
          section_id: sectionId,
          year_level: yearLevel,
          status: formData.status
        };

        const { error } = await supabase
          .from('users')
          .update(userPayload)
          .eq('user_id', userId);
        if (error) throw error;

        await showLocalNotification({
          title: 'User Profile Updated',
          body: `Updated ${formData.role.toUpperCase()} account for ${formData.firstName} ${formData.lastName}.`
        });

        const actorName = resolveActorName(profile, user);
        await logActivity(
          'User Update',
          `Updated user details for ${formData.lastName}, ${formData.firstName} (${formData.email})`,
          actorName
        );
        await notifyAdminActivity({
          type: 'security',
          message: `Security Notice: User details for ${formData.lastName}, ${formData.firstName} (${formData.email}) were updated by ${actorName}.`,
          actorName
        });
      } else {
        const newUserNumber = await nextUserNumber(formData.role);

        const { data: invokeData, error: invokeErr } = await supabase.functions.invoke('create-admin-user', {
          body: {
            email: formData.email.trim().toLowerCase(),
            password: DEFAULT_PASSWORD,
            firstName: formData.firstName.trim(),
            lastName: formData.lastName.trim(),
            middleName: formData.middleName.trim(),
            role: formData.role,
            departmentId,
            yearLevel,
            sectionId,
            userNumber: newUserNumber
          }
        });
        if (invokeErr || invokeData?.error) {
          throw new Error(invokeErr?.message || invokeData?.error || 'Failed to register authentication account.');
        }

        // Client-side fallback in case the function did not store the number.
        if (invokeData?.user?.id) {
          await supabase
            .from('users')
            .update({ user_number: newUserNumber })
            .eq('user_id', invokeData.user.id);
        }

        await showLocalNotification({
          title: 'New User Registered',
          body: `Created ${formData.role.toUpperCase()} account for ${formData.firstName} ${formData.lastName}.`
        });

        const actorName = resolveActorName(profile, user);
        await logActivity(
          'User Creation',
          `Created new ${formData.role} account: ${formData.lastName}, ${formData.firstName} (${formData.email})`,
          actorName
        );
        await notifyAdminActivity({
          type: 'user_signup',
          message: `Security Notice: Created new ${formData.role.toUpperCase()} account for ${formData.firstName} ${formData.lastName} (${formData.email}) by ${actorName}.`,
          actorName
        });
      }

      navigate('/admin/userlist');
    } catch (err) {
      console.error('Error saving user:', err);
      setErrorMsg('Failed to save user: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectClass = 'block w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs sm:text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';
  const inputClass = 'block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-xl text-xs sm:text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500';
  const labelClass = 'text-xs font-bold text-slate-700 uppercase tracking-wide';

  return (
    <>
      <PageHeader
        title={isEditMode ? 'Edit User Account' : 'Register New User'}
        breadcrumb="Admin Portal"
      />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 max-w-2xl mx-auto w-full space-y-4 sm:space-y-6">

        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/admin/userlist')}>
            User Management
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">
            {isEditMode ? 'Edit Account' : 'Register User'}
          </span>
        </div>

        {errorMsg && (
          <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 sm:p-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2">
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="flex items-center gap-3 pb-3 sm:pb-4 border-b border-slate-100">
            <div className="p-2 bg-sage-50 text-sage-600 rounded-xl">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold font-display text-slate-900">User Identification</h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Please provide exact academic record credentials.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>First Name <span className="text-rose-500">*</span></label>
              <input type="text" required value={formData.firstName} onChange={(e) => updateField({ firstName: e.target.value })} className={inputClass} placeholder="e.g. Amanda" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Middle Name</label>
              <input type="text" value={formData.middleName} onChange={(e) => updateField({ middleName: e.target.value })} className={inputClass} placeholder="e.g. Santos" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Last Name <span className="text-rose-500">*</span></label>
              <input type="text" required value={formData.lastName} onChange={(e) => updateField({ lastName: e.target.value })} className={inputClass} placeholder="e.g. Rivera" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {/* Email: locked after creation (changing it here would not change the login email). */}
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Email Address <span className="text-rose-500">*</span></label>
              <input
                type="email"
                required
                readOnly={isEditMode}
                value={formData.email}
                onChange={(e) => updateField({ email: e.target.value })}
                className={`${inputClass} font-mono ${isEditMode ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                placeholder="e.g. user@sage.edu.ph"
              />
              {isEditMode && (
                <span className="text-[10px] text-slate-400 mt-0.5">The email is the account's login and can't be changed here.</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Portal Role</label>
              <select value={formData.role} onChange={(e) => updateField({ role: e.target.value })} className={selectClass}>
                {ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {formData.role !== 'admin' && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>College / School <span className="text-rose-500">*</span></label>
                <select
                  value={formData.departmentId}
                  onChange={(e) => updateField({ departmentId: e.target.value })}
                  disabled={!lookupsReady}
                  className={selectClass}
                >
                  <option value="">-- Select College --</option>
                  {departments.map(dept => (
                    <option key={dept.department_id} value={dept.department_id}>{dept.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5 justify-center">
              <label className={`${labelClass} mb-1`}>Account Active Status</label>
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="status-toggle"
                  checked={formData.status === 'active'}
                  onChange={(e) => updateField({ status: e.target.checked ? 'active' : 'inactive' })}
                  className="w-4 h-4 text-sage-600 border-slate-200 rounded focus:ring-sage-500 outline-none cursor-pointer"
                />
                <label htmlFor="status-toggle" className="text-xs sm:text-sm font-medium text-slate-700 cursor-pointer select-none">
                  Enable logins and portal access
                </label>
              </div>
            </div>
          </div>

          {!isEditMode ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Default Password</label>
                <input type="text" readOnly value={DEFAULT_PASSWORD} className="block w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-500 font-mono outline-none cursor-not-allowed" />
                <span className="text-[10px] text-slate-400 mt-0.5">Temporary password; the user must change it at first login.</span>
              </div>
            </div>
          ) : userNumber && (
            <p className="text-xs text-slate-500">ID number: <span className="font-mono font-semibold text-slate-700">{userNumber}</span></p>
          )}

          {/* Students: program, year level, and an active-term section are required. */}
          {formData.role === 'student' && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <p className="text-[11px] text-slate-500">
                {activeTerm
                  ? <>Sections shown are for the active term: <strong className="text-slate-700">{activeTerm.school_year} · {activeTerm.semester}</strong>.</>
                  : <strong className="text-rose-600">No active term is set. Activate a term in Academic Terms first.</strong>}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Degree Program <span className="text-rose-500">*</span></label>
                  <select
                    value={formData.programId}
                    onChange={(e) => updateField({ programId: e.target.value })}
                    disabled={!formData.departmentId}
                    className={`${selectClass} truncate`}
                  >
                    <option value="">{formData.departmentId ? '-- Select Program --' : 'Choose a college first'}</option>
                    {collegePrograms.map(prog => (
                      <option key={prog.program_id} value={prog.program_id}>{prog.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Year Level</label>
                  <select value={formData.yearLevel} onChange={(e) => updateField({ yearLevel: e.target.value })} className={selectClass}>
                    {YEAR_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Assigned Section <span className="text-rose-500">*</span></label>
                  <select
                    value={formData.sectionId}
                    onChange={(e) => updateField({ sectionId: e.target.value })}
                    disabled={!formData.programId}
                    className={selectClass}
                  >
                    <option value="">
                      {!formData.programId ? 'Choose a program first' : sectionOptions.length ? '-- Select Section --' : 'No sections for this program and year'}
                    </option>
                    {savedSectionOutsideOptions && (
                      <option value={savedSectionOutsideOptions.section_id}>
                        {savedSectionOutsideOptions.name} ({termLabel(savedSectionOutsideOptions)}, current)
                      </option>
                    )}
                    {sectionOptions.map(sec => (
                      <option key={sec.section_id} value={sec.section_id}>{sec.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {savedSectionOutsideOptions && (
                <p className="text-[11px] text-amber-700">
                  This student's current section ({savedSectionOutsideOptions.name}, {termLabel(savedSectionOutsideOptions)}) is not an active-term section for the selected program and year. Choose an active-term section to move them.
                </p>
              )}
              {formData.programId && !sectionOptions.length && (
                <p className="text-[11px] text-slate-500">Create the section for this program, year, and term in Sections first.</p>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/userlist')}
              className="w-full sm:w-auto px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !lookupsReady}
              className="w-full sm:w-auto px-5 py-2.5 bg-sage-600 hover:bg-sage-700 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : isEditMode ? 'Save Changes' : 'Register User'}
            </button>
          </div>
        </form>

      </div>
    </>
  );
}
