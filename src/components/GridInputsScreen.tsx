import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  DerivAccount,
  LadderLevel,
  OrderDirection,
  OrderType,
  MarketSymbol,
  PlacedOrder,
  TradeNotice,
} from '../types/trading';
import {
  TrendingDown,
  TrendingUp,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Minus,
  Plus,
  Loader2,
} from 'lucide-react';
import { SymbolSearchSelect } from './SymbolSearchSelect';
import { getMentorToken, getMt5Order, Mt5OrderRequest, queueMt5Orders, StoredMt5Account } from '../services/joemoneyMt5Api';
import { MT5_PRICE_STALE_AFTER_SEC } from '../services/marketPrice';
import { getTradeOutcome } from '../services/tradeOutcome';
import { Mt5Quote } from '../hooks/useMt5Prices';

interface GridInputsScreenProps {
  account: DerivAccount;
  mt5Account: StoredMt5Account | null;
  spotPrice: number;
  mt5PriceAge?: number | null;
  mt5Quote?: Mt5Quote | null;
  selectedSymbol: MarketSymbol;
  onSelectSymbol: (sym: MarketSymbol) => void;
  symbols: MarketSymbol[];
  onDeployOrders: (orders: PlacedOrder[]) => void;
  onTradeNotice: (notice: TradeNotice) => void;
}

type TradeAction = 'SELL_STOP' | 'SELL_LIMIT' | 'BUY_LIMIT' | 'BUY_STOP' | 'BUY_MARKET' | 'SELL_MARKET';

