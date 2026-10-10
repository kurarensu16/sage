import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/auditLog';
import SageLogo from '../../components/layout/SageLogo';
import PasswordRequirements from '../../components/auth/PasswordRequirements';
import { checkPassword, PASSWORD_POLICY_MESSAGE } from '../../lib/passwordPolicy';

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [otherSessionsEnded, setOtherSessionsEnded] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!checkPassword(newPassword).valid) {
      setErrorMsg(PASSWORD_POLICY_MESSAGE);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify inputs.');
      return;
    }

    try {
      // 1. Update password in Supabase Auth
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      // 2. Optionally revoke every other signed-in session; this recovery session stays.
      let endedOthers = false;
      if (signOutOthers) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
        if (signOutError) {
          console.warn('Could not end other sessions:', signOutError);
        } else {
          endedOthers = true;
        }
      }
      setOtherSessionsEnded(endedOthers);

      // 3. Log password update success to audit log
      await logActivity(
        'Password Reset Success',
        endedOthers
          ? 'Password updated via recovery link; all other active sessions were signed out.'
          : 'Password updated via recovery link; other active sessions were left signed in.',
        'Public Account Service'
      );

      setIsSubmitted(true);
    } catch (err) {
      console.error('Password reset update error:', err);
      setErrorMsg(err.message || 'Failed to update password. Recovery link may have expired.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="max-w-md w-full space-y-6">
        
        <div className="text-center space-y-3">
          <div className="inline-flex text-sage-900">
            <SageLogo className="h-24 w-24" />
          </div>
          <h2 className="text-3xl font-bold font-display text-slate-900 tracking-tight">
            Create New Password
          </h2>
          <p className="text-sm text-slate-500 max-w-xs mx-auto">
            Please enter your new strong password credentials below.
          </p>
        </div>

        {/* Content Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-8 space-y-6">
          {isSubmitted ? (
            <div className="space-y-4 text-center">
              <div className="inline-flex p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold font-display text-slate-900">Password Updated</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your password credentials have been successfully updated. You can now sign in using your new credentials.
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                {otherSessionsEnded
                  ? 'All other devices signed in to your account have been signed out.'
                  : signOutOthers
                    ? 'Other devices could not be signed out automatically. Sign out of them manually if you do not recognize them.'
                    : 'Other devices signed in to your account remain signed in.'}
              </p>
              
              <RouterLink 
                to="/login" 
                className="block w-full py-3 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-sm font-bold text-center transition-colors"
              >
                Go to Sign In
              </RouterLink>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Password field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input 
                    type={showNewPassword ? "text" : "password"} 
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <PasswordRequirements value={newPassword} />
              </div>

              {/* Confirm Password field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Confirm New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={signOutOthers}
                  onChange={(e) => setSignOutOthers(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-sage-600"
                />
                <span>
                  <span className="font-bold block">Sign out of all other devices</span>
                  <span className="text-slate-500">Recommended if you reset your password because you suspect someone else used your account.</span>
                </span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                className="w-full py-3 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm mt-4 cursor-pointer"
              >
                Update Password
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
