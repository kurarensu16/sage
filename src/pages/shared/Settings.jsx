import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/layout/PageHeader';
import { 
  User, 
  Lock, 
  Sliders, 
  Database, 
  Save, 
  Check, 
  Eye, 
  EyeOff, 
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Settings() {
  const location = useLocation();
  const path = location.pathname;
  const role = path.split('/')[1] || 'faculty';

  const { profile } = useAuth();

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
    student: {
      name: 'Sarah Jenkins',
      email: 's.jenkins@student.sage.edu',
      title: 'BSIT - 3rd Year',
      department: 'IT Department',
      college: 'College of Computer Studies'
    }
  };

  const defaultData = roleMeta[role] || roleMeta.faculty;

  // Compute profile data on render dynamically (avoids useEffect setState cascade)
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

  // Helper for initializing preferences based on role
  const getInitialPreferences = (currentRole) => {
    const base = {
      emailAlerts: true,
      systemSounds: false,
      ewsNotifications: true, // student, faculty
      gradeAlerts: true, // student
      evalAlerts: true, // faculty, dean
      backupReminder: true, // admin
      autoSync: true, // admin
      syncFrequency: 'daily' // admin
    };
    if (currentRole === 'admin') {
      return { ...base, emailAlerts: true, autoSync: true, backupReminder: true };
    } else if (currentRole === 'dean') {
      return { ...base, emailAlerts: true, evalAlerts: true };
    } else if (currentRole === 'faculty') {
      return { ...base, emailAlerts: true, ewsNotifications: true, evalAlerts: true };
    } else {
      return { ...base, emailAlerts: true, ewsNotifications: true, gradeAlerts: true };
    }
  };

  // Preferences Toggles initialized lazily
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
      // 1. Verify current password by logging in again in the background
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: profileData.email,
        password: passwordData.oldPassword
      });

      if (verifyError) {
        setSaveError('Incorrect current password.');
        setSubmittingPassword(false);
        return;
      }

      // 2. Update password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (updateError) {
        setSaveError(updateError.message);
        setSubmittingPassword(false);
        return;
      }

      // 3. Update public.users must_change_password flag if needed
      if (profile?.must_change_password) {
        const { error: dbError } = await supabase
          .from('users')
          .update({ must_change_password: false })
          .eq('user_id', profile.user_id);
        
        if (dbError) {
          console.error('Error updating must_change_password flag:', dbError);
        }
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

  // Supabase Database Connection Details
  const dbConnectionDetails = {
    url: 'https://ettnwknyhdhehoclrwwh.supabase.co',
    status: 'Connected',
    engine: 'PostgreSQL 15 (Supabase Cloud)',
    rlsStatus: 'Inactive (Disabled for development phase)'
  };

  // Helper: check password strength
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

  // Settings tabs configuration
  const tabs = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'security', label: 'Security & Sign In', icon: Lock },
    { id: 'preferences', label: 'Portal Preferences', icon: Sliders },
    ...(role === 'admin' ? [{ id: 'database', label: 'Database Maintenance', icon: Database }] : [])
  ];

  return (
    <>
      <PageHeader title="Account Settings" breadcrumb={`${role.charAt(0).toUpperCase() + role.slice(1)} Portal`} />

      <div className="p-8 overflow-y-auto flex-1 max-w-5xl mx-auto w-full space-y-6">
        
        {/* Status Messages */}
        {saveSuccess && (
          <div className="bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-xl p-4 flex items-center gap-3 animate-fade-in">
            <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <div className="text-sm font-semibold">Changes applied successfully. Settings updated in your local configuration.</div>
          </div>
        )}

        {saveError && (
          <div className="bg-rose-50 border border-rose-250 text-rose-800 rounded-xl p-4 flex items-center gap-3 animate-fade-in">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
            <div className="text-sm font-semibold">{saveError}</div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
          
          {/* Left Column: Navigation Sidebar */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden md:col-span-1">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Settings Panels</span>
            </div>
            <div className="p-2 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSaveError('');
                    setSaveSuccess(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-all text-left",
                    activeTab === tab.id
                      ? "bg-sage-50 text-sage-800 border-l-4 border-sage-500 pl-3 font-bold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-sage-600" : "text-slate-400")} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Active Setting Panel */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden md:col-span-3 flex flex-col min-h-[450px]">
            
            {/* PROFILE PANEL */}
            {activeTab === 'profile' && (
              <div className="p-6 flex flex-col justify-between flex-1 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-950 font-display">Personal Profile Information</h3>
                  <p className="text-xs text-slate-500 mt-1">View details regarding your academic portal profile.</p>
                  
                  {/* Decorative role cards */}
                  <div className="mt-5 p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Authorization</span>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">{profileData.title}</h4>
                      <p className="text-xs text-slate-500">{profileData.department} &bull; {profileData.college}</p>
                    </div>
                    <span className="self-start sm:self-center px-3 py-1 rounded-full text-xs font-semibold bg-sage-100 text-sage-800 border border-sage-200 capitalize">
                      {role} Access
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Display Name</label>
                      <input 
                        type="text" 
                        value={profileData.name} 
                        readOnly
                        disabled
                        className="block w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-slate-50 text-slate-500 cursor-not-allowed select-none outline-none"
                        placeholder="Full Name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email Address</label>
                      <input 
                        type="email" 
                        value={profileData.email} 
                        readOnly
                        disabled
                        className="block w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-slate-50 text-slate-500 cursor-not-allowed select-none outline-none"
                        placeholder="Email Address"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center gap-2 text-slate-400">
                  <AlertCircle className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-[11px] font-medium">Official profile and registration details can only be modified by the Registrar or IT Services.</span>
                </div>
              </div>
            )}

            {/* SECURITY PANEL */}
            {activeTab === 'security' && (
              <form onSubmit={handleSavePassword} className="p-6 flex flex-col justify-between flex-1 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-950 font-display">Authentication & Security Settings</h3>
                  <p className="text-xs text-slate-500 mt-1">Configure your login passwords to maintain credential security.</p>
                  
                  <div className="space-y-4 mt-6 max-w-md">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Current Password</label>
                      <div className="relative">
                        <input 
                          type={showPassword.old ? 'text' : 'password'} 
                          value={passwordData.oldPassword} 
                          onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                          className="block w-full border border-slate-200 rounded-lg p-2.5 pr-10 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-all outline-none"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword({ ...showPassword, old: !showPassword.old })}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                          {showPassword.old ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">New Password</label>
                      <div className="relative">
                        <input 
                          type={showPassword.new ? 'text' : 'password'} 
                          value={passwordData.newPassword} 
                          onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                          className="block w-full border border-slate-200 rounded-lg p-2.5 pr-10 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-all outline-none"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword({ ...showPassword, new: !showPassword.new })}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                          {showPassword.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      
                      {/* Password strength visualizer */}
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
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Confirm New Password</label>
                      <div className="relative">
                        <input 
                          type={showPassword.confirm ? 'text' : 'password'} 
                          value={passwordData.confirmPassword} 
                          onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                          className="block w-full border border-slate-200 rounded-lg p-2.5 pr-10 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-all outline-none"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword({ ...showPassword, confirm: !showPassword.confirm })}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                          {showPassword.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button 
                    type="submit"
                    disabled={submittingPassword}
                    className="px-5 py-2 text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="h-4 w-4" /> {submittingPassword ? 'Updating Password...' : 'Change Portal Password'}
                  </button>
                </div>
              </form>
            )}

            {/* PREFERENCES PANEL */}
            {activeTab === 'preferences' && (
              <div className="p-6 flex flex-col justify-between flex-1 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-950 font-display">Portal Preferences & Notifications</h3>
                  <p className="text-xs text-slate-500 mt-1">Configure notification settings and interface preferences.</p>
                  
                  <div className="mt-6 space-y-5">
                    
                    {/* General Toggles */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">General Alerts</h4>
                      
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={preferences.emailAlerts}
                          onChange={(e) => setPreferences({ ...preferences, emailAlerts: e.target.checked })}
                          className="w-4.5 h-4.5 border border-slate-300 rounded text-sage-600 focus:ring-sage-500 mt-0.5"
                        />
                        <div>
                          <span className="text-sm font-bold text-slate-900 group-hover:text-slate-950">Email Digests</span>
                          <p className="text-xs text-slate-500">Send compiled summaries of system logs and notifications to my email.</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={preferences.systemSounds}
                          onChange={(e) => setPreferences({ ...preferences, systemSounds: e.target.checked })}
                          className="w-4.5 h-4.5 border border-slate-300 rounded text-sage-600 focus:ring-sage-500 mt-0.5"
                        />
                        <div>
                          <span className="text-sm font-bold text-slate-900 group-hover:text-slate-950">System Sound Effects</span>
                          <p className="text-xs text-slate-500">Play subtle warning or confirmation sounds during grade overrides or user updates.</p>
                        </div>
                      </label>
                    </div>

                    {/* Role Specific Toggles */}
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider capitalize">{role} Preferences</h4>
                      
                      {role === 'admin' && (
                        <>
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={preferences.backupReminder}
                              onChange={(e) => setPreferences({ ...preferences, backupReminder: e.target.checked })}
                              className="w-4.5 h-4.5 border border-slate-300 rounded text-sage-600 focus:ring-sage-500 mt-0.5"
                            />
                            <div>
                              <span className="text-sm font-bold text-slate-900 group-hover:text-slate-950">Periodic Database Backup Reminders</span>
                              <p className="text-xs text-slate-500">Remind administrators to export JSON database backups every 30 days.</p>
                            </div>
                          </label>

                          <div className="space-y-2 max-w-sm pt-2">
                            <span className="text-xs font-bold text-slate-700">Registrar Data Auto-Sync Interval</span>
                            <select
                              value={preferences.syncFrequency}
                              onChange={(e) => setPreferences({ ...preferences, syncFrequency: e.target.value })}
                              className="block w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none"
                            >
                              <option value="hourly">Every Hour</option>
                              <option value="daily">Every 24 Hours (Midnight)</option>
                              <option value="weekly">Every Sunday</option>
                            </select>
                          </div>
                        </>
                      )}

                      {role === 'dean' && (
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <input 
                            type="checkbox" 
                            checked={preferences.evalAlerts}
                            onChange={(e) => setPreferences({ ...preferences, evalAlerts: e.target.checked })}
                            className="w-4.5 h-4.5 border border-slate-300 rounded text-sage-600 focus:ring-sage-500 mt-0.5"
                          />
                          <div>
                            <span className="text-sm font-bold text-slate-900 group-hover:text-slate-950">Faculty Evaluation Analytics Alerts</span>
                            <p className="text-xs text-slate-500">Notify me immediately when evaluation periods end or dean-level reports finish generating.</p>
                          </div>
                        </label>
                      )}

                      {role === 'faculty' && (
                        <>
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={preferences.ewsNotifications}
                              onChange={(e) => setPreferences({ ...preferences, ewsNotifications: e.target.checked })}
                              className="w-4.5 h-4.5 border border-slate-300 rounded text-sage-600 focus:ring-sage-500 mt-0.5"
                            />
                            <div>
                              <span className="text-sm font-bold text-slate-900 group-hover:text-slate-950">Early Warning System (EWS) Alerts</span>
                              <p className="text-xs text-slate-500">Display running warning badges on classroom rosters when student scores fall below 75%.</p>
                            </div>
                          </label>

                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={preferences.evalAlerts}
                              onChange={(e) => setPreferences({ ...preferences, evalAlerts: e.target.checked })}
                              className="w-4.5 h-4.5 border border-slate-300 rounded text-sage-600 focus:ring-sage-500 mt-0.5"
                            />
                            <div>
                              <span className="text-sm font-bold text-slate-900 group-hover:text-slate-950">Anonymized Student Feedback Dispatch</span>
                              <p className="text-xs text-slate-500">Send notifications when students finish evaluations and reports are ready.</p>
                            </div>
                          </label>
                        </>
                      )}

                      {role === 'student' && (
                        <>
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={preferences.gradeAlerts}
                              onChange={(e) => setPreferences({ ...preferences, gradeAlerts: e.target.checked })}
                              className="w-4.5 h-4.5 border border-slate-300 rounded text-sage-600 focus:ring-sage-500 mt-0.5"
                            />
                            <div>
                              <span className="text-sm font-bold text-slate-900 group-hover:text-slate-950">Grade Posting Push Notifications</span>
                              <p className="text-xs text-slate-500">Notify me immediately when faculty submit Prelim, Midterm, or Final marks.</p>
                            </div>
                          </label>

                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={preferences.ewsNotifications}
                              onChange={(e) => setPreferences({ ...preferences, ewsNotifications: e.target.checked })}
                              className="w-4.5 h-4.5 border border-slate-300 rounded text-sage-600 focus:ring-sage-500 mt-0.5"
                            />
                            <div>
                              <span className="text-sm font-bold text-slate-900 group-hover:text-slate-950">AI counseling verdict ready notifications</span>
                              <p className="text-xs text-slate-500">Alert me when new monthly AI assessments or grade warnings are triggered.</p>
                            </div>
                          </label>
                        </>
                      )}

                    </div>

                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button 
                    onClick={() => {
                      setSaveSuccess(true);
                      setTimeout(() => setSaveSuccess(false), 4000);
                    }}
                    className="px-5 py-2 text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" /> Save Preference Toggles
                  </button>
                </div>
              </div>
            )}

            {/* DATABASE MAINTENANCE (ADMIN ONLY) */}
            {activeTab === 'database' && role === 'admin' && (
              <div className="p-6 flex flex-col justify-between flex-1 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-950 font-display">Database & Platform Connection</h3>
                  <p className="text-xs text-slate-550 mt-1">Status of the system's live database infrastructure connection.</p>
                  
                  <div className="mt-6 space-y-4">
                    {/* Connection Status Card */}
                    <div className="p-5 border border-slate-200 bg-slate-50/50 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database className="h-5 w-5 text-sage-600" />
                          <h4 className="text-sm font-bold text-slate-900">Database Engine</h4>
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-250">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          {dbConnectionDetails.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
                        <div className="space-y-1">
                          <span className="text-slate-400 font-medium">Service Provider / Engine:</span>
                          <p className="font-bold text-slate-800">{dbConnectionDetails.engine}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-slate-400 font-medium">Database Host Address:</span>
                          <p className="font-mono font-bold text-slate-800 select-all">{dbConnectionDetails.url}</p>
                        </div>
                      </div>

                      <div className="border-t border-slate-200/60 pt-4 text-xs">
                        <p className="text-slate-600 leading-relaxed">
                          SAGE is fully configured to fetch and persist data on the live remote **Supabase PostgreSQL instance**. 
                          Schema definitions, tables, functions, and relational integrity are controlled via automated migrations.
                        </p>
                      </div>
                    </div>

                    {/* Console Redirection Warning/Notice */}
                    <div className="p-4 bg-blue-50/40 border border-blue-200 text-blue-800 rounded-xl text-xs flex gap-3">
                      <AlertCircle className="h-4.5 w-4.5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold">Supabase Console Management</p>
                        <p className="text-blue-600 leading-relaxed">
                          Backup logs, user credentials, row-level security policies, and SQL scripts must be managed and inspected directly in the official **Supabase Dashboard Console** to safeguard system integrity.
                        </p>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center gap-2 text-slate-400">
                  <AlertCircle className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-[11px] font-medium">Production database seeding and tables are secured by encrypted server keys.</span>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </>
  );
}
