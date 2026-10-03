import React, { useState } from 'react';
import { DerivAccount } from '../types/trading';
import { derivService } from '../services/derivWs';
import {
  Key,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
  Server,
  Zap,
  HelpCircle,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface DerivAccountPortalProps {
  currentAccount: DerivAccount;
  onConnected: (account: DerivAccount) => void;
  onBackToSplash: () => void;
}

export const DerivAccountPortal: React.FC<DerivAccountPortalProps> = ({
  currentAccount,
  onConnected,
  onBackToSplash,
}) => {
  const [token, setToken] = useState(currentAccount.token || '');
  const [showToken, setShowToken] = useState(false);
  const [appId, setAppId] = useState(currentAccount.appId || 1089);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoRedirect, setAutoRedirect] = useState(true);

  const handleConnectToken = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      derivService.setToken(token, appId);
      const acc = await derivService.connect(token, appId);

      setIsSubmitting(false);
      if (acc.isConnected) {
        if (autoRedirect) {
          setTimeout(() => {
            onConnected(acc);
          }, 400);
        }
      } else {
        setErrorMessage('Failed to authorize token. Please check your token scopes and try again.');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err?.message || 'Connection error. Check network.');
    }
  };

  const handleLaunchDemo = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      derivService.clearToken();
      const acc = await derivService.connect(undefined, appId);
      setIsSubmitting(false);
      if (autoRedirect) {
        setTimeout(() => {
          onConnected(acc);
        }, 400);
      }
    } catch {
      setIsSubmitting(false);
      setErrorMessage('Sandbox initialization error.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-sky-50/60 p-4 sm:p-8 flex flex-col justify-between font-sans">
      {/* Top Navbar */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between py-2">
        <button
          onClick={onBackToSplash}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-sky-600 transition cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-sky-500 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            J
          </div>
          <span>J-Grid Trader</span>
        </button>

        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 border border-sky-200">
          Step 1: Account Portal
        </span>
      </div>

      {/* Main Connection Card */}
      <div className="max-w-xl w-full mx-auto my-6 bg-white rounded-3xl border border-sky-100 shadow-xl shadow-sky-100/70 p-6 sm:p-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-100/70 text-sky-600 mb-3 border border-sky-200 shadow-xs">
            <Key className="w-7 h-7" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
            Connect Deriv Account
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Authenticate your Deriv account to deploy multi-step buy & sell ladder orders.
          </p>
        </div>

        {/* If already connected, show account banner */}
        {currentAccount.isConnected && (
          <div className="mt-6 p-4 rounded-2xl bg-sky-50 border border-sky-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-sky-600 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-sm">
                    {currentAccount.loginId || 'Connected Account'}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-sky-200 text-sky-800">
                    {currentAccount.isDemo ? 'Demo / Virtual' : 'Real Account'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Balance:{' '}
                  <strong className="text-sky-700 font-extrabold text-sm">
                    {currentAccount.currency} {currentAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </strong>
                </p>
              </div>
            </div>

            <button
              onClick={() => onConnected(currentAccount)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition"
            >
              <span>Go to Orders Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error message alert */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleConnectToken} className="mt-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>Deriv API Token</span>
                <span className="text-rose-500">*</span>
              </label>
              <a
                href="https://app.deriv.com/account/api-token"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 hover:underline"
              >
                <span>Get Token on Deriv</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="e.g. uY82kLPq91bN..."
                className="w-full px-3.5 py-2.5 pr-10 text-xs sm:text-sm rounded-xl border border-sky-200 bg-sky-50/20 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 leading-normal">
              Token requires <strong>Read</strong> and <strong>Trade</strong> permissions from your Deriv account settings.
            </p>
          </div>

          {/* App ID settings (expandable or simple) */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-bold text-slate-700 mb-1 block">
                Deriv App ID
              </label>
              <input
                type="number"
                value={appId}
                onChange={(e) => setAppId(parseInt(e.target.value, 10) || 1089)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-sky-200 bg-sky-50/20 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 font-mono"
              />
            </div>
            <div className="flex flex-col justify-end">
              <span className="text-[11px] text-slate-400 mb-1.5">Preset IDs:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAppId(1089)}
                  className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition ${
                    appId === 1089
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white text-slate-600 border-sky-200 hover:bg-sky-50'
                  }`}
                >
                  1089 (Standard)
                </button>
                <button
                  type="button"
                  onClick={() => setAppId(36544)}
                  className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition ${
                    appId === 36544
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white text-slate-600 border-sky-200 hover:bg-sky-50'
                  }`}
                >
                  36544 (Dev)
                </button>
              </div>
            </div>
          </div>

          {/* Auto-redirect checkbox */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="autoRedirect"
              checked={autoRedirect}
              onChange={(e) => setAutoRedirect(e.target.checked)}
              className="w-4 h-4 rounded text-sky-600 focus:ring-sky-400 border-sky-300 accent-sky-500"
            />
            <label htmlFor="autoRedirect" className="text-xs text-slate-600 cursor-pointer">
              Automatically advance to Orders Portal when connected
            </label>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2.5">
            <button
              type="submit"
              disabled={isSubmitting || !token.trim()}
              className={`w-full py-3 px-4 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer ${
                isSubmitting || !token.trim()
                  ? 'bg-sky-300 cursor-not-allowed shadow-none'
                  : 'bg-sky-500 hover:bg-sky-600 active:scale-99 shadow-sky-200'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authorizing with Deriv API...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Connect Real / Live Account</span>
                </>
              )}
            </button>

            {/* Quick Demo Sandbox Option */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-sky-100"></div>
              <span className="flex-shrink mx-4 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                Or test instantly without token
              </span>
              <div className="flex-grow border-t border-sky-100"></div>
            </div>

            <button
              type="button"
              onClick={handleLaunchDemo}
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl border border-sky-300 bg-sky-50/70 hover:bg-sky-100 text-sky-700 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Sparkles className="w-4 h-4 text-sky-500" />
              <span>Launch Demo Sandbox ($10,000 Virtual)</span>
            </button>
          </div>
        </form>

        {/* Security Notice */}
        <div className="mt-6 pt-4 border-t border-sky-100 flex items-start gap-2.5 text-[11px] text-slate-500">
          <Server className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
          <p>
            Your token is stored locally on your device in your browser. Connection is made directly to{' '}
            <code className="text-sky-700 bg-sky-50 px-1 py-0.5 rounded font-mono">
              wss://ws.derivws.com
            </code>{' '}
            via TLS encrypted WebSocket.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-4xl w-full mx-auto text-center text-xs text-slate-400 py-2">
        <span>J-Grid Trader • Secure Deriv WebSocket Interface</span>
      </div>
    </div>
  );
};
