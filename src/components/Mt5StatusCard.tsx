import React, { useEffect, useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { getMentorToken, getMt5AccountStatus, StoredMt5Account } from '../services/joemoneyMt5Api';

type ConnectionState = 'pending' | 'connected' | 'error';

export const Mt5StatusCard: React.FC<{ account: StoredMt5Account }> = ({ account }) => {
  const [state, setState] = useState<ConnectionState>('pending');
  const [message, setMessage] = useState('Terminal is starting on the VPS…');
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [secondsSinceCheck, setSecondsSinceCheck] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const status = await getMt5AccountStatus(getMentorToken(), account.login);
        if (cancelled) return;
        setLastCheckedAt(Date.now());
        if (status.terminal_connected) {
          setState('connected');
          setMessage('MT5 terminal heartbeat is active.');
        } else {
          setState('pending');
          setMessage(status.message && status.message !== 'MT5 login successful'
            ? status.message
            : 'Waiting for an active MT5 terminal heartbeat.');
        }
      } catch (checkError) {
        if (cancelled) return;
        setLastCheckedAt(Date.now());
        setState('error');
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

  useEffect(() => {
    if (lastCheckedAt === null) return;
    const ageTimer = window.setInterval(() => {
      setSecondsSinceCheck(Math.floor((Date.now() - lastCheckedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(ageTimer);
  }, [lastCheckedAt]);

  const styles = {
    pending: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
    connected: 'border-[#d6f655]/40 bg-[#d6f655]/10 text-[#d6f655]',
    error: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
  }[state];

  return (
    <div className={`rounded-xl border p-3 text-left ${styles}`}>
      <div className="flex items-center gap-2">
        {state === 'pending' && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === 'connected' && <ShieldCheck className="h-4 w-4" />}
        {state === 'error' && <ShieldAlert className="h-4 w-4" />}
        <p className="text-xs font-extrabold uppercase tracking-widest">
          MT5 {account.login} · {state === 'connected' ? 'connected' : state === 'pending' ? 'connecting' : 'attention needed'}
        </p>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed">{message}</p>
      <p className="mt-1 text-[10px] font-semibold opacity-80">
        {lastCheckedAt === null
          ? 'Checking status…'
          : `Last checked ${secondsSinceCheck === 0 ? 'just now' : `${secondsSinceCheck} seconds ago`} · refreshes every 5 seconds`}
      </p>
    </div>
  );
};
