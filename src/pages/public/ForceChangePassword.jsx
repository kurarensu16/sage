import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertCircle, ArrowRight, LogOut, CheckCircle } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import SageLogo from '../../components/layout/SageLogo';
import PasswordRequirements from '../../components/auth/PasswordRequirements';
import { checkPassword, PASSWORD_POLICY_MESSAGE } from '../../lib/passwordPolicy';

export default function ForceChangePassword() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile, signOut } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState({ new: false, confirm: false });
  
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Redirect logic
  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate('/login');
      } else if (profile && !profile.must_change_password) {
        navigate(`/${profile.role}/dashboard`);
      }
    }
  }, [user, profile, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    if (!checkPassword(newPassword).valid) {
      setErrorMsg(PASSWORD_POLICY_MESSAGE);
      setSubmitting(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify inputs.');
      setSubmitting(false);
      return;
    }

    try {
      // 1. Update password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (authError) {
        throw authError;
      }

      // 2. Update must_change_password flag in public.users
      const { error: dbError } = await supabase
        .from('users')
        .update({ must_change_password: false })
        .eq('user_id', user.id);

      if (dbError) {
        throw dbError;
      }

      // 3. Mark success and refresh profile
      setSuccess(true);
      await refreshProfile();
      
      // Delay redirection slightly so user sees success state
      setTimeout(() => {
        if (profile) {
          navigate(`/${profile.role}/dashboard`);
        } else {
          navigate('/login');
        }
      }, 1500);

    } catch (err) {
      console.error('Error changing password:', err);
      setErrorMsg(err.message || 'An error occurred while updating your password.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-semibold text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="max-w-md w-full space-y-6">
        
        {/* Header logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex text-sage-900">
            <SageLogo className="h-24 w-24" />
          </div>
          <h2 className="text-3xl font-bold font-display text-slate-900 tracking-tight">
            Security Update
          </h2>
          <p className="text-sm text-slate-500 max-w-xs mx-auto">
            For your security, you are required to change your password on your first login.
          </p>
        </div>

        {/* Content Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-8 space-y-6">
          {success ? (
            <div className="space-y-4 text-center py-4">
              <div className="inline-flex p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold font-display text-slate-900">Password Updated</h3>
              <p className="text-xs text-slate-550 leading-relaxed">
                Your credentials have been successfully updated. Redirecting you to your portal...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* New Password field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input 
                    type={showPassword.new ? "text" : "password"} 
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword({ ...showPassword, new: !showPassword.new })}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <PasswordRequirements value={newPassword} />
              </div>

              {/* Confirm Password field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Confirm Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input 
                    type={showPassword.confirm ? "text" : "password"} 
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword({ ...showPassword, confirm: !showPassword.confirm })}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button 
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm mt-6 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? "Updating..." : "Update Password"} <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* Sign out link */}
          <div className="text-center pt-2">
            <button 
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" /> Cancel & Sign Out
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
