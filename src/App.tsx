import React, { useState, useEffect, useRef } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { ConnectPortal } from './components/ConnectPortal';
import { HomeScreen } from './components/HomeScreen';
import { GridInputsScreen } from './components/GridInputsScreen';
import { OrdersScreen } from './components/OrdersScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { BottomNavBar, AppTab } from './components/BottomNavBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { derivService } from './services/derivWs';
import { DerivAccount, MarketSymbol, PlacedOrder, TradeNotice } from './types/trading';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

const SYMBOLS: MarketSymbol[] = [
  {
    symbol: '1HZ100V',
    displayName: 'Volatility 100 (24/7)',
    category: 'Synthetics',
    decimals: 2,
    minLot: 0.1,
    lotStep: 0.1,
    defaultPrice: 1420.5,
  },
  {
    symbol: '1HZ75V',
    displayName: 'Volatility 75 (24/7)',
    category: 'Synthetics',
    decimals: 2,
    minLot: 0.01,
    lotStep: 0.01,
    defaultPrice: 890.25,
  },
  {
    symbol: 'frxXAUUSD',
    displayName: 'Gold / USD',
    category: 'Metals',
    decimals: 2,
    minLot: 0.01,
    lotStep: 0.01,
    defaultPrice: 2653.0,
  },
  {
    symbol: 'cryBTCUSD',
    displayName: 'Bitcoin / USD (24/7)',
    category: 'Crypto',
    decimals: 2,
    minLot: 0.01,
    lotStep: 0.01,
    defaultPrice: 65420.0,
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
];

import { PWAInstallGate } from './components/PWAInstallGate';

const checkIsStandalone = () => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
};

