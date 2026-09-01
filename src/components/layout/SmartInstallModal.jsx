import React from 'react';
import { 
  X, 
  Download, 
  Smartphone, 
  Monitor, 
  ShieldCheck, 
  CheckCircle2, 
  Share2, 
  PlusSquare, 
  ExternalLink,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { cn } from '../../lib/utils';
import SageLogo from './SageLogo';

export default function SmartInstallModal({
  isOpen,
  onClose,
  activeTab = 'android',
  setActiveTab,
  platform = 'desktop',
  downloadApk,
  canNativeInstall = false,
  promptInstall,
  actorName = 'Institutional User'
}) {
  if (!isOpen) return null;

  const currentTab = activeTab || platform || 'desktop';

  const handleApkDownloadClick = () => {
    if (downloadApk) {
      downloadApk(actorName);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 text-slate-800 relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-modal-title"
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="w-11 h-11 rounded-xl bg-sage-50 border border-sage-200/80 text-sage-700 flex items-center justify-center font-bold flex-shrink-0 shadow-xs">
            <SageLogo className="h-6 w-6 text-sage-600" />
          </div>
          <div className="min-w-0 pr-6">
            <div className="flex items-center gap-2">
              <h3 id="install-modal-title" className="font-bold font-display text-slate-900 text-lg leading-tight">
                Install SAGE App
              </h3>
              <span className="bg-sage-100 text-sage-800 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full">
                v1.0.0
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              Smart Academic Grading & Evaluation System • DYCI
            </p>
          </div>
        </div>

        {/* Platform Selection Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl my-4 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab && setActiveTab('android')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              currentTab === 'android'
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Smartphone className="h-4 w-4 text-emerald-600" />
            <span>Android APK</span>
            {platform === 'android' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Your current device" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab && setActiveTab('ios')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              currentTab === 'ios'
                ? "bg-white text-indigo-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Smartphone className="h-4 w-4 text-indigo-600" />
            <span>iOS (Safari)</span>
            {platform === 'ios' && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" title="Your current device" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab && setActiveTab('desktop')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              currentTab === 'desktop'
                ? "bg-white text-sage-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Monitor className="h-4 w-4 text-sage-600" />
            <span>Desktop</span>
            {platform === 'desktop' && (
              <span className="w-1.5 h-1.5 rounded-full bg-sage-600" title="Your current device" />
            )}
          </button>
        </div>

        {/* Tab Body Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0 text-slate-700">
          
          {/* TAB 1: ANDROID (.APK) */}
          {currentTab === 'android' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Primary APK Download Action Card */}
              <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl border border-emerald-200/80 shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <Download className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">SAGE Android APK</h4>
                      <p className="text-[11px] text-slate-500 font-mono">ph.edu.dyci.sage • Release Build</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-medium px-2 py-1 rounded-md bg-emerald-200/70 text-emerald-900">
                    Android 8.0+
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleApkDownloadClick}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Download SAGE APK (.apk)</span>
                </button>
              </div>

              {/* 3-Step Sideloading Walkthrough */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  How to Install SAGE on Android
                </h4>
                
                <div className="space-y-2 text-xs">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">Download the APK</p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Tap the <strong>Download SAGE APK</strong> button above. If Chrome shows <em>"File might be harmful"</em>, tap <strong>Download anyway</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">Open Downloaded File</p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Once finished, tap the completed download notification or open <code className="font-mono text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded">sage.apk</code> from your <strong>Downloads</strong> folder.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">Allow & Complete Installation</p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        If prompted by Android Security, tap <strong>Settings</strong> ➔ toggle <strong>"Allow from this source"</strong>, then tap <strong>Install</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Verified Institutional Note */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-2.5 text-[11px] text-slate-600">
                <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span>
                  Official native application for Dr. Yanga's Colleges, Inc. Includes real-time lockscreen alerts and offline grade caching.
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: IOS (SAFARI PWA) */}
          {currentTab === 'ios' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-200/80 text-xs text-indigo-900 flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <span>
                  iOS installs web applications directly to your Home Screen without needing the App Store. Follow the 3 steps below in <strong>Safari</strong>.
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {/* Step 1 */}
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">Open in Safari</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Ensure you are viewing SAGE inside Apple's <strong>Safari</strong> browser (iOS PWA installation is not supported inside Chrome/Firefox).
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                      <span>Tap the Share Button</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-mono">
                        <Share2 className="h-3 w-3 inline mr-1" /> Share
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Tap the <strong>Share</strong> icon located in the bottom toolbar on iPhone (or top toolbar on iPad).
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                      <span>Select "Add to Home Screen"</span>
                      <PlusSquare className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Scroll down the share sheet, tap <strong>"Add to Home Screen"</strong>, then tap <strong>Add</strong> in the top-right corner.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-2.5 text-[11px] text-slate-600">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                <span>
                  SAGE will launch full-screen directly from your Home Screen with instant portal access.
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: DESKTOP */}
          {currentTab === 'desktop' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {canNativeInstall && (
                <div className="p-4 bg-sage-50 rounded-2xl border border-sage-200 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Install SAGE Desktop App</h4>
                    <p className="text-[11px] text-slate-500">Run SAGE in a dedicated window without browser tabs.</p>
                  </div>
                  <button
                    type="button"
                    onClick={promptInstall}
                    className="px-4 py-2 bg-sage-700 hover:bg-sage-800 active:scale-95 text-white rounded-xl font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Install Now</span>
                  </button>
                </div>
              )}

              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="w-5 h-5 rounded-full bg-sage-100 text-sage-700 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">Chrome & Microsoft Edge</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Look for the <strong>Install App icon (⊕ or 💻)</strong> on the far right of your browser's address bar at the top of the screen.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="w-5 h-5 rounded-full bg-sage-100 text-sage-700 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">Pin to Taskbar / Start Menu</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Click <strong>Install</strong> to add SAGE to your Applications, Windows Taskbar, or macOS Dock.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-2.5 text-[11px] text-slate-600">
                <ShieldCheck className="h-4 w-4 text-sage-600 flex-shrink-0" />
                <span>
                  Provides full desktop support for master grade computation, batch roster imports, and Excel COG generation.
                </span>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between flex-shrink-0 gap-2">
          <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
            Dr. Yanga's Colleges, Inc.
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {currentTab === 'android' && (
              <button
                type="button"
                onClick={handleApkDownloadClick}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download APK</span>
              </button>
            )}

            {currentTab === 'desktop' && canNativeInstall && (
              <button
                type="button"
                onClick={promptInstall}
                className="px-4 py-2 bg-sage-700 hover:bg-sage-800 text-white rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Install App</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
