import React, { useState } from 'react';
import { PlacedOrder } from '../types/trading';
import {
  Download,
  Trash2,
  XCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { MT5_STALE_AFTER_SEC } from '../hooks/useMt5Prices';

interface OrdersScreenProps {
  orders: PlacedOrder[];
  spotPrice: number;
  mt5PriceAge?: number | null;
  onCancelOrder: (id: string) => void;
  onCancelAll: () => void;
  onClosePosition: (id: string) => void;
  onBulkCloseAll: () => Promise<void>;
  onSwitchToGrid: () => void;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({
  orders,
  spotPrice,
  mt5PriceAge = null,
  onCancelOrder,
  onCancelAll,
  onClosePosition,
  onBulkCloseAll,
  onSwitchToGrid,
}) => {
  const [filter, setFilter] = useState<'all' | 'filled' | 'pending'>('all');
  const [isBulkClosing, setIsBulkClosing] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pending = orders.filter((o) => o.status === 'PENDING');
  const filled = orders.filter((o) => o.status === 'FILLED');

  // Calculate live floating P&L
  const totalPnL = filled.reduce((acc, order) => {
    const diff =
      order.direction === 'SELL' ? order.price - spotPrice : spotPrice - order.price;
    return acc + diff * order.lotSize * 10;
  }, 0);

  const filteredOrders = orders.filter((o) => {
    if (filter === 'filled') return o.status === 'FILLED';
    if (filter === 'pending') return o.status === 'PENDING';
    return true;
  });

  const handleBulkClose = async () => {
    setErrorMessage(null);
    setIsBulkClosing(true);
    setFeedback('Liquidating positions on Deriv liquidity pool...');
    try {
      await onBulkCloseAll();
      setFeedback('All positions successfully closed!');
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error executing bulk close on Deriv');
    } finally {
      setIsBulkClosing(false);
    }
  };

  const handleSingleClose = async (id: string) => {
    setErrorMessage(null);
    setClosingId(id);
    try {
      await onClosePosition(id);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to close position on Deriv');
    } finally {
      setClosingId(null);
    }
  };

  const exportCSV = () => {
    if (orders.length === 0) return;
    const headers = ['ID', 'ContractID', 'Level', 'Direction', 'Price', 'Lot', 'Status', 'Spot'];
    const rows = orders.map((o) => [
      o.id,
      o.derivContractId || 'N/A',
      `Level ${o.levelIndex}`,
      o.direction,
      o.price.toFixed(2),
      o.lotSize,
      o.status,
      spotPrice.toFixed(2),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `deriv-orders-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="pb-40 pt-3 px-4 sm:px-5 max-w-md w-full mx-auto space-y-4 font-sans bg-white min-h-screen">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Active Market Positions</h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
            <span>
              Live {mt5PriceAge !== null ? 'MT5' : 'Deriv'} Spot:{' '}
              <strong
                className={
                  mt5PriceAge !== null && mt5PriceAge >= MT5_STALE_AFTER_SEC
                    ? 'text-slate-400'
                    : 'text-slate-900'
                }
              >
                {spotPrice.toFixed(2)}
              </strong>
            </span>
            {mt5PriceAge !== null && (
              <span
                className={`px-1 py-0.5 rounded text-[9px] font-black tracking-widest ${
                  mt5PriceAge >= MT5_STALE_AFTER_SEC
                    ? 'bg-slate-200 text-slate-500'
                    : 'bg-sky-100 text-sky-700'
                }`}
              >
                MT5
              </span>
            )}
          </p>
        </div>

        {orders.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={exportCSV}
              className="p-2 text-slate-500 hover:text-slate-900 transition cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCancelAll}
              className="p-2 text-slate-400 hover:text-rose-600 transition cursor-pointer"
              title="Cancel Pending"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Error / Alert Banner */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1">
            <div className="font-bold">Deriv Notice</div>
            <div className="mt-0.5">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* High-Contrast P&L Terminal Card with Instant Bulk Close */}
      <div className="bg-[#18181b] text-white rounded-2xl p-5 shadow-sm space-y-4 border border-neutral-800">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
              Floating Unrealized P&L
            </span>
            <div
              className={`text-3xl font-black font-mono mt-1 tracking-tight ${
                totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)} <span className="text-xs text-neutral-400">USD</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1 font-mono">
              {filled.length} open contracts • {pending.length} pending ladder
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
              Total Count
            </span>
            <span className="text-xl font-bold font-mono text-white mt-1 block">
              {orders.length}
            </span>
          </div>
        </div>

        {/* 1-TAP BULK CLOSE BUTTON */}
        {orders.length > 0 && (
          <button
            type="button"
            disabled={isBulkClosing}
            onClick={handleBulkClose}
            className="w-full py-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-98 text-white font-black text-xs shadow-md flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {isBulkClosing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Liquidating {orders.length} Positions...</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                <span>BULK CLOSE ALL ({orders.length} POSITIONS & ORDERS)</span>
              </>
            )}
          </button>
        )}

        {feedback && (
          <div className="text-center text-xs text-emerald-400 font-bold bg-neutral-900 py-2 px-3 rounded-lg border border-neutral-700">
            {feedback}
          </div>
        )}
      </div>

      {/* Filter Tabs (Clean Line Tabs, Zero Puffy Pills) */}
      <div className="flex border-b border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`pb-2.5 px-3 transition border-b-2 cursor-pointer ${
            filter === 'all'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          All ({orders.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter('filled')}
          className={`pb-2.5 px-3 transition border-b-2 cursor-pointer ${
            filter === 'filled'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Active Contracts ({filled.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`pb-2.5 px-3 transition border-b-2 cursor-pointer ${
            filter === 'pending'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Pending Ladder ({pending.length})
        </button>
      </div>

      {/* Order Cards List (Clean Modern Structural Cards, No Weird Pills) */}
      {filteredOrders.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm font-bold text-slate-900">No active positions</p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Switch to the Order Desk to execute positions directly into the Deriv market.
          </p>
          <button
            type="button"
            onClick={onSwitchToGrid}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-black transition cursor-pointer"
          >
            Open Order Desk
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isFilled = order.status === 'FILLED';
            const orderPnL = isFilled
              ? (order.direction === 'SELL' ? order.price - spotPrice : spotPrice - order.price) *
                order.lotSize *
                10
              : 0;

            const isClosing = closingId === order.id;

            return (
              <div
                key={order.id}
                className="bg-white rounded-xl border border-slate-200 p-4 transition shadow-xs hover:border-slate-300"
              >
                {/* Header row: Direction + Price + PnL */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-black text-xs tracking-wider ${
                        order.direction === 'SELL' ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {order.mt5OrderType?.replaceAll('_', ' ') ?? order.direction}
                    </span>
                    <span className="text-slate-300 font-normal">|</span>
                    <span className="font-mono text-base font-black text-slate-900">
                      {order.price.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      ({order.lotSize} Lots)
                    </span>
                  </div>

                  {/* P&L */}
                  {isFilled && (
                    <div
                      className={`font-mono text-sm font-black ${
                        orderPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {orderPnL >= 0 ? '+' : ''}${orderPnL.toFixed(2)}
                    </div>
                  )}
                </div>

                {/* Sub row: Contract ID, Market Symbol, and Action */}
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100 text-xs">
                  <div className="text-slate-500 font-mono text-[11px]">
                    {order.derivContractId ? (
                      <span className="text-slate-700 font-bold">
                        Deriv #{order.derivContractId}
                      </span>
                    ) : order.mt5ResultMessage ? (
                      <span className={order.status === 'FAILED' ? 'text-rose-700 font-medium' : 'text-emerald-700 font-medium'}>
                        {order.mt5ResultMessage}
                      </span>
                    ) : order.status === 'QUEUED' ? (
                      <span className="text-amber-700 font-medium">Queued on bridge; waiting for the MT5 EA to poll.</span>
                    ) : order.status === 'CLAIMED' || order.status === 'TRIGGERED' ? (
                      <span className="text-sky-700 font-medium">MT5 EA received this order and is processing it.</span>
                    ) : order.status === 'PENDING' && order.mt5OrderId ? (
                      <span className="text-emerald-700 font-medium">Accepted by MT5; waiting for the broker price trigger.</span>
                    ) : order.status === 'FAILED' ? (
                      <span className="text-rose-700 font-medium">MT5 rejected this trade.</span>
                    ) : (
                      <span className="text-amber-600 font-medium">
                        Waiting for trigger at {order.price.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {isFilled ? (
                    <button
                      type="button"
                      disabled={isClosing}
                      onClick={() => handleSingleClose(order.id)}
                      className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      {isClosing ? 'Closing...' : 'Close Position'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onCancelOrder(order.id)}
                      className="text-slate-400 hover:text-rose-600 font-medium text-xs cursor-pointer"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
