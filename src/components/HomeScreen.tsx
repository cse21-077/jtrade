import React, { useState } from 'react';
import { DerivAccount, MarketSymbol } from '../types/trading';
import { Bell, Search, Play, ArrowRight } from 'lucide-react';

interface HomeScreenProps {
  account: DerivAccount;
  spotPrice: number;
  selectedSymbol: MarketSymbol;
  onOpenGrid: (preset?: { offset: number; lot: number; steps: number }) => void;
  onOpenConnect: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  account,
  spotPrice,
  selectedSymbol,
  onOpenGrid,
  onOpenConnect,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="pb-28 pt-3 px-5 max-w-[400px] mx-auto space-y-6 font-sans select-none bg-white min-h-screen">
      {/* Top Header: Greeting & Circular Bell Button (Exactly matching Screen 2 in reference image) */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
            <span>Hello, {account.fullName?.split(' ')[0] || 'Trader'}</span>
            <span>👋</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            {account.mt5Server ? `MT5: ${account.mt5Server}` : account.loginId ? `Deriv: ${account.loginId}` : 'Demo Sandbox'}
          </p>
        </div>

        {/* Circular Black Bell Button matching reference image */}
        <button
          onClick={onOpenConnect}
          className="w-11 h-11 rounded-full bg-[#18181b] text-white flex items-center justify-center shadow-sm active:scale-95 transition cursor-pointer relative"
          title="Account Settings"
        >
          <Bell className="w-4 h-4 text-white" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#38bdf8] border-2 border-[#18181b]" />
        </button>
      </div>

      {/* Clean Pill Search Bar matching reference image */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="w-full pl-11 pr-4 py-3 rounded-full bg-[#f4f5f7] border-0 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition"
        />
      </div>

      {/* Dual Featured Cards (Screen 2 reference: Left Dark Card + Right White Card) */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Left: Deep Charcoal/Black Card (Emotional Balance in ref image -> Gold Spot Engine) */}
        <div
          onClick={() => onOpenGrid()}
          className="bg-[#18181b] rounded-[28px] p-4 text-white flex flex-col justify-between h-44 shadow-sm cursor-pointer hover:scale-[1.01] active:scale-98 transition-transform"
        >
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">
              {selectedSymbol.displayName.split(' ')[0]} Engine
            </h3>
            <div className="mt-3 text-2xl font-bold font-mono tracking-tight text-white">
              {spotPrice.toFixed(selectedSymbol.decimals)}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="px-2.5 py-1 rounded-full bg-neutral-800 text-[11px] font-medium text-neutral-300">
              Live Spot
            </span>
            <div className="w-8 h-8 rounded-full bg-[#38bdf8] text-slate-900 flex items-center justify-center">
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </div>
          </div>
        </div>

        {/* Right: Crisp White Card with subtle border (Calm Relaxation in ref image -> Grid Equation) */}
        <div
          onClick={() => onOpenGrid()}
          className="bg-white rounded-[28px] p-4 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between h-44 cursor-pointer hover:scale-[1.01] active:scale-98 transition-transform"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900 leading-tight">
              Grid Equation
            </h3>
            <div className="mt-3 text-xs font-mono font-bold text-slate-700 bg-[#f4f5f7] px-2.5 py-1.5 rounded-xl inline-block">
              u - x - zy
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="px-2.5 py-1 rounded-full bg-[#f4f5f7] text-[11px] font-medium text-slate-600">
              Multi-Step
            </span>
            <div className="w-8 h-8 rounded-full bg-[#dcf0fa] text-slate-800 flex items-center justify-center">
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </div>
          </div>
        </div>
      </div>

      {/* "Special for you" Section (Matching reference image Screen 2) */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Special for you</h2>
          <button
            onClick={() => onOpenGrid()}
            className="text-xs font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-0.5 cursor-pointer"
          >
            <span>See all</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Card 1: Soft Light Blue Card (Morning Gratitude in ref image) */}
        <div
          onClick={() => onOpenGrid({ offset: 5.0, lot: 0.1, steps: 5 })}
          className="bg-[#dcf0fa] rounded-[24px] p-4 flex items-center justify-between cursor-pointer hover:scale-[1.01] active:scale-99 transition-transform"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900">Gold Sell Ladder (4165)</h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-3 py-1 rounded-full bg-white text-slate-800 font-medium text-xs shadow-2xs">
                5 min
              </span>
              <span className="px-3 py-1 rounded-full bg-white text-slate-800 font-medium text-xs shadow-2xs">
                0.10 Lots
              </span>
            </div>
          </div>

          <div className="w-10 h-10 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-xs shrink-0">
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </div>
        </div>

        {/* Card 2: Clean White Card (Serenity Before Sleep in ref image) */}
        <div
          onClick={() => onOpenGrid({ offset: 2.0, lot: 0.05, steps: 10 })}
          className="bg-white rounded-[24px] p-4 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex items-center justify-between cursor-pointer hover:scale-[1.01] active:scale-99 transition-transform"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900">Micro Step Grid (y=0.1)</h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-3 py-1 rounded-full bg-[#f4f5f7] text-slate-700 font-medium text-xs">
                10 Steps
              </span>
              <span className="px-3 py-1 rounded-full bg-[#f4f5f7] text-slate-700 font-medium text-xs">
                s=2 Orders
              </span>
            </div>
          </div>

          <div className="w-10 h-10 rounded-full bg-[#dcf0fa] text-slate-900 flex items-center justify-center shrink-0">
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
};
