import React, { useState } from 'react';
import { DerivAccount, ConnectionMode } from '../types/trading';
import { derivService } from '../services/derivWs';
import { Server, Key, Sparkles, ArrowRight, ExternalLink, Eye, EyeOff } from 'lucide-react';

interface ConnectPortalProps {
  initialMode?: ConnectionMode;
  currentAccount: DerivAccount;
  onSuccess: (acc: DerivAccount) => void;
  onCancel?: () => void;
}

export const ConnectPortal: React.FC<ConnectPortalProps> = ({
  initialMode = 'mt5',
  currentAccount,
  onSuccess,
  onCancel,
}) => {
  const [activeMode, setActiveMode] = useState<ConnectionMode>(initialMode);

  // MT5 state
  const [mt5Server, setMt5Server] = useState('Deriv-Demo');
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5IsDemo, setMt5IsDemo] = useState(true);

  // Token state
  const [token, setToken] = useState(currentAccount.token || '');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnectMT5 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mt5Login.trim()) {
      setError('Please enter your MT5 Login ID (e.g. 1029384).');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const acc = await derivService.connectMT5({
        server: mt5Server,
        login: mt5Login.trim(),
        password: mt5Password,
        isDemo: mt5IsDemo,
      });
      setLoading(false);
      onSuccess(acc);
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Failed to connect MT5 account.');
    }
  };

  const handleConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Please enter your Deriv API token.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      derivService.setToken(token);
      const acc = await derivService.connect(token);
      setLoading(false);
      if (acc.isConnected) {
        onSuccess(acc);
      } else {
        setError('Token authorization failed. Please check token scopes.');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Connection error.');
    }
  };

  const handleConnectDemo = async () => {
    setError(null);
    setLoading(true);
    try {
      derivService.clearToken();
      const acc = await derivService.connect();
      setLoading(false);
      onSuccess(acc);
    } catch {
      setLoading(false);
      setError('Sandbox initialization error.');
    }
  };

  return (
    <div className="bg-white rounded-[32px] p-6 sm:p-7 border border-slate-100 shadow-2xl max-w-sm w-full mx-auto font-sans select-none">
      {/* Header */}
      <div className="text-center mb-5">
        <div className="w-12 h-12 rounded-full bg-[#f4f5f7] text-slate-900 flex items-center justify-center mx-auto mb-2 font-bold text-lg">
          J
        </div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Connect Deriv
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Select login method to access grid inputs
        </p>
      </div>

      {/* Pill Mode Switcher matching reference image */}
      <div className="flex items-center gap-1 bg-[#f4f5f7] p-1 rounded-full mb-5">
        <button
          type="button"
          onClick={() => {
            setActiveMode('mt5');
            setError(null);
          }}
          className={`flex-1 py-2 rounded-full text-xs font-bold transition cursor-pointer ${
            activeMode === 'mt5'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          MT5 Logins
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMode('token');
            setError(null);
          }}
          className={`flex-1 py-2 rounded-full text-xs font-bold transition cursor-pointer ${
            activeMode === 'token'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Deriv API
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMode('demo');
            setError(null);
          }}
          className={`flex-1 py-2 rounded-full text-xs font-bold transition cursor-pointer ${
            activeMode === 'demo'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Demo
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-4 p-3 rounded-2xl bg-rose-50 text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {/* MT5 Login Form */}
      {activeMode === 'mt5' && (
        <form onSubmit={handleConnectMT5} className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              MT5 Server
            </label>
            <select
              value={mt5Server}
              onChange={(e) => {
                setMt5Server(e.target.value);
                setMt5IsDemo(e.target.value.toLowerCase().includes('demo'));
              }}
              className="w-full px-4 py-2.5 rounded-2xl bg-[#f4f5f7] border-0 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-slate-900"
            >
              <option value="Deriv-Demo">Deriv-Demo (Virtual)</option>
              <option value="Deriv-Server">Deriv-Server (Real)</option>
              <option value="Deriv-Server-02">Deriv-Server-02 (Real 2)</option>
              <option value="Deriv-SVG">Deriv-SVG (Financial/CFD)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              MT5 Login Account ID
            </label>
            <input
              type="text"
              value={mt5Login}
              onChange={(e) => setMt5Login(e.target.value)}
              placeholder="e.g. 1029384"
              className="w-full px-4 py-2.5 rounded-2xl bg-[#f4f5f7] border-0 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              Trader Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={mt5Password}
                onChange={(e) => setMt5Password(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 pr-10 rounded-2xl bg-[#f4f5f7] border-0 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-400">Account Type:</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMt5IsDemo(true)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                  mt5IsDemo ? 'bg-[#18181b] text-white' : 'bg-[#f4f5f7] text-slate-600'
                }`}
              >
                Demo ($10K)
              </button>
              <button
                type="button"
                onClick={() => setMt5IsDemo(false)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                  !mt5IsDemo ? 'bg-[#18181b] text-white' : 'bg-[#f4f5f7] text-slate-600'
                }`}
              >
                Real
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-3 py-3 rounded-full bg-[#18181b] hover:bg-black active:scale-98 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Connect & Continue to Grid</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      )}

      {/* Token Form */}
      {activeMode === 'token' && (
        <form onSubmit={handleConnectToken} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-600">
                Deriv API Token
              </label>
              <a
                href="https://app.deriv.com/account/api-token"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 hover:underline"
              >
                <span>Get Token</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="e.g. uY82kLPq91bN..."
                className="w-full px-4 py-2.5 pr-10 rounded-2xl bg-[#f4f5f7] border-0 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Token requires <strong>Read</strong> and <strong>Trade</strong> scopes.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-3 py-3 rounded-full bg-[#18181b] hover:bg-black active:scale-98 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Connect & Continue to Grid</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      )}

      {/* Demo Sandbox */}
      {activeMode === 'demo' && (
        <div className="text-center py-3 space-y-4">
          <div className="p-4 rounded-2xl bg-[#f4f5f7]">
            <div className="text-2xl font-bold text-slate-900 font-mono">$10,000.00</div>
            <span className="text-[11px] text-slate-500 font-medium">Virtual Balance</span>
            <p className="text-xs text-slate-400 mt-1">
              Test Gold spot ladders ($u, x, t, s, y, z$) with live Deriv prices.
            </p>
          </div>

          <button
            type="button"
            onClick={handleConnectDemo}
            disabled={loading}
            className="w-full py-3 rounded-full bg-[#18181b] hover:bg-black active:scale-98 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Launch Demo & Continue to Grid</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full mt-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-700 cursor-pointer"
        >
          Cancel
        </button>
      )}
    </div>
  );
};
