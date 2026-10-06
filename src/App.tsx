import React, { useState, useEffect, useRef } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { ConnectPortal } from './components/ConnectPortal';
import { HomeScreen } from './components/HomeScreen';
import { GridInputsScreen } from './components/GridInputsScreen';
import { OrdersScreen } from './components/OrdersScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { BottomNavBar, AppTab } from './components/BottomNavBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Mt5AccountsScreen } from './components/Mt5AccountsScreen';
import { derivService } from './services/derivWs';
import { getStoredMt5Account, StoredMt5Account } from './services/joemoneyMt5Api';
import { getMt5MidPrice } from './services/marketPrice';
import { useMt5Prices, toMt5Symbol } from './hooks/useMt5Prices';
import { DerivAccount, MarketSymbol, PlacedOrder, TradeNotice } from './types/trading';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

const SYMBOLS: MarketSymbol[] = SYMBOL_CATALOG;

import { SYMBOL_CATALOG } from './data/symbols';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');

  const [account, setAccount] = useState<DerivAccount>(derivService.getAccount());
  const [mt5Account, setMt5Account] = useState<StoredMt5Account | null>(() => getStoredMt5Account());
  const [selectedSymbol, setSelectedSymbol] = useState<MarketSymbol>(SYMBOLS[0]);
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [tradeNotice, setTradeNotice] = useState<TradeNotice | null>(null);
  const isMt5Route = window.location.pathname === '/mt5' || window.location.pathname === '/mt5-demo';

  // MT5 is the only supported market price source. A stale or missing quote is
  // not substituted with any external fallback.
  const { prices: mt5Prices } = useMt5Prices(mt5Account?.login);
  const mt5Price = getMt5MidPrice(mt5Prices, selectedSymbol.symbol);
  const mt5Quote = mt5Prices[toMt5Symbol(selectedSymbol.symbol)] ?? null;
  const mt5PriceAge = mt5Quote?.ageSec ?? null;
  const effectiveSpotPrice = mt5Price ?? 0;

  // Listen to Deriv account status
  useEffect(() => {
    const unsub = derivService.onStatusChange(() => {
      setAccount(derivService.getAccount());
    });
    return unsub;
  }, []);

  const handleSplashConnected = (acc: DerivAccount) => {
    setAccount(acc);
    setShowSplash(false);
    setActiveTab('home');
  };

  const handleMt5Connected = (mt5: StoredMt5Account) => {
    setMt5Account(mt5);
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
    setOrders((prev) => {
      const updates = new Map(newOrders.map((order) => [order.id, order]));
      const existing = prev.map((order) => updates.get(order.id) ?? order);
      const existingIds = new Set(prev.map((order) => order.id));
      return [...newOrders.filter((order) => !existingIds.has(order.id)), ...existing];
    });
    setActiveTab('orders');
  };

  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans selection:bg-slate-200">
      <OfflineIndicator />

      {isMt5Route ? (
        <Mt5AccountsScreen />
      ) : showSplash ? (
        <SplashScreen
          onConnected={handleSplashConnected}
          onMt5Connected={handleMt5Connected}
        />
      ) : (
        <div className="w-full max-w-md mx-auto min-h-screen bg-white flex flex-col relative">
          {/* Main App Screens */}
          <main className="flex-1 bg-white overflow-y-auto">
            {/* Tab 1: Home Dashboard (Screen 2 in ref image) */}
            {activeTab === 'home' && (
              <HomeScreen
                account={account}
                spotPrice={effectiveSpotPrice}
                selectedSymbol={selectedSymbol}
                mt5PriceAge={mt5PriceAge}
                mt5Account={mt5Account}
              />
            )}

            {/* Tab 2: Grid Inputs ($u, x, t, s, y, z$) */}
            {activeTab === 'grid' && (
              <GridInputsScreen
                account={account}
                mt5Account={mt5Account}
                spotPrice={effectiveSpotPrice}
                mt5PriceAge={mt5PriceAge}
                selectedSymbol={selectedSymbol}
                mt5Quote={mt5Quote}
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
                spotPrice={effectiveSpotPrice}
                mt5PriceAge={mt5PriceAge}
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
                        ? tradeNotice.errorMessage ? 'Partial execution' : 'Orders submitted'
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
                        <span className="font-semibold text-slate-800">
                          {trade.orderType ? `${trade.orderType.replace('_', ' ')} ` : `${trade.direction} `}{trade.symbol}
                        </span>
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
