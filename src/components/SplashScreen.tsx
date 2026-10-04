import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { DerivAccount } from '../types/trading';
import { derivService } from '../services/derivWs';
import { beginDerivOAuth, exchangeDerivOAuthCode } from '../services/derivOAuth';
import { MascotHead } from './MascotHead';

interface SplashScreenProps {
  onConnected: (account: DerivAccount) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onConnected }) => {
  const [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackStarted = useRef(false);

  useEffect(() => {
    if (window.location.pathname !== '/oauth/callback' || callbackStarted.current) return;
    callbackStarted.current = true;

    const finishOAuth = async () => {
      setLoading(true);
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const returnedState = params.get('state');
      const expectedState = sessionStorage.getItem('deriv_oauth_state');
      const verifier = sessionStorage.getItem('deriv_oauth_verifier');
      const savedAccountType = sessionStorage.getItem('deriv_oauth_account_type');
      const selectedAccountType = savedAccountType === 'real' ? 'real' : 'demo';
      window.history.replaceState({}, document.title, '/');

      try {
        if (params.has('error')) {
          throw new Error(params.get('error_description') || 'Deriv sign-in was cancelled.');
        }
        if (!code || !returnedState || !expectedState || returnedState !== expectedState || !verifier) {
          throw new Error('The Deriv sign-in could not be verified. Please try again.');
        }

        sessionStorage.removeItem('deriv_oauth_state');
        sessionStorage.removeItem('deriv_oauth_verifier');
        sessionStorage.removeItem('deriv_oauth_account_type');
        await exchangeDerivOAuthCode(code, verifier);
        const account = await derivService.connectOAuthAccount(selectedAccountType);
        onConnected(account);
      } catch (callbackError) {
        sessionStorage.removeItem('deriv_oauth_state');
        sessionStorage.removeItem('deriv_oauth_verifier');
        sessionStorage.removeItem('deriv_oauth_account_type');
        setError(callbackError instanceof Error ? callbackError.message : 'Deriv sign-in failed.');
      } finally {
        setLoading(false);
      }
    };

    void finishOAuth();
  }, [onConnected]);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await beginDerivOAuth(accountType);
    } catch (signInError) {
      setLoading(false);
      setError(signInError instanceof Error ? signInError.message : 'Could not start Deriv sign-in.');
    }
  };

  const isCallback = window.location.pathname === '/oauth/callback';

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center py-6 px-4 sm:px-6 max-w-md w-full mx-auto font-sans select-none space-y-4">
      <div className="my-3 rounded-[32px] p-4 flex flex-col items-center justify-center border border-pink-100/60 bg-[#fdf0f4] shadow-xs">
        <MascotHead
          status={loading ? 'connecting' : error ? 'error' : 'idle'}
          size={140}
          message={isCallback ? 'Completing secure Deriv sign-in...' : undefined}
        />
      </div>

      <div className="bg-[#18181b] text-white rounded-[28px] p-5 shadow-md space-y-4">
        <div>
          <h1 className="text-base font-bold tracking-tight">Connect your Deriv account</h1>
          <p className="mt-1 text-[11px] text-neutral-400">
            Sign in on Deriv and approve JTrade. Your password and access token stay with Deriv.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#27272a] p-1">
          {(['demo', 'real'] as const).map((type) => (
            <button
              key={type}
              type="button"
              disabled={loading}
              onClick={() => setAccountType(type)}
              className={`py-2.5 rounded-lg text-xs font-bold capitalize transition ${
                accountType === type
                  ? type === 'real' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {type} account
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={handleSignIn}
          className="w-full py-3 rounded-xl bg-white hover:bg-neutral-100 text-slate-900 font-extrabold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
          <span>{loading ? 'Connecting securely...' : `Continue with Deriv · ${accountType}`}</span>
          {!loading && <ArrowRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};
