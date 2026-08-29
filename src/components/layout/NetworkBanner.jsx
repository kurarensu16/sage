import React from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react';

export const NetworkBanner = () => {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="bg-amber-600 text-white px-4 py-2 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 sticky top-0 z-50 shadow-md animate-in slide-in-from-top duration-200">
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
      <span>No Internet Connection. SAGE requires active network connectivity to sync grades and academic records.</span>
    </div>
  );
};

export default NetworkBanner;
