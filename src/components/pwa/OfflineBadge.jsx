import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBadge() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-amber-900/90 text-amber-200 text-xs font-medium rounded-full shadow-lg border border-amber-700/50 backdrop-blur-sm animate-pulse">
      <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
      <span>Offline Mode — Using Cached Data</span>
    </div>
  );
}
