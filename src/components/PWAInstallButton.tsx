import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-500 text-white shadow-sm hover:bg-sky-600 active:scale-95 transition-all"
        title="Install J-Grid on your device"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install PWA</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-all"
          title="Install J-Grid on iPhone/iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-sky-600" />
          <span>Add to Home Screen</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-sky-100 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-sky-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center font-bold text-base shadow-sm">
                    J
                  </div>
                  <h3 className="text-base font-bold text-slate-800">Install J-Grid on iOS</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-600 leading-relaxed">
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-sky-50/60 border border-sky-100">
                  <span className="w-5 h-5 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                  <span>Tap the <strong>Share</strong> button in the Safari navigation bar at the bottom.</span>
                </div>
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-sky-50/60 border border-sky-100">
                  <span className="w-5 h-5 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                  <span>Scroll down and select <strong>Add to Home Screen</strong>.</span>
                </div>
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-sky-50/60 border border-sky-100">
                  <span className="w-5 h-5 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                  <span>Tap <strong>Add</strong> to access the instant offline trading portal.</span>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-sky-500 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-600 transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Provide a clean fallback button for browsers where install prompt will trigger when available or explain
  return (
    <button
      onClick={() => {
        alert('To install this app on your device: open your browser menu (⋮ or Share) and choose "Install app" or "Add to Home Screen".');
      }}
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-sky-200 bg-sky-50/50 text-sky-700 hover:bg-sky-100 transition-colors"
    >
      <Download className="w-3 h-3 text-sky-500" />
      <span>PWA Ready</span>
    </button>
  );
};
