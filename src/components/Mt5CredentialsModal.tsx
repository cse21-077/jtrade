import React, { useState } from 'react';
import { Loader2, Lock, Server, UserRound, X } from 'lucide-react';
import { getMentorToken, registerMt5Account, storeMt5Account, StoredMt5Account } from '../services/joemoneyMt5Api';

const DERIV_SERVERS = ['Deriv-Demo','DerivSVG-Demo', 'DerivSVG-Server', 'DerivSVG-Server-02', 'DerivSVG-Server-03'];

interface Mt5CredentialsModalProps {
  onClose: () => void;
  onConnected: (account: StoredMt5Account) => void;
}

export const Mt5CredentialsModal: React.FC<Mt5CredentialsModalProps> = ({ onClose, onConnected }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [serverChoice, setServerChoice] = useState(DERIV_SERVERS[0]);
  const [customServer, setCustomServer] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const tokenConfigured = Boolean(getMentorToken());
  const server = serverChoice === 'Custom' ? customServer.trim() : serverChoice;

  const handleConnect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!/^\d{4,20}$/.test(login.trim())) {
      setError('MT5 login must be 4-20 digits.');
      return;
    }
    if (!password) {
      setError('Enter the MT5 account password.');
      return;
    }
    if (!server) {
      setError('Choose a Deriv server or enter a custom one.');
      return;
    }
    const mentorToken = getMentorToken() || manualToken.trim();
    if (!mentorToken) {
      setError('Enter the bridge key once — it is printed by start-bridge.ps1 on the VPS.');
      return;
    }
    if (!tokenConfigured) {
      window.sessionStorage.setItem('joemoney-mentor-token', mentorToken);
    }

    setIsConnecting(true);
    try {
      await registerMt5Account(mentorToken, {
        login: login.trim(),
        password,
        server,
      });
      const account: StoredMt5Account = { login: login.trim(), server };
      storeMt5Account(account);
      onConnected(account);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Could not register this MT5 account.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="mt5-credentials-title"
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="mt5-credentials-title" className="text-base font-black tracking-tight">MT5 Credentials</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
              Your Deriv MT5 account runs on the JoeMoney VPS. We start a terminal, log it in, and connect it to your dashboard.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-neutral-500 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleConnect} className="mt-4 space-y-3">
          <label className="grid gap-1.5 text-xs font-semibold text-neutral-300">
            MT5 login
            <span className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                required
                inputMode="numeric"
                pattern="\d{4,20}"
                autoComplete="off"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-700 bg-neutral-900 pl-9 pr-3 font-mono text-sm text-white outline-none focus:border-emerald-500"
                placeholder="e.g. 12345678"
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-neutral-300">
            MT5 password
            <span className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                required
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-700 bg-neutral-900 pl-9 pr-3 font-mono text-sm text-white outline-none focus:border-emerald-500"
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-neutral-300">
            Deriv server
            <span className="relative">
              <Server className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <select
                value={serverChoice}
                onChange={(event) => setServerChoice(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-neutral-700 bg-neutral-900 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-500"
              >
                {DERIV_SERVERS.map((name) => <option key={name} value={name}>{name}</option>)}
                <option value="Custom">Custom server…</option>
              </select>
            </span>
          </label>
          {serverChoice === 'Custom' && (
            <label className="grid gap-1.5 text-xs font-semibold text-neutral-300">
              Server name
              <input
                required
                maxLength={128}
                value={customServer}
                onChange={(event) => setCustomServer(event.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 font-mono text-sm text-white outline-none focus:border-emerald-500"
                placeholder="e.g. BrokerName-Server01"
              />
            </label>
          )}

          {!tokenConfigured && (
            <label className="grid gap-1.5 text-xs font-semibold text-neutral-300">
              Bridge key <span className="font-normal text-neutral-500">(asked once; not needed in production builds)</span>
              <input
                required
                type="password"
                autoComplete="off"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 font-mono text-sm text-white outline-none focus:border-emerald-500"
                placeholder="Paste the bridge key printed on the VPS"
              />
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 p-3 text-xs font-semibold text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isConnecting}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-extrabold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {isConnecting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isConnecting ? 'Starting terminal on the VPS…' : 'Connect'}
          </button>
        </form>

        <p className="mt-3 text-[10px] leading-relaxed text-neutral-500">
          The password is sent once over HTTPS to start your terminal and is not saved in this app.
        </p>
      </section>
    </div>
  );
};
