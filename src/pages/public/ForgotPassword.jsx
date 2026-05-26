import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SageLogo from '../../components/layout/SageLogo';
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim()) {
      setErrorMsg('Please specify your registered email address.');
      return;
    }

    const users = mockDb.getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());

    if (!user) {
      setErrorMsg('No active user account found matching that email.');
      return;
    }

    // Simulate sending recovery token
    mockDb.addLog('Password Reset Request', `Password reset token requested for user ${user.email}.`, 'Public Account Service');
    setIsSubmitted(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="max-w-md w-full space-y-6">
        
        {/* Header logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex text-sage-900">
            <SageLogo className="h-24 w-24" />
          </div>
          <h2 className="text-3xl font-bold font-display text-slate-900 tracking-tight">
            Reset Password
          </h2>
          <p className="text-sm text-slate-500 max-w-xs mx-auto">
            Provide your academic account email to receive your password reset token.
          </p>
        </div>

        {/* Content Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-8 space-y-6">
          {isSubmitted ? (
            <div className="space-y-4 text-center">
              <div className="inline-flex p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold font-display text-slate-900">Recovery Link Sent</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                We have dispatched a password recovery token to <strong className="text-slate-800 font-mono">{email}</strong>. Check your university inbox and click the link to proceed.
              </p>
              
              <Link 
                to="/resetpassword" 
                className="block w-full py-3 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-sm font-bold text-center transition-colors"
              >
                Proceed to Reset Form
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Email address field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">University Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400" />
                  </div>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@sage.edu.ph"
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                  />
                </div>
              </div>

              {/* Submit */}
              <button 
                type="submit"
                className="w-full py-3 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm mt-4 cursor-pointer"
              >
                Send Recovery Token
              </button>
            </form>
          )}

          {/* Cancel/Back link */}
          <div className="text-center pt-2">
            <Link 
              to="/login" 
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
