import React, { useState, useMemo, useEffect } from 'react';
import {
  DerivAccount,
  LadderLevel,
  OrderDirection,
  OrderType,
  MarketSymbol,
  PlacedOrder,
} from '../types/trading';
import {
  TrendingDown,
  TrendingUp,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Layers,
  Minus,
  Plus,
  Loader2,
} from 'lucide-react';
import { derivService } from '../services/derivWs';

interface GridInputsScreenProps {
  account: DerivAccount;
  spotPrice: number;
  selectedSymbol: MarketSymbol;
  onSelectSymbol: (sym: MarketSymbol) => void;
  symbols: MarketSymbol[];
  onDeployOrders: (orders: PlacedOrder[]) => void;
}

type EasyPresetType = 'SELL_STOP' | 'SELL_LIMIT' | 'BUY_LIMIT' | 'BUY_STOP';

export const GridInputsScreen: React.FC<GridInputsScreenProps> = ({
  account,
  spotPrice,
  selectedSymbol,
  onSelectSymbol,
  symbols,
  onDeployOrders,
}) => {
  // Preset trading action
  const [tradeAction, setTradeAction] = useState<EasyPresetType>('SELL_STOP');

  // Simple, intuitive trading fields
  const [startPrice, setStartPrice] = useState<number>(4165.0);
  const [stepSpacing, setStepSpacing] = useState<number>(0.1);
  const [orderCount, setOrderCount] = useState<number>(5);
  const [lotSize, setLotSize] = useState<number>(0.1);
  const [stepDirection, setStepDirection] = useState<'down' | 'up'>('down');
  const [ordersPerLevel, setOrdersPerLevel] = useState<number>(1);
  const [showFormulaDetails, setShowFormulaDetails] = useState(false);

  // Execution Mode: 'immediate' (execute all into market immediately via API) or 'ladder' (trigger on price reach)
  const [executionMode, setExecutionMode] = useState<'immediate' | 'ladder'>('immediate');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployFeedback, setDeployFeedback] = useState<string | null>(null);

  // Auto-align default start price when market spot updates or action changes
  useEffect(() => {
    if (spotPrice > 0) {
      if (tradeAction === 'SELL_STOP' || tradeAction === 'BUY_LIMIT') {
        const initial = +(spotPrice - 5.0).toFixed(selectedSymbol.decimals);
        setStartPrice(initial > 0 ? initial : +(spotPrice * 0.99).toFixed(selectedSymbol.decimals));
        setStepDirection('down');
      } else {
        const initial = +(spotPrice + 5.0).toFixed(selectedSymbol.decimals);
        setStartPrice(initial);
        setStepDirection('up');
      }
    }
  }, [tradeAction, selectedSymbol]);

  // Derive direction & order type
  const direction: OrderDirection = tradeAction.startsWith('SELL') ? 'SELL' : 'BUY';
  const orderType: OrderType = tradeAction.includes('STOP') ? 'STOP' : 'LIMIT';

  // Calculate ladder levels
  const ladderLevels: LadderLevel[] = useMemo(() => {
    const list: LadderLevel[] = [];
    let cumLots = 0;
    const safeCount = Math.min(25, Math.max(1, orderCount));

    for (let k = 0; k < safeCount; k++) {
      const priceOffset = k * stepSpacing;
      const targetPrice =
        stepDirection === 'down'
          ? startPrice - priceOffset
          : startPrice + priceOffset;

      const rounded = +targetPrice.toFixed(selectedSymbol.decimals);
      const totalLots = +(ordersPerLevel * lotSize).toFixed(3);
      cumLots = +(cumLots + totalLots).toFixed(3);

      const sign = stepDirection === 'down' ? '−' : '+';
      const formulaStr = `${startPrice.toFixed(selectedSymbol.decimals)} ${sign} (${k} × ${stepSpacing})`;

      list.push({
        levelIndex: k,
        formula: formulaStr,
        price: rounded,
        ordersCount: ordersPerLevel,
        lotSize,
        totalLotsAtLevel: totalLots,
        cumulativeLots: cumLots,
        distanceFromSpot: +(spotPrice - rounded).toFixed(selectedSymbol.decimals),
      });
    }

    return list;
  }, [
    startPrice,
    stepSpacing,
    orderCount,
    lotSize,
    ordersPerLevel,
    stepDirection,
    spotPrice,
    selectedSymbol.decimals,
  ]);

  const totalOrders = ladderLevels.length * ordersPerLevel;
  const totalVolume = +(totalOrders * lotSize).toFixed(2);
  const endPrice = ladderLevels[ladderLevels.length - 1]?.price || startPrice;

  // Stepper handlers for lot size to avoid needing keyboard
  const changeLot = (delta: number) => {
    setLotSize((prev) => {
      const next = +(prev + delta).toFixed(2);
      return next >= 0.01 ? next : 0.01;
    });
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    setDeployFeedback('Sending real trade orders to Deriv API...');

    const newOrders: PlacedOrder[] = [];

    for (const level of ladderLevels) {
      for (let s = 1; s <= level.ordersCount; s++) {
        const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${level.levelIndex + 1}-${s}`;

        if (executionMode === 'immediate') {
          // Send real trade to Deriv WebSocket!
          const res = await derivService.executeRealTrade({
            symbol: selectedSymbol.symbol,
            direction,
            price: level.price,
            lotSize: level.lotSize,
            orderType: 'MARKET_GRID',
          });

          newOrders.push({
            id: orderId,
            levelIndex: level.levelIndex + 1,
            subIndex: s,
            symbol: selectedSymbol.symbol,
            direction,
            orderType: 'MARKET_GRID',
            price: level.price,
            lotSize: level.lotSize,
            status: 'FILLED', // Directly filled into the market! No manual button clicking!
            createdAt: Date.now(),
            filledAt: Date.now(),
            derivContractId: res.contractId,
          });
        } else {
          // Ladder order (triggers automatically when market price touches it)
          newOrders.push({
            id: orderId,
            levelIndex: level.levelIndex + 1,
            subIndex: s,
            symbol: selectedSymbol.symbol,
            direction,
            orderType,
            price: level.price,
            lotSize: level.lotSize,
            status: 'PENDING',
            createdAt: Date.now(),
          });
        }
      }
    }

    setIsDeploying(false);
    onDeployOrders(newOrders);
  };

  return (
    <div className="pb-44 pt-3 px-4 sm:px-5 max-w-md mx-auto space-y-4 font-sans bg-white min-h-screen">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Order Desk</h2>
          <p className="text-xs text-slate-400 font-medium">
            {account.token ? 'Live Deriv API Active' : account.mt5Server ? `MT5 (${account.mt5Login})` : 'Sandbox Simulator'}
          </p>
        </div>

        {/* Live Spot Pill */}
        <div className="px-3 py-1.5 rounded-full bg-[#f4f5f7] text-slate-800 text-xs font-mono font-bold flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Spot: {spotPrice.toFixed(selectedSymbol.decimals)}</span>
        </div>
      </div>

      {/* Market Selector Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {symbols.map((sym) => {
          const isSelected = selectedSymbol.symbol === sym.symbol;
          return (
            <button
              key={sym.symbol}
              type="button"
              onClick={() => onSelectSymbol(sym)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                isSelected
                  ? 'bg-[#18181b] text-white shadow-xs'
                  : 'bg-[#f4f5f7] text-slate-700 hover:bg-slate-200'
              }`}
            >
              {sym.displayName.split(' ')[0]}
            </button>
          );
        })}
      </div>

      {/* Execution Style Switcher: Immediate Market vs Ladder Triggers */}
      <div className="bg-[#f4f5f7] p-1 rounded-2xl flex gap-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setExecutionMode('immediate')}
          className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
            executionMode === 'immediate'
              ? 'bg-[#18181b] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Execute All Now (Live API)</span>
        </button>

        <button
          type="button"
          onClick={() => setExecutionMode('ladder')}
          className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
            executionMode === 'ladder'
              ? 'bg-[#18181b] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          <span>Auto Price Trigger</span>
        </button>
      </div>

      {/* 4 Simple Trading Actions: Sell Stop, Buy Limit, Sell Limit, Buy Stop */}
      <div className="bg-[#f4f5f7] rounded-2xl p-1 grid grid-cols-2 gap-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setTradeAction('SELL_STOP')}
          className={`py-2 px-2.5 rounded-xl transition cursor-pointer flex flex-col items-center ${
            tradeAction === 'SELL_STOP'
              ? 'bg-[#18181b] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span>SELL STOP</span>
          </span>
          <span className="text-[9px] font-normal opacity-70">Sell below spot (4165)</span>
        </button>

        <button
          type="button"
          onClick={() => setTradeAction('BUY_LIMIT')}
          className={`py-2 px-2.5 rounded-xl transition cursor-pointer flex flex-col items-center ${
            tradeAction === 'BUY_LIMIT'
              ? 'bg-[#18181b] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>BUY LIMIT</span>
          </span>
          <span className="text-[9px] font-normal opacity-70">Buy dips below spot</span>
        </button>

        <button
          type="button"
          onClick={() => setTradeAction('SELL_LIMIT')}
          className={`py-2 px-2.5 rounded-xl transition cursor-pointer flex flex-col items-center ${
            tradeAction === 'SELL_LIMIT'
              ? 'bg-[#18181b] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span>SELL LIMIT</span>
          </span>
          <span className="text-[9px] font-normal opacity-70">Sell rallies above spot</span>
        </button>

        <button
          type="button"
          onClick={() => setTradeAction('BUY_STOP')}
          className={`py-2 px-2.5 rounded-xl transition cursor-pointer flex flex-col items-center ${
            tradeAction === 'BUY_STOP'
              ? 'bg-[#18181b] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>BUY STOP</span>
          </span>
          <span className="text-[9px] font-normal opacity-70">Buy breakout above spot</span>
        </button>
      </div>

      {/* Main Order Settings Card */}
      <div className="bg-white rounded-[28px] p-4 sm:p-5 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
        {/* Field 1: Start Price */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label className="font-bold text-slate-900">First Order Price</label>
            <span className="text-[11px] font-mono font-medium text-slate-400">
              Spot: {spotPrice.toFixed(selectedSymbol.decimals)}
            </span>
          </div>

          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={startPrice}
            onChange={(e) => setStartPrice(parseFloat(e.target.value) || 0)}
            className="w-full px-4 py-2.5 rounded-2xl bg-[#f4f5f7] border-0 font-mono text-base font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
          />

          <div className="grid grid-cols-6 gap-1 mt-1.5">
            {[-5.0, -2.0, -1.0, 1.0, 2.0, 5.0].map((diff) => {
              const p = +(spotPrice + diff).toFixed(selectedSymbol.decimals);
              return (
                <button
                  key={diff}
                  type="button"
                  onClick={() => setStartPrice(p)}
                  className="py-1 rounded-lg bg-[#f4f5f7] hover:bg-slate-200 text-[10px] font-mono font-semibold text-slate-700 cursor-pointer transition text-center"
                >
                  {diff > 0 ? `+${diff}` : diff}
                </button>
              );
            })}
          </div>
        </div>

        {/* Field 2: Responsive Lot Volume Selector (Fixed mobile freezing & layout) */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label className="font-bold text-slate-900">Lot Size (Volume per Order)</label>
            <span className="text-[10px] text-slate-400 font-medium">Deriv Stake</span>
          </div>

          {/* Stepper + Input */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeLot(-0.01)}
              className="w-10 h-10 rounded-xl bg-[#f4f5f7] hover:bg-slate-200 active:scale-95 text-slate-800 flex items-center justify-center font-bold cursor-pointer transition shrink-0"
              title="Decrease lot"
            >
              <Minus className="w-4 h-4" />
            </button>

            <input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={lotSize}
              onChange={(e) => setLotSize(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[#f4f5f7] border-0 font-mono text-base font-bold text-slate-900 text-center focus:ring-2 focus:ring-slate-900"
            />

            <button
              type="button"
              onClick={() => changeLot(0.01)}
              className="w-10 h-10 rounded-xl bg-[#f4f5f7] hover:bg-slate-200 active:scale-95 text-slate-800 flex items-center justify-center font-bold cursor-pointer transition shrink-0"
              title="Increase lot"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Preset Pills */}
          <div className="grid grid-cols-5 gap-1 mt-1.5">
            {[0.01, 0.05, 0.10, 0.20, 0.50].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLotSize(l)}
                className={`py-1 rounded-lg text-[10px] font-bold transition cursor-pointer text-center ${
                  lotSize === l ? 'bg-[#18181b] text-white shadow-2xs' : 'bg-[#f4f5f7] text-slate-600'
                }`}
              >
                {l}L
              </button>
            ))}
          </div>
        </div>

        {/* Field 3 & 4: Spacing & How Many Orders */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Spacing / Step */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label className="font-bold text-slate-900">Spacing</label>
              {/* Compact Progression Toggle */}
              <div className="flex bg-[#f4f5f7] rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setStepDirection('down')}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition ${
                    stepDirection === 'down' ? 'bg-[#18181b] text-white' : 'text-slate-500'
                  }`}
                >
                  ↓ Down
                </button>
                <button
                  type="button"
                  onClick={() => setStepDirection('up')}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition ${
                    stepDirection === 'up' ? 'bg-[#18181b] text-white' : 'text-slate-500'
                  }`}
                >
                  ↑ Up
                </button>
              </div>
            </div>

            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={stepSpacing}
              onChange={(e) => setStepSpacing(Math.max(0.001, parseFloat(e.target.value) || 0.1))}
              className="w-full px-3 py-2 rounded-xl bg-[#f4f5f7] border-0 font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
            />

            <div className="grid grid-cols-4 gap-1 mt-1.5">
              {[0.1, 0.25, 0.5, 1.0].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStepSpacing(s)}
                  className={`py-1 rounded-md text-[9px] font-bold transition cursor-pointer text-center ${
                    stepSpacing === s ? 'bg-[#18181b] text-white' : 'bg-[#f4f5f7] text-slate-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* How Many Orders */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label className="font-bold text-slate-900">Orders</label>
              <span className="text-[10px] text-slate-400 font-medium">Count</span>
            </div>

            <input
              type="number"
              min="1"
              max="25"
              inputMode="numeric"
              value={orderCount}
              onChange={(e) => setOrderCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-2 rounded-xl bg-[#f4f5f7] border-0 font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
            />

            <div className="grid grid-cols-4 gap-1 mt-1.5">
              {[3, 5, 10, 15].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setOrderCount(cnt)}
                  className={`py-1 rounded-md text-[9px] font-bold transition cursor-pointer text-center ${
                    orderCount === cnt ? 'bg-[#18181b] text-white' : 'bg-[#f4f5f7] text-slate-600'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Clear Plain-English Order Summary & Deploy CTA */}
      <div className="bg-[#18181b] text-white rounded-[28px] p-5 shadow-sm space-y-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-[#fbcfe8]" />
            <span>
              {executionMode === 'immediate'
                ? 'Ready for Live API Execution'
                : 'Ready for Trigger Ladder'}
            </span>
          </div>

          <div className="text-sm font-bold mt-1 text-neutral-100 leading-snug">
            Placing {totalOrders} {direction} {executionMode === 'immediate' ? 'Market' : orderType} orders of {lotSize} lots from{' '}
            <span className="text-white font-mono">{startPrice.toFixed(selectedSymbol.decimals)}</span>{' '}
            {stepDirection === 'down' ? 'down' : 'up'} to{' '}
            <span className="text-white font-mono">{endPrice.toFixed(selectedSymbol.decimals)}</span>
          </div>

          <div className="text-[11px] text-neutral-400 font-mono mt-1">
            Total volume: {totalVolume} Lots • {executionMode === 'immediate' ? 'Fills instantly into market' : 'Triggers as price hits level'}
          </div>
        </div>

        <button
          type="button"
          disabled={isDeploying}
          onClick={handleDeploy}
          className="w-full py-3.5 rounded-full bg-white hover:bg-neutral-100 active:scale-98 text-slate-900 font-black text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
        >
          {isDeploying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Placing to Deriv API...</span>
            </>
          ) : (
            <>
              <span>Place {totalOrders} Orders to Account</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* Order Ladder Preview */}
      <div className="bg-white rounded-[28px] p-4 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-2">
        <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-100">
          <span className="font-extrabold text-slate-900">Planned Positions</span>
          <button
            type="button"
            onClick={() => setShowFormulaDetails(!showFormulaDetails)}
            className="text-[10px] font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
          >
            <span>Formula (u-x-zy)</span>
            {showFormulaDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {showFormulaDetails && (
          <div className="p-2.5 rounded-xl bg-[#f4f5f7] text-[10px] font-mono text-slate-600 space-y-1">
            <div>u = Spot ({spotPrice})</div>
            <div>x = Offset ({(spotPrice - startPrice).toFixed(2)})</div>
            <div>t = Lot Size ({lotSize})</div>
            <div>y = Step Spacing ({stepSpacing})</div>
            <div>z = {orderCount - 1} steps</div>
          </div>
        )}

        <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto font-mono text-xs">
          {ladderLevels.map((lvl) => (
            <div key={lvl.levelIndex} className="py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f4f5f7] text-slate-800">
                  #{lvl.levelIndex + 1}
                </span>
                <span className="text-slate-600 font-bold text-xs">
                  {lvl.price.toFixed(selectedSymbol.decimals)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-right">
                <span
                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    direction === 'SELL' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {direction}
                </span>
                <span className="text-[10px] text-slate-400">{lvl.lotSize}L</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
