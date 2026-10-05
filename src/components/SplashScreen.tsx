import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CandlestickChart, Loader2, ShieldCheck, Wallet } from 'lucide-react';
import { DerivAccount, DerivOptionsAccount } from '../types/trading';
import { derivService } from '../services/derivWs';
import { beginDerivOAuth, exchangeDerivOAuthCode } from '../services/derivOAuth';
import { getStoredMt5Account, StoredMt5Account } from '../services/joemoneyMt5Api';
import { Mt5CredentialsModal } from './Mt5CredentialsModal';
import { MascotHead } from './MascotHead';

interface SplashScreenProps {
  onConnected: (account: DerivAccount) => void;
  onMt5Connected: (account: StoredMt5Account) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onConnected, onMt5Connected }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsAccounts, setOptionsAccounts] = useState<DerivOptionsAccount[] | null>(null);
  const [connectingAccountId, setConnectingAccountId] = useState<string | null>(null);
  const [showMt5Modal, setShowMt5Modal] = useState(false);
  const [storedMt5Account, setStoredMt5Account] = useState<StoredMt5Account | null>(() => getStoredMt5Account());
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
        await exchangeDerivOAuthCode(code, verifier);
        const accounts = await derivService.getOAuthOptionsAccounts();
        if (accounts.length === 0) throw new Error('No active Deriv Options accounts were found for this login.');
        setOptionsAccounts(accounts);
      } catch (callbackError) {
        sessionStorage.removeItem('deriv_oauth_state');
        sessionStorage.removeItem('deriv_oauth_verifier');
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
      await beginDerivOAuth();
    } catch (signInError) {
      setLoading(false);
      setError(signInError instanceof Error ? signInError.message : 'Could not start Deriv sign-in.');
    }
  };

  const handleSelectAccount = async (selectedAccount: DerivOptionsAccount) => {
    setConnectingAccountId(selectedAccount.accountId);
    setError(null);
    try {
      const account = await derivService.connectOAuthAccount(selectedAccount.accountId);
      onConnected(account);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Could not connect this Options account.');
    } finally {
      setConnectingAccountId(null);
    }
  };

  const isCallback = window.location.pathname === '/oauth/callback';

  const handleMt5ModalConnected = (account: StoredMt5Account) => {
    setStoredMt5Account(account);
    setShowMt5Modal(false);
    onMt5Connected(account);
  };

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
            Sign in on Deriv and approve JoeMoney. Your password and access token stay with Deriv.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs">
            {error}
          </div>
        )}

        {optionsAccounts ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-300">Choose the Options account to trade</p>
            {optionsAccounts.map((optionAccount) => (
              <button
                key={optionAccount.accountId}
                type="button"
                disabled={connectingAccountId !== null}
                onClick={() => handleSelectAccount(optionAccount)}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-3 text-left text-slate-900 transition hover:bg-neutral-100 disabled:opacity-60"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {connectingAccountId === optionAccount.accountId
                    ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    : <Wallet className="h-4 w-4 shrink-0 text-slate-500" />}
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs font-bold">{optionAccount.accountId}</span>
                    <span className="mt-0.5 block text-[10px] capitalize text-slate-500">{optionAccount.accountType} Options</span>
                  </span>
                </span>
                <span className="shrink-0 text-right font-mono text-xs font-semibold">
                  {optionAccount.currency} {optionAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </button>
            ))}
            <p className="pt-1 text-[10px] leading-relaxed text-neutral-500">
              This list contains Options accounts. CFD and MT5 accounts aren’t available through this trading connection.
            </p>
          </div>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={handleSignIn}
            className="w-full py-3 rounded-xl bg-white hover:bg-neutral-100 text-slate-900 font-extrabold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
            <span>{loading ? 'Connecting securely...' : 'Continue to Deriv (Options trading)'}</span>
            {!loading && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        )}
        {storedMt5Account ? (
          <button
            type="button"
            onClick={() => onMt5Connected(storedMt5Account)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600/60 bg-emerald-500/10 py-3 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/20"
          >
            <CandlestickChart className="h-3.5 w-3.5" />
            MT5 dashboard · {storedMt5Account.login}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowMt5Modal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-600 py-3 text-xs font-bold text-neutral-200 transition hover:bg-white/10"
          >
            <CandlestickChart className="h-3.5 w-3.5" />
            MT5 Credentials
          </button>
        )}
      </div>

      {showMt5Modal && (
        <Mt5CredentialsModal
          onClose={() => setShowMt5Modal(false)}
          onConnected={handleMt5ModalConnected}
        />
      )}
    </div>
  );
};
