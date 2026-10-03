import React, { useState } from 'react';
import { ArrowRight, Layers, Server, Key, Sparkles, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { ConnectionMode, DerivAccount } from '../types/trading';
import { derivService } from '../services/derivWs';

interface SplashScreenProps {
  onConnected: (account: DerivAccount) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onConnected }) => {
  const [selectedMode, setSelectedMode] = useState<ConnectionMode>('mt5');

  // MT5 fields
  const [mt5Server, setMt5Server] = useState('Deriv-Demo');
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5IsDemo, setMt5IsDemo] = useState(true);

  // Token fields
  const [token, setToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (selectedMode === 'mt5') {
        if (!mt5Login.trim()) {
          setError('Please enter your MT5 Account ID (e.g. 1029384)');
          setLoading(false);
          return;
        }
        const acc = await derivService.connectMT5({
          server: mt5Server,
          login: mt5Login.trim(),
          password: mt5Password,
          isDemo: mt5IsDemo,
        });
        setLoading(false);
        onConnected(acc);
      } else if (selectedMode === 'token') {
        if (!token.trim()) {
          setError('Please enter your Deriv API token');
          setLoading(false);
          return;
        }
        derivService.setToken(token);
        const acc = await derivService.connect(token);
        setLoading(false);
        if (acc.isConnected) {
          onConnected(acc);
        } else {
          setError('Token authorization failed. Please check token permissions.');
        }
      } else {
        // Demo
        derivService.clearToken();
        const acc = await derivService.connect();
        setLoading(false);
        onConnected(acc);
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Connection failed. Please verify credentials.');
    }
  };

  const handleLaunchDemo = async () => {
    setError(null);
    setLoading(true);
    try {
      derivService.clearToken();
      const acc = await derivService.connect();
      setLoading(false);
      onConnected(acc);
    } catch {
      setLoading(false);
      setError('Sandbox initialization error.');
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-between p-4 sm:p-6 max-w-md w-full mx-auto font-sans select-none">
      {/* Top Header & Brand (Without "PWA Ready") */}
      <div className="pt-2 px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#18181b] text-white flex items-center justify-center font-black text-lg shadow-sm">
            J
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-slate-900 tracking-tight">J-GRID TRADER</h1>
            <p className="text-[11px] text-slate-400 font-medium">Deriv & MT5 Algorithmic Desk</p>
          </div>
        </div>

        {/* Progress dashes */}
        <div className="flex items-center gap-2 mt-4">
          <div className="h-1 flex-1 bg-slate-900 rounded-full" />
          <div className="h-1 flex-1 bg-slate-900 rounded-full" />
          <div className="h-1 flex-1 bg-slate-200 rounded-full" />
        </div>
      </div>

      {/* Value Explanation Showcase Card */}
      <div className="my-4 bg-[#fdf0f4] rounded-[32px] p-5 flex flex-col justify-between relative overflow-hidden shadow-xs border border-pink-100/60">
        <div className="flex items-center justify-between mb-3">
          <div className="w-12 h-12 rounded-full bg-[#fbcfe8] border-2 border-slate-900 flex items-center justify-center shadow-xs">
            <span className="text-xl font-black text-slate-900">J</span>
          </div>
          <span className="px-3 py-1 rounded-full bg-white text-slate-800 text-[10px] font-bold shadow-2xs">
            Formula: u − x − zy
          </span>
        </div>

        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
            Automate Buy & Sell Grids
          </h2>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            Deploy mathematical position ladders with live Deriv spot prices: Spot <strong>u</strong> (4170) − Offset <strong>x</strong> (4165) − Step multiples <strong>zy</strong>.
          </p>
        </div>

        {/* Core Value Badges */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="bg-white/90 p-2.5 rounded-2xl border border-pink-100/80 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#dcf0fa] text-slate-900 flex items-center justify-center shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <div className="text-[11px] font-bold text-slate-800 leading-tight">
              Auto Ladder Engine
            </div>
          </div>

          <div className="bg-white/90 p-2.5 rounded-2xl border border-pink-100/80 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#fbcfe8] text-slate-900 flex items-center justify-center shrink-0">
              <Server className="w-3.5 h-3.5" />
            </div>
            <div className="text-[11px] font-bold text-slate-800 leading-tight">
              Live MT5 Streaming
            </div>
          </div>
        </div>
      </div>

      {/* Connection Sheet: Connect user's account right here (NO duplicate modal) */}
      <div className="bg-[#18181b] rounded-[32px] p-5 text-white shadow-md">
        {/* Connection Mode Selector */}
        <div className="flex items-center justify-between gap-1 bg-[#27272a] p-1 rounded-full mb-3.5">
          <button
            type="button"
            onClick={() => {
              setSelectedMode('mt5');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
              selectedMode === 'mt5'
                ? 'bg-[#fbcfe8] text-slate-900 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Server className="w-3 h-3" />
            <span>Deriv MT5</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedMode('token');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
              selectedMode === 'token'
                ? 'bg-[#fbcfe8] text-slate-900 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Key className="w-3 h-3" />
            <span>Deriv API</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedMode('demo');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
              selectedMode === 'demo'
                ? 'bg-[#fbcfe8] text-slate-900 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Demo</span>
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Direct MT5 Inputs */}
        {selectedMode === 'mt5' && (
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-neutral-400 block mb-1">
                  Server
                </label>
                <select
                  value={mt5Server}
                  onChange={(e) => {
                    setMt5Server(e.target.value);
                    setMt5IsDemo(e.target.value.toLowerCase().includes('demo'));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#27272a] border border-neutral-700 text-xs text-white focus:outline-none"
                >
                  <option value="Deriv-Demo">Deriv-Demo</option>
                  <option value="Deriv-Server">Deriv-Server</option>
                  <option value="Deriv-SVG">Deriv-SVG</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-neutral-400 block mb-1">
                  Type
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setMt5IsDemo(true)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition ${
                      mt5IsDemo ? 'bg-white text-slate-900' : 'bg-[#27272a] text-neutral-400'
                    }`}
                  >
                    Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMt5IsDemo(false)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition ${
                      !mt5IsDemo ? 'bg-white text-slate-900' : 'bg-[#27272a] text-neutral-400'
                    }`}
                  >
                    Real
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-neutral-400 block mb-1">
                MT5 Account ID
              </label>
              <input
                type="text"
                value={mt5Login}
                onChange={(e) => setMt5Login(e.target.value)}
                placeholder="e.g. 1029384"
                className="w-full px-3 py-2 rounded-xl bg-[#27272a] border border-neutral-700 text-xs font-mono text-white focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-neutral-400 block mb-1">
                Trader Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={mt5Password}
                  onChange={(e) => setMt5Password(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 pr-9 rounded-xl bg-[#27272a] border border-neutral-700 text-xs font-mono text-white focus:outline-none focus:border-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-full bg-white hover:bg-neutral-100 active:scale-98 text-slate-900 font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Connect & Open Grid Inputs</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Direct Deriv API Token Inputs */}
        {selectedMode === 'token' && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold text-neutral-400">
                  Deriv API Token
                </label>
                <a
                  href="https://app.deriv.com/account/api-token"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  Get Token →
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="e.g. uY82kLPq91bN..."
                  className="w-full px-3 py-2 pr-9 rounded-xl bg-[#27272a] border border-neutral-700 text-xs font-mono text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">Requires Read & Trade scopes</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-full bg-white hover:bg-neutral-100 active:scale-98 text-slate-900 font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Connect & Open Grid Inputs</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Direct Demo Sandbox */}
        {selectedMode === 'demo' && (
          <div className="py-2 space-y-3 text-center">
            <div className="p-3 rounded-2xl bg-[#27272a] text-center">
              <div className="text-xl font-bold font-mono text-white">$10,000.00 USD</div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Simulate Spot 4170 ladders risk-free with live ticks.
              </p>
            </div>

            <button
              type="button"
              onClick={handleLaunchDemo}
              disabled={loading}
              className="w-full py-3 rounded-full bg-white hover:bg-neutral-100 active:scale-98 text-slate-900 font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Start with $10,000 Demo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
