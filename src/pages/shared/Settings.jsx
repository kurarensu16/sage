import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { usePwaInstall } from '../../lib/usePwaInstall';
import PageHeader from '../../components/layout/PageHeader';
import SmartInstallModal from '../../components/layout/SmartInstallModal';
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
  Mail,
  Volume2,
  Bell,
  BrainCircuit,
  Award,
  Shield,
  LogOut,
  Download
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const role = path.split('/')[1] || 'faculty';

  const { profile, signOut } = useAuth();
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

  // Helper for preferences
  const getInitialPreferences = (currentRole) => {
    const base = {
      emailAlerts: true,
      systemSounds: false,
      ewsNotifications: true,
      gradeAlerts: true,
      evalAlerts: true,
      backupReminder: true,
      autoSync: true,
      syncFrequency: 'daily'
    };
    if (currentRole === 'admin') {
      return { ...base, emailAlerts: true, autoSync: true, backupReminder: true };
    } else if (currentRole === 'office') {
      return { ...base, emailAlerts: true, autoSync: true, backupReminder: true };
    } else if (currentRole === 'dean') {
      return { ...base, emailAlerts: true, evalAlerts: true };
    } else if (currentRole === 'faculty') {
      return { ...base, emailAlerts: true, ewsNotifications: true, evalAlerts: true };
    } else {
      return { ...base, emailAlerts: true, ewsNotifications: true, gradeAlerts: true };
    }
  };

  const [preferences, setPreferences] = useState(() => getInitialPreferences(role));

  // Handle changing password
  const handleSavePassword = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess(false);

    if (!passwordData.oldPassword) {
      setSaveError('Current password is required.');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setSaveError('New password must be at least 6 characters long.');
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

  const dbConnectionDetails = {
    url: 'https://ettnwknyhdhehoclrwwh.supabase.co',
    status: 'Connected',
    engine: 'PostgreSQL 15 (Supabase Cloud)',
    rlsStatus: 'Inactive (Disabled for dev phase)'
  };

  const getPasswordStrength = () => {
    const pwd = passwordData.newPassword;
    if (!pwd) return null;
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { label: 'Weak', color: 'bg-rose-500', width: 'w-1/3' };
    if (score <= 4) return { label: 'Medium', color: 'bg-amber-500', width: 'w-2/3' };
    return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
  };

  const pwdStrength = getPasswordStrength();

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'preferences', label: 'Preferences', icon: Sliders },
    ...(role === 'admin' ? [{ id: 'database', label: 'Database', icon: Database }] : [])
  ];

  // Helper toggle switch renderer (iOS Native Mobile App Style)
  const renderToggleSwitch = (value, onChange) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out cursor-pointer flex-shrink-0 relative focus:outline-none",
        value ? "bg-sage-600" : "bg-slate-300"
      )}
    >
      <span 
        className={cn(
          "block w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out",
          value ? "translate-x-5" : "translate-x-0"
        )} 
      />
    </button>
  );

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
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-sage-800 text-white font-bold font-display text-lg sm:text-xl flex items-center justify-center flex-shrink-0 shadow-md">
            {profileData.name.split(' ').map(n => n[0]).filter(Boolean).slice(-2).join('')}
          </div>
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
                <p className="text-xs text-slate-500 mt-0.5">Academic account and institutional registration data.</p>
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

                  {pwdStrength && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">Strength:</span>
                        <span className="font-semibold text-slate-700">{pwdStrength.label}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn("h-full transition-all duration-300", pwdStrength.color, pwdStrength.width)}></div>
                      </div>
                    </div>
                  )}
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
          {activeTab === 'preferences' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-sm space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">Notifications & Preferences</h3>
                <p className="text-xs text-slate-500 mt-0.5">Customize alerts and interaction settings.</p>
              </div>

              <div className="space-y-3">
                
                {/* Email Digests */}
                <div className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/40 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-sage-100 text-sage-700 flex items-center justify-center flex-shrink-0">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Email Digests</h4>
                      <p className="text-[11px] text-slate-500 line-clamp-1">Receive system summary emails.</p>
                    </div>
                  </div>
                  {renderToggleSwitch(preferences.emailAlerts, (val) => setPreferences({ ...preferences, emailAlerts: val }))}
                </div>

                {/* Sound Effects */}
                <div className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/40 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
                      <Volume2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">System Sound Effects</h4>
                      <p className="text-[11px] text-slate-500 line-clamp-1">Play sounds on action confirmation.</p>
                    </div>
                  </div>
                  {renderToggleSwitch(preferences.systemSounds, (val) => setPreferences({ ...preferences, systemSounds: val }))}
                </div>

                {/* Role Specific Toggles */}
                {role === 'student' && (
                  <>
                    <div className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/40 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                          <Award className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Grade Posting Alerts</h4>
                          <p className="text-[11px] text-slate-500 line-clamp-1">Alert when new grades are posted.</p>
                        </div>
                      </div>
                      {renderToggleSwitch(preferences.gradeAlerts, (val) => setPreferences({ ...preferences, gradeAlerts: val }))}
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/40 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                          <BrainCircuit className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">AI Counseling Insights</h4>
                          <p className="text-[11px] text-slate-500 line-clamp-1">Alert when new risk verdicts generate.</p>
                        </div>
                      </div>
                      {renderToggleSwitch(preferences.ewsNotifications, (val) => setPreferences({ ...preferences, ewsNotifications: val }))}
                    </div>
                  </>
                )}

                {role === 'faculty' && (
                  <>
                    <div className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/40 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                          <Bell className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">At-Risk Student Alerts</h4>
                          <p className="text-[11px] text-slate-500 line-clamp-1">Flag students below 75% average.</p>
                        </div>
                      </div>
                      {renderToggleSwitch(preferences.ewsNotifications, (val) => setPreferences({ ...preferences, ewsNotifications: val }))}
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/40 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                          <Sliders className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Evaluation Release Alerts</h4>
                          <p className="text-[11px] text-slate-500 line-clamp-1">Notify when Deans release ratings.</p>
                        </div>
                      </div>
                      {renderToggleSwitch(preferences.evalAlerts, (val) => setPreferences({ ...preferences, evalAlerts: val }))}
                    </div>
                  </>
                )}

              </div>
            </div>
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
            <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-display">Install SAGE Mobile</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Direct client installation for your device.</p>
                </div>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {platform === 'android' ? 'Android APK' : platform === 'ios' ? 'Safari PWA' : 'Desktop App'}
                </span>
              </div>

              <button
                type="button"
                onClick={promptInstall}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-xs sm:text-sm border transition-all cursor-pointer shadow-xs",
                  platform === 'android' 
                    ? "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white border-transparent"
                    : platform === 'ios'
                    ? "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white border-transparent"
                    : "bg-sage-700 hover:bg-sage-800 active:scale-[0.99] text-white border-transparent"
                )}
              >
                <Download className="h-4 w-4" />
                <span>
                  {platform === 'android' 
                    ? 'Download Android App (.APK)' 
                    : platform === 'ios' 
                    ? 'Add to Home Screen (iOS Safari)' 
                    : 'Install SAGE Desktop App'}
                </span>
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
              <span>Sign Out of SAGE</span>
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
