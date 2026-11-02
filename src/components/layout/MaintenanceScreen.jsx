import { Wrench, LogOut, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useMaintenance } from '../../lib/MaintenanceContext';
import SageLogo from './SageLogo';

// Shown instead of the portal to a non-admin who arrives while maintenance is
// on. It carries only the administrator's own message -- no stack trace, no
// half-rendered portal, no spinner that never resolves. That is the entire point
// of the feature: replacing an ambiguous failure with a deliberate statement.

export default function MaintenanceScreen() {
  const { maintenanceMessage, updatedAt, refresh } = useMaintenance();
  const { signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  const recheck = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm max-w-md w-full p-6 sm:p-8 text-center">
        <div className="flex justify-center mb-5">
          <SageLogo className="h-9" />
        </div>

        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <Wrench className="h-7 w-7" />
        </div>

        <h1 className="text-lg sm:text-xl font-bold font-display text-slate-900">
          ASPIRE is under maintenance
        </h1>

        {maintenanceMessage ? (
          <p className="text-sm text-slate-600 leading-relaxed mt-2.5 whitespace-pre-line">
            {maintenanceMessage}
          </p>
        ) : (
          <p className="text-sm text-slate-500 leading-relaxed mt-2.5">
            Scheduled maintenance is in progress. Please try again shortly.
          </p>
        )}

        {updatedAt && (
          <p className="text-[11px] text-slate-400 mt-3">
            Last updated {new Date(updatedAt).toLocaleString('en-PH')}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <button
            onClick={recheck}
            disabled={checking}
            className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={checking ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {checking ? 'Checking…' : 'Check again'}
          </button>
          <button
            onClick={signOut}
            className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
