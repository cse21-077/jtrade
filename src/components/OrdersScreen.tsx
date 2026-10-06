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

const statusChip = (status: PlacedOrder['status']) => {
  switch (status) {
    case 'FILLED':
      return 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30';
    case 'FAILED':
      return 'bg-rose-400/10 text-rose-400 border-rose-400/30';
    case 'QUEUED':
    case 'CLAIMED':
    case 'TRIGGERED':
      return 'bg-amber-400/10 text-amber-400 border-amber-400/30';
    default:
      return 'bg-[#1f1f23] text-[#a1a1aa] border-[#26262b]';
  }
};

const statusLabel = (status: PlacedOrder['status']) => {
  switch (status) {
    case 'FILLED':
      return 'Filled';
    case 'FAILED':
      return 'Rejected';
    case 'QUEUED':
    case 'CLAIMED':
    case 'TRIGGERED':
      return 'On Progress';
    default:
      return 'Pending';
  }
};

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
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pending = orders.filter((o) => o.status === 'PENDING');
  const filled = orders.filter((o) => o.status === 'FILLED');
  const awaiting = orders.filter((o) => o.status === 'QUEUED' || o.status === 'CLAIMED');
  const rejected = orders.filter((o) => o.status === 'FAILED');

  const filteredOrders = orders.filter((o) => {
    if (filter === 'filled') return o.status === 'FILLED';
    if (filter === 'pending') return o.status === 'PENDING';
    return true;
  });

  const handleBulkClose = async () => {
    setErrorMessage(null);
    setIsBulkClosing(true);
    setFeedback('Closing positions on MT5...');
    try {
      await onBulkCloseAll();
      setFeedback('All positions successfully closed!');
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error executing bulk close');
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
      setErrorMessage(err?.message || 'Failed to close position');
    } finally {
      setClosingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    setErrorMessage(null);
    setCancellingId(id);
    try {
      await onCancelOrder(id);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to cancel order');
    } finally {
      setCancellingId(null);
    }
  };

  const handleCancelAll = async () => {
    setErrorMessage(null);
    setIsCancellingAll(true);
    try {
      await onCancelAll();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to cancel pending orders');
    } finally {
      setIsCancellingAll(false);
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
    <div className="pb-40 pt-3 px-4 sm:px-5 max-w-md w-full mx-auto space-y-4 font-sans min-h-screen">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Active Market Positions</h2>
          <p className="text-xs text-[#52525b] font-mono mt-0.5 flex items-center gap-1.5">
            <span>
              Live {mt5PriceAge !== null ? 'MT5' : 'Deriv'} Spot:{' '}
              <strong
                className={
                  mt5PriceAge !== null && mt5PriceAge >= MT5_STALE_AFTER_SEC
                    ? 'text-[#52525b]'
                    : 'text-white'
                }
              >
                {spotPrice.toFixed(2)}
              </strong>
            </span>
            {mt5PriceAge !== null && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-black tracking-widest ${
                  mt5PriceAge >= MT5_STALE_AFTER_SEC
                    ? 'bg-[#1f1f23] text-[#52525b] border border-[#26262b]'
                    : 'bg-[#d6f655] text-[#0e0e10]'
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
              className="p-2 text-[#52525b] hover:text-white transition cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={isCancellingAll}
              onClick={handleCancelAll}
              className="p-2 text-[#52525b] hover:text-rose-400 transition cursor-pointer disabled:opacity-50"
              title="Cancel Pending"
            >
              {isCancellingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* Error / Alert Banner */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-400/10 border border-rose-400/30 text-rose-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1">
            <div className="font-bold">Notice</div>
            <div className="mt-0.5">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* MT5 execution status counts */}
      <div className="bg-[#18181b] text-white rounded-2xl p-5 shadow-sm space-y-4 border border-[#26262b]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div><span className="block text-[10px] font-bold uppercase text-[#a1a1aa]">Executed positions</span><strong className="font-mono text-xl">{filled.length}</strong></div>
          <div><span className="block text-[10px] font-bold uppercase text-[#a1a1aa]">Pending at broker</span><strong className="font-mono text-xl">{pending.length}</strong></div>
          <div><span className="block text-[10px] font-bold uppercase text-[#a1a1aa]">Awaiting confirmation</span><strong className="font-mono text-xl text-amber-300">{awaiting.length}</strong></div>
          <div><span className="block text-[10px] font-bold uppercase text-[#a1a1aa]">Rejected</span><strong className="font-mono text-xl text-rose-300">{rejected.length}</strong></div>
        </div>

        {filled.length > 0 && (
          <button
            type="button"
            disabled={isBulkClosing}
            onClick={handleBulkClose}
            className="w-full py-3.5 rounded-full bg-rose-400/10 border border-rose-400/30 hover:bg-rose-400/20 active:scale-98 text-rose-300 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {isBulkClosing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Closing {filled.length} positions...</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                <span>Close executed positions ({filled.length})</span>
              </>
            )}
          </button>
        )}

        {feedback && (
          <div className="text-center text-xs text-emerald-400 font-bold bg-[#0e0e10] py-2 px-3 rounded-lg border border-[#26262b]">
            {feedback}
          </div>
        )}
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 text-xs font-bold">
        {(
          [
            ['all', `All (${orders.length})`],
            ['filled', `Active (${filled.length})`],
            ['pending', `Pending (${pending.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full transition cursor-pointer ${
              filter === value
                ? 'bg-white text-black'
                : 'bg-[#18181b] text-[#a1a1aa] border border-[#26262b] hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Order Cards List */}
      {filteredOrders.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm font-bold text-white">No active positions</p>
          <p className="text-xs text-[#52525b] max-w-xs mx-auto">
            Switch to the Order Desk to execute positions directly into the Deriv market.
          </p>
          <button
            type="button"
            onClick={onSwitchToGrid}
            className="px-5 py-2.5 rounded-full bg-[#d6f655] text-[#0e0e10] text-xs font-bold hover:opacity-90 transition cursor-pointer"
          >
            Open Order Desk
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isFilled = order.status === 'FILLED';
            const isClosing = closingId === order.id;
            const created = new Date(order.createdAt);

            return (
              <div
                key={order.id}
                className="rounded-2xl bg-[#18181b] border border-[#26262b] p-4 transition hover:border-[#3f3f46]"
              >
                <div className="flex items-center gap-3">
                  {/* Date block */}
                  <div className="shrink-0 w-11 text-center">
                    <span className="block text-lg font-black font-mono text-white leading-none">
                      {created.getDate()}
                    </span>
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-[#52525b] mt-0.5">
                      {created.toLocaleString('en-US', { month: 'short' })}
                    </span>
                  </div>

                  {/* Symbol / type / lots */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm truncate">
                      {order.symbol}
                    </p>
                    <p className="text-[11px] text-[#a1a1aa] truncate">
                      <span className={order.direction === 'SELL' ? 'text-rose-400' : 'text-emerald-400'}>
                        {order.mt5OrderType?.replaceAll('_', ' ') ?? order.direction}
                      </span>
                      {' · '}{order.lotSize} lots
                    </p>
                  </div>

                  {/* Price + status chip */}
                  <div className="shrink-0 text-right">
                    <p className="font-mono font-bold text-white text-sm">
                      {order.price.toFixed(2)}
                    </p>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusChip(order.status)}`}
                    >
                      {statusLabel(order.status)}
                    </span>
                  </div>
                </div>

                {/* Detail line */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#26262b] text-[11px]">
                  <div className="text-[#52525b] font-mono">
                    {order.derivContractId ? (
                      <span className="text-[#a1a1aa] font-bold">
                        Deriv #{order.derivContractId}
                      </span>
                    ) : order.mt5ResultMessage ? (
                      <span className={order.status === 'FAILED' ? 'text-rose-400 font-medium' : 'text-emerald-400 font-medium'}>
                        {order.mt5ResultMessage}
                      </span>
                    ) : order.status === 'QUEUED' ? (
                      <span className="text-amber-400 font-medium">Queued on bridge; waiting for the MT5 EA to poll.</span>
                    ) : order.status === 'CLAIMED' || order.status === 'TRIGGERED' ? (
                      <span className="text-[#a1a1aa] font-medium">MT5 EA received this order and is processing it.</span>
                    ) : order.status === 'PENDING' && order.mt5OrderId ? (
                      <span className="text-emerald-400 font-medium">Accepted by MT5; waiting for the broker price trigger.</span>
                    ) : order.status === 'FAILED' ? (
                      <span className="text-rose-400 font-medium">MT5 rejected this trade.</span>
                    ) : (
                      <span className="text-amber-400 font-medium">
                        Waiting for trigger at {order.price.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {isFilled ? (
                    <button
                      type="button"
                      disabled={isClosing}
                      onClick={() => handleSingleClose(order.id)}
                      className="ml-3 shrink-0 px-4 py-1.5 rounded-full bg-white text-black font-bold text-[11px] transition cursor-pointer disabled:opacity-50 hover:bg-neutral-200"
                    >
                      {isClosing ? 'Closing...' : 'Close'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={cancellingId === order.id}
                      onClick={() => handleCancel(order.id)}
                      className="ml-3 shrink-0 px-4 py-1.5 rounded-full border border-[#26262b] text-[#a1a1aa] hover:text-rose-400 hover:border-rose-400/40 font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                    >
                      {cancellingId === order.id ? 'Cancelling...' : 'Cancel'}
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
