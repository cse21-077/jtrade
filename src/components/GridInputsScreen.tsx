import React, { useState, useMemo } from 'react';
import {
  DerivAccount,
  LadderLevel,
  OrderDirection,
  MarketSymbol,
  PlacedOrder,
} from '../types/trading';
import {
  TrendingDown,
  TrendingUp,
  Lock,
  Unlock,
  ArrowRight,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';

interface GridInputsScreenProps {
  account: DerivAccount;
  spotPrice: number;
  selectedSymbol: MarketSymbol;
  onSelectSymbol: (sym: MarketSymbol) => void;
  symbols: MarketSymbol[];
  onDeployOrders: (orders: PlacedOrder[]) => void;
}

export const GridInputsScreen: React.FC<GridInputsScreenProps> = ({
  account,
  spotPrice,
  selectedSymbol,
  onSelectSymbol,
  symbols,
  onDeployOrders,
}) => {
  // Parameters: u, x, t, s, y, z
  const [autoUpdateSpot, setAutoUpdateSpot] = useState(true);
  const [customSpotU, setCustomSpotU] = useState(4170.0);
  const effectiveU = autoUpdateSpot ? spotPrice : customSpotU;

  const [direction, setDirection] = useState<OrderDirection>('SELL');
  const [xOffset, setXOffset] = useState<number>(5.0); // e.g. 4170 - 5 = 4165
  const [lotSizeT, setLotSizeT] = useState<number>(0.1); // t
  const [ordersCountS, setOrdersCountS] = useState<number>(2); // s
  const [stepY, setStepY] = useState<number>(0.1); // y
  const [multiplesZ, setMultiplesZ] = useState<number>(4); // z
  const [stepDirection, setStepDirection] = useState<'down' | 'up'>('down');

  // Base price calculation (u - x)
  const basePriceP0 = useMemo(() => {
    const p = direction === 'SELL' ? effectiveU - xOffset : effectiveU + xOffset;
    return +p.toFixed(selectedSymbol.decimals);
  }, [effectiveU, xOffset, direction, selectedSymbol.decimals]);

  const handleBasePriceChange = (val: number) => {
    if (isNaN(val)) return;
    const calc = direction === 'SELL' ? effectiveU - val : val - effectiveU;
    setXOffset(+Math.max(0, calc).toFixed(selectedSymbol.decimals));
  };

  // Generate ladder levels
  const ladderLevels: LadderLevel[] = useMemo(() => {
    const list: LadderLevel[] = [];
    let cumLots = 0;
    const maxZ = Math.min(25, Math.max(0, multiplesZ));

    for (let k = 0; k <= maxZ; k++) {
      const stepOffset = k * stepY;
      let targetPrice: number;

      if (direction === 'SELL') {
        targetPrice =
          stepDirection === 'down'
            ? effectiveU - xOffset - stepOffset
            : effectiveU - xOffset + stepOffset;
      } else {
        targetPrice =
          stepDirection === 'down'
            ? effectiveU + xOffset - stepOffset
            : effectiveU + xOffset + stepOffset;
      }

      const rounded = +targetPrice.toFixed(selectedSymbol.decimals);
      const totalLots = +(ordersCountS * lotSizeT).toFixed(3);
      cumLots = +(cumLots + totalLots).toFixed(3);

      const sign = stepDirection === 'down' ? '−' : '+';
      const formulaStr = `${effectiveU.toFixed(selectedSymbol.decimals)} − ${xOffset} ${sign} (${k} × ${stepY})`;

      list.push({
        levelIndex: k,
        formula: formulaStr,
        price: rounded,
        ordersCount: ordersCountS,
        lotSize: lotSizeT,
        totalLotsAtLevel: totalLots,
        cumulativeLots: cumLots,
        distanceFromSpot: +(effectiveU - rounded).toFixed(selectedSymbol.decimals),
      });
    }

    return list;
  }, [
    effectiveU,
    xOffset,
    direction,
    stepDirection,
    stepY,
    multiplesZ,
    ordersCountS,
    lotSizeT,
    selectedSymbol.decimals,
  ]);

  const totalLevels = ladderLevels.length;
  const totalOrders = totalLevels * ordersCountS;
  const totalVolume = +(totalOrders * lotSizeT).toFixed(2);

  const handleDeploy = () => {
    const newOrders: PlacedOrder[] = [];
    ladderLevels.forEach((level) => {
      for (let s = 1; s <= level.ordersCount; s++) {
        newOrders.push({
          id: `ORD-${Date.now().toString(36).toUpperCase()}-${level.levelIndex}-${s}`,
          levelIndex: level.levelIndex,
          subIndex: s,
          symbol: selectedSymbol.symbol,
          direction,
          orderType: 'LIMIT',
          price: level.price,
          lotSize: level.lotSize,
          status: 'PENDING',
          createdAt: Date.now(),
        });
      }
    });

    onDeployOrders(newOrders);
  };

  return (
    <div className="pb-32 pt-4 px-5 max-w-md mx-auto space-y-5 font-sans select-none bg-white min-h-screen">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Grid Inputs</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Mathematical Order Ladder ($u − x − zy$)
          </p>
        </div>

        <span className="px-3 py-1 rounded-full bg-[#f4f5f7] text-slate-800 text-xs font-bold">
          {totalOrders} Orders Ready
        </span>
      </div>

      {/* Market Selector Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        {symbols.map((sym) => {
          const isSelected = selectedSymbol.symbol === sym.symbol;
          return (
            <button
              key={sym.symbol}
              onClick={() => onSelectSymbol(sym)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                isSelected
                  ? 'bg-[#18181b] text-white shadow-xs'
                  : 'bg-[#f4f5f7] text-slate-700 hover:bg-slate-200'
              }`}
            >
              {sym.displayName}
            </button>
          );
        })}
      </div>

      {/* Hero Card: Spot Price (u) with Live Wave Accent */}
      <div className="bg-[#18181b] rounded-[32px] p-5 text-white shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
              {selectedSymbol.displayName.split(' ')[0]} Spot Price (u)
            </span>
          </div>

          <button
            onClick={() => setAutoUpdateSpot(!autoUpdateSpot)}
            className="px-2.5 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold text-neutral-300 flex items-center gap-1 cursor-pointer transition"
          >
            {autoUpdateSpot ? <Unlock className="w-3 h-3 text-emerald-400" /> : <Lock className="w-3 h-3 text-amber-400" />}
            <span>{autoUpdateSpot ? 'Live Streaming' : 'Locked'}</span>
          </button>
        </div>

        <div className="my-3 flex items-baseline justify-between">
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
            {effectiveU.toFixed(selectedSymbol.decimals)}
          </div>
          <span className="text-xs font-bold text-neutral-400">USD</span>
        </div>

        <div className="text-[11px] text-neutral-400">
          Base order will trigger from this price reference.
        </div>
      </div>

      {/* Direction Toggle Pills */}
      <div className="bg-[#f4f5f7] rounded-full p-1.5 flex gap-1.5">
        <button
          onClick={() => setDirection('SELL')}
          className={`flex-1 py-3 rounded-full text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
            direction === 'SELL'
              ? 'bg-[#18181b] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <TrendingDown className="w-4 h-4 text-rose-400" />
          <span>SELL ORDERS (Short)</span>
        </button>

        <button
          onClick={() => setDirection('BUY')}
          className={`flex-1 py-3 rounded-full text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
            direction === 'BUY'
              ? 'bg-[#18181b] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>BUY ORDERS (Long)</span>
        </button>
      </div>

      {/* Input Card 1: Offset from Spot (x) & 1st Order Price */}
      <div className="bg-white rounded-[32px] p-5 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-xl bg-[#f4f5f7] text-slate-900 text-xs font-mono font-bold flex items-center justify-center">
              x
            </span>
            <span className="text-sm font-extrabold text-slate-900">Initial Offset (x)</span>
          </div>
          <span className="text-xs font-bold text-slate-500 font-mono">
            {direction === 'SELL' ? 'u − x' : 'u + x'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#f4f5f7] rounded-2xl p-3.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Offset Distance (x)
            </span>
            <input
              type="number"
              step="any"
              value={xOffset}
              onChange={(e) => setXOffset(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-transparent border-0 font-mono text-base font-bold text-slate-900 focus:outline-none"
            />
          </div>

          <div className="bg-[#dcf0fa]/60 rounded-2xl p-3.5 border border-sky-100">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
              Level 0 Price (u − x)
            </span>
            <input
              type="number"
              step="any"
              value={basePriceP0}
              onChange={(e) => handleBasePriceChange(parseFloat(e.target.value))}
              className="w-full bg-transparent border-0 font-mono text-base font-black text-slate-900 focus:outline-none"
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          At Spot <strong>{effectiveU.toFixed(2)}</strong>, offset x={xOffset} sets Level 0 at <strong>{basePriceP0}</strong>.
        </p>
      </div>

      {/* Input Card 2: Lot Size (t) & Orders per Price (s) */}
      <div className="bg-white rounded-[32px] p-5 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
        <div className="grid grid-cols-2 gap-3.5">
          {/* t */}
          <div className="bg-[#f4f5f7] rounded-2xl p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Lot Size (t)
              </span>
              <span className="w-5 h-5 rounded-lg bg-white text-slate-900 text-[10px] font-bold flex items-center justify-center shadow-2xs">
                t
              </span>
            </div>
            <input
              type="number"
              step="any"
              value={lotSizeT}
              onChange={(e) => setLotSizeT(Math.max(0.001, parseFloat(e.target.value) || 0.01))}
              className="w-full bg-transparent border-0 font-mono text-base font-bold text-slate-900 focus:outline-none"
            />
            <div className="flex gap-1 mt-2">
              {[0.01, 0.05, 0.1, 0.5].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLotSizeT(preset)}
                  className={`flex-1 py-1 rounded-md text-[9px] font-bold transition cursor-pointer ${
                    lotSizeT === preset
                      ? 'bg-[#18181b] text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* s */}
          <div className="bg-[#f4f5f7] rounded-2xl p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Orders / Price (s)
              </span>
              <span className="w-5 h-5 rounded-lg bg-white text-slate-900 text-[10px] font-bold flex items-center justify-center shadow-2xs">
                s
              </span>
            </div>
            <input
              type="number"
              min="1"
              max="20"
              value={ordersCountS}
              onChange={(e) => setOrdersCountS(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full bg-transparent border-0 font-mono text-base font-bold text-slate-900 focus:outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-2 font-medium">
              {ordersCountS} parallel order{ordersCountS > 1 ? 's' : ''} per rung
            </p>
          </div>
        </div>
      </div>

      {/* Input Card 3: Step Interval (y) & Multiples of y (z) */}
      <div className="bg-white rounded-[32px] p-5 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
        <div className="grid grid-cols-2 gap-3.5">
          {/* y */}
          <div className="bg-[#f4f5f7] rounded-2xl p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Step Distance (y)
              </span>
              <span className="w-5 h-5 rounded-lg bg-white text-slate-900 text-[10px] font-bold flex items-center justify-center shadow-2xs">
                y
              </span>
            </div>
            <input
              type="number"
              step="any"
              value={stepY}
              onChange={(e) => setStepY(Math.max(0.0001, parseFloat(e.target.value) || 0.1))}
              className="w-full bg-transparent border-0 font-mono text-base font-bold text-slate-900 focus:outline-none"
            />
            <div className="flex gap-1 mt-2">
              {[0.1, 0.25, 0.5, 1.0].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setStepY(step)}
                  className={`flex-1 py-1 rounded-md text-[9px] font-bold transition cursor-pointer ${
                    stepY === step
                      ? 'bg-[#18181b] text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {step}
                </button>
              ))}
            </div>
          </div>

          {/* z */}
          <div className="bg-[#f4f5f7] rounded-2xl p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Multiples (z)
              </span>
              <span className="w-5 h-5 rounded-lg bg-white text-slate-900 text-[10px] font-bold flex items-center justify-center shadow-2xs">
                z
              </span>
            </div>
            <input
              type="number"
              min="1"
              max="25"
              value={multiplesZ}
              onChange={(e) => setMultiplesZ(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full bg-transparent border-0 font-mono text-base font-bold text-slate-900 focus:outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-2 font-medium">
              {multiplesZ + 1} total levels (0 to {multiplesZ})
            </p>
          </div>
        </div>

        {/* Step Direction */}
        <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100">
          <span className="text-slate-500 font-semibold">Progression:</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setStepDirection('down')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                stepDirection === 'down' ? 'bg-[#18181b] text-white' : 'bg-[#f4f5f7] text-slate-600'
              }`}
            >
              Steps Going Down (−y)
            </button>
            <button
              type="button"
              onClick={() => setStepDirection('up')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                stepDirection === 'up' ? 'bg-[#18181b] text-white' : 'bg-[#f4f5f7] text-slate-600'
              }`}
            >
              Steps Going Up (+y)
            </button>
          </div>
        </div>
      </div>

      {/* Deploy Card (High-Contrast Charcoal Banner) */}
      <div className="bg-[#18181b] text-white rounded-[32px] p-5 shadow-md flex items-center justify-between">
        <div>
          <span className="text-[10px] text-neutral-400 uppercase font-extrabold tracking-wider block">
            Grid Total
          </span>
          <div className="text-lg font-black font-mono mt-0.5">
            {totalOrders} Orders • {totalVolume} Lots
          </div>
          <span className="text-[11px] text-neutral-400">
            {ladderLevels[0]?.price} to {ladderLevels[ladderLevels.length - 1]?.price}
          </span>
        </div>

        <button
          onClick={handleDeploy}
          className="bg-white hover:bg-neutral-100 active:scale-95 text-slate-900 font-extrabold text-xs px-7 py-3.5 rounded-full shadow-md flex items-center gap-1.5 transition cursor-pointer shrink-0"
        >
          <span>Deploy</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Ladder Rungs Preview Matrix */}
      <div className="bg-white rounded-[32px] p-5 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-3">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
          <span className="font-extrabold text-slate-900">Ladder Matrix Breakdown</span>
          <span className="text-[11px] font-mono text-slate-500 font-bold">
            u − x − zy
          </span>
        </div>

        <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto font-mono text-xs">
          {ladderLevels.map((lvl) => (
            <div key={lvl.levelIndex} className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#f4f5f7] text-slate-800">
                  #{lvl.levelIndex}
                </span>
                <span className="text-[11px] text-slate-500">{lvl.formula}</span>
              </div>
              <div className="text-right">
                <span className="font-black text-slate-900 block text-xs">
                  {lvl.price.toFixed(selectedSymbol.decimals)}
                </span>
                <span className="text-[10px] text-slate-400">
                  {lvl.ordersCount}x {lvl.lotSize}L
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
