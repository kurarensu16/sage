import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SageLogo from '../../components/layout/SageLogo';
import { Lock, Mail, ArrowRight, AlertCircle, Key } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    // In a real system, authentication is done server-side.
    // In our prototype, we lookup the user in the mock database by email.
    const users = mockDb.getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());

    if (!user) {
      setErrorMsg('Invalid email address. Account not found.');
      return;
    }

    if (user.status !== 'active') {
      setErrorMsg('Your account has been deactivated. Please contact the administrator.');
      return;
    }

    // Redirect to corresponding dashboard based on user role
    mockDb.addLog('User Login', `User ${user.email} successfully logged into the ${user.role} portal.`, `${user.firstName} ${user.lastName}`);
    navigate(`/${user.role}/dashboard`);
  };

  // Demo accounts helper to make testing/evaluating seamless
  const handleQuickLogin = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('demo1234');
    
    const users = mockDb.getUsers();
    const user = users.find(u => u.email.toLowerCase() === demoEmail.toLowerCase());
    if (user) {
      mockDb.addLog('User Login', `User ${user.email} logged in via Quick Demo selector.`, `${user.firstName} ${user.lastName}`);
      navigate(`/${user.role}/dashboard`);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-50">
      
      {/* Left Pane: Form (Welcome back & credentials) */}
      <div className="flex flex-col justify-between p-8 lg:p-12 xl:p-16 bg-white min-h-screen">
        


        {/* Form Container */}
        <div className="max-w-md w-full mx-auto my-auto py-12 space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold font-display text-slate-900 tracking-tight">
              Welcome back
            </h2>
            <p className="text-sm text-slate-500">
              Please enter your details to sign in to your academic portal.
            </p>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Email Address</label>
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

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Password</label>
                <Link to="/forgotpassword" className="text-xs font-bold text-sage-600 hover:text-sage-700">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button 
              type="submit"
              className="w-full py-3 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm mt-6 cursor-pointer"
            >
              Sign In <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Quick Demo Logins drawer */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3 mt-6">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide text-center flex items-center justify-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-sage-600" /> Quick Demo Accounts Selector
            </h4>
            
            <div className="grid grid-cols-2 gap-2">
              <button 
                type="button"
                onClick={() => handleQuickLogin('admin@sage.edu.ph')}
                className="px-3 py-2 bg-white border border-slate-200 hover:border-sage-300 hover:bg-slate-50 text-xs font-semibold rounded-lg text-slate-700 transition-colors cursor-pointer"
              >
                Sign In as Admin
              </button>
              <button 
                type="button"
                onClick={() => handleQuickLogin('c.valdes@sage.edu.ph')}
                className="px-3 py-2 bg-white border border-slate-200 hover:border-sage-300 hover:bg-slate-50 text-xs font-semibold rounded-lg text-slate-700 transition-colors cursor-pointer"
              >
                Sign In as Dean
              </button>
              <button 
                type="button"
                onClick={() => handleQuickLogin('a.rivera@sage.edu.ph')}
                className="px-3 py-2 bg-white border border-slate-200 hover:border-sage-300 hover:bg-slate-50 text-xs font-semibold rounded-lg text-slate-700 transition-colors cursor-pointer"
              >
                Sign In as Faculty
              </button>
              <button 
                type="button"
                onClick={() => handleQuickLogin('s.jenkins@student.sage.edu')}
                className="px-3 py-2 bg-white border border-slate-200 hover:border-sage-300 hover:bg-slate-50 text-xs font-semibold rounded-lg text-slate-700 transition-colors cursor-pointer"
              >
                Sign In as Student
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-400">
          &copy; {new Date().getFullYear()} Dr. Yanga's Colleges, Inc. All rights reserved.
        </div>
      </div>

      {/* Right Pane: Premium branding view */}
      <div className="hidden lg:flex flex-col justify-center items-center p-12 bg-sage-900 text-white relative overflow-hidden">
        
        {/* Subtle decorative circles */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-sage-800/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-sage-800/20 rounded-full blur-3xl -ml-20 -mb-20"></div>
        
        <div className="max-w-md text-center space-y-6 z-10">
          <div className="inline-flex text-sage-200">
            <SageLogo className="h-48 w-48" />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-bold font-display tracking-tight text-white">
              SAGE System
            </h1>
            <p className="text-sage-200 text-sm leading-relaxed max-w-sm mx-auto">
              Smart Academic Grading and Evaluation System. Seamless grades oversight, evaluation workflows, and analytical tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
