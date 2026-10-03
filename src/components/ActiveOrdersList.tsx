import React from 'react';
import { PlacedOrder, OrderDirection } from '../types/trading';
import { Trash2, CheckCircle2, Clock, Play, Download, AlertCircle } from 'lucide-react';

interface ActiveOrdersListProps {
  orders: PlacedOrder[];
  spotPrice: number;
  onCancelOrder: (id: string) => void;
  onCancelAll: () => void;
  onSimulateFill: (id: string) => void;
  onFillAllPending: () => void;
}

export const ActiveOrdersList: React.FC<ActiveOrdersListProps> = ({
  orders,
  spotPrice,
  onCancelOrder,
  onCancelAll,
  onSimulateFill,
  onFillAllPending,
}) => {
  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;
  const filledCount = orders.filter((o) => o.status === 'FILLED').length;

  // Calculate live unrealized P&L for filled positions
  const totalPnL = orders
    .filter((o) => o.status === 'FILLED')
    .reduce((acc, order) => {
      // For SELL: profit if spot < entryPrice; for BUY: profit if spot > entryPrice
      const diff =
        order.direction === 'SELL' ? order.price - spotPrice : spotPrice - order.price;
      // Multiplied by lot size and standard point multiplier (e.g., 100 for Gold)
      const pnl = diff * order.lotSize * 100;
      return acc + pnl;
    }, 0);

  const exportCSV = () => {
    if (orders.length === 0) return;
    const headers = ['Order ID', 'Level', 'Direction', 'Order Price', 'Lot Size', 'Status', 'Spot At Execution', 'Created At'];
    const rows = orders.map((o) => [
      o.id,
      `Level ${o.levelIndex}`,
      o.direction,
      o.price.toFixed(2),
      o.lotSize,
      o.status,
      spotPrice.toFixed(2),
      new Date(o.createdAt).toLocaleTimeString(),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `j-grid-orders-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-2xl border border-sky-100 shadow-sm p-4">
      {/* Header & Quick stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-sky-100">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Active Grid Positions & Orders</h3>
            <p className="text-[11px] text-slate-500">
              Live tracking against spot price ({spotPrice.toFixed(2)})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              {pendingCount} Pending
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {filledCount} Active
            </span>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              onClick={onFillAllPending}
              className="px-2.5 py-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 text-[11px] font-semibold flex items-center gap-1 transition"
              title="Test: trigger all pending levels"
            >
              <Play className="w-3 h-3 text-sky-600" />
              <span>Fill Pending</span>
            </button>
          )}

          {orders.length > 0 && (
            <>
              <button
                onClick={exportCSV}
                className="px-2.5 py-1.5 rounded-lg border border-sky-200 bg-white text-slate-700 hover:bg-sky-50 text-[11px] font-semibold flex items-center gap-1 transition"
                title="Download CSV report"
              >
                <Download className="w-3 h-3 text-sky-600" />
                <span>CSV</span>
              </button>

              <button
                onClick={onCancelAll}
                className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-[11px] font-semibold flex items-center gap-1 transition"
              >
                <Trash2 className="w-3 h-3 text-rose-500" />
                <span>Cancel All</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* PnL Bar */}
      {filledCount > 0 && (
        <div className="my-3 p-3 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 flex items-center justify-between">
          <div className="text-xs">
            <span className="text-slate-500">Unrealized Grid P&L: </span>
            <strong
              className={`font-black text-sm ${
                totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)} USD
            </strong>
          </div>
          <div className="text-[11px] text-slate-500">
            {filledCount} contract{filledCount > 1 ? 's' : ''} currently open
          </div>
        </div>
      )}

      {/* Table */}
      {orders.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <Clock className="w-8 h-8 mx-auto text-sky-300 mb-2 opacity-60" />
          <p className="text-xs font-semibold">No grid orders deployed yet</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Configure your parameters on the left and click "Deploy Grid Orders".
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-sky-50/70 border-b border-sky-100 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-2 px-3">Level / ID</th>
                <th className="py-2 px-3">Direction</th>
                <th className="py-2 px-3">Order Price</th>
                <th className="py-2 px-3">Lots (t)</th>
                <th className="py-2 px-3">Distance to Spot</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-50 text-slate-700">
              {orders.map((order) => {
                const dist = +(spotPrice - order.price).toFixed(2);
                const isSell = order.direction === 'SELL';
                const isFilled = order.status === 'FILLED';

                return (
                  <tr
                    key={order.id}
                    className={`hover:bg-sky-50/40 transition-colors ${
                      isFilled ? 'bg-sky-50/20 font-medium' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="font-bold text-slate-800">#{order.levelIndex}</span>
                        <span className="text-[10px] text-slate-400">({order.id.slice(-6)})</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          isSell
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {order.direction}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                      {order.price.toFixed(2)}
                    </td>

                    <td className="py-2.5 px-3 font-mono">
                      {order.lotSize}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {dist === 0 ? (
                        <span className="text-sky-600 font-bold">At Spot</span>
                      ) : (
                        <span className={dist > 0 ? 'text-amber-600' : 'text-slate-500'}>
                          {dist > 0 ? `+${dist}` : `${dist}`} pts
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      {order.status === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-2.5 h-2.5" />
                          <span>Pending</span>
                        </span>
                      ) : order.status === 'FAILED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertCircle className="w-2.5 h-2.5" />
                          <span>Rejected</span>
                        </span>
                      ) : order.status === 'TRIGGERED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                          <Clock className="w-2.5 h-2.5" />
                          <span>Submitting</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Active / Filled</span>
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {order.status === 'PENDING' && (
                          <button
                            onClick={() => onSimulateFill(order.id)}
                            className="p-1 rounded text-sky-600 hover:bg-sky-100 hover:text-sky-800 transition"
                            title="Simulate Market Fill"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onCancelOrder(order.id)}
                          className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Cancel Order"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
