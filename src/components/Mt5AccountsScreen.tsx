import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, Loader2, Plus, Radio, ShieldAlert, Trash2 } from 'lucide-react';
import {
  deactivateMt5Account,
  getMt5BridgeHealth,
  listMt5Accounts,
  Mt5Account,
  Mt5BridgeHealth,
  Mt5OrderRequest,
  Mt5OrderType,
  Mt5QueuedOrder,
  queueMt5Orders,
  registerMt5Account,
  getMt5Order,
} from '../services/joemoneyMt5Api';

const ORDER_TYPES: Array<{ value: Mt5OrderType; label: string }> = [
  { value: 'MARKET_BUY', label: 'Buy market' },
  { value: 'MARKET_SELL', label: 'Sell market' },
  { value: 'BUY_LIMIT', label: 'Buy limit' },
  { value: 'SELL_LIMIT', label: 'Sell limit' },
  { value: 'BUY_STOP', label: 'Buy stop' },
  { value: 'SELL_STOP', label: 'Sell stop' },
];

const TOKEN_STORAGE_KEY = 'joemoney-mentor-token';
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const accountIsLive = (account: Mt5Account) =>
  account.is_active && account.terminal_running && account.ea_connected;

export const Mt5AccountsScreen: React.FC = () => {
  const [token, setToken] = useState(() => window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '');
  const [health, setHealth] = useState<Mt5BridgeHealth | null>(null);
  const [accounts, setAccounts] = useState<Mt5Account[]>([]);
  const [selectedLogin, setSelectedLogin] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newServer, setNewServer] = useState('');
  const [symbol, setSymbol] = useState('EURUSD');
  const [orderType, setOrderType] = useState<Mt5OrderType>('BUY_STOP');
  const [volume, setVolume] = useState('0.01');
  const [firstEntry, setFirstEntry] = useState('1.10000');
  const [levelCount, setLevelCount] = useState('1');
  const [ordersPerLevel, setOrdersPerLevel] = useState('1');
  const [spacing, setSpacing] = useState('0.00100');
  const [spacingDirection, setSpacingDirection] = useState<'up' | 'down'>('up');
  const [tpEnabled, setTpEnabled] = useState(true);
  const [tpDistance, setTpDistance] = useState('0.00200');
  const [orders, setOrders] = useState<Mt5QueuedOrder[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pollTimer = useRef<number | null>(null);

  const refreshAccounts = useCallback(async (activeToken: string) => {
    try {
      const payload = await listMt5Accounts(activeToken);
      setAccounts(payload.accounts);
      setError('');
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not reach the MT5 API.');
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    void refreshAccounts(token);
    pollTimer.current = window.setInterval(() => void refreshAccounts(token), 5000);
    return () => {
      if (pollTimer.current !== null) window.clearInterval(pollTimer.current);
    };
  }, [token, refreshAccounts]);

  const checkConnection = async () => {
    setError('');
    setNotice('');
    setIsChecking(true);
    try {
      setHealth(await getMt5BridgeHealth(token));
      await refreshAccounts(token);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Could not reach the MT5 API.');
      setHealth(null);
    } finally {
      setIsChecking(false);
    }
  };

  const registerAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!/^\d{4,20}$/.test(newLogin.trim())) {
      setError('MT5 login must be 4-20 digits.');
      return;
    }
    setIsRegistering(true);
    try {
      const result = await registerMt5Account(token, {
        login: newLogin.trim(),
        password: newPassword,
        server: newServer.trim(),
      });
      setNotice(`Account ${result.login} registered. ${result.launched ? 'Terminal launched.' : result.message}`);
      setNewLogin('');
      setNewPassword('');
      setNewServer('');
      setSelectedLogin(result.login);
      await refreshAccounts(token);
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : 'Account registration failed.');
    } finally {
      setIsRegistering(false);
    }
  };

  const deactivateAccount = async (login: string) => {
    setError('');
    try {
      await deactivateMt5Account(token, login);
      if (selectedLogin === login) setSelectedLogin('');
      await refreshAccounts(token);
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : 'Could not deactivate the account.');
    }
  };

  const submitOrders = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSubmitting(true);
    setOrders([]);

    try {
      const levels = Number(levelCount);
      const copies = Number(ordersPerLevel);
      const lotSize = Number(volume);
      const initial = Number(firstEntry);
      const step = Number(spacing);
      const distance = Number(tpDistance);
      const market = orderType.startsWith('MARKET_');
      const count = levels * copies;

      if (!Number.isInteger(levels) || levels < 1 || levels > 25 || !Number.isInteger(copies) || copies < 1 || copies > 20) {
        throw new Error('Use 1-25 levels and 1-20 orders per level.');
      }
      if (count > 100) throw new Error('A batch is limited to 100 individual orders.');
      if (!market && (!Number.isFinite(initial) || initial <= 0)) throw new Error('Pending orders need an entry price greater than zero.');
      if (tpEnabled && (!Number.isFinite(distance) || distance <= 0)) throw new Error('TP distance must be greater than zero.');
      if (!Number.isFinite(lotSize) || lotSize <= 0) throw new Error('Volume must be greater than zero.');

      const payload: Mt5OrderRequest[] = [];
      for (let level = 0; level < levels; level++) {
        const entryPrice = market ? 0 : Number((initial + (spacingDirection === 'up' ? 1 : -1) * level * step).toFixed(10));
        for (let copy = 0; copy < copies; copy++) {
          payload.push({
            symbol: symbol.trim(),
            order_type: orderType,
            volume: lotSize,
            entry_price: entryPrice,
            tp_enabled: tpEnabled,
            tp_distance: distance,
          });
        }
      }

      const batch = await queueMt5Orders(token, selectedLogin, payload);
      setOrders(batch.orders);
      for (let attempt = 0; attempt < 20; attempt++) {
        await wait(1000);
        const updated = await Promise.all(batch.orders.map((order) => getMt5Order(token, order.id)));
        setOrders(updated);
        if (updated.every((order) => order.status !== 'queued' && order.status !== 'claimed')) break;
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Order submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAccount = accounts.find((account) => account.login === selectedLogin) ?? null;

  return (
    <main className="min-h-screen bg-[#f4f7f7] px-4 py-5 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">JoeMoney · VPS MT5</p>
            <h1 className="mt-1 text-xl font-extrabold">MT5 accounts</h1>
          </div>
          <a href="/" className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" /> Main app
          </a>
        </header>

        <section className="border-b border-slate-200 pb-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold"><Activity className="h-4 w-4 text-emerald-700" /> Bridge</div>
            <button type="button" onClick={checkConnection} disabled={isChecking || !token} className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
              Check connection
            </button>
          </div>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
            Mentor token
            <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm" placeholder="Paste the mentor token printed by the VPS bridge" />
          </label>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Kept only in this tab's session storage. It is not included in the PWA build.</p>
          {health && (
            <p className="mt-3 text-xs font-semibold text-emerald-800" role="status">
              Bridge reachable — {health.active_accounts} active account(s) on the VPS.
            </p>
          )}
        </section>

        <section className="border-b border-slate-200 pb-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Plus className="h-4 w-4 text-emerald-700" /> Register MT5 account</h2>
          <form onSubmit={registerAccount} className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-700">MT5 login
              <input required inputMode="numeric" pattern="\d{4,20}" value={newLogin} onChange={(event) => setNewLogin(event.target.value)} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm" placeholder="e.g. 51234567" />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Server
              <input required maxLength={128} value={newServer} onChange={(event) => setNewServer(event.target.value)} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm" placeholder="e.g. ICMarkets-Demo" />
            </label>
            <label className="col-span-2 grid gap-1.5 text-xs font-semibold text-slate-700">MT5 password
              <input required type="password" autoComplete="new-password" maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm" />
            </label>
            <button type="submit" disabled={isRegistering || !token} className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-800 text-sm font-extrabold text-white disabled:opacity-50">
              {isRegistering && <Loader2 className="h-4 w-4 animate-spin" />}
              {isRegistering ? 'Launching terminal on the VPS…' : 'Register & launch terminal'}
            </button>
          </form>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">The VPS starts a portable MT5 terminal, logs it into this account, and attaches the JoeMoney EA. Re-registering the same login updates its credentials.</p>
        </section>

        <section className="border-b border-slate-200 pb-5">
          <h2 className="mb-3 text-sm font-bold">Accounts</h2>
          {accounts.length === 0 && <p className="text-xs text-slate-500">No accounts registered for this mentor token yet.</p>}
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li key={account.login}>
                <button
                  type="button"
                  onClick={() => setSelectedLogin(account.login)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left ${selectedLogin === account.login ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${accountIsLive(account) ? 'bg-emerald-600' : account.is_active ? 'bg-amber-500' : 'bg-slate-300'}`} />
                    <span className="font-mono text-xs font-bold">{account.login}</span>
                    <span className="text-[11px] text-slate-500">{account.server}</span>
                  </span>
                  <span className="flex items-center gap-2 text-[11px] text-slate-500">
                    {account.terminal_running ? (account.ea_connected ? 'EA live' : 'terminal up') : account.is_active ? 'starting' : 'inactive'}
                    {account.is_active && (
                      <Trash2
                        className="h-3.5 w-3.5 text-slate-400 hover:text-rose-600"
                        aria-label={`Deactivate account ${account.login}`}
                        onClick={(event) => { event.stopPropagation(); void deactivateAccount(account.login); }}
                      />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selectedAccount && (
          <section>
            <h2 className="mb-3 text-sm font-bold">New order batch — <span className="font-mono">{selectedAccount.login}</span></h2>
            {!accountIsLive(selectedAccount) && (
              <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">
                {selectedAccount.is_active
                  ? 'Terminal or EA not confirmed live yet — orders will queue until the EA connects.'
                  : 'This account is deactivated. Re-register it to trade again.'}
              </p>
            )}
            <form onSubmit={submitOrders} className="grid grid-cols-2 gap-3">
              <label className="col-span-2 grid gap-1.5 text-xs font-semibold text-slate-700">Broker symbol
                <input required maxLength={64} value={symbol} onChange={(event) => setSymbol(event.target.value)} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm" />
              </label>
              <label className="col-span-2 grid gap-1.5 text-xs font-semibold text-slate-700">Order type
                <select value={orderType} onChange={(event) => setOrderType(event.target.value as Mt5OrderType)} className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm">
                  {ORDER_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Lots per order
                <input type="number" min="0.01" max="100" step="0.01" required value={volume} onChange={(event) => setVolume(event.target.value)} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm" />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Entry price (pending only)
                <input type="number" min="0" step="any" value={firstEntry} onChange={(event) => setFirstEntry(event.target.value)} disabled={orderType.startsWith('MARKET_')} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm disabled:bg-slate-100" />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Price levels
                <input type="number" min="1" max="25" step="1" value={levelCount} onChange={(event) => setLevelCount(event.target.value)} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm" />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Orders per level
                <input type="number" min="1" max="20" step="1" value={ordersPerLevel} onChange={(event) => setOrdersPerLevel(event.target.value)} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm" />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Level spacing
                <input type="number" min="0" step="any" value={spacing} onChange={(event) => setSpacing(event.target.value)} disabled={orderType.startsWith('MARKET_')} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm disabled:bg-slate-100" />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Spacing direction
                <select value={spacingDirection} onChange={(event) => setSpacingDirection(event.target.value as 'up' | 'down')} disabled={orderType.startsWith('MARKET_')} className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100">
                  <option value="up">Up</option><option value="down">Down</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700">TP distance from live spot
                <input type="number" min="0" step="any" value={tpDistance} onChange={(event) => setTpDistance(event.target.value)} disabled={!tpEnabled} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm disabled:bg-slate-100" />
              </label>
              <label className="col-span-2 flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={tpEnabled} onChange={(event) => setTpEnabled(event.target.checked)} className="h-4 w-4 accent-emerald-700" />
                Attach TP computed from the broker's live quote
              </label>
              <button type="submit" disabled={isSubmitting || !selectedAccount.is_active} className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-md bg-emerald-800 text-sm font-extrabold text-white disabled:opacity-50">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Waiting for MT5 result…' : `Queue order(s) on ${selectedAccount.login}`}
              </button>
            </form>
          </section>
        )}

        <div className="flex items-start gap-2 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-600">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>Broker credentials are sent over HTTPS and stored in the bridge database on the VPS. Confirm every order in MT5. Pending-order requests are broker-held after MT5 accepts them.</p>
        </div>

        {notice && <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{notice}</p>}
        {error && <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p>}
        {orders.length > 0 && (
          <section aria-live="polite" className="space-y-2 border-t border-slate-200 pt-4">
            <h2 className="text-sm font-extrabold">Submitted orders</h2>
            {orders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 py-2 font-mono text-[11px]">
              <span>{order.id.slice(0, 8)}</span>
              <span className="font-bold uppercase">{order.status}</span>
              {order.ticket && <span>ticket {order.ticket}</span>}
              {order.result_message && <span className="basis-full text-slate-600">{order.result_message}</span>}
            </div>)}
          </section>
        )}
      </div>
    </main>
  );
};
