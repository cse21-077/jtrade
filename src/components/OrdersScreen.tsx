import React from 'react';
import { PlacedOrder } from '../types/trading';
import { Trash2, Download, Clock, CheckCircle2 } from 'lucide-react';

interface OrdersScreenProps {
  orders: PlacedOrder[];
  spotPrice: number;
  onCancelOrder: (id: string) => void;
  onCancelAll: () => void;
  onSimulateFill: (id: string) => void;
  onFillAllPending: () => void;
  onSwitchToGrid: () => void;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({
  orders,
  spotPrice,
  onCancelOrder,
  onCancelAll,
  onSimulateFill,
  onFillAllPending,
  onSwitchToGrid,
}) => {
  const pending = orders.filter((o) => o.status === 'PENDING');
  const filled = orders.filter((o) => o.status === 'FILLED' || o.status === 'TRIGGERED');

  const totalPnL = filled.reduce((acc, order) => {
    const diff =
      order.direction === 'SELL' ? order.price - spotPrice : spotPrice - order.price;
    return acc + diff * order.lotSize * 100;
  }, 0);

  const exportCSV = () => {
    if (orders.length === 0) return;
    const headers = ['ID', 'Level', 'Direction', 'Price', 'Lot', 'Status', 'Spot'];
    const rows = orders.map((o) => [
      o.id,
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
    link.download = `orders-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="pb-28 pt-3 px-5 max-w-[400px] mx-auto space-y-5 font-sans select-none bg-white min-h-screen">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Orders Desk</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Spot Price: <strong className="font-mono text-slate-800">{spotPrice.toFixed(2)}</strong>
          </p>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          {pending.length > 0 && (
            <button
              onClick={onFillAllPending}
              className="px-3 py-1 rounded-full text-xs font-semibold bg-[#f4f5f7] text-slate-800 hover:bg-slate-200 transition cursor-pointer"
            >
              Fill All
            </button>
          )}

          {orders.length > 0 && (
            <>
              <button
                onClick={exportCSV}
                className="p-2 rounded-full text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                title="Download CSV"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelAll}
                className="p-2 rounded-full text-slate-400 hover:text-rose-600 transition cursor-pointer"
                title="Cancel All"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* P&L Card: High-contrast Dark Card */}
      <div className="bg-[#18181b] text-white rounded-[28px] p-5 shadow-sm flex items-center justify-between">
        <div>
          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
            Grid Unrealized P&L
          </span>
          <div
            className={`text-2xl font-bold font-mono mt-0.5 ${
              totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)} USD
          </div>
          <span className="text-[11px] text-neutral-400">
            {filled.length} filled / {pending.length} pending
          </span>
        </div>

        <div className="flex flex-col gap-1 items-end">
          <span className="px-3 py-1 rounded-full bg-neutral-800 text-xs font-medium text-neutral-300">
            {orders.length} Total
          </span>
        </div>
      </div>

      {/* Orders List */}
      {orders.length === 0 ? (
        <div className="bg-white rounded-[28px] p-8 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] text-center">
          <Clock className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No active grid orders</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            Deploy positions from the Grid tab.
          </p>
          <button
            onClick={onSwitchToGrid}
            className="px-6 py-2.5 rounded-full bg-[#18181b] text-white font-bold text-xs shadow-sm transition cursor-pointer hover:bg-black"
          >
            Open Grid Inputs
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {orders.map((order) => {
            const isSell = order.direction === 'SELL';
            const isFilled = order.status === 'FILLED' || order.status === 'TRIGGERED';
            const dist = +(spotPrice - order.price).toFixed(2);

            return (
              <div
                key={order.id}
                className="bg-white rounded-[22px] p-3.5 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-[#f4f5f7] text-slate-800 font-bold text-xs flex items-center justify-center shrink-0">
                    #{order.levelIndex}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 text-xs font-mono">
                        {order.price.toFixed(2)}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                          isSell ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {order.direction}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span>{order.lotSize} Lots</span>
                      <span>•</span>
                      <span>{dist === 0 ? 'At Spot' : `${dist > 0 ? `+${dist}` : dist} pts`}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {order.status === 'PENDING' ? (
                    <button
                      onClick={() => onSimulateFill(order.id)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#f4f5f7] text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                    >
                      Fill
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>Filled</span>
                    </span>
                  )}

                  <button
                    onClick={() => onCancelOrder(order.id)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-rose-600 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