export const GridInputsScreen: React.FC<GridInputsScreenProps> = ({
  account,
  mt5Account,
  spotPrice,
  mt5PriceAge = null,
  mt5Quote = null,
  selectedSymbol,
  onSelectSymbol,
  symbols,
  onDeployOrders,
  onTradeNotice,
}) => {
  const [tradeAction, setTradeAction] = useState<TradeAction>('SELL_STOP');

  // Simple, intuitive trading fields
  const [startPrice, setStartPrice] = useState<number>(4165.0);
  const [stepSpacing, setStepSpacing] = useState<number>(0.1);
  const [orderCount, setOrderCount] = useState<number>(5);
  const [lotSize, setLotSize] = useState<number>(0.1);
  const [stepDirection, setStepDirection] = useState<'down' | 'up'>('down');
  const [ordersPerLevel, setOrdersPerLevel] = useState<number>(1);
  const [showFormulaDetails, setShowFormulaDetails] = useState(false);

  const [isDeploying, setIsDeploying] = useState(false);
  const lastAlignedKey = useRef('');

  // Align once per symbol/action after its first fresh MT5 quote arrives.
  useEffect(() => {
    const key = `${selectedSymbol.symbol}:${tradeAction}`;
    if (spotPrice <= 0 || mt5PriceAge === null || mt5PriceAge >= MT5_PRICE_STALE_AFTER_SEC || lastAlignedKey.current === key) {
      return;
    }
    lastAlignedKey.current = key;
    if (tradeAction === 'SELL_STOP' || tradeAction === 'BUY_LIMIT') {
      const initial = +(spotPrice - 5.0).toFixed(selectedSymbol.decimals);
      setStartPrice(initial > 0 ? initial : +(spotPrice * 0.99).toFixed(selectedSymbol.decimals));
      setStepDirection('down');
    } else if (tradeAction === 'SELL_LIMIT' || tradeAction === 'BUY_STOP') {
      setStartPrice(+(spotPrice + 5.0).toFixed(selectedSymbol.decimals));
      setStepDirection('up');
    } else {
      setStartPrice(+spotPrice.toFixed(selectedSymbol.decimals));
    }
  }, [tradeAction, selectedSymbol, spotPrice, mt5PriceAge]);

  // Derive direction & order type
  const direction: OrderDirection = tradeAction.startsWith('SELL') ? 'SELL' : 'BUY';
  const isMarketOrder = tradeAction.endsWith('MARKET');
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

  const mt5Badge = mt5PriceAge !== null && (
    <span
      className={`px-1 py-0.5 rounded text-[8px] font-black tracking-widest ${
        mt5PriceAge >= MT5_PRICE_STALE_AFTER_SEC
          ? 'bg-slate-300 text-slate-600'
          : 'bg-sky-500 text-white'
      }`}
    >
      MT5
    </span>
  );

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  // Stepper handlers for lot size to avoid needing keyboard
  const changeLot = (delta: number) => {
    setLotSize((prev) => {
      const next = +(prev + delta).toFixed(2);
      return next >= 0.01 ? next : 0.01;
    });
  };

  const handleDeploy = async () => {
    if (!mt5Account) {
      onTradeNotice({
        success: false,
        message: 'Select and connect an MT5 account before deploying orders.',
        trades: [],
      });
      return;
    }
    if (mt5PriceAge === null || mt5PriceAge >= MT5_PRICE_STALE_AFTER_SEC) {
      onTradeNotice({
        success: false,
        message: `MT5 quote for ${selectedSymbol.symbol} is ${mt5PriceAge === null ? 'missing' : `stale (${mt5PriceAge.toFixed(1)}s old)`}. Check the exact MT5 symbol in Market Watch and the EA ReportSymbols list before deploying.`,
        trades: [],
      });
      return;
    }
    if (!mt5Quote?.volumeLimitsKnown) {
      onTradeNotice({
        success: false,
        message: `MT5 has not reported volume limits for ${mt5Quote?.symbol ?? selectedSymbol.symbol}. Update and restart the EA build that reports broker min/max/step before placing trades.`,
        trades: [],
      });
      return;
    }
    const volumeMin = mt5Quote?.volumeMin ?? selectedSymbol.minLot;
    const volumeMax = mt5Quote?.volumeMax ?? 100;
    const volumeStep = mt5Quote?.volumeStep ?? selectedSymbol.lotStep;
    if (lotSize < volumeMin || lotSize > volumeMax || volumeStep <= 0 ||
        Math.abs(lotSize / volumeStep - Math.round(lotSize / volumeStep)) > 1e-8) {
      onTradeNotice({
        success: false,
        message: `Invalid volume for ${mt5Quote?.symbol ?? selectedSymbol.symbol}: choose ${volumeMin} to ${volumeMax} lots in steps of ${volumeStep}.`,
        trades: [],
      });
      return;
    }

    setIsDeploying(true);
    const createdAt = Date.now();
    const localOrders: PlacedOrder[] = [];
    const bridgeOrders: Mt5OrderRequest[] = [];
    let executionError = '';
    let latestOrders: PlacedOrder[] = [];

    try {
      for (const level of ladderLevels) {
        for (let s = 1; s <= level.ordersCount; s++) {
          localOrders.push({
            id: `ORD-${createdAt.toString(36).toUpperCase()}-${level.levelIndex + 1}-${s}`,
            levelIndex: level.levelIndex + 1,
            subIndex: s,
            symbol: mt5Quote?.symbol ?? selectedSymbol.symbol,
            direction,
            orderType,
            mt5OrderType: isMarketOrder
              ? (direction === 'BUY' ? 'MARKET_BUY' : 'MARKET_SELL')
              : (direction === 'BUY'
                ? (tradeAction === 'BUY_LIMIT' ? 'BUY_LIMIT' : 'BUY_STOP')
                : (tradeAction === 'SELL_LIMIT' ? 'SELL_LIMIT' : 'SELL_STOP')),
            price: level.price,
            lotSize: level.lotSize,
            status: 'QUEUED',
            createdAt,
          });
          bridgeOrders.push({
            symbol: mt5Quote?.symbol ?? selectedSymbol.symbol,
            order_type: isMarketOrder
              ? (direction === 'BUY' ? 'MARKET_BUY' : 'MARKET_SELL')
              : (direction === 'BUY'
                ? (tradeAction === 'BUY_LIMIT' ? 'BUY_LIMIT' : 'BUY_STOP')
                : (tradeAction === 'SELL_LIMIT' ? 'SELL_LIMIT' : 'SELL_STOP')),
            volume: level.lotSize,
            entry_price: isMarketOrder ? 0 : level.price,
            tp_enabled: false,
            tp_distance: 0,
          });
        }
      }

      const token = getMentorToken();
      const batch = await queueMt5Orders(token, mt5Account.login, bridgeOrders);
      const queuedOrders: PlacedOrder[] = batch.orders.map((bridgeOrder, index) => ({
        ...localOrders[index],
        mt5OrderId: bridgeOrder.id,
        status: bridgeOrder.status === 'queued' ? 'QUEUED' : 'CLAIMED',
        mt5Ticket: bridgeOrder.ticket ?? undefined,
      }));

      onDeployOrders(queuedOrders);
      latestOrders = queuedOrders;

      for (let attempt = 0; attempt < 20; attempt++) {
        const updated = await Promise.all(queuedOrders.map((order) =>
          order.mt5OrderId ? getMt5Order(token, order.mt5OrderId) : Promise.resolve(null)
        ));

        const nextOrders: PlacedOrder[] = queuedOrders.map((order, index) => {
          const current = updated[index];
          if (!current || !order.mt5OrderId) return order;

          let nextStatus: PlacedOrder['status'];
          switch (current.status) {
            case 'filled': nextStatus = 'FILLED'; break;
            case 'placed': nextStatus = order.mt5OrderType?.startsWith('MARKET_') ? 'FILLED' : 'PENDING'; break;
            case 'queued': nextStatus = 'QUEUED'; break;
            case 'claimed': nextStatus = 'CLAIMED'; break;
            case 'rejected': nextStatus = 'FAILED'; break;
            default: nextStatus = 'PENDING';
          }

          return {
            ...order,
            status: nextStatus,
            mt5Ticket: current.ticket ?? order.mt5Ticket,
            mt5ResultMessage: current.result_message ?? undefined,
          };
        });
        latestOrders = nextOrders;
        onDeployOrders(nextOrders);

        if (updated.every((order) => order && order.status !== 'queued' && order.status !== 'claimed')) break;
        await wait(1000);
      }
    } catch (error: any) {
      executionError = error?.message || 'MT5 order submission failed.';
    } finally {
      setIsDeploying(false);
    }

    if (executionError) {
      if (latestOrders.length > 0) {
        onTradeNotice({
          success: false,
          outcome: 'unconfirmed',
          message: `Could not confirm the MT5 result for ${latestOrders.length} queued order(s): ${executionError}. Do not assume these trades were placed; check MT5 Trade/History and the order status before retrying.`,
          errorMessage: executionError,
          trades: latestOrders.map((order) => ({
            symbol: order.symbol,
            direction: order.direction,
            orderType: order.mt5OrderType,
            price: order.price,
            lotSize: order.lotSize,
            contractId: order.mt5Ticket?.toString(),
            status: order.status,
            resultMessage: order.mt5ResultMessage,
          })),
        });
        return;
      }
      onTradeNotice({
        success: false,
        outcome: 'rejected',
        message: `MT5 grid deployment failed: ${executionError}`,
        errorMessage: executionError,
        trades: [],
      });
      return;
    }

    const acceptedCount = latestOrders.filter((order) => order.status === 'FILLED' || order.status === 'PENDING').length;
    const rejectedOrders = latestOrders.filter((order) => order.status === 'FAILED');
    const waitingCount = latestOrders.filter((order) => order.status === 'QUEUED' || order.status === 'CLAIMED').length;
    const rejectionReason = rejectedOrders.find((order) => order.mt5ResultMessage)?.mt5ResultMessage;
    const outcome = getTradeOutcome(acceptedCount, rejectedOrders.length, waitingCount);
    const success = outcome === 'accepted';

    onTradeNotice({
      success,
      outcome,
      errorMessage: rejectedOrders.length > 0 ? rejectionReason ?? `${rejectedOrders.length} order(s) were rejected by MT5.` : undefined,
      message: `${acceptedCount} accepted by MT5; ${rejectedOrders.length} rejected; ${waitingCount} not yet confirmed by the EA. Submitted order type: ${bridgeOrders[0]?.order_type ?? 'unknown'}.`,
      trades: latestOrders.map((order) => ({
        symbol: order.symbol,
        direction: order.direction,
        orderType: order.mt5OrderType,
        price: order.price,
        lotSize: order.lotSize,
        contractId: order.mt5Ticket?.toString(),
        status: order.status,
        resultMessage: order.mt5ResultMessage,
      })),
    });
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
          <span
            className={`w-2 h-2 rounded-full animate-pulse ${
              mt5PriceAge !== null && mt5PriceAge >= MT5_PRICE_STALE_AFTER_SEC
                ? 'bg-slate-400'
                : 'bg-emerald-500'
            }`}
          />
          <span
            className={
              mt5PriceAge !== null && mt5PriceAge >= MT5_PRICE_STALE_AFTER_SEC ? 'text-slate-400' : ''
            }
          >
            Spot: {mt5PriceAge !== null && mt5PriceAge < MT5_PRICE_STALE_AFTER_SEC
              ? spotPrice.toFixed(selectedSymbol.decimals)
              : `No fresh MT5 quote for ${selectedSymbol.symbol}`}
          </span>
          {mt5Badge}
        </div>
      </div>
      {mt5Account && (
        <p className="-mt-3 text-right text-[10px] font-mono text-slate-500">
          MT5 {mt5Account.login} · {mt5Quote && mt5PriceAge !== null && mt5PriceAge < MT5_PRICE_STALE_AFTER_SEC
            ? `bid ${mt5Quote.bid} / ask ${mt5Quote.ask} · ${mt5PriceAge.toFixed(1)}s`
            : 'selected account has no fresh quote for this exact symbol'}
        </p>
      )}

      {/* Searchable Market Selector */}
      <SymbolSearchSelect
        symbols={symbols}
        selectedSymbol={selectedSymbol}
        onSelect={onSelectSymbol}
      />

      <div className="grid grid-cols-2 gap-2 text-xs font-bold">
        <button type="button" onClick={() => setTradeAction('BUY_MARKET')} className={`py-3 rounded-xl flex items-center justify-center gap-1.5 ${tradeAction === 'BUY_MARKET' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800'}`}>
          <TrendingUp className="w-4 h-4" /> BUY MARKET · NOW
        </button>
        <button type="button" onClick={() => setTradeAction('SELL_MARKET')} className={`py-3 rounded-xl flex items-center justify-center gap-1.5 ${tradeAction === 'SELL_MARKET' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800'}`}>
          <TrendingDown className="w-4 h-4" /> SELL MARKET · NOW
        </button>
      </div>

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
          <span className="text-[9px] font-normal opacity-70">Trigger when price falls to level</span>
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
          <span className="text-[9px] font-normal opacity-70">Trigger when price falls to level</span>
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
          <span className="text-[9px] font-normal opacity-70">Trigger when price rises to level</span>
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
          <span className="text-[9px] font-normal opacity-70">Trigger when price rises to level</span>
        </button>
      </div>

      {/* Main Order Settings Card */}
      <div className="bg-white rounded-[28px] p-4 sm:p-5 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4">
        {/* Field 1: Start Price */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label className="font-bold text-slate-900">First Order Price</label>
            <span className="text-[11px] font-mono font-medium text-slate-400 flex items-center gap-1">
              Spot: {spotPrice.toFixed(selectedSymbol.decimals)}
              {mt5Badge}
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
              {isMarketOrder ? 'Live market execution' : 'Live price-triggered execution'}
            </span>
          </div>

          <div className="text-sm font-bold mt-1 text-neutral-100 leading-snug">
            {isMarketOrder
              ? `Execute ${totalOrders} ${direction} market order(s) now at the live price.`
              : `Place ${totalOrders} ${direction} ${orderType} trigger(s) from ${startPrice.toFixed(selectedSymbol.decimals)} ${stepDirection} to ${endPrice.toFixed(selectedSymbol.decimals)}.`}
          </div>

          <div className="text-[11px] text-neutral-400 font-mono mt-1">
            Total volume: {totalVolume} Lots · {isMarketOrder ? 'Submitted to Deriv now' : 'Sent to Deriv when the selected price is reached'}
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
              <span>{isDeploying ? 'Sending to Deriv...' : isMarketOrder ? `Execute ${totalOrders} Market Order(s) Now` : `Arm ${totalOrders} Price Trigger(s)`}</span>
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
