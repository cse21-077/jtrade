import React, { useState } from 'react';
import { DerivAccount, MarketSymbol, PlacedOrder } from '../types/trading';
import { Search, Play, ArrowRight, LogOut, CheckCircle2, Zap, Loader2, ExternalLink } from 'lucide-react';
import { MascotHead } from './MascotHead';
import { derivService } from '../services/derivWs';

interface HomeScreenProps {
  account: DerivAccount;
  spotPrice: number;
  selectedSymbol: MarketSymbol;
  onOpenGrid: (preset?: { offset: number; lot: number; steps: number }) => void;
  onOpenConnect: () => void;
  onDisconnect: () => void;
  onDeployOrder?: (order: PlacedOrder) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  account,
  spotPrice,
  selectedSymbol,
  onOpenGrid,
  onOpenConnect,
  onDisconnect,
  onDeployOrder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExecutingTest, setIsExecutingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    contractId?: string;
    message?: string;
  } | null>(null);

  const handleTestMarketTrade = async () => {
    setIsExecutingTest(true);
    setTestResult(null);

    try {
      const res = await derivService.executeRealTrade({
        symbol: selectedSymbol.symbol,
        direction: 'BUY',
        lotSize: selectedSymbol.minLot,
      });

      if (res.success && res.contractId) {
        setTestResult({
          success: true,
          contractId: res.contractId,
          message: `Real Market Contract #${res.contractId} opened on Deriv!`,
        });

        if (onDeployOrder) {
          onDeployOrder({
            id: `test-${Date.now()}`,
            symbol: selectedSymbol.symbol,
            direction: 'BUY',
            orderType: 'MARKET_GRID',
            price: spotPrice,
            lotSize: selectedSymbol.minLot,
            levelIndex: 1,
            subIndex: 1,
            status: 'FILLED',
            derivContractId: res.contractId,
            createdAt: Date.now(),
            filledAt: Date.now(),
          });
        }
      } else {
        setTestResult({
          success: false,
          message: res.message || 'Trade execution failed on Deriv',
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || 'Trade failed',
      });
    } finally {
      setIsExecutingTest(false);
    }
  };

  const accountId = account.loginId || account.mt5Login || 'Demo-Account';
  const isReal = !account.isDemo && accountId.startsWith('CR');

  return (
    <div className="pb-28 pt-3 px-4 sm:px-5 max-w-[400px] mx-auto space-y-5 font-sans select-none bg-white min-h-screen">
      {/* Top Header: Greeting, Connected Green Mascot Head & Disconnect Button */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-1.5">
            <span>Hello, {account.fullName?.split(' ')[0] || 'Trader'}</span>
            <span>👋</span>
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-700">{accountId}</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                isReal ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isReal ? 'Real' : 'Demo'}
            </span>
          </div>
        </div>

        {/* Right Header Area: Green Connected Mascot Head + Disconnect Button */}
        <div className="flex items-center gap-2">
          {/* Connected Green Mascot Avatar */}
          <div
            onClick={onOpenConnect}
            className="cursor-pointer relative hover:scale-105 transition-transform"
            title={`Connected to ${accountId}. Click to view details.`}
          >
            <div className="w-11 h-11 rounded-full bg-emerald-50 border-2 border-emerald-400 p-0.5 flex items-center justify-center shadow-xs">
              <MascotHead status="success" size={38} />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-[8px] text-white font-bold">
              ✓
            </span>
          </div>

          {/* Quick Disconnect Button */}
          <button
            type="button"
            onClick={onDisconnect}
            className="p-2.5 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition cursor-pointer"
            title="Disconnect Account"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Real Account & Real-Time Market Status Card */}
      <div className="bg-[#18181b] rounded-[28px] p-4 text-white shadow-md space-y-3 relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono tracking-wider uppercase text-neutral-400">
              Active Deriv Account
            </span>
            <div className="text-lg font-black tracking-tight font-mono text-white flex items-center gap-2">
              <span>{accountId}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-sans font-bold">
                {account.currency || 'USD'} {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-neutral-400 block">Spot Feed</span>
            <span className="text-xs font-mono font-bold text-emerald-400">100% Real-Time</span>
          </div>
        </div>

        {/* Real Account Context Explanation */}
        <p className="text-[11px] text-neutral-300 leading-relaxed bg-neutral-900/80 p-2.5 rounded-xl border border-neutral-800">
          💡 <strong>Which account is trading?</strong> Deriv bound your API token to account{' '}
          <strong className="text-white font-mono">{accountId}</strong>. Every order executed here is
          debited/credited directly on Deriv and verified in your live Deriv Statement.
        </p>

        {/* 1-Tap Real Market Execution Test Button */}
        <div className="pt-1">
          <button
            type="button"
            disabled={isExecutingTest}
            onClick={handleTestMarketTrade}
            className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-100 active:scale-98 text-slate-900 font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            {isExecutingTest ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Executing Live Deriv Order...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>Test 1-Tap Market Buy on Deriv ({selectedSymbol.displayName.split(' ')[0]})</span>
              </>
            )}
          </button>
        </div>

        {/* Real Test Result Banner */}
        {testResult && (
          <div
            className={`p-2.5 rounded-xl text-xs font-medium border ${
              testResult.success
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : null}
              <span>{testResult.message}</span>
            </div>
            {testResult.contractId && (
              <p className="text-[10px] text-emerald-400/90 mt-1">
                Deriv Contract ID: <strong className="font-mono">{testResult.contractId}</strong>. You can verify
                this directly inside your Deriv Trader / Statement!
              </p>
            )}
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search markets (Volatility, Gold, Crypto)..."
          className="w-full pl-11 pr-4 py-3 rounded-full bg-[#f4f5f7] border-0 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition"
        />
      </div>

      {/* Dual Featured Cards */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Left: Deep Charcoal/Black Card */}
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
            <span className="px-2.5 py-1 rounded-full bg-neutral-800 text-[11px] font-medium text-emerald-400">
              Live Spot Feed
            </span>
            <div className="w-8 h-8 rounded-full bg-[#38bdf8] text-slate-900 flex items-center justify-center">
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </div>
          </div>
        </div>

        {/* Right: Crisp White Card */}
        <div
          onClick={() => onOpenGrid()}
          className="bg-white rounded-[28px] p-4 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between h-44 cursor-pointer hover:scale-[1.01] active:scale-98 transition-transform"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900 leading-tight">Grid Equation</h3>
            <div className="mt-3 text-xs font-mono font-bold text-slate-700 bg-[#f4f5f7] px-2.5 py-1.5 rounded-xl inline-block">
              u - x - zy
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="px-2.5 py-1 rounded-full bg-[#f4f5f7] text-[11px] font-medium text-slate-600">
              Auto Ladder
            </span>
            <div className="w-8 h-8 rounded-full bg-[#dcf0fa] text-slate-800 flex items-center justify-center">
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </div>
          </div>
        </div>
      </div>

      {/* "Special for you" Presets */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Trading Presets</h2>
          <button
            onClick={() => onOpenGrid()}
            className="text-xs font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-0.5 cursor-pointer"
          >
            <span>Customise</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Preset 1 */}
        <div
          onClick={() => onOpenGrid({ offset: 5.0, lot: 0.1, steps: 5 })}
          className="bg-[#dcf0fa] rounded-[24px] p-4 flex items-center justify-between cursor-pointer hover:scale-[1.01] active:scale-99 transition-transform"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900">Volatility 100 Buy/Sell Ladder</h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-3 py-1 rounded-full bg-white text-slate-800 font-medium text-xs shadow-2xs">
                5 Levels
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
      </div>
    </div>
  );
};
