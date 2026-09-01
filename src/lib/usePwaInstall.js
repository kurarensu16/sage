import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { logActivity } from './auditLog';

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [platform, setPlatform] = useState(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'desktop';
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      return 'ios';
    }
    return 'desktop';
  });

  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (Capacitor.isNativePlatform()) return true;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator.standalone === true) return true;
    if (typeof document !== 'undefined' && document.referrer && document.referrer.includes('android-app://')) {
      return true;
    }
    return false;
  });

  const [showGuideModal, setShowGuideModal] = useState(false);
  const [activeTab, setActiveTab] = useState(platform);

  const apkDownloadUrl = import.meta.env.VITE_ANDROID_APK_URL || 
    `${import.meta.env.VITE_SUPABASE_URL || 'https://ettnwknyhdhehoclrwwh.supabase.co'}/storage/v1/object/public/app-releases/sage.apk`;

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowGuideModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Synchronize initial active modal tab with detected platform
  useEffect(() => {
    setActiveTab(platform);
  }, [platform]);

  const downloadApk = useCallback(async (actorName = 'Institutional User') => {
    try {
      await logActivity(
        'APK Download',
        `Android APK download initiated (Platform: ${platform}, Binary: sage.apk)`,
        actorName
      );
    } catch (logErr) {
      console.warn('[PWA] Failed to record APK download audit log:', logErr);
    }

    const link = document.createElement('a');
    link.href = apkDownloadUrl;
    link.download = 'sage.apk';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [apkDownloadUrl, platform]);

  const promptInstall = useCallback(async () => {
    if (platform === 'desktop' && deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      setShowGuideModal(false);
    } else {
      setActiveTab(platform);
      setShowGuideModal(true);
    }
  }, [deferredPrompt, platform]);

  return {
    platform,
    setPlatform,
    isInstalled,
    canInstall: !isInstalled,
    canNativeInstall: !!deferredPrompt,
    apkDownloadUrl,
    downloadApk,
    promptInstall,
    showGuideModal,
    setShowGuideModal,
    activeTab,
    setActiveTab,
  };
}

