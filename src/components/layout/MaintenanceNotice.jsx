import { useEffect, useState } from 'react';
import { Wrench, X } from 'lucide-react';
import { useMaintenance } from '../../lib/MaintenanceContext';

// The active-session notice, for someone already working when maintenance
// starts. Confirmed behaviour, which is two components in one:
//
//   * a one-time dismissible TOAST on the false -> true transition, and
//   * a persistent top BANNER that stays for as long as the flag is on.
//
// The banner clears automatically and silently the moment maintenance ends while
// they are still working -- turning maintenance off raises no notice of its own.
//
// Nothing here blocks: the session keeps working throughout. Being told is the
// whole intervention.

export function MaintenanceBanner() {
  const { maintenanceMode, maintenanceMessage, blocking } = useMaintenance();

  // `blocking` means the MaintenanceScreen is already showing, so a banner on
  // top of it would be redundant.
  if (!maintenanceMode || blocking) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-3.5 sm:px-5 py-2 flex items-center gap-2 flex-shrink-0">
      <Wrench className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
      <p className="text-[11px] sm:text-xs text-amber-900 min-w-0 flex-1 truncate">
        <span className="font-semibold">Maintenance in progress.</span>
        {maintenanceMessage && <span className="ml-1.5">{maintenanceMessage}</span>}
      </p>
    </div>
  );
}

export function MaintenanceToast() {
  const { justStarted, maintenanceMessage, acknowledgeStart } = useMaintenance();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (justStarted) setVisible(true);
  }, [justStarted]);

  const dismiss = () => {
    setVisible(false);
    acknowledgeStart();
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 lg:bottom-6 right-3.5 sm:right-6 z-[90] max-w-sm w-[calc(100%-1.75rem)] sm:w-auto animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-white rounded-2xl border border-amber-200 shadow-lg p-3.5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
          <Wrench className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs sm:text-sm font-semibold text-slate-900">
            Maintenance has started
          </h3>
          <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5 leading-relaxed">
            {maintenanceMessage || 'Scheduled maintenance is now in progress.'}
          </p>
          <p className="text-[10px] text-slate-400 mt-1.5">
            You can keep working — nothing has been signed out.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
