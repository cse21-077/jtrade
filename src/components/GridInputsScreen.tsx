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
  ArrowLeft,
  Sparkles,
  Minus,
  Plus,
  Loader2,
  Calculator,
  CheckCircle2,
  Crosshair,
} from 'lucide-react';
import { SymbolSearchSelect } from './SymbolSearchSelect';
import { getMentorToken, getMt5Order, Mt5OrderRequest, queueMt5Orders, StoredMt5Account } from '../services/joemoneyMt5Api';
import { MT5_PRICE_STALE_AFTER_SEC } from '../services/marketPrice';
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
  onSwitchToOrders?: () => void;
}

type TradeAction = 'SELL_STOP' | 'SELL_LIMIT' | 'BUY_LIMIT' | 'BUY_STOP' | 'BUY_MARKET' | 'SELL_MARKET';

const ACTION_LABELS: Record<TradeAction, string> = {
  BUY_MARKET: 'Buy Now',
  SELL_MARKET: 'Sell Now',
  BUY_LIMIT: 'Buy Limit',
  SELL_LIMIT: 'Sell Limit',
  BUY_STOP: 'Buy Stop',
  SELL_STOP: 'Sell Stop',
};

interface DeployResult {
  acceptedCount: number;
  rejectedCount: number;
  waitingCount: number;
  rejectionReason?: string;
  orders: PlacedOrder[];
}

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
  onSwitchToOrders,
}) => {
  const [tradeAction, setTradeAction] = useState<TradeAction>('SELL_STOP');
  const [showActionPicker, setShowActionPicker] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  const selectAction = (action: TradeAction) => {
    setTradeAction(action);
    setShowActionPicker(false);
  };

  // Simple, intuitive trading fields
  const [startPrice, setStartPrice] = useState<number>(4165.0);
  const [stepSpacing, setStepSpacing] = useState<number>(0.1);
  const [orderCount, setOrderCount] = useState<number>(5);
  const [lotSize, setLotSize] = useState<number>(0.1);
  const [stepDirection, setStepDirection] = useState<'down' | 'up'>('down');
  const [ordersPerLevel, setOrdersPerLevel] = useState<number>(1);

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
          ? 'bg-[#26262b] text-[#52525b]'
          : 'bg-[#d6f655] text-[#0e0e10]'
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

  const handleDeploy = async (): Promise<DeployResult | null> => {
    if (!mt5Account) {
      onTradeNotice({
        success: false,
        message: 'Select and connect an MT5 account before deploying orders.',
        trades: [],
      });
      return null;
    }
    if (mt5PriceAge === null || mt5PriceAge >= MT5_PRICE_STALE_AFTER_SEC) {
      onTradeNotice({
        success: false,
        message: `MT5 quote for ${selectedSymbol.symbol} is ${mt5PriceAge === null ? 'missing' : `stale (${mt5PriceAge.toFixed(1)}s old)`}. Check the exact MT5 symbol in Market Watch and the EA ReportSymbols list before deploying.`,
        trades: [],
      });
      return null;
    }
    if (!mt5Quote?.volumeLimitsKnown) {
      onTradeNotice({
        success: false,
        message: `MT5 has not reported volume limits for ${mt5Quote?.symbol ?? selectedSymbol.symbol}. Update and restart the EA build that reports broker min/max/step before placing trades.`,
        trades: [],
      });
      return null;
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
      return null;
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
        return null;
      }
      onTradeNotice({
        success: false,
        outcome: 'rejected',
        message: `MT5 grid deployment failed: ${executionError}`,
        errorMessage: executionError,
        trades: [],
      });
      return null;
    }

    const acceptedCount = latestOrders.filter((order) => order.status === 'FILLED' || order.status === 'PENDING').length;
    const rejectedOrders = latestOrders.filter((order) => order.status === 'FAILED');
    const waitingCount = latestOrders.filter((order) => order.status === 'QUEUED' || order.status === 'CLAIMED').length;
    const rejectionReason = rejectedOrders.find((order) => order.mt5ResultMessage)?.mt5ResultMessage;

    return {
      acceptedCount,
      rejectedCount: rejectedOrders.length,
      waitingCount,
      rejectionReason: rejectedOrders.length > 0 ? rejectionReason ?? `${rejectedOrders.length} order(s) were rejected by MT5.` : undefined,
      orders: latestOrders,
    };
  };

  const handleArm = async () => {
    setShowReview(false);
    const result = await handleDeploy();
    if (result) setDeployResult(result);
  };

  return (
    <div className="relative pb-44 pt-3 px-4 sm:px-5 max-w-md mx-auto space-y-4 font-sans bg-[#0e0e10] min-h-screen">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Order Desk</h2>
          <p className="text-xs text-[#52525b] font-medium">
            {account.token ? 'Live Deriv API Active' : account.mt5Server ? `MT5 (${account.mt5Login})` : 'Sandbox Simulator'}
          </p>
        </div>

        {/* Live Spot Pill */}
        <div className="px-3 py-1.5 rounded-full bg-[#18181b] border border-[#26262b] text-[#fafafa] text-xs font-mono font-bold flex items-center gap-1.5 shrink-0">
          <span
            className={`w-2 h-2 rounded-full animate-pulse ${
              mt5PriceAge !== null && mt5PriceAge >= MT5_PRICE_STALE_AFTER_SEC
                ? 'bg-[#52525b]'
                : 'bg-[#d6f655]'
            }`}
          />
          <span
            className={
              mt5PriceAge !== null && mt5PriceAge >= MT5_PRICE_STALE_AFTER_SEC ? 'text-[#52525b]' : ''
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
        <p className="-mt-3 text-right text-[10px] font-mono text-[#52525b]">
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

      {/* Hero Action Box */}
      <div className="rounded-2xl bg-[#d6f655] p-5 text-[#0e0e10] space-y-3">
        <div>
          <h3 className="text-2xl font-black leading-tight tracking-tight">
            {selectedSymbol.displayName}
          </h3>
          <p className="font-mono text-sm font-bold mt-0.5">
            {mt5PriceAge !== null && mt5PriceAge < MT5_PRICE_STALE_AFTER_SEC
              ? spotPrice.toLocaleString('en-US', {
                  minimumFractionDigits: selectedSymbol.decimals,
                  maximumFractionDigits: selectedSymbol.decimals,
                })
              : 'Waiting for live quote…'}
            <span className="font-sans text-[10px] font-bold text-[#0e0e10]/60 ml-1.5">
              {selectedSymbol.symbol}
            </span>
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#0e0e10]/60">Action</p>
            <p className="text-sm font-black">{ACTION_LABELS[tradeAction]}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowActionPicker((prev) => !prev)}
            className="rounded-full bg-[#0e0e10] text-[#d6f655] px-4 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition hover:opacity-90"
          >
            <Crosshair className="w-3.5 h-3.5" />
            {showActionPicker ? 'Hide Actions' : 'Choose Action'}
          </button>
        </div>
      </div>

      {showActionPicker && (
      <>
      <div className="grid grid-cols-2 gap-2 text-xs font-bold">
        <button type="button" onClick={() => selectAction('BUY_MARKET')} className={`py-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition ${tradeAction === 'BUY_MARKET' ? 'bg-[#d6f655] text-[#0e0e10]' : 'bg-[#18181b] text-[#a1a1aa] border border-[#26262b]'}`}>
          <TrendingUp className="w-4 h-4" /> BUY MARKET · NOW
        </button>
        <button type="button" onClick={() => selectAction('SELL_MARKET')} className={`py-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition ${tradeAction === 'SELL_MARKET' ? 'bg-[#d6f655] text-[#0e0e10]' : 'bg-[#18181b] text-[#a1a1aa] border border-[#26262b]'}`}>
          <TrendingDown className="w-4 h-4" /> SELL MARKET · NOW
        </button>
      </div>

      <div className="bg-[#18181b] border border-[#26262b] rounded-2xl p-1 grid grid-cols-2 gap-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => selectAction('SELL_STOP')}
          className={`py-2 px-2.5 rounded-xl transition cursor-pointer flex flex-col items-center ${
            tradeAction === 'SELL_STOP'
              ? 'bg-[#d6f655] text-[#0e0e10]'
              : 'text-[#a1a1aa] hover:text-white'
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
          onClick={() => selectAction('BUY_LIMIT')}
          className={`py-2 px-2.5 rounded-xl transition cursor-pointer flex flex-col items-center ${
            tradeAction === 'BUY_LIMIT'
              ? 'bg-[#d6f655] text-[#0e0e10]'
              : 'text-[#a1a1aa] hover:text-white'
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
          onClick={() => selectAction('SELL_LIMIT')}
          className={`py-2 px-2.5 rounded-xl transition cursor-pointer flex flex-col items-center ${
            tradeAction === 'SELL_LIMIT'
              ? 'bg-[#d6f655] text-[#0e0e10]'
              : 'text-[#a1a1aa] hover:text-white'
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
          onClick={() => selectAction('BUY_STOP')}
          className={`py-2 px-2.5 rounded-xl transition cursor-pointer flex flex-col items-center ${
            tradeAction === 'BUY_STOP'
              ? 'bg-[#d6f655] text-[#0e0e10]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>BUY STOP</span>
          </span>
          <span className="text-[9px] font-normal opacity-70">Trigger when price rises to level</span>
        </button>
      </div>
      </>
      )}

      {/* Main Order Settings Card */}
      <div className="bg-[#18181b] rounded-2xl p-4 sm:p-5 border border-[#26262b] space-y-4">
        {/* Field 1: Start Price */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label className="font-bold text-[#fafafa]">First Order Price</label>
            <span className="text-[11px] font-mono font-medium text-[#52525b] flex items-center gap-1">
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
            className="w-full px-4 py-2.5 rounded-2xl bg-[#1f1f23] border border-[#26262b] font-mono text-base font-bold text-white focus:ring-2 focus:ring-[#d6f655]"
          />

          <div className="grid grid-cols-6 gap-1 mt-1.5">
            {[-5.0, -2.0, -1.0, 1.0, 2.0, 5.0].map((diff) => {
              const p = +(spotPrice + diff).toFixed(selectedSymbol.decimals);
              return (
                <button
                  key={diff}
                  type="button"
                  onClick={() => setStartPrice(p)}
                  className="py-1 rounded-lg bg-[#1f1f23] text-[10px] font-mono font-semibold text-[#a1a1aa] cursor-pointer transition text-center"
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
            <label className="font-bold text-[#fafafa]">Lot Size (Volume per Order)</label>
            <span className="text-[10px] text-[#52525b] font-medium">Deriv Stake</span>
          </div>

          {/* Stepper + Input */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeLot(-0.01)}
              className="w-10 h-10 rounded-xl bg-[#1f1f23] border border-[#26262b] active:scale-95 text-white flex items-center justify-center font-bold cursor-pointer transition shrink-0"
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
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[#f4f5f7] border-0 font-mono text-base font-bold text-[#fafafa] text-center focus:ring-2 focus:ring-slate-900"
            />

            <button
              type="button"
              onClick={() => changeLot(0.01)}
              className="w-10 h-10 rounded-xl bg-[#1f1f23] border border-[#26262b] active:scale-95 text-white flex items-center justify-center font-bold cursor-pointer transition shrink-0"
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
                  lotSize === l ? 'bg-[#d6f655] text-[#0e0e10]' : 'bg-[#1f1f23] text-[#a1a1aa]'
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
              <label className="font-bold text-[#fafafa]">Spacing</label>
              {/* Compact Progression Toggle */}
              <div className="flex bg-[#1f1f23] rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setStepDirection('down')}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition ${
                    stepDirection === 'down' ? 'bg-[#d6f655] text-[#0e0e10]' : 'text-[#52525b]'
                  }`}
                >
                  ↓ Down
                </button>
                <button
                  type="button"
                  onClick={() => setStepDirection('up')}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition ${
                    stepDirection === 'up' ? 'bg-[#d6f655] text-[#0e0e10]' : 'text-[#52525b]'
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
              className="w-full px-3 py-2 rounded-xl bg-[#1f1f23] border border-[#26262b] font-mono text-sm font-bold text-white focus:ring-2 focus:ring-[#d6f655]"
            />

            <div className="grid grid-cols-4 gap-1 mt-1.5">
              {[0.1, 0.25, 0.5, 1.0].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStepSpacing(s)}
                  className={`py-1 rounded-md text-[9px] font-bold transition cursor-pointer text-center ${
                    stepSpacing === s ? 'bg-[#d6f655] text-[#0e0e10]' : 'bg-[#1f1f23] text-[#a1a1aa]'
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
              <label className="font-bold text-[#fafafa]">Orders</label>
              <span className="text-[10px] text-[#52525b] font-medium">Count</span>
            </div>

            <input
              type="number"
              min="1"
              max="25"
              inputMode="numeric"
              value={orderCount}
              onChange={(e) => setOrderCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-2 rounded-xl bg-[#1f1f23] border border-[#26262b] font-mono text-sm font-bold text-white focus:ring-2 focus:ring-[#d6f655]"
            />

            <div className="grid grid-cols-4 gap-1 mt-1.5">
              {[3, 5, 10, 15].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setOrderCount(cnt)}
                  className={`py-1 rounded-md text-[9px] font-bold transition cursor-pointer text-center ${
                    orderCount === cnt ? 'bg-[#d6f655] text-[#0e0e10]' : 'bg-[#1f1f23] text-[#a1a1aa]'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Order Summary + Review CTA */}
      <div className="bg-[#18181b] text-white rounded-2xl p-5 border border-[#26262b] space-y-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#52525b] uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-[#d6f655]" />
            <span>
              {isMarketOrder ? 'Live market execution' : 'Live price-triggered execution'}
            </span>
          </div>

          <div className="text-sm font-bold mt-1 text-[#fafafa] leading-snug">
            {isMarketOrder
              ? `Execute ${totalOrders} ${direction} market order(s) now at the live price.`
              : `Place ${totalOrders} ${direction} ${orderType} trigger(s) from ${startPrice.toFixed(selectedSymbol.decimals)} ${stepDirection} to ${endPrice.toFixed(selectedSymbol.decimals)}.`}
          </div>

          <div className="text-[11px] text-[#52525b] font-mono mt-1">
            Total volume: {totalVolume} lots · {isMarketOrder ? 'Executed immediately at market' : 'Placed on MT5 when the price is reached'}
          </div>
        </div>

        <button
          type="button"
          disabled={isDeploying}
          onClick={() => setShowReview(true)}
          className="w-full py-3.5 rounded-full bg-[#d6f655] hover:opacity-90 active:scale-98 text-[#0e0e10] font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
        >
          <span>Review & Arm · {totalOrders} order(s)</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Floating FOP (First Order Price) button */}
      <button
        type="button"
        onClick={() => setShowReview(true)}
        className="fixed bottom-24 right-4 z-40 flex flex-col items-center gap-1 cursor-pointer group"
        title="Review First Order Price"
      >
        <span className="w-14 h-14 rounded-full bg-[#d6f655] text-[#0e0e10] shadow-lg flex items-center justify-center group-active:scale-95 transition">
          <Calculator className="w-6 h-6" />
        </span>
        <span className="text-[9px] font-black tracking-widest text-[#d6f655]">FOP</span>
      </button>

      {/* Review Order overlay */}
      {showReview && (
        <div className="absolute inset-0 z-50 bg-[#0e0e10] flex flex-col" role="dialog" aria-label="Review order">
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-[#26262b]">
            <button
              type="button"
              onClick={() => setShowReview(false)}
              className="p-2 rounded-full bg-[#18181b] border border-[#26262b] text-[#a1a1aa] cursor-pointer"
              aria-label="Back to order desk"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-base font-black text-white tracking-tight">Review Order</h3>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Payment Summary */}
            <div className="rounded-2xl bg-[#18181b] border border-[#26262b] p-4 space-y-3">
              <p className="text-[10px] font-bold text-[#52525b] uppercase tracking-widest">Order Summary</p>
              {([
                ['Product Name', selectedSymbol.displayName],
                ['Action', ACTION_LABELS[tradeAction]],
                ['First Order Price', isMarketOrder ? 'Live market price' : startPrice.toFixed(selectedSymbol.decimals)],
                ['Number of Orders', String(totalOrders)],
                ['Total Volume', `${totalVolume} lots`],
                ...(!isMarketOrder ? [['Step Spacing', `${stepSpacing} ${stepDirection}`]] : []),
                ['MT5 Account', mt5Account ? mt5Account.login : 'Not connected'],
              ] as Array<[string, string]>).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-xs gap-3">
                  <span className="text-[#52525b] font-medium">{label}</span>
                  <span className="font-mono font-bold text-[#fafafa] text-right truncate">{value}</span>
                </div>
              ))}
            </div>

            {/* Locked action row */}
            <div className="flex items-center gap-3 rounded-2xl bg-[#18181b] border border-[#26262b] p-4">
              <span className="w-9 h-9 rounded-xl bg-[#1f1f23] flex items-center justify-center shrink-0">
                <Crosshair className="w-4 h-4 text-[#d6f655]" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{ACTION_LABELS[tradeAction]}</p>
                <p className="text-[10px] text-[#52525b]">Locked action · {selectedSymbol.symbol}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-[#d6f655] shrink-0" />
            </div>

            <p className="text-[10px] text-[#52525b] leading-relaxed px-1">
              {isMarketOrder
                ? 'Arming sends market orders to MT5 for immediate execution at the current price.'
                : 'Arming places pending orders on MT5. They trigger when the market reaches your levels.'}
            </p>
          </div>

          <div className="px-4 pb-6 pt-2 space-y-2 border-t border-[#26262b]">
            <button
              type="button"
              disabled={isDeploying}
              onClick={handleArm}
              className="w-full py-4 rounded-full bg-[#d6f655] text-[#0e0e10] font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 active:scale-98"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Placing to MT5…</span>
                </>
              ) : (
                <span>ARM · {totalOrders} order(s)</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowReview(false)}
              className="w-full py-2 text-xs font-bold text-[#52525b] hover:text-[#a1a1aa] cursor-pointer"
            >
              Back to desk
            </button>
          </div>
        </div>
      )}

      {/* Success overlay */}
      {deployResult && (
        <div className="absolute inset-0 z-50 bg-[#0e0e10] flex flex-col items-center justify-center px-6 text-center" role="dialog" aria-label="Orders armed">
          <div className="w-full max-w-sm space-y-5">
            <div className="flex flex-col items-center gap-3">
              <span className="w-16 h-16 rounded-full bg-[#d6f655] flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-[#0e0e10]" />
              </span>
              <h3 className="text-xl font-black text-white tracking-tight">Yay! Orders armed!</h3>
              <p className="text-xs text-[#a1a1aa] leading-relaxed">
                {deployResult.acceptedCount} accepted by MT5
                {deployResult.rejectedCount > 0 && ` · ${deployResult.rejectedCount} rejected`}
                {deployResult.waitingCount > 0 && ` · ${deployResult.waitingCount} pending EA confirmation`}.
              </p>
            </div>

            <div className="rounded-2xl bg-[#18181b] border border-[#26262b] p-4 space-y-2.5 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white truncate">
                  {selectedSymbol.displayName} · {ACTION_LABELS[tradeAction]}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest bg-[#d6f655]/15 text-[#d6f655] shrink-0">
                  {deployResult.orders[0]?.status === 'FAILED' ? 'REJECTED' : deployResult.orders[0]?.status ?? 'QUEUED'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#52525b]">First Order Price</span>
                <span className="font-mono font-bold text-[#fafafa]">
                  {isMarketOrder ? 'Market' : startPrice.toFixed(selectedSymbol.decimals)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#52525b]">Total Volume</span>
                <span className="font-mono font-bold text-[#fafafa]">{totalVolume} lots</span>
              </div>
              {deployResult.rejectionReason && (
                <p className="text-[10px] text-rose-400">{deployResult.rejectionReason}</p>
              )}
            </div>

            {deployResult.orders.length > 1 && (
              <div className="rounded-2xl bg-[#18181b] border border-[#26262b] p-4 space-y-2 text-left">
                <p className="text-[10px] font-bold text-[#52525b] uppercase tracking-widest">Other Orders</p>
                {deployResult.orders.slice(1, 6).map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold text-[#a1a1aa]">{order.price.toFixed(selectedSymbol.decimals)}</span>
                    <span className="text-[#52525b]">{order.lotSize} lots</span>
                    <span className="font-mono text-[10px] text-[#a1a1aa]">{order.status}</span>
                  </div>
                ))}
                {deployResult.orders.length > 6 && (
                  <p className="text-[10px] text-[#52525b]">+{deployResult.orders.length - 6} more in Orders</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setDeployResult(null);
                onSwitchToOrders?.();
              }}
              className="w-full py-4 rounded-full bg-[#d6f655] text-[#0e0e10] font-black text-sm cursor-pointer active:scale-98"
            >
              Go to Orders
            </button>
            <button
              type="button"
              onClick={() => setDeployResult(null)}
              className="w-full py-2 text-xs font-bold text-[#52525b] hover:text-[#a1a1aa] cursor-pointer"
            >
              Back to desk
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
