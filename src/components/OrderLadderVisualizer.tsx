import React from 'react';
import { LadderLevel, OrderDirection } from '../types/trading';

interface OrderLadderVisualizerProps {
  spotPrice: number;
  levels: LadderLevel[];
  direction: OrderDirection;
  symbol: string;
}

export const OrderLadderVisualizer: React.FC<OrderLadderVisualizerProps> = ({
  spotPrice,
  levels,
  direction,
  symbol,
}) => {
  if (levels.length === 0) return null;

  const prices = [spotPrice, ...levels.map((l) => l.price)];
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;
  const padding = range * 0.15;
  const effectiveMin = minPrice - padding;
  const effectiveMax = maxPrice + padding;
  const totalSpan = effectiveMax - effectiveMin;

  const getYPercent = (p: number) => {
    // Higher prices at top, lower at bottom
    return 100 - ((p - effectiveMin) / totalSpan) * 100;
  };

  const spotY = getYPercent(spotPrice);

  return (
    <div className="bg-white rounded-2xl border border-sky-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-sky-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">Visual Price Ladder</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-sky-100 text-sky-700">
            {levels.length} Price Rungs
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-sky-700 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-ping" />
            Spot u: {spotPrice.toFixed(2)}
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
            Sell Orders
          </span>
        </div>
      </div>

      {/* Ladder Chart Container */}
      <div className="relative h-64 w-full bg-gradient-to-b from-sky-50/40 via-white to-sky-50/30 rounded-xl border border-sky-100 p-2 overflow-hidden">
        {/* Spot Price Line (u) */}
        <div
          className="absolute left-0 right-0 z-20 flex items-center transition-all duration-300"
          style={{ top: `${Math.max(5, Math.min(95, spotY))}%` }}
        >
          <div className="w-full border-t-2 border-dashed border-sky-500" />
          <div className="absolute right-2 -top-3 px-2 py-0.5 rounded-md bg-sky-600 text-white font-mono text-[10px] font-bold shadow-sm whitespace-nowrap">
            Spot (u): {spotPrice.toFixed(2)}
          </div>
        </div>

        {/* Order Levels Rungs */}
        {levels.map((level) => {
          const y = getYPercent(level.price);
          const isSell = direction === 'SELL';
          return (
            <div
              key={level.levelIndex}
              className="absolute left-2 right-2 flex items-center group transition-all duration-200"
              style={{ top: `${Math.max(4, Math.min(96, y))}%` }}
            >
              <div
                className={`w-full border-t ${
                  isSell ? 'border-rose-400' : 'border-emerald-400'
                } group-hover:border-2`}
              />
              <div
                className={`absolute left-2 -top-2.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold shadow-2xs border ${
                  isSell
                    ? 'bg-rose-50 border-rose-200 text-rose-700 group-hover:bg-rose-500 group-hover:text-white'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700 group-hover:bg-emerald-500 group-hover:text-white'
                } transition-colors flex items-center gap-1.5`}
              >
                <span>Level #{level.levelIndex}:</span>
                <span>{level.price.toFixed(2)}</span>
                <span className="opacity-75">
                  ({level.ordersCount}x {level.lotSize}L)
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
        <span>Min: {minPrice.toFixed(2)}</span>
        <span>Max Spread: {range.toFixed(2)} pts</span>
        <span>Max: {maxPrice.toFixed(2)}</span>
      </div>
    </div>
  );
};