export default function App() {
  const [isStandalone, setIsStandalone] = useState<boolean>(checkIsStandalone);
  const [showSplash, setShowSplash] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');

  // React to standalone display-mode changes dynamically
  useEffect(() => {
    const handleModeChange = () => {
      setIsStandalone(checkIsStandalone());
    };
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', handleModeChange);
    window.addEventListener('appinstalled', handleModeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleModeChange);
      window.removeEventListener('appinstalled', handleModeChange);
    };
  }, []);

  const [account, setAccount] = useState<DerivAccount>(derivService.getAccount());
  const [selectedSymbol, setSelectedSymbol] = useState<MarketSymbol>(SYMBOLS[0]);
  const [spotPrice, setSpotPrice] = useState<number>(1420.5);
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [tradeNotice, setTradeNotice] = useState<TradeNotice | null>(null);
  const executingOrderIds = useRef(new Set<string>());

  // Listen to Deriv account status
  useEffect(() => {
    const unsub = derivService.onStatusChange(() => {
      setAccount(derivService.getAccount());
    });
    return unsub;
  }, []);

  // Subscribe to live ticks
  useEffect(() => {
    const unsub = derivService.subscribeTicks(selectedSymbol.symbol, (sym, quote) => {
      if (sym === selectedSymbol.symbol) {
        setSpotPrice(quote);
      }
    });
    return unsub;
  }, [selectedSymbol]);

  // Execute client-selected limit/stop triggers only after the live quote reaches their level.
  useEffect(() => {
    if (orders.length === 0) return;

    const triggeringOrders = orders.filter((order) => {
      if (
        order.status !== 'PENDING' ||
        order.orderType === 'MARKET_GRID' ||
        executingOrderIds.current.has(order.id)
      ) return false;
      if (order.direction === 'BUY') {
        return order.orderType === 'LIMIT' ? spotPrice <= order.price : spotPrice >= order.price;
      }
      return order.orderType === 'LIMIT' ? spotPrice >= order.price : spotPrice <= order.price;
    });
    if (triggeringOrders.length === 0) return;

    triggeringOrders.forEach((order) => executingOrderIds.current.add(order.id));
    const triggeringIds = new Set(triggeringOrders.map((order) => order.id));
    setOrders((previous) => previous.map((order) =>
      triggeringIds.has(order.id) && order.status === 'PENDING'
        ? { ...order, status: 'TRIGGERED' }
        : order
    ));

    void Promise.all(triggeringOrders.map(async (order) => {
      try {
        const result = await derivService.executeRealTrade({
          symbol: order.symbol,
          direction: order.direction,
          price: order.price,
          lotSize: order.lotSize,
          orderType: order.orderType,
        });
        return { order, result };
      } catch (error) {
        return {
          order,
          result: {
            success: false,
            contractId: '',
            message: error instanceof Error ? error.message : 'Deriv trade execution failed.',
          },
        };
      }
    })).then((results) => {
      triggeringOrders.forEach((order) => executingOrderIds.current.delete(order.id));
      const openedResults = results.filter(({ result }) => result.success && result.contractId);
      const failedResults = results.filter(({ result }) => !result.success || !result.contractId);
      const openedTrades: TradeNotice['trades'] = openedResults.map(({ order, result }) => ({
        symbol: order.symbol,
        direction: order.direction,
        price: spotPrice,
        lotSize: order.lotSize,
        contractId: result.contractId,
      }));
      const completedAt = Date.now();

      setOrders((previous) => previous.map((order) => {
        const outcome = results.find(({ order: triggered }) => triggered.id === order.id);
        if (!outcome) return order;
        if (outcome.result.success && outcome.result.contractId) {
          return {
            ...order,
            status: 'FILLED',
            filledAt: completedAt,
            derivContractId: outcome.result.contractId,
          };
        }
        return { ...order, status: 'FAILED' };
      }));

      const errorMessage = failedResults
        .map(({ result }) => result.message || 'Deriv did not open the trade.')
        .join(' ');
      setTradeNotice({
        success: openedTrades.length > 0,
        message: failedResults.length > 0
          ? `${openedTrades.length} trade(s) opened; ${failedResults.length} failed.`
          : `${openedTrades.length} price-triggered trade(s) opened on Deriv.`,
        errorMessage: errorMessage || undefined,
        trades: openedTrades,
      });
    });
  }, [orders, spotPrice]);

  const handleSplashConnected = (acc: DerivAccount) => {
    setAccount(acc);
    setShowSplash(false);
    setActiveTab('home');
  };

  const handleDisconnect = () => {
    derivService.clearToken();
    setAccount(derivService.getAccount());
    setShowSplash(true);
    setActiveTab('home');
  };

  const handleDeployOrders = (newOrders: PlacedOrder[]) => {
    setOrders((prev) => [...newOrders, ...prev]);
    setActiveTab('orders');
  };

  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans selection:bg-slate-200">
      <OfflineIndicator />

      {/* PWA Gate: Only when opened as PWA (standalone) can users access the app */}
      {!isStandalone ? (
        <PWAInstallGate
          onCheckStatus={() => setIsStandalone(checkIsStandalone())}
        />
      ) : showSplash ? (
        <SplashScreen
          onConnected={handleSplashConnected}
        />
      ) : (
        <div className="w-full max-w-md mx-auto min-h-screen bg-white flex flex-col relative">
          {/* Main App Screens */}
          <main className="flex-1 bg-white overflow-y-auto">
            {/* Tab 1: Home Dashboard (Screen 2 in ref image) */}
            {activeTab === 'home' && (
              <HomeScreen
                account={account}
                spotPrice={spotPrice}
                selectedSymbol={selectedSymbol}
                onDeployOrder={(order) => setOrders((prev) => [order, ...prev])}
                onTradeNotice={setTradeNotice}
              />
            )}

            {/* Tab 2: Grid Inputs ($u, x, t, s, y, z$) */}
            {activeTab === 'grid' && (
              <GridInputsScreen
                account={account}
                spotPrice={spotPrice}
                selectedSymbol={selectedSymbol}
                onSelectSymbol={setSelectedSymbol}
                symbols={SYMBOLS}
                onDeployOrders={handleDeployOrders}
                onTradeNotice={setTradeNotice}
              />
            )}

            {/* Tab 3: Orders Desk */}
            {activeTab === 'orders' && (
              <OrdersScreen
                orders={orders}
                spotPrice={spotPrice}
                onCancelOrder={(id) => setOrders((prev) => prev.filter((o) => o.id !== id))}
                onCancelAll={() => setOrders((prev) => prev.filter((o) => o.status === 'FILLED'))}
                onClosePosition={async (id) => {
                  const target = orders.find((o) => o.id === id);
                  if (target?.derivContractId) {
                    await derivService.closeRealPosition(String(target.derivContractId));
                  }
                  setOrders((prev) => prev.filter((o) => o.id !== id));
                }}
                onBulkCloseAll={async () => {
                  const contractIds = orders
                    .filter((o) => o.derivContractId)
                    .map((o) => String(o.derivContractId));
                  if (contractIds.length > 0) {
                    await derivService.bulkClosePositions(contractIds);
                  }
                  setOrders([]);
                }}
                onSwitchToGrid={() => setActiveTab('grid')}
              />
            )}

            {/* Tab 4: Account / Profile (Screen 3 in ref image) */}
            {activeTab === 'profile' && (
              <ProfileScreen
                account={account}
                onOpenConnect={() => setShowConnectModal(true)}
                onDisconnect={() => {
                  derivService.clearToken();
                  setAccount(derivService.getAccount());
                  setShowConnectModal(true);
                }}
              />
            )}
          </main>

          {/* Bottom Navigation Bar matching reference image */}
          <BottomNavBar
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            pendingCount={pendingCount}
          />

          {/* OAuth account switch modal */}
          {showConnectModal && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
              <ConnectPortal
                currentAccount={account}
                onCancel={() => setShowConnectModal(false)}
              />
            </div>
          )}

          {tradeNotice && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="presentation">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="trade-result-title"
                className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {tradeNotice.success
                      ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                      : <CircleAlert className="h-5 w-5 shrink-0 text-rose-600" />}
                    <h2 id="trade-result-title" className="text-base font-bold text-slate-900">
                      {tradeNotice.success
                        ? tradeNotice.errorMessage ? 'Partial execution' : 'Trades opened'
                        : 'Trade not opened'}
                    </h2>
                  </div>
                  <button type="button" onClick={() => setTradeNotice(null)} className="p-1 text-slate-400 hover:text-slate-800" aria-label="Close dialog">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-700">{tradeNotice.message}</p>
                {(!tradeNotice.success || tradeNotice.errorMessage) && (
                  <p className="mt-2 text-xs text-slate-500">
                    {tradeNotice.errorMessage || tradeNotice.message} The market may be closed for the weekend or outside this symbol's trading hours.
                  </p>
                )}
                {tradeNotice.trades.length > 0 && (
                  <div className="mt-4 max-h-48 space-y-2 overflow-y-auto border-y border-slate-100 py-3">
                    {tradeNotice.trades.map((trade, index) => (
                      <div key={`${trade.contractId || trade.symbol}-${index}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800">{trade.direction} {trade.symbol}</span>
                        <span className="text-right font-mono text-slate-500">
                          {trade.lotSize} lots{trade.contractId ? ` · #${trade.contractId}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  {tradeNotice.trades.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setTradeNotice(null); setActiveTab('orders'); }}
                      className="flex-1 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
                    >
                      View open trades
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTradeNotice(null)}
                    className="rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
