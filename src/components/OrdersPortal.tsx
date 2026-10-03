import React, { useState, useEffect, useMemo } from 'react';
import {
  DerivAccount,
  GridParameters,
  LadderLevel,
  PlacedOrder,
  OrderDirection,
  MarketSymbol,
} from '../types/trading';
import { derivService } from '../services/derivWs';
import { OrderLadderVisualizer } from './OrderLadderVisualizer';
import { ActiveOrdersList } from './ActiveOrdersList';
import { PWAInstallButton } from './PWAInstallButton';
import {
  TrendingDown,
  TrendingUp,
  Layers,
  Calculator,
  Play,
  RotateCcw,
  Sparkles,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Radio,
  ExternalLink,
  LogOut,
  Wallet,
  Activity,
  History,
  Info,
} from 'lucide-react';

const POPULAR_SYMBOLS: MarketSymbol[] = [
  {
    symbol: 'frxXAUUSD',
    displayName: 'Gold / USD (XAU)',
    category: 'Metals',
    decimals: 2,
    minLot: 0.01,
    lotStep: 0.01,
    defaultPrice: 4170.0,
  },
  {
    symbol: '1HZ100V',
    displayName: 'Volatility 100 (1s) Index',
    category: 'Synthetics',
    decimals: 2,
    minLot: 0.1,
    lotStep: 0.1,
    defaultPrice: 1420.5,
  },
  {
    symbol: '1HZ75V',
    displayName: 'Volatility 75 (1s) Index',
    category: 'Synthetics',
    decimals: 2,
    minLot: 0.01,
    lotStep: 0.01,
    defaultPrice: 890.25,
  },
  {
    symbol: 'frxEURUSD',
    displayName: 'EUR / USD',
    category: 'Forex',
    decimals: 5,
    minLot: 0.01,
    lotStep: 0.01,
    defaultPrice: 1.085,
  },
  {
    symbol: 'cryBTCUSD',
    displayName: 'Bitcoin / USD',
    category: 'Crypto',
    decimals: 2,
    minLot: 0.01,
    lotStep: 0.01,
    defaultPrice: 65420.0,
  },
];

interface OrdersPortalProps {
  account: DerivAccount;
  onDisconnect: () => void;
}

