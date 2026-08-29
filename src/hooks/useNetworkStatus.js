import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true
  );

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let handle;
      Network.getStatus().then((status) => {
        setIsOnline(status.connected);
      });

      const listenerPromise = Network.addListener('networkStatusChange', (status) => {
        setIsOnline(status.connected);
      });

      listenerPromise.then((h) => {
        handle = h;
      });

      return () => {
        if (handle) {
          handle.remove();
        }
      };
    } else {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  return isOnline;
};

export default useNetworkStatus;
