import React, { useState } from 'react';
import { Activity, ArrowLeft, Loader2, Radio, ShieldAlert } from 'lucide-react';
import {
  getMt5ApiStatus,
  getMt5Order,
  Mt5ApiStatus,
  Mt5OrderRequest,
  Mt5QueuedOrder,
  Mt5OrderType,
  queueMt5Orders,
} from '../services/joemoneyMt5Api';

const ORDER_TYPES: Array<{ value: Mt5OrderType; label: string }> = [
  { value: 'MARKET_BUY', label: 'Buy market' },
  { value: 'MARKET_SELL', label: 'Sell market' },
  { value: 'BUY_LIMIT', label: 'Buy limit' },
  { value: 'SELL_LIMIT', label: 'Sell limit' },
  { value: 'BUY_STOP', label: 'Buy stop' },
  { value: 'SELL_STOP', label: 'Sell stop' },
];

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export const Mt5DemoScreen: React.FC = () => {
  const [token, setToken] = useState('');
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
  const [status, setStatus] = useState<Mt5ApiStatus | null>(null);
  const [orders, setOrders] = useState<Mt5QueuedOrder[]>([]);
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkConnection = async () => {
    setError('');
    setIsChecking(true);
    try {
      setStatus(await getMt5ApiStatus(token));
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Could not reach the MT5 API.');
      setStatus(null);
    } finally {
      setIsChecking(false);
    }
  };

  const submitOrders = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
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

      const batch = await queueMt5Orders(token, payload);
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

  return (
    <main className="min-h-screen bg-[#f4f7f7] px-4 py-5 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">JoeMoney · VPS Demo</p>
            <h1 className="mt-1 text-xl font-extrabold">MT5 order test</h1>
          </div>
          <a href="/" className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" /> Main app
          </a>
        </header>

        <section className="border-b border-slate-200 pb-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold"><Activity className="h-4 w-4 text-emerald-700" /> VPS terminal</div>
            <button type="button" onClick={checkConnection} disabled={isChecking || !token} className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
              Check connection
            </button>
          </div>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
            Temporary demo API token
            <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} className="h-11 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm" placeholder="Paste the client token printed by the VPS bridge" />
          </label>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Kept only in this page's memory. It is not saved in browser storage or included in the PWA build.</p>
          {status && (
            <p className={`mt-3 text-xs font-semibold ${status.terminal_connected ? 'text-emerald-800' : 'text-amber-800'}`} role="status">
              {status.terminal_connected ? `Connected to MT5 demo ${status.configured_login ?? ''}.` : status.message}
            </p>
          )}
        </section>

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
          <button type="submit" disabled={isSubmitting || !token} className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-md bg-emerald-800 text-sm font-extrabold text-white disabled:opacity-50">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Waiting for MT5 result…' : 'Queue demo order(s)'}
          </button>
        </form>

        <div className="flex items-start gap-2 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-600">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>Demo only. The API token is a temporary shared test credential, not client authentication. Confirm every order in MT5. Pending-order requests are broker-held after MT5 accepts them.</p>
        </div>

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