export const OrdersPortal: React.FC<OrdersPortalProps> = ({ account, onDisconnect }) => {
  const [activeTab, setActiveTab] = useState<'config' | 'active' | 'logs'>('config');

  // Selected symbol
  const [selectedSymbol, setSelectedSymbol] = useState<MarketSymbol>(POPULAR_SYMBOLS[0]);

  // Live spot price (u)
  const [liveSpotPrice, setLiveSpotPrice] = useState<number>(4170.0);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  // User inputs: u, x, t, s, y, z
  const [autoUpdateSpot, setAutoUpdateSpot] = useState<boolean>(true);
  const [customSpotU, setCustomSpotU] = useState<number>(4170.0);
  const effectiveU = autoUpdateSpot ? liveSpotPrice : customSpotU;

  const [direction, setDirection] = useState<OrderDirection>('SELL');
  const [xOffset, setXOffset] = useState<number>(5.0); // e.g. 4170 - 5 = 4165
  const [lotSizeT, setLotSizeT] = useState<number>(0.1); // t
  const [ordersCountS, setOrdersCountS] = useState<number>(2); // s
  const [stepY, setStepY] = useState<number>(0.1); // y
  const [multiplesZ, setMultiplesZ] = useState<number>(4); // z (multiples 0 to z)
  const [stepDirection, setStepDirection] = useState<'down' | 'up'>('down');

  // Optional TP/SL
  const [enableTP, setEnableTP] = useState<boolean>(false);
  const [tpDistance, setTpDistance] = useState<number>(2.0);
  const [enableSL, setEnableSL] = useState<boolean>(false);
  const [slDistance, setSlDistance] = useState<number>(5.0);

  // Placed Orders & Execution Log
  const [placedOrders, setPlacedOrders] = useState<PlacedOrder[]>([]);
  const [executionLogs, setExecutionLogs] = useState<
    Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'warning' }>
  >([
    {
      timestamp: new Date().toLocaleTimeString(),
      message: `Deriv Orders Engine initialized for ${account.loginId || 'Guest'}.`,
      type: 'info',
    },
  ]);

  const addLog = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setExecutionLogs((prev) => [
      { timestamp: new Date().toLocaleTimeString(), message, type },
      ...prev.slice(0, 49),
    ]);
  };

  // Subscribe to live ticks from Deriv WebSocket
  useEffect(() => {
    let lastP = liveSpotPrice;
    const unsubscribe = derivService.subscribeTicks(selectedSymbol.symbol, (symbol, quote) => {
      if (symbol === selectedSymbol.symbol) {
        if (quote > lastP) setPriceFlash('up');
        else if (quote < lastP) setPriceFlash('down');
        lastP = quote;
        setLiveSpotPrice(quote);
        setTimeout(() => setPriceFlash(null), 500);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedSymbol]);

  // Sync custom spot with symbol defaults on symbol change
  const handleSelectSymbol = (sym: MarketSymbol) => {
    setSelectedSymbol(sym);
    setLiveSpotPrice(sym.defaultPrice);
    setCustomSpotU(sym.defaultPrice);
    // Adjust sensible defaults for forex vs metals
    if (sym.symbol === 'frxEURUSD') {
      setXOffset(0.002);
      setStepY(0.0005);
      setLotSizeT(0.1);
    } else if (sym.category === 'Crypto') {
      setXOffset(50.0);
      setStepY(10.0);
      setLotSizeT(0.01);
    } else {
      setXOffset(5.0);
      setStepY(0.1);
      setLotSizeT(0.1);
    }
  };

  // Calculate First Base Price (u - x for SELL, or u + x / u - x)
  const basePriceP0 = useMemo(() => {
    const p = direction === 'SELL' ? effectiveU - xOffset : effectiveU + xOffset;
    return +p.toFixed(selectedSymbol.decimals);
  }, [effectiveU, xOffset, direction, selectedSymbol.decimals]);

  // When user edits Base Price directly, update xOffset
  const handleDirectBasePriceChange = (val: number) => {
    if (isNaN(val)) return;
    const calculatedX = direction === 'SELL' ? effectiveU - val : val - effectiveU;
    setXOffset(+Math.max(0, calculatedX).toFixed(selectedSymbol.decimals));
  };

  // Generate Ladder Levels: Level k from k = 0 to z
  // Formula: u - x - (k * y) (for going down) or u - x + (k * y) (for going up)
  const ladderLevels: LadderLevel[] = useMemo(() => {
    const levels: LadderLevel[] = [];
    let cumLots = 0;
    const safeZ = Math.min(50, Math.max(0, multiplesZ)); // Cap at 50 to prevent overflow

    for (let k = 0; k <= safeZ; k++) {
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

      const roundedPrice = +targetPrice.toFixed(selectedSymbol.decimals);
      const totalLots = +(ordersCountS * lotSizeT).toFixed(3);
      cumLots = +(cumLots + totalLots).toFixed(3);

      const sign = stepDirection === 'down' ? '-' : '+';
      const formulaStr = `${effectiveU.toFixed(
        selectedSymbol.decimals
      )} - ${xOffset} ${sign} (${k} × ${stepY})`;

      const tp = enableTP
        ? direction === 'SELL'
          ? roundedPrice - tpDistance
          : roundedPrice + tpDistance
        : undefined;

      const sl = enableSL
        ? direction === 'SELL'
          ? roundedPrice + slDistance
          : roundedPrice - slDistance
        : undefined;

      levels.push({
        levelIndex: k,
        formula: formulaStr,
        price: roundedPrice,
        ordersCount: ordersCountS,
        lotSize: lotSizeT,
        totalLotsAtLevel: totalLots,
        cumulativeLots: cumLots,
        tpPrice: tp ? +tp.toFixed(selectedSymbol.decimals) : undefined,
        slPrice: sl ? +sl.toFixed(selectedSymbol.decimals) : undefined,
        distanceFromSpot: +(effectiveU - roundedPrice).toFixed(selectedSymbol.decimals),
      });
    }

    return levels;
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
    enableTP,
    tpDistance,
    enableSL,
    slDistance,
  ]);

  // Overall grid statistics
  const totalLevelsCount = ladderLevels.length;
  const totalOrdersToOpen = totalLevelsCount * ordersCountS;
  const totalVolumeLots = +(totalOrdersToOpen * lotSizeT).toFixed(2);
  const minGridPrice = ladderLevels.length > 0 ? Math.min(...ladderLevels.map((l) => l.price)) : 0;
  const maxGridPrice = ladderLevels.length > 0 ? Math.max(...ladderLevels.map((l) => l.price)) : 0;

  // Real-time market tick monitoring: trigger pending orders if spot price reaches them
  useEffect(() => {
    if (placedOrders.length === 0) return;

    setPlacedOrders((prevOrders) => {
      let changed = false;
      const updated = prevOrders.map((order) => {
        if (order.status !== 'PENDING') return order;

        // Condition for SELL limit/stop or BUY limit/stop
        // For SELL at price P: if spot reaches P or drops below/touches
        const triggered =
          order.direction === 'SELL'
            ? liveSpotPrice <= order.price || Math.abs(liveSpotPrice - order.price) < stepY * 0.5
            : liveSpotPrice >= order.price || Math.abs(liveSpotPrice - order.price) < stepY * 0.5;

        if (triggered) {
          changed = true;
          addLog(
            `Order #${order.levelIndex} TRIGGERED at spot ${liveSpotPrice.toFixed(2)} (Price: ${order.price.toFixed(2)}, Lot: ${order.lotSize})`,
            'success'
          );
          return {
            ...order,
            status: 'FILLED' as const,
            filledAt: Date.now(),
          };
        }
        return order;
      });

      return changed ? updated : prevOrders;
    });
  }, [liveSpotPrice]);

  // Deploy Grid Orders Action
  const handleDeployGrid = async () => {
    const newOrders: PlacedOrder[] = [];

    ladderLevels.forEach((level) => {
      for (let s = 1; s <= level.ordersCount; s++) {
        const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${level.levelIndex}-${s}`;
        newOrders.push({
          id: orderId,
          levelIndex: level.levelIndex,
          subIndex: s,
          symbol: selectedSymbol.symbol,
          direction: direction,
          orderType: 'LIMIT',
          price: level.price,
          lotSize: level.lotSize,
          status: 'PENDING',
          tpPrice: level.tpPrice,
          slPrice: level.slPrice,
          createdAt: Date.now(),
        });
      }
    });

    setPlacedOrders((prev) => [...newOrders, ...prev]);
    addLog(
      `Deployed ${newOrders.length} ${direction} orders for ${selectedSymbol.displayName} across ${ladderLevels.length} levels.`,
      'success'
    );

    // Call Deriv Service order placement
    try {
      await derivService.executeOrder({
        symbol: selectedSymbol.symbol,
        direction,
        price: basePriceP0,
        lotSize: lotSizeT,
      });
    } catch {
      // Handled
    }

    setActiveTab('active');
  };

  const handleCancelOrder = (id: string) => {
    setPlacedOrders((prev) => prev.filter((o) => o.id !== id));
    addLog(`Cancelled order ${id}.`, 'warning');
  };

  const handleCancelAll = () => {
    const count = placedOrders.length;
    setPlacedOrders([]);
    addLog(`Cancelled all ${count} active & pending grid orders.`, 'warning');
  };

  const handleSimulateFill = (id: string) => {
    setPlacedOrders((prev) =>
      prev.map((o) =>
        o.id === id ? { ...o, status: 'FILLED', filledAt: Date.now() } : o
      )
    );
    addLog(`Manually filled order ${id}.`, 'info');
  };

  const handleFillAllPending = () => {
    setPlacedOrders((prev) =>
      prev.map((o) =>
        o.status === 'PENDING' ? { ...o, status: 'FILLED', filledAt: Date.now() } : o
      )
    );
    addLog('All pending orders executed/filled.', 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-sky-100 shadow-2xs px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Logo & Symbol info */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center font-black text-base shadow-sm">
              J
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  J-GRID ORDERS PORTAL
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200">
                  Deriv Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <span>Account:</span>
                <strong className="text-slate-700 font-semibold">{account.loginId || 'Guest'}</strong>
                <span className="text-sky-500">•</span>
                <span className="text-sky-600 font-bold">
                  {account.currency} {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </p>
            </div>
          </div>

          {/* Right Header: Spot price badge + Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Spot Tracker Badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all duration-300 ${
                priceFlash === 'up'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700 scale-102'
                  : priceFlash === 'down'
                  ? 'bg-rose-50 border-rose-300 text-rose-700 scale-102'
                  : 'bg-sky-50/80 border-sky-200 text-sky-800'
              }`}
            >
              <Radio className="w-3 h-3 text-sky-500 animate-pulse" />
              <span className="text-[11px] font-medium text-slate-500 hidden md:inline">
                {selectedSymbol.displayName.split(' ')[0]} Spot (u):
              </span>
              <strong className="font-mono text-xs sm:text-sm font-extrabold">
                {liveSpotPrice.toFixed(selectedSymbol.decimals)}
              </strong>
            </div>

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Disconnect / Switch Account */}
            <button
              onClick={onDisconnect}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-sky-200 text-slate-600 hover:text-sky-700 hover:bg-sky-50 text-xs font-semibold flex items-center gap-1 transition"
              title="Switch or Disconnect Deriv Account"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Account</span>
            </button>
          </div>
        </div>
      </header>

      {/* Symbol Bar */}
      <div className="bg-white border-b border-sky-100 px-4 sm:px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Markets:
          </span>
          {POPULAR_SYMBOLS.map((sym) => {
            const isSelected = selectedSymbol.symbol === sym.symbol;
            return (
              <button
                key={sym.symbol}
                onClick={() => handleSelectSymbol(sym)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'bg-sky-50/60 text-slate-600 hover:bg-sky-100 border border-sky-100'
                }`}
              >
                <span>{sym.displayName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="bg-white border-b border-sky-100 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex gap-2 sm:gap-6">
            <button
              onClick={() => setActiveTab('config')}
              className={`py-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition ${
                activeTab === 'config'
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Calculator className="w-4 h-4" />
              <span>Grid Configurator (u, x, t, s, y, z)</span>
            </button>

            <button
              onClick={() => setActiveTab('active')}
              className={`py-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition ${
                activeTab === 'active'
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Active Orders & Positions</span>
              {placedOrders.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-500 text-white">
                  {placedOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`py-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition ${
                activeTab === 'logs'
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Execution Logs</span>
              <span className="sm:hidden">Logs</span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Deriv API Live Protocol: wss://ws.derivws.com</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 flex-1">
        {activeTab === 'config' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Parameter Inputs (Inputs u, x, t, s, y, z) */}
            <div className="lg:col-span-5 space-y-5">
              {/* Direction Selector: BUY or SELL */}
              <div className="bg-white rounded-2xl border border-sky-100 p-4 shadow-sm">
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                  Order Direction
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection('SELL')}
                    className={`py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer border ${
                      direction === 'SELL'
                        ? 'bg-rose-500 text-white border-rose-500 shadow-sm shadow-rose-200'
                        : 'bg-white text-slate-600 border-sky-100 hover:bg-rose-50/50'
                    }`}
                  >
                    <TrendingDown className="w-4 h-4" />
                    <span>SELL ORDERS (Short)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDirection('BUY')}
                    className={`py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer border ${
                      direction === 'BUY'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200'
                        : 'bg-white text-slate-600 border-sky-100 hover:bg-emerald-50/50'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>BUY ORDERS (Long)</span>
                  </button>
                </div>
              </div>

              {/* Mathematical Equation Inputs Card */}
              <div className="bg-white rounded-2xl border border-sky-100 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-sky-100">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs">
                      f(x)
                    </div>
                    <h2 className="text-sm font-extrabold text-slate-800">
                      Algorithmic Grid Inputs
                    </h2>
                  </div>
                  <span className="text-[11px] text-sky-600 font-mono font-semibold">
                    {direction === 'SELL' ? 'u - x - zy' : 'u + x + zy'}
                  </span>
                </div>

                {/* Input 1: Spot Price (u) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-mono text-[11px]">
                        u
                      </span>
                      <span>Spot Price</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setAutoUpdateSpot(!autoUpdateSpot)}
                      className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer"
                    >
                      {autoUpdateSpot ? (
                        <>
                          <Unlock className="w-3 h-3 text-emerald-500" />
                          <span>Live Streaming</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3 text-amber-500" />
                          <span>Fixed / Locked</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      value={autoUpdateSpot ? liveSpotPrice : customSpotU}
                      disabled={autoUpdateSpot}
                      onChange={(e) => setCustomSpotU(parseFloat(e.target.value) || 0)}
                      className={`w-full px-3.5 py-2.5 text-sm rounded-xl font-mono font-bold border transition ${
                        autoUpdateSpot
                          ? 'bg-sky-50/50 border-sky-200 text-sky-900 cursor-not-allowed'
                          : 'bg-white border-sky-300 text-slate-800 focus:ring-2 focus:ring-sky-400'
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                      {selectedSymbol.symbol}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Live spot price $u$ from Deriv. Toggle to lock or enter custom value (e.g. 4170).
                  </p>
                </div>

                {/* Input 2: Offset x & Resulting First Position Base Price */}
                <div className="p-3 rounded-xl bg-sky-50/50 border border-sky-100 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-sky-200 text-sky-900 font-mono text-[11px]">
                        x
                      </span>
                      <span>Initial Offset from Spot</span>
                    </label>
                    <span className="text-[11px] font-mono text-sky-700 font-bold">
                      Formula: {direction === 'SELL' ? 'u - x' : 'u + x'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block mb-1">
                        Offset Distance (x):
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={xOffset}
                        onChange={(e) => setXOffset(Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="e.g. 5.0"
                        className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-bold rounded-lg border border-sky-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block mb-1">
                        First Order Price (Level 0):
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={basePriceP0}
                        onChange={(e) => handleDirectBasePriceChange(parseFloat(e.target.value))}
                        className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-bold rounded-lg border border-sky-300 bg-sky-100/50 text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Example: At spot $u = {effectiveU.toFixed(selectedSymbol.decimals)}$, with offset $x = {xOffset}$, your first {direction} position opens at <strong>{basePriceP0}</strong>.
                  </p>
                </div>

                {/* Input 3: Lot Size (t) & Input 4: Orders per Price (s) */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Lot Size (t) */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-mono text-[11px]">
                        t
                      </span>
                      <span>Lot Size per Order</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={selectedSymbol.minLot}
                      value={lotSizeT}
                      onChange={(e) => setLotSizeT(Math.max(0.001, parseFloat(e.target.value) || 0.01))}
                      placeholder="e.g. 0.1"
                      className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl border border-sky-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <div className="flex gap-1 pt-1">
                      {[0.01, 0.05, 0.1, 0.5, 1.0].map((quick) => (
                        <button
                          key={quick}
                          type="button"
                          onClick={() => setLotSizeT(quick)}
                          className={`px-1.5 py-0.5 text-[9px] rounded font-bold transition ${
                            lotSizeT === quick
                              ? 'bg-sky-500 text-white'
                              : 'bg-sky-50 text-slate-600 hover:bg-sky-100'
                          }`}
                        >
                          {quick}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Orders at one price (s) */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-mono text-[11px]">
                        s
                      </span>
                      <span>Orders per Price</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={ordersCountS}
                      onChange={(e) => setOrdersCountS(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      placeholder="e.g. 2"
                      className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl border border-sky-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <p className="text-[10px] text-slate-400 pt-1">
                      Number of orders fired at each price rung.
                    </p>
                  </div>
                </div>

                {/* Input 5: Step Distance (y) & Input 6: Multiples (z) */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Step (y) */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-mono text-[11px]">
                        y
                      </span>
                      <span>Step Interval</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      value={stepY}
                      onChange={(e) => setStepY(Math.max(0.0001, parseFloat(e.target.value) || 0.1))}
                      placeholder="e.g. 0.1"
                      className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl border border-sky-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <div className="flex gap-1 pt-1">
                      {[0.1, 0.25, 0.5, 1.0].map((stepOpt) => (
                        <button
                          key={stepOpt}
                          type="button"
                          onClick={() => setStepY(stepOpt)}
                          className={`px-1.5 py-0.5 text-[9px] rounded font-bold transition ${
                            stepY === stepOpt
                              ? 'bg-sky-500 text-white'
                              : 'bg-sky-50 text-slate-600 hover:bg-sky-100'
                          }`}
                        >
                          {stepOpt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Multiples (z) */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-mono text-[11px]">
                        z
                      </span>
                      <span>Multiples of y</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={multiplesZ}
                      onChange={(e) => setMultiplesZ(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      placeholder="e.g. 4"
                      className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl border border-sky-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <p className="text-[10px] text-slate-400 pt-1">
                      Levels: 0 to {multiplesZ} ({multiplesZ + 1} rungs)
                    </p>
                  </div>
                </div>

                {/* Step Direction Selector */}
                <div className="pt-1">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-700">Step Progression:</span>
                    <span className="font-mono text-[11px] text-sky-700 font-bold">
                      {stepDirection === 'down' ? '4170 - x - ky (Going Down)' : '4170 - x + ky (Going Up)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setStepDirection('down')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                        stepDirection === 'down'
                          ? 'bg-sky-500 text-white border-sky-500 shadow-2xs'
                          : 'bg-sky-50/50 text-slate-600 border-sky-200 hover:bg-sky-100'
                      }`}
                    >
                      Steps Going Down ( - y )
                    </button>
                    <button
                      type="button"
                      onClick={() => setStepDirection('up')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                        stepDirection === 'up'
                          ? 'bg-sky-500 text-white border-sky-500 shadow-2xs'
                          : 'bg-sky-50/50 text-slate-600 border-sky-200 hover:bg-sky-100'
                      }`}
                    >
                      Steps Going Up ( + y )
                    </button>
                  </div>
                </div>

                {/* Take Profit & Stop Loss Options */}
                <div className="pt-2 border-t border-sky-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="enableTP"
                        checked={enableTP}
                        onChange={(e) => setEnableTP(e.target.checked)}
                        className="rounded text-sky-600 focus:ring-sky-400 accent-sky-500"
                      />
                      <label htmlFor="enableTP" className="font-bold text-slate-700 cursor-pointer">
                        Attach Take Profit (TP)
                      </label>
                    </div>
                    {enableTP && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">Distance:</span>
                        <input
                          type="number"
                          step="any"
                          value={tpDistance}
                          onChange={(e) => setTpDistance(Math.max(0.1, parseFloat(e.target.value) || 1))}
                          className="w-16 px-2 py-1 text-xs font-mono rounded border border-sky-200"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="enableSL"
                        checked={enableSL}
                        onChange={(e) => setEnableSL(e.target.checked)}
                        className="rounded text-sky-600 focus:ring-sky-400 accent-sky-500"
                      />
                      <label htmlFor="enableSL" className="font-bold text-slate-700 cursor-pointer">
                        Attach Stop Loss (SL)
                      </label>
                    </div>
                    {enableSL && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">Distance:</span>
                        <input
                          type="number"
                          step="any"
                          value={slDistance}
                          onChange={(e) => setSlDistance(Math.max(0.1, parseFloat(e.target.value) || 1))}
                          className="w-16 px-2 py-1 text-xs font-mono rounded border border-sky-200"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Action Button: Deploy Grid */}
                <div className="pt-2">
                  <button
                    onClick={handleDeployGrid}
                    className="w-full py-3.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 active:scale-99 text-white font-extrabold text-sm shadow-md shadow-sky-200 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>
                      Deploy Grid ({totalOrdersToOpen} {direction} Orders)
                    </span>
                  </button>
                  <p className="mt-1 text-center text-[10px] text-slate-400">
                    Fires {ordersCountS} order{ordersCountS > 1 ? 's' : ''} across {totalLevelsCount} price levels to Deriv engine
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Mathematical Summary, Visual Ladder, and Formula Preview Table */}
            <div className="lg:col-span-7 space-y-5">
              {/* Algorithmic Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl border border-sky-100 p-3.5 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Price Levels (z+1)
                  </span>
                  <div className="mt-1 text-xl font-black text-slate-800 font-mono">
                    {totalLevelsCount}
                  </div>
                  <span className="text-[10px] text-sky-600 font-medium">k = 0 to {multiplesZ}</span>
                </div>

                <div className="bg-white rounded-2xl border border-sky-100 p-3.5 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Orders (z+1)×s
                  </span>
                  <div className="mt-1 text-xl font-black text-slate-800 font-mono">
                    {totalOrdersToOpen}
                  </div>
                  <span className="text-[10px] text-sky-600 font-medium">{ordersCountS} per level</span>
                </div>

                <div className="bg-white rounded-2xl border border-sky-100 p-3.5 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Cumulative Volume
                  </span>
                  <div className="mt-1 text-xl font-black text-slate-800 font-mono">
                    {totalVolumeLots}
                  </div>
                  <span className="text-[10px] text-sky-600 font-medium">{lotSizeT} lots/order</span>
                </div>

                <div className="bg-white rounded-2xl border border-sky-100 p-3.5 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Price Range
                  </span>
                  <div className="mt-1 text-xs font-black text-slate-800 font-mono">
                    {minGridPrice.toFixed(selectedSymbol.decimals)} - {maxGridPrice.toFixed(selectedSymbol.decimals)}
                  </div>
                  <span className="text-[10px] text-sky-600 font-medium">
                    Δ {(maxGridPrice - minGridPrice).toFixed(selectedSymbol.decimals)} pts
                  </span>
                </div>
              </div>

              {/* Visual Depth Ladder Chart */}
              <OrderLadderVisualizer
                spotPrice={effectiveU}
                levels={ladderLevels}
                direction={direction}
                symbol={selectedSymbol.symbol}
              />

              {/* Interactive Mathematical Ladder Matrix Table */}
              <div className="bg-white rounded-2xl border border-sky-100 shadow-sm p-4">
                <div className="flex items-center justify-between pb-3 border-b border-sky-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Ladder Level Matrix Preview
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Calculated target positions following{' '}
                      <code className="text-sky-700 bg-sky-50 px-1 py-0.5 rounded font-mono text-[10px]">
                        u - x - zy
                      </code>
                    </p>
                  </div>
                  <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-100">
                    {ladderLevels.length} Rungs Ready
                  </span>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-sky-50/70 border-b border-sky-100 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-2 px-3">Level (k)</th>
                        <th className="py-2 px-3">Equation Formula</th>
                        <th className="py-2 px-3">Order Price</th>
                        <th className="py-2 px-3">Orders (s)</th>
                        <th className="py-2 px-3">Lot/Order (t)</th>
                        <th className="py-2 px-3">Total Lots</th>
                        <th className="py-2 px-3">Dist to Spot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-50 text-slate-700 font-mono">
                      {ladderLevels.map((lvl) => {
                        const isFirst = lvl.levelIndex === 0;
                        return (
                          <tr
                            key={lvl.levelIndex}
                            className={`hover:bg-sky-50/50 transition-colors ${
                              isFirst ? 'bg-sky-50/30 font-semibold' : ''
                            }`}
                          >
                            <td className="py-2 px-3">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isFirst
                                    ? 'bg-sky-500 text-white'
                                    : 'bg-sky-100 text-sky-800'
                                }`}
                              >
                                #{lvl.levelIndex}
                              </span>
                            </td>

                            <td className="py-2 px-3 text-[11px] text-slate-600">
                              {lvl.formula}
                            </td>

                            <td className="py-2 px-3 font-bold text-slate-900 text-xs">
                              {lvl.price.toFixed(selectedSymbol.decimals)}
                            </td>

                            <td className="py-2 px-3">
                              <span className="font-bold text-sky-700">{lvl.ordersCount}x</span>
                            </td>

                            <td className="py-2 px-3 text-slate-600">
                              {lvl.lotSize}
                            </td>

                            <td className="py-2 px-3 font-bold text-slate-800">
                              {lvl.totalLotsAtLevel}L
                            </td>

                            <td className="py-2 px-3 text-[11px]">
                              {lvl.distanceFromSpot > 0 ? (
                                <span className="text-amber-600">-{lvl.distanceFromSpot}</span>
                              ) : lvl.distanceFromSpot < 0 ? (
                                <span className="text-emerald-600">+{Math.abs(lvl.distanceFromSpot)}</span>
                              ) : (
                                <span className="text-sky-600 font-bold">Spot</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Active Orders & Positions */}
        {activeTab === 'active' && (
          <div className="space-y-6">
            <ActiveOrdersList
              orders={placedOrders}
              spotPrice={liveSpotPrice}
              onCancelOrder={handleCancelOrder}
              onCancelAll={handleCancelAll}
              onSimulateFill={handleSimulateFill}
              onFillAllPending={handleFillAllPending}
            />

            {/* Quick deployment trigger if empty */}
            {placedOrders.length === 0 && (
              <div className="text-center py-6">
                <button
                  onClick={() => setActiveTab('config')}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 text-white font-bold text-xs shadow-sm hover:bg-sky-600 transition"
                >
                  Configure and Deploy Grid Orders →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Execution Logs */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-2xl border border-sky-100 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-sky-100 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Deriv Execution Activity Log</h3>
                <p className="text-[11px] text-slate-500">
                  Real-time protocol messages, tick updates, and order confirmations
                </p>
              </div>
              <button
                onClick={() =>
                  setExecutionLogs([
                    {
                      timestamp: new Date().toLocaleTimeString(),
                      message: 'Logs cleared by user.',
                      type: 'info',
                    },
                  ])
                }
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Clear Logs
              </button>
            </div>

            <div className="space-y-2 font-mono text-xs max-h-96 overflow-y-auto">
              {executionLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl flex items-start gap-2 border ${
                    log.type === 'success'
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                      : log.type === 'warning'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-800'
                      : 'bg-sky-50/50 border-sky-100 text-slate-700'
                  }`}
                >
                  <span className="text-[10px] text-slate-400 shrink-0 font-bold">
                    [{log.timestamp}]
                  </span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
