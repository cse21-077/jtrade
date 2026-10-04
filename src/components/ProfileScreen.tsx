import React, { useState } from 'react';
import { DerivAccount } from '../types/trading';
import { Settings, ChevronRight, LogOut, CircleHelp } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileScreenProps {
  account: DerivAccount;
  onOpenConnect: () => void;
  onDisconnect: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  account,
  onOpenConnect,
  onDisconnect,
}) => {
  const [showFAQ, setShowFAQ] = useState(false);
  const accountId = account.loginId || account.mt5Login || 'Account';

  return (
    <div className="pb-28 pt-4 px-5 max-w-[400px] mx-auto space-y-6 font-sans select-none bg-white min-h-screen">
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold font-mono text-slate-900">{accountId}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {account.currency || 'USD'} {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <span className={`shrink-0 text-xs font-semibold ${account.isDemo ? 'text-slate-500' : 'text-emerald-700'}`}>
            {account.isDemo ? 'Demo' : 'Real'}
          </span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-[#f8fbfc] px-4 pt-4 pb-3">
        <div className="relative h-32">
          <div className="absolute left-[28%] top-0 z-10 flex items-center gap-1.5 rounded-full border border-slate-100 bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Calm
          </div>
          <div className="absolute right-2 top-5 z-10 flex items-center gap-1.5 rounded-full border border-slate-100 bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            Happy
          </div>
          <svg
            className="h-full w-full overflow-visible"
            viewBox="0 0 300 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="profile-chart-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="64%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#fb7185" />
              </linearGradient>
              <linearGradient id="profile-chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 100 L 0 65 Q 45 80 85 30 T 170 38 T 255 22 T 300 18 L 300 100 Z"
              fill="url(#profile-chart-fill)"
              className="profile-chart-area"
            />
            <path
              d="M 0 65 Q 45 80 85 30 T 170 38 T 255 22 T 300 18"
              fill="none"
              stroke="url(#profile-chart-stroke)"
              strokeWidth="3.5"
              strokeLinecap="round"
              pathLength="1"
              className="profile-chart-line"
            />
            <circle cx="300" cy="18" r="4" fill="#fb7185" className="profile-chart-marker" />
          </svg>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-medium text-slate-400">
          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
        </div>
      </div>

      <div className="divide-y divide-slate-200 border-y border-slate-200">
        <button
          type="button"
          onClick={onOpenConnect}
          className="w-full py-4 flex items-center justify-between hover:text-slate-500 transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4 text-slate-700" />
            <span className="text-sm font-semibold text-slate-800">Account settings</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => setShowFAQ(!showFAQ)}
          className="w-full py-4 flex items-center justify-between hover:text-slate-500 transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <CircleHelp className="w-4 h-4 text-slate-700" />
            <span className="text-sm font-semibold text-slate-800">Grid terms</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showFAQ ? 'rotate-90' : ''}`} />
        </button>

        {showFAQ && (
          <div className="pb-4 text-xs text-slate-600 space-y-2">
            <p><strong>u:</strong> Spot price of asset (e.g. 4170 for Gold).</p>
            <p><strong>x:</strong> Base price offset ($u - x = 4165$).</p>
            <p><strong>t:</strong> Lot size per order.</p>
            <p><strong>s:</strong> Orders at each price level.</p>
            <p><strong>y:</strong> Step distance between levels.</p>
            <p><strong>z:</strong> Number of multiples ($u - x - zy$).</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 text-xs">
        <PWAInstallButton />
        <button
          type="button"
          onClick={onDisconnect}
          className="text-rose-700 hover:text-rose-800 font-semibold flex items-center gap-1.5 py-2 transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Disconnect</span>
        </button>
      </div>
    </div>
  );
};
