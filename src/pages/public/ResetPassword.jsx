import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';
import SageLogo from '../../components/layout/SageLogo';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify inputs.');
      return;
    }

    // Simulate password update
    mockDb.addLog('Password Reset Success', 'Password successfully updated for user account.', 'Public Account Service');
    setIsSubmitted(true);
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
                    type="password" 
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                  />
                </div>
              </div>

              {/* Confirm Password field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Confirm New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input 
                    type="password" 
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                  />
                </div>
              </div>

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
