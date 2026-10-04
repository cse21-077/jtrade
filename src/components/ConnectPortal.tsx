import React, { useState } from 'react';
import { ArrowRight, Loader2, ShieldCheck, X } from 'lucide-react';
import { DerivAccount } from '../types/trading';
import { beginDerivOAuth } from '../services/derivOAuth';

interface ConnectPortalProps {
  currentAccount: DerivAccount;
  onCancel?: () => void;
}

export const ConnectPortal: React.FC<ConnectPortalProps> = ({ currentAccount, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await beginDerivOAuth();
    } catch (signInError) {
      setLoading(false);
      setError(signInError instanceof Error ? signInError.message : 'Could not start Deriv sign-in.');
    }
  };

  return (
    <section className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" aria-labelledby="connect-deriv-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="connect-deriv-title" className="text-base font-bold text-slate-900">Connect Deriv</h2>
          <p className="mt-1 text-xs text-slate-500">Sign in with Deriv, then select the exact Options account to use.</p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-800" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

      <button
        type="button"
        disabled={loading}
        onClick={handleSignIn}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        <span>{loading ? 'Connecting securely...' : `Switch from ${currentAccount.loginId || 'current account'}`}</span>
        {!loading && <ArrowRight className="h-3.5 w-3.5" />}
      </button>
    </section>
  );
};
