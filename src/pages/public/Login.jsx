import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SageLogo from '../../components/layout/SageLogo';
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/auditLog';
import { useAuth } from '../../lib/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { session, role } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // If already authenticated with a valid role, redirect to appropriate portal dashboard
  useEffect(() => {
    if (session && role) {
      navigate(`/${role}/dashboard`, { replace: true });
    }
  }, [session, role, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    try {
      // Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      // Fetch the profile from the public users table
      const { data: profile, error: profileErr } = await supabase
        .from('users')
        .select('first_name, last_name, role, must_change_password, status')
        .eq('user_id', data.user.id)
        .single();
      
      if (profileErr || !profile) {
        setErrorMsg('Account profile not found in public tables.');
        return;
      }

      if (profile.status === 'archived') {
        setErrorMsg('This account has been archived. Please contact system support.');
        await supabase.auth.signOut();
        return;
      }

      // Resolve role
      const userRole = profile.role;

      // Log login activity
      const actorName = `${profile.first_name} ${profile.last_name}`;
      await logActivity(
        'User Login',
        `User logged in: ${email.trim()} (Role: ${userRole}).`,
        actorName
      );

      // Route to correct dashboard based on role or password change constraint
      if (profile.must_change_password) {
        navigate('/change-password');
      } else {
        navigate(`/${userRole}/dashboard`);
      }
    } catch (err) {
      setErrorMsg('An unexpected error occurred during login.');
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-50">
      
      {/* Left Pane: Form (Welcome back & credentials) */}
      <div className="flex flex-col justify-between p-8 lg:p-12 xl:p-16 bg-white min-h-screen">
        
        {/* Header Branding (Mobile view only) */}
        <div className="flex lg:hidden items-center gap-3">
          <SageLogo className="h-8 w-8 text-sage-600" />
          <span className="text-xl font-bold font-display text-sage-700 tracking-tight">SAGE</span>
        </div>

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
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-3 animate-shake">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@sage.edu.ph"
                  className="block w-full border border-slate-200 rounded-xl p-3 pl-10 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all"
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <Link to="/forgotpassword" className="text-xs text-sage-600 hover:underline font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full border border-slate-200 rounded-xl p-3 pl-10 pr-10 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all"
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-sage-800 hover:bg-sage-900 text-white rounded-xl font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              Sign in to Portal <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-400">
          &copy; {new Date().getFullYear()} Dr. Yanga's Colleges, Inc. All rights reserved.
        </div>

      </div>

      {/* Right Pane: Premium branding view */}
      <div className="hidden lg:flex flex-col justify-center items-center p-12 bg-sage-900 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sage-800/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-sage-800/20 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />

        <div className="max-w-md text-center space-y-6 z-10">
          <div className="inline-flex text-sage-200">
            <SageLogo className="h-44 w-44" />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-bold font-display tracking-tight text-white">
              SAGE
            </h1>
            <p className="text-sage-200/90 text-sm leading-relaxed max-w-sm mx-auto">
              Smart Academic Grading and Evaluation System. Seamless grades oversight, evaluation workflows, and analytical tracking.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
