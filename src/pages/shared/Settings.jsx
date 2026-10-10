import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { usePwaInstall } from '../../lib/usePwaInstall';
import PageHeader from '../../components/layout/PageHeader';
import SmartInstallModal from '../../components/layout/SmartInstallModal';
import NotificationPreferences from '../../components/settings/NotificationPreferences';
import PasswordRequirements from '../../components/auth/PasswordRequirements';
import ProfilePhotoAndContact from '../../components/settings/ProfilePhotoAndContact';
import UserAvatar from '../../components/layout/UserAvatar';
import { checkPassword, PASSWORD_POLICY_MESSAGE } from '../../lib/passwordPolicy';
import { 
  User, 
  Lock, 
  Sliders, 
  Database, 
  Save, 
  Check, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Shield,
  LogOut,
  Download,
  Edit2,
  X,
  Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const role = path.split('/')[1] || 'faculty';

  const { profile, user, signOut, refreshProfile } = useAuth();
  const { 
    platform, 
    isInstalled, 
    canNativeInstall, 
    downloadApk, 
    promptInstall, 
    showGuideModal, 
    setShowGuideModal,
    activeTab: pwaActiveTab,
    setActiveTab: setPwaActiveTab 
  } = usePwaInstall();

  const handleSignOut = async () => {
    navigate('/login', { replace: true });
    await signOut();
  };

  // State definitions
  const [activeTab, setActiveTab] = useState('profile');
  const [showPassword, setShowPassword] = useState({ old: false, new: false, confirm: false });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [guardianInfo, setGuardianInfo] = useState(null);
  const [isEditingGuardian, setIsEditingGuardian] = useState(false);
  const [editGuardianForm, setEditGuardianForm] = useState({ full_name: '', relationship: '', email: '' });
  const [savingGuardian, setSavingGuardian] = useState(false);
  const [guardianError, setGuardianError] = useState('');
  
  const RELATIONSHIP_OPTIONS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Other'];

  // Fetch Guardian for Student Portal
  useEffect(() => {
    let cancelled = false;
    async function fetchGuardian() {
      if (role !== 'student' || !user?.id) return;
      const { data } = await supabase
        .from('guardians')
        .select('full_name, relationship, email')
        .eq('student_id', user.id)
        .eq('is_primary', true)
        .maybeSingle();
      if (!cancelled && data) {
        setGuardianInfo(data);
        setEditGuardianForm({
          full_name: data.full_name || '',
          relationship: data.relationship || '',
          email: data.email || ''
        });
      }
    }
    fetchGuardian();
    return () => { cancelled = true; };
  }, [role, user?.id]);

  const handleSaveGuardian = async (e) => {
    e.preventDefault();
    setGuardianError('');
    const { full_name, relationship, email } = editGuardianForm;
    
    if (!full_name.trim() || !relationship || !email.trim()) {
      setGuardianError('All fields are required.');
      return;
    }
    
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setGuardianError('Enter a valid email address.');
      return;
    }

    setSavingGuardian(true);
    const { error } = await supabase.rpc('upsert_primary_guardian', {
      p_full_name: full_name.trim(),
      p_relationship: relationship,
      p_email: email.trim()
    });
    setSavingGuardian(false);

    if (error) {
      setGuardianError(error.message || 'Could not update guardian information.');
      return;
    }

    setGuardianInfo({ full_name: full_name.trim(), relationship, email: email.trim() });
    setIsEditingGuardian(false);
  };

  // Sync activeTab with URL search param ?tab=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      if (tabParam === 'password' || tabParam === 'security') {
        setActiveTab('security');
      } else if (tabParam === 'notifications' || tabParam === 'preferences') {
        setActiveTab('preferences');
      } else if (tabParam === 'profile') {
        setActiveTab('profile');
      } else if (tabParam === 'database') {
        setActiveTab('database');
      }
    }
  }, [location.search]);

  // Role metadata default configs
  const roleMeta = {
    admin: {
      name: 'Admin System Control',
      email: 'admin@sage.edu.ph',
      title: 'Administrator',
      department: 'System Administration',
      college: 'ICT Services Division'
    },
    faculty: {
      name: 'Prof. Amanda Rivera',
      email: 'a.rivera@sage.edu.ph',
      title: 'Senior Faculty',
      department: 'Department of Information Technology',
      college: 'College of Computer Studies'
    },
    dean: {
      name: 'Dr. Carlos Valdes',
      email: 'c.valdes@sage.edu.ph',
      title: 'College Dean',
      department: 'Dean\'s Office',
      college: 'College of Computer Studies'
    },
    office: {
      name: 'College Office Staff',
      email: 'office@sage.edu.ph',
      title: 'Office Staff',
      department: 'College Office',
      college: 'College of Computer Studies'
    },
    student: {
      name: 'Sarah Jenkins',
      email: 's.jenkins@student.sage.edu',
      title: 'BSIT - 3rd Year',
      department: 'IT Department',
      college: 'College of Computer Studies'
    }
  };

  const defaultData = roleMeta[role] || roleMeta.faculty;

  // Compute profile data
  const profileData = (() => {
    if (!profile) return defaultData;
    const displayName = profile.first_name ? `${profile.first_name} ${profile.last_name}` : defaultData.name;
    const displayTitle = (() => {
      if (role === 'student') {
        const prog = profile.program || '';
        const year = profile.year_level || profile.yearLevel || '';
        return [prog, year].filter(Boolean).join(' • ') || defaultData.title;
      }
      return profile.departments?.name || profile.department || profile.department_name || defaultData.title;
    })();

    return {
      name: displayName,
      email: profile.email || defaultData.email,
      title: displayTitle,
      department: profile.departments?.name || profile.department || profile.department_name || defaultData.department,
      college: profile.departments?.name || profile.college || defaultData.college
    };
  })();

  // Password Form state
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });


  // Handle changing password
  const handleSavePassword = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess(false);

    if (!passwordData.oldPassword) {
      setSaveError('Current password is required.');
      return;
    }
    if (!checkPassword(passwordData.newPassword).valid) {
      setSaveError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setSaveError('Confirm password does not match new password.');
      return;
    }

    setSubmittingPassword(true);

    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: profileData.email,
        password: passwordData.oldPassword
      });

      if (verifyError) {
        setSaveError('Incorrect current password.');
        setSubmittingPassword(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (updateError) {
        setSaveError(updateError.message);
        setSubmittingPassword(false);
        return;
      }

      if (profile?.must_change_password) {
        await supabase
          .from('users')
          .update({ must_change_password: false })
          .eq('user_id', profile.user_id);
      }

      setSaveSuccess(true);
      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error('Error changing password:', err);
      setSaveError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmittingPassword(false);
    }
  };

  const profileInitials = profileData.name.split(' ').map(n => n[0]).filter(Boolean).slice(-2).join('');

  const dbConnectionDetails = {
    url: 'https://ettnwknyhdhehoclrwwh.supabase.co',
    status: 'Connected',
    engine: 'PostgreSQL 15 (Supabase Cloud)',
    rlsStatus: 'Inactive (Disabled for dev phase)'
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'preferences', label: 'Preferences', icon: Sliders },
    ...(role === 'admin' ? [{ id: 'database', label: 'Database', icon: Database }] : [])
  ];


  return (
    <>
      <PageHeader title="Account Settings" breadcrumb={`${role.charAt(0).toUpperCase() + role.slice(1)} Portal`} />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-4 sm:space-y-6">
        
        {/* Status Alerts */}
        {saveSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3.5 sm:p-4 flex items-center gap-3 shadow-sm animate-in fade-in duration-200">
            <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <div className="text-xs sm:text-sm font-semibold">Changes saved successfully.</div>
          </div>
        )}

        {saveError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 sm:p-4 flex items-center gap-3 shadow-sm animate-in fade-in duration-200">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
            <div className="text-xs sm:text-sm font-semibold">{saveError}</div>
          </div>
        )}

        {/* Mobile App Style Profile Banner Header */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-sm flex items-center gap-4">
          <UserAvatar
            path={profile?.avatar_path}
            initials={profileInitials}
            className="w-14 h-14 sm:w-16 sm:h-16 bg-sage-800 text-white font-bold font-display text-lg sm:text-xl shadow-md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-xl font-bold font-display text-slate-900 truncate">
                {profileData.name}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sage-100 text-sage-800 border border-sage-200 capitalize flex-shrink-0">
                {role}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">{profileData.email}</p>
            <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">{profileData.title} &bull; {profileData.department}</p>
          </div>
        </div>

        {/* Native Mobile Segmented Control Bar */}
        <div className="bg-slate-200/70 p-1 rounded-2xl shadow-inner grid grid-cols-3 sm:grid-cols-4 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSaveError('');
                setSaveSuccess(false);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center select-none",
                activeTab === tab.id
                  ? "bg-white text-slate-900 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/50"
              )}
            >
              <tab.icon className={cn("h-3.5 w-3.5 flex-shrink-0", activeTab === tab.id ? "text-sage-600" : "text-slate-400")} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Active Panel Content */}
        <div className="space-y-4">
          
          {/* PROFILE PANEL */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-sm space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">Profile Information</h3>
                <p className="text-xs text-slate-500 mt-0.5">Name, email, ID number, and department are maintained by the administrator. You can update your photo and contact number.</p>
              </div>

              <div className="space-y-3.5">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Full Name</span>
                  <span className="text-sm font-bold text-slate-800 block">{profileData.name}</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address</span>
                  <span className="text-sm font-bold text-slate-800 block">{profileData.email}</span>
                </div>

                {(profile?.user_number || (role === 'student' ? '2026-00005' : 'FAC-2026-00003')) && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {role === 'student' ? 'Student Number / ID' : 'Employee ID Number'}
                    </span>
                    <span className="text-sm font-bold text-slate-850 block">{profile?.user_number || (role === 'student' ? '2026-00005' : 'FAC-2026-00003')}</span>
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Department & College</span>
                  <span className="text-sm font-bold text-slate-800 block">{profileData.department}</span>
                  <span className="text-xs text-slate-500 block">{profileData.college}</span>
                </div>

                {user?.id && (
                  <ProfilePhotoAndContact
                    userId={user.id}
                    profile={profile}
                    initials={profileInitials}
                    onUpdated={refreshProfile}
                  />
                )}

                {role === 'student' && guardianInfo && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Guardian Information</span>
                      {!isEditingGuardian && (
                        <button 
                          onClick={() => setIsEditingGuardian(true)}
                          className="flex items-center gap-1.5 text-[11px] font-bold text-sage-600 hover:text-sage-700 hover:bg-sage-50 px-2 py-1 rounded-md transition-colors"
                        >
                          <Edit2 className="h-3 w-3" /> Edit
                        </button>
                      )}
                    </div>
                    
                    {isEditingGuardian ? (
                      <form onSubmit={handleSaveGuardian} className="space-y-3">
                        {guardianError && (
                          <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-2 text-rose-600">
                            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span className="text-xs font-medium leading-relaxed">{guardianError}</span>
                          </div>
                        )}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
                          <input 
                            type="text" 
                            value={editGuardianForm.full_name}
                            onChange={(e) => setEditGuardianForm({...editGuardianForm, full_name: e.target.value})}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none bg-white"
                            disabled={savingGuardian}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Relationship</label>
                          <select
                            value={editGuardianForm.relationship}
                            onChange={(e) => setEditGuardianForm({...editGuardianForm, relationship: e.target.value})}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none bg-white"
                            disabled={savingGuardian}
                          >
                            <option value="">Select Relationship</option>
                            {RELATIONSHIP_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
                          <input 
                            type="email" 
                            value={editGuardianForm.email}
                            onChange={(e) => setEditGuardianForm({...editGuardianForm, email: e.target.value})}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none bg-white"
                            disabled={savingGuardian}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <button 
                            type="button" 
                            onClick={() => {
                              setIsEditingGuardian(false);
                              setGuardianError('');
                              setEditGuardianForm({
                                full_name: guardianInfo.full_name || '',
                                relationship: guardianInfo.relationship || '',
                                email: guardianInfo.email || ''
                              });
                            }}
                            disabled={savingGuardian}
                            className="flex-1 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button 
                            type="submit" 
                            disabled={savingGuardian}
                            className="flex-1 px-3 py-2 bg-sage-600 text-white rounded-lg text-xs font-bold hover:bg-sage-700 transition-colors flex items-center justify-center gap-1.5"
                          >
                            {savingGuardian ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            {savingGuardian ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-sm font-bold text-slate-800 block">{guardianInfo.full_name} <span className="font-medium text-slate-500 text-xs">({guardianInfo.relationship})</span></span>
                        <span className="text-xs text-slate-500 block">{guardianInfo.email}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-slate-400">
                <Shield className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <span className="text-[11px] font-medium leading-relaxed">Official registration data is managed by DYCI Registrar and IT Services.</span>
              </div>
            </div>
          )}

          {/* SECURITY PANEL */}
          {activeTab === 'security' && (
            <form onSubmit={handleSavePassword} className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-sm space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">Sign In & Password</h3>
                <p className="text-xs text-slate-500 mt-0.5">Update your portal account credentials.</p>
              </div>

              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Current Password</label>
                  <div className="relative">
                    <input 
                      type={showPassword.old ? 'text' : 'password'} 
                      value={passwordData.oldPassword} 
                      onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                      className="block w-full border border-slate-200 rounded-xl p-3 pr-10 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-all outline-none bg-slate-50/50"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword({ ...showPassword, old: !showPassword.old })}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword.old ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">New Password</label>
                  <div className="relative">
                    <input 
                      type={showPassword.new ? 'text' : 'password'} 
                      value={passwordData.newPassword} 
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="block w-full border border-slate-200 rounded-xl p-3 pr-10 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-all outline-none bg-slate-50/50"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword({ ...showPassword, new: !showPassword.new })}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <PasswordRequirements value={passwordData.newPassword} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Confirm New Password</label>
                  <div className="relative">
                    <input 
                      type={showPassword.confirm ? 'text' : 'password'} 
                      value={passwordData.confirmPassword} 
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      className="block w-full border border-slate-200 rounded-xl p-3 pr-10 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-all outline-none bg-slate-50/50"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword({ ...showPassword, confirm: !showPassword.confirm })}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button 
                  type="submit"
                  disabled={submittingPassword}
                  className="w-full sm:w-auto justify-center px-5 py-3 text-xs sm:text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
                >
                  <Save className="h-4 w-4" /> {submittingPassword ? 'Updating...' : 'Save New Password'}
                </button>
              </div>
            </form>
          )}

          {/* PREFERENCES PANEL */}
          {activeTab === 'preferences' && user?.id && (
            <NotificationPreferences userId={user.id} role={role} />
          )}

          {/* DATABASE PANEL (ADMIN ONLY) */}
          {activeTab === 'database' && role === 'admin' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-sm space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">Database Maintenance</h3>
                <p className="text-xs text-slate-500 mt-0.5">Supabase PostgreSQL engine status.</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/80">
                  <span className="font-semibold text-slate-500">Service Status</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ● {dbConnectionDetails.status}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1 py-1 border-b border-slate-200/80">
                  <span className="font-semibold text-slate-500">Endpoint</span>
                  <span className="font-mono text-[11px] text-slate-800 break-all">{dbConnectionDetails.url}</span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="font-semibold text-slate-500">Engine</span>
                  <span className="font-mono text-[11px] text-slate-800">{dbConnectionDetails.engine}</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Mobile-Only Device & Session Management Section */}
        <div className="lg:hidden pt-2 space-y-3">
          {/* Download Mobile App (Rendered if not in standalone mode) */}
          {!isInstalled && (
            <div className="bg-white rounded-2xl border border-sage-200 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-display">Install ASPIRE App</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Available for Android, iPhone, and desktop. Choose your device in the next step.</p>
                </div>
                <span className="shrink-0 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-sage-50 text-sage-800 border border-sage-200">
                  {platform === 'android' ? 'Detected: Android' : platform === 'ios' ? 'Detected: iPhone' : 'Detected: Desktop'}
                </span>
              </div>

              <button
                type="button"
                onClick={promptInstall}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-xs sm:text-sm border border-transparent bg-sage-700 hover:bg-sage-800 active:scale-[0.99] text-white transition-all cursor-pointer shadow-xs"
              >
                <Download className="h-4 w-4" />
                <span>Install ASPIRE App</span>
              </button>
            </div>
          )}

          {/* Session Management / Sign Out */}
          <div className="bg-white rounded-2xl border border-rose-200/80 p-4 shadow-sm space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 font-display">Session Management</h3>
              <p className="text-xs text-slate-500 mt-0.5">End your current active session on this device.</p>
            </div>
            
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-semibold text-xs sm:text-sm border border-rose-200 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4 text-rose-600 flex-shrink-0" />
              <span>Sign Out of ASPIRE</span>
            </button>
          </div>
        </div>

      </div>

      {/* Smart Adaptive Install Modal */}
      <SmartInstallModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        activeTab={pwaActiveTab}
        setActiveTab={setPwaActiveTab}
        platform={platform}
        downloadApk={downloadApk}
        canNativeInstall={canNativeInstall}
        promptInstall={promptInstall}
        actorName={profileData.name || 'Institutional User'}
      />
    </>
  );
}
