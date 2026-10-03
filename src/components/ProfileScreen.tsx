import React, { useState } from 'react';
import { DerivAccount } from '../types/trading';
import { Settings, Globe, HelpCircle, ChevronRight, Quote, Download, LogOut, Server } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { MascotHead } from './MascotHead';

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
  const accountId = account.loginId || account.mt5Login || 'Demo-Account';
  const isReal = !account.isDemo && accountId.startsWith('CR');

  return (
    <div className="pb-28 pt-4 px-5 max-w-[400px] mx-auto space-y-6 font-sans select-none bg-white min-h-screen">
      {/* Top Profile Header with Connected Green Mascot */}
      <div className="flex flex-col items-center text-center">
        <div className="w-18 h-18 rounded-full bg-emerald-50 border-2 border-emerald-400 p-1 shadow-sm mb-2 flex items-center justify-center relative">
          <MascotHead status="success" size={54} />
          <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-[9px] text-white font-bold">
            ✓
          </span>
        </div>

        {/* User name & status pill */}
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900 font-mono">
            {accountId}
          </h2>
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{isReal ? 'Live Deriv Account' : 'Demo Virtual'}</span>
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Balance: {account.currency || 'USD'} {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {/* Smooth Wave Chart (Screen 3 in reference image) */}
      <div className="bg-white rounded-[28px] p-4 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative overflow-hidden">
        {/* Floating tooltip pills matching reference image */}
        <div className="relative h-28 w-full">
          <div className="absolute top-2 left-1/3 -translate-x-1/2 bg-white px-2.5 py-1 rounded-full shadow-sm border border-slate-100 text-[10px] font-semibold text-slate-700 flex items-center gap-1 z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Calm</span>
          </div>

          <div className="absolute top-6 right-8 bg-white px-2.5 py-1 rounded-full shadow-sm border border-slate-100 text-[10px] font-semibold text-slate-700 flex items-center gap-1 z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>Happy</span>
          </div>

          <svg className="w-full h-full overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="refGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="60%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>
            <path
              d="M 0 65 Q 45 80 85 30 T 170 38 T 255 22 T 300 18"
              fill="none"
              stroke="url(#refGrad)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Days of the week matching reference image */}
        <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mt-2 px-1">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
          <span>Sun</span>
        </div>
      </div>

      {/* Dark Quote Banner (Screen 3 in reference image: "Every day is a new opportunity...") */}
      <div className="bg-[#18181b] text-white rounded-[24px] p-4 flex items-center gap-3.5 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-[#bae6fd] text-slate-900 flex items-center justify-center shrink-0">
          <Quote className="w-4 h-4 fill-current" />
        </div>
        <p className="text-xs text-neutral-200 leading-snug font-normal">
          Every day is a new opportunity for growth and positive change.
        </p>
      </div>

      {/* Grouped Settings List (Matching Screen 3 in reference image: Settings, Language, FAQ) */}
      <div className="bg-white rounded-[24px] border border-slate-100 divide-y divide-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        {/* Row 1: Settings */}
        <button
          onClick={onOpenConnect}
          className="w-full p-4 flex items-center justify-between hover:bg-[#f8f9fa] transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4 text-slate-700" />
            <span className="text-sm font-semibold text-slate-800">Settings</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {/* Row 2: Language */}
        <div className="w-full p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-slate-700" />
            <span className="text-sm font-semibold text-slate-800">Language</span>
          </div>
          <span className="text-xs text-slate-400 font-medium">English</span>
        </div>

        {/* Row 3: FAQ */}
        <button
          onClick={() => setShowFAQ(!showFAQ)}
          className="w-full p-4 flex items-center justify-between hover:bg-[#f8f9fa] transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <HelpCircle className="w-4 h-4 text-slate-700" />
            <span className="text-sm font-semibold text-slate-800">FAQ</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showFAQ ? 'rotate-90' : ''}`} />
        </button>

        {/* Expanded FAQ content */}
        {showFAQ && (
          <div className="p-4 bg-[#f8f9fa] text-xs text-slate-600 space-y-2">
            <p><strong>u:</strong> Spot price of asset (e.g. 4170 for Gold).</p>
            <p><strong>x:</strong> Base price offset ($u - x = 4165$).</p>
            <p><strong>t:</strong> Lot size per order.</p>
            <p><strong>s:</strong> Orders at each price level.</p>
            <p><strong>y:</strong> Step distance between levels.</p>
            <p><strong>z:</strong> Number of multiples ($u - x - zy$).</p>
          </div>
        )}
      </div>

      {/* PWA & Account Actions */}
      <div className="flex items-center justify-between px-2 pt-1 text-xs">
        <PWAInstallButton />
        <button
          onClick={onDisconnect}
          className="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Disconnect Account</span>
        </button>
      </div>
    </div>
  );
};
