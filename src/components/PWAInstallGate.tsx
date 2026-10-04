import React, { useState, useEffect } from 'react';
import {
  Share,
  PlusSquare,
  Smartphone,
  Download,
  CheckCircle2,
  Sparkles,
  Lock,
  RefreshCw,
} from 'lucide-react';

interface PWAInstallGateProps {
  onCheckStatus: () => void;
}

export const PWAInstallGate: React.FC<PWAInstallGateProps> = ({ onCheckStatus }) => {
  const [deviceTab, setDeviceTab] = useState<'ios' | 'android'>('android');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Detect OS automatically
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
      setDeviceTab('ios');
    } else {
      setDeviceTab('android');
    }

    // Capture Android native install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setDeferredPrompt(null);
      onCheckStatus();
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [onCheckStatus]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setDeferredPrompt(null);
        // After accepting install, give instruction to launch from home screen
      }
    } catch {
      // fallback
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-between p-5 sm:p-7 max-w-md w-full mx-auto font-sans select-none">
      {/* Top Header & Mascot */}
      <div className="pt-2 text-center">
        {/* Mascot Face */}
        <div className="w-20 h-20 rounded-full bg-[#fbcfe8] border-[3px] border-slate-900 mx-auto flex items-center justify-center relative shadow-sm mb-3">
          {/* Curly hair tuft */}
          <div className="absolute -top-4 right-4">
            <svg width="24" height="28" viewBox="0 0 40 46" fill="none">
              <path
                d="M12 40 C12 24 26 12 34 6 C38 3 42 12 34 18 C26 24 18 32 18 42"
                stroke="#0f172a"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
          {/* Face */}
          <div className="flex flex-col items-center">
            <div className="flex gap-4 mb-1">
              <div className="w-2 h-2 rounded-full bg-slate-900" />
              <div className="w-2 h-2 rounded-full bg-slate-900" />
            </div>
            <div className="w-4 h-2 border-b-2 border-slate-900 rounded-full" />
          </div>
        </div>

        <span className="px-3 py-1 rounded-full bg-[#fce7f3] text-rose-800 text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1.5 mb-2">
          <Lock className="w-3 h-3 text-rose-600" />
          <span>Standalone PWA Required</span>
        </span>

        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Install JoeMoney to Trade
        </h1>
        <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
          Access is locked in regular browsers. To trade on Deriv & MT5, install JoeMoney and launch it from your home screen.
        </p>
      </div>

      {/* OS Tab Switcher: iOS vs Android */}
      <div className="my-4">
        <div className="bg-[#f4f5f7] p-1 rounded-full flex gap-1 mb-3.5">
          <button
            type="button"
            onClick={() => setDeviceTab('android')}
            className={`flex-1 py-2.5 rounded-full text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              deviceTab === 'android'
                ? 'bg-[#18181b] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android (Chrome)</span>
          </button>

          <button
            type="button"
            onClick={() => setDeviceTab('ios')}
            className={`flex-1 py-2.5 rounded-full text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              deviceTab === 'ios'
                ? 'bg-[#18181b] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>iOS (iPhone / Safari)</span>
          </button>
        </div>

        {/* Android Instructions */}
        {deviceTab === 'android' && (
          <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-[0_4px_25px_rgba(0,0,0,0.03)] space-y-3.5">
            {/* Native 1-Click Install Button if supported */}
            {deferredPrompt && (
              <div className="space-y-2 pb-2 border-b border-slate-100">
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={installing}
                  className="w-full py-3.5 rounded-full bg-[#18181b] hover:bg-black active:scale-98 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{installing ? 'Installing...' : '1-Click Install App'}</span>
                </button>
                <p className="text-[10px] text-center text-slate-400">
                  Tap to add directly to your home screen
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#f4f5f7] text-slate-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Open in Chrome</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Navigate to this page in Google Chrome on your device.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#f4f5f7] text-slate-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Tap Chrome Menu (⋮)</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tap the 3 dots in the top-right corner of Chrome.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#f4f5f7] text-slate-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Tap "Install app"</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Select <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#fbcfe8] text-slate-900 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  4
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Launch from Home Screen</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Close the browser and tap the <strong>JoeMoney</strong> app icon to trade.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* iOS (Safari) Instructions */}
        {deviceTab === 'ios' && (
          <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-[0_4px_25px_rgba(0,0,0,0.03)] space-y-3.5">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-[#dcf0fa] text-slate-900 flex items-center justify-center shrink-0 mt-0.5">
                <Share className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">1. Tap the Share Button</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  In Safari, tap the <strong>Share icon</strong> (square with arrow) on the toolbar.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-[#fbcfe8] text-slate-900 flex items-center justify-center shrink-0 mt-0.5">
                <PlusSquare className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">2. Tap "Add to Home Screen"</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Scroll down the share sheet and select <strong>Add to Home Screen</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-[#f4f5f7] text-slate-900 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">3. Tap "Add"</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Confirm and tap <strong>Add</strong> in the top-right corner.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-xl bg-[#18181b] text-white flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                J
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">4. Open JoeMoney from Home Screen</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Launch the installed app icon to unlock full access.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Strict Waiting Indicator & Re-check Status */}
      <div className="pt-2 space-y-2.5 text-center">
        <div className="p-3 rounded-2xl bg-[#f4f5f7] flex items-center justify-center gap-2 text-xs font-bold text-slate-700">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <span>Waiting for launch from installed PWA icon</span>
        </div>

        <button
          type="button"
          onClick={onCheckStatus}
          className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center justify-center gap-1.5 mx-auto py-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Re-check Launch Mode</span>
        </button>

        <p className="text-[10px] text-slate-400">
          Standalone PWA provides zero browser URL bars, background sync, and offline alerts.
        </p>
      </div>
    </div>
  );
};
