import React, { useState } from 'react';
import { ArrowRight, Server, Key, Eye, EyeOff } from 'lucide-react';
import { ConnectionMode, DerivAccount } from '../types/trading';
import { derivService } from '../services/derivWs';
import { MascotHead } from './MascotHead';

interface SplashScreenProps {
  onConnected: (account: DerivAccount) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onConnected }) => {
  // Default directly to real Deriv API
  const [selectedMode, setSelectedMode] = useState<ConnectionMode>('token');

  // MT5 fields
  const [mt5Server, setMt5Server] = useState('Deriv-Server');
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5IsDemo, setMt5IsDemo] = useState(false);

  // Token fields
  const [token, setToken] = useState('');
  const [appId, setAppId] = useState<number>(derivService.getAppId());
  const [optionsAccountType, setOptionsAccountType] = useState<'demo' | 'real'>('demo');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connectionSuccess || loading) return;

    setError(null);
    setLoading(true);

    try {
      if (selectedMode === 'token') {
        if (!token.trim()) {
          setError('Please enter your Deriv API token (requires Read and Trade scopes).');
          setLoading(false);
          return;
        }
        if (!Number.isInteger(appId) || appId <= 0) {
          setError('Enter the App ID registered to your Deriv application.');
          setLoading(false);
          return;
        }
        derivService.setToken(token, appId);
        const acc = await derivService.connect(token, appId, optionsAccountType);
        setLoading(false);

        if (acc.isConnected && acc.loginId) {
          // TURN MASCOT HEAD GREEN & AUTO-PROCEED
          setConnectionSuccess(true);
          setTimeout(() => {
            onConnected(acc);
          }, 900);
        } else {
          setError(
            derivService.getLastError() ||
              'The token was not authorized for the selected Options account. Check the token’s trade scope, App ID, and account access.'
          );
        }
      } else if (selectedMode === 'mt5') {
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

        // TURN MASCOT HEAD GREEN & AUTO-PROCEED
        setConnectionSuccess(true);
        setTimeout(() => {
          onConnected(acc);
        }, 900);
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || derivService.getLastError() || 'Connection failed.');
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center py-6 px-4 sm:px-6 max-w-md w-full mx-auto font-sans select-none space-y-4">

      {/* Mascot Head Showcase Card: Turns Green on Success & Auto Proceeds */}
      <div
        className={`my-3 rounded-[32px] p-4 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-500 border ${
          connectionSuccess
            ? 'bg-[#ecfdf5] border-emerald-200 shadow-md scale-102'
            : 'bg-[#fdf0f4] border-pink-100/60 shadow-xs'
        }`}
      >
        <MascotHead
          status={
            connectionSuccess
              ? 'success'
              : loading
              ? 'connecting'
              : error
              ? 'error'
              : 'idle'
          }
          size={140}
          message={
            selectedMode === 'token'
              ? 'Authorizing Deriv API Token...'
              : 'Authenticating MT5 Server...'
          }
        />
      </div>

      {/* Account Login Portal Card: Real Account Focused */}
      <div className="bg-[#18181b] text-white rounded-[32px] p-5 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Connect Real Account</h3>
            <p className="text-[11px] text-neutral-400">Authenticate your Deriv account to trade live</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-emerald-400">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                connectionSuccess
                  ? 'bg-emerald-400 scale-125'
                  : 'bg-emerald-500 animate-pulse'
              }`}
            />
          </div>
        </div>

        {/* Mode Selector Tabs: Deriv API vs MT5 */}
        <div className="bg-[#27272a] p-1 rounded-full flex gap-1">
          <button
            type="button"
            disabled={loading || connectionSuccess}
            onClick={() => {
              setSelectedMode('token');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              selectedMode === 'token'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Deriv API (Token)</span>
          </button>

          <button
            type="button"
            disabled={loading || connectionSuccess}
            onClick={() => {
              setSelectedMode('mt5');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              selectedMode === 'mt5'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>MetaTrader 5 (MT5)</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Direct Deriv API Token Inputs */}
        {selectedMode === 'token' && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold text-neutral-400">
                  Deriv Personal Access Token
                </label>
                <a
                  href="https://developers.deriv.com/docs/intro/authentication/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  Token setup docs →
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your token here..."
                  disabled={loading || connectionSuccess}
                  className="w-full px-3 py-2 pr-9 rounded-xl bg-[#27272a] border border-neutral-700 text-xs font-mono text-white focus:outline-none focus:border-neutral-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">Requires trade access and your registered App ID</p>

              <div className="mt-3 pt-2.5 border-t border-neutral-800">
                <span className="text-[10px] text-neutral-400 font-semibold block mb-1">Options Account</span>
                <div className="grid grid-cols-2 gap-1 mb-2">
                  {(['demo', 'real'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      disabled={loading || connectionSuccess}
                      onClick={() => setOptionsAccountType(type)}
                      className={`py-2 rounded-lg text-xs font-bold capitalize transition ${
                        optionsAccountType === type
                          ? type === 'real' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                          : 'bg-[#27272a] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <label htmlFor="deriv-app-id" className="text-[10px] text-neutral-400 font-semibold block mb-1">
                  Registered Deriv App ID
                </label>
                <input
                  id="deriv-app-id"
                  type="number"
                  min="1"
                  step="1"
                  value={appId || ''}
                  disabled={loading || connectionSuccess}
                  onChange={(event) => setAppId(parseInt(event.target.value, 10) || 0)}
                  className="w-full px-3 py-2 rounded-xl bg-[#27272a] border border-neutral-700 text-xs font-mono text-white focus:outline-none focus:border-neutral-500 disabled:opacity-50"
                />
                <p className="text-[9px] text-neutral-500 mt-1">
                  Use the App ID created for your application in the Deriv developer dashboard.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || connectionSuccess}
              className={`w-full mt-2 py-3 rounded-full font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                connectionSuccess
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white hover:bg-neutral-100 active:scale-98 text-slate-900'
              }`}
            >
              {connectionSuccess ? (
                <span>Connected! Launching Dashboard...</span>
              ) : loading ? (
                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Connect & Open Order Desk</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
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
                  disabled={loading || connectionSuccess}
                  onChange={(e) => {
                    setMt5Server(e.target.value);
                    setMt5IsDemo(e.target.value.toLowerCase().includes('demo'));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#27272a] border border-neutral-700 text-xs text-white focus:outline-none disabled:opacity-50"
                >
                  <option value="Deriv-Server">Deriv-Server (Real)</option>
                  <option value="Deriv-SVG">Deriv-SVG (Real)</option>
                  <option value="Deriv-Demo">Deriv-Demo</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-neutral-400 block mb-1">
                  Account Type
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={loading || connectionSuccess}
                    onClick={() => setMt5IsDemo(false)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition ${
                      !mt5IsDemo ? 'bg-white text-slate-900' : 'bg-[#27272a] text-neutral-400'
                    }`}
                  >
                    Real
                  </button>
                  <button
                    type="button"
                    disabled={loading || connectionSuccess}
                    onClick={() => setMt5IsDemo(true)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition ${
                      mt5IsDemo ? 'bg-white text-slate-900' : 'bg-[#27272a] text-neutral-400'
                    }`}
                  >
                    Demo
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
                disabled={loading || connectionSuccess}
                onChange={(e) => setMt5Login(e.target.value)}
                placeholder="e.g. 1029384"
                className="w-full px-3 py-2 rounded-xl bg-[#27272a] border border-neutral-700 text-xs font-mono text-white focus:outline-none focus:border-neutral-500 disabled:opacity-50"
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
                  disabled={loading || connectionSuccess}
                  onChange={(e) => setMt5Password(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 pr-9 rounded-xl bg-[#27272a] border border-neutral-700 text-xs font-mono text-white focus:outline-none focus:border-neutral-500 disabled:opacity-50"
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
              disabled={loading || connectionSuccess}
              className={`w-full mt-2 py-3 rounded-full font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                connectionSuccess
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white hover:bg-neutral-100 active:scale-98 text-slate-900'
              }`}
            >
              {connectionSuccess ? (
                <span>Connected! Launching Dashboard...</span>
              ) : loading ? (
                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Connect & Open Order Desk</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
