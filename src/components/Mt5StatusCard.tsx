import React, { useEffect, useState } from 'react';
import { ArrowRight, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { getMentorToken, getMt5AccountStatus, StoredMt5Account } from '../services/joemoneyMt5Api';

type ConnectionState = 'pending' | 'connected' | 'error';

export const Mt5StatusCard: React.FC<{ account: StoredMt5Account }> = ({ account }) => {
  const [state, setState] = useState<ConnectionState>('pending');
  const [message, setMessage] = useState('Terminal is starting on the VPS…');
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState('');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const status = await getMt5AccountStatus(getMentorToken(), account.login);
        if (cancelled) return;
        if (status.terminal_connected) {
          setState('connected');
          setBalance(status.balance);
          setCurrency(status.currency);
          setMessage('Logged in on the VPS. MT5 trading is live.');
        } else {
          setState('pending');
          setBalance(null);
          setCurrency('');
          setMessage(status.message || 'Waiting for the MT5 login on the VPS…');
        }
      } catch (checkError) {
        if (cancelled) return;
        setState('error');
        setBalance(null);
        setCurrency('');
        setMessage(checkError instanceof Error ? checkError.message : 'Could not reach the VPS bridge.');
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [account.login]);

  const styles = {
    pending: 'border-amber-400/50 bg-amber-500/10 text-amber-200',
    connected: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200',
    error: 'border-rose-400/50 bg-rose-500/10 text-rose-200',
  }[state];

  if (state === 'pending') {
    return (
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-bold text-amber-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        <span>
          MT5 {account.login} · connecting — {message}
        </span>
      </p>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <div className="flex items-center gap-2">
        {state === 'connected' && <ShieldCheck className="h-4 w-4" />}
        {state === 'error' && <ShieldAlert className="h-4 w-4" />}
        <p className="text-xs font-extrabold uppercase tracking-widest">
          MT5 {account.login} · {state === 'connected' ? 'connected' : 'attention needed'}
        </p>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed">{message}</p>
      {state === 'connected' ? (
        <a
          href="/mt5"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-white/90 py-2.5 text-xs font-extrabold text-slate-900 transition hover:bg-white"
        >
          Trade on MT5 <ArrowRight className="h-3.5 w-3.5" />
        </a>
      ) : (
        <a
          href="/mt5"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-white/20 py-2.5 text-xs font-bold text-white/90 transition hover:bg-white/10"
        >
          Open MT5 console <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
};
