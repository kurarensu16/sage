import { useNavigate } from 'react-router-dom';
import { HelpCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';

export default function NotFound() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const handleBack = () => {
    if (profile?.role) {
      navigate(`/${profile.role}/dashboard`);
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full text-center space-y-6 bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="inline-flex p-4 bg-sage-50 text-sage-600 rounded-2xl border border-sage-100">
          <HelpCircle className="h-10 w-10" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold font-display text-slate-900 tracking-tight">
            Page Not Found
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            The page you are looking for does not exist, has been removed, or has had its name changed.
          </p>
        </div>

        <button
          onClick={handleBack}
          className="w-full py-3 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          {profile?.role ? 'Return to Dashboard' : 'Back to Login'}
        </button>
      </div>
      
      <div className="text-xs text-slate-400 mt-6">
        &copy; {new Date().getFullYear()} Dr. Yanga's Colleges, Inc. All rights reserved.
      </div>
    </div>
  );
}
