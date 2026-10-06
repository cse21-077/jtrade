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
import { clearStoredMt5Account, closeMt5Positions, deactivateMt5Account, getMentorToken, getMt5Close, getMt5Positions, getStoredMt5Account, StoredMt5Account } from './services/joemoneyMt5Api';
import { getMt5MidPrice } from './services/marketPrice';
import { getMt5Quote, useMt5Prices } from './hooks/useMt5Prices';
import { DerivAccount, MarketSymbol, PlacedOrder, TradeNotice } from './types/trading';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

const SYMBOLS: MarketSymbol[] = SYMBOL_CATALOG;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pollMt5Close = async (token: string, closeId: string): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await getMt5Close(token, closeId);
    if (result.status === 'closed') return;
    if (result.status === 'failed') {
      throw new Error(result.result_message || 'MT5 rejected the close request.');
    }
    await wait(1000);
  }
  throw new Error('Timed out waiting for MT5 to confirm the close. Check the Orders page before retrying.');
};

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
  // not substituted with any external fallback. Prices are fetched across every
  // connected account (no login filter) so e.g. a synthetic account feeds the
  // Volatility indices while a financial account feeds gold/forex at the same
  // time; the hook keeps the freshest quote per symbol name.
  const { prices: mt5Prices } = useMt5Prices();
  const mt5Quote = getMt5Quote(mt5Prices, selectedSymbol.symbol);
  const mt5Price = mt5Quote && mt5Quote.ageSec < 60
    ? (mt5Quote.bid + mt5Quote.ask) / 2
    : null;
  const mt5PriceAge = mt5Quote?.ageSec ?? null;
  const effectiveSpotPrice = mt5Price ?? 0;

  // Listen to Deriv account status
  useEffect(() => {
    const unsub = derivService.onStatusChange(() => {
      setAccount(derivService.getAccount());
    });
    return unsub;
  }, []);

  // Fill detection: the EA snapshots open positions in its price report, so a
  // pending limit/stop order whose ticket appears as a position has filled and
  // becomes closable from the Orders page.
  useEffect(() => {
    if (!mt5Account) return;
    const timer = window.setInterval(async () => {
      try {
        const { positions } = await getMt5Positions(getMentorToken(), mt5Account.login);
        if (positions.length === 0) return;
        const tickets = new Set(positions.map((position) => position.ticket));
        setOrders((prev) => prev.map((order) =>
          (order.status === 'PENDING' || order.status === 'CLAIMED') &&
          order.mt5Ticket && tickets.has(String(order.mt5Ticket))
            ? { ...order, status: 'FILLED', filledAt: order.filledAt ?? Date.now() }
            : order
        ));
      } catch {
        // transient poll failure; the next tick retries
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [mt5Account]);

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

  const handleDisconnect = async () => {
    if (mt5Account) {
      await deactivateMt5Account(getMentorToken(), mt5Account.login);
      clearStoredMt5Account();
      setMt5Account(null);
    }
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
  };

  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-[#0e0e10] text-[#fafafa] flex flex-col font-sans selection:bg-[#26262b]">
      <OfflineIndicator />

      {isMt5Route ? (
        <Mt5AccountsScreen />
      ) : showSplash ? (
        <SplashScreen
          onConnected={handleSplashConnected}
          onMt5Connected={handleMt5Connected}
        />
      ) : (
        <div className="w-full max-w-md mx-auto min-h-screen bg-[#0e0e10] flex flex-col relative">
          {/* Main App Screens */}
          <main className="flex-1 overflow-y-auto">
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
                onSwitchToOrders={() => setActiveTab('orders')}
              />
            )}

            {/* Tab 3: Orders Desk */}
            {activeTab === 'orders' && (
              <OrdersScreen
                orders={orders}
                spotPrice={effectiveSpotPrice}
                mt5PriceAge={mt5PriceAge}
                onCancelOrder={async (id) => {
                  const target = orders.find((o) => o.id === id);
                  if (target?.mt5Ticket && mt5Account) {
                    const token = getMentorToken();
                    const batch = await closeMt5Positions(token, mt5Account.login, [String(target.mt5Ticket)], 'cancel');
                    await pollMt5Close(token, batch.closes[0].id);
                  }
                  setOrders((prev) => prev.filter((o) => o.id !== id));
                }}
                onCancelAll={async () => {
                  const pending = orders.filter((o) => o.status === 'PENDING' && o.mt5Ticket);
                  if (pending.length > 0) {
                    if (!mt5Account) throw new Error('Connect an MT5 account before cancelling orders.');
                    const token = getMentorToken();
                    const batch = await closeMt5Positions(token, mt5Account.login, pending.map((o) => String(o.mt5Ticket)), 'cancel');
                    await Promise.all(batch.closes.map((close) => pollMt5Close(token, close.id)));
                  }
                  setOrders((prev) => prev.filter((o) => o.status !== 'PENDING'));
                }}
                onClosePosition={async (id) => {
                  const target = orders.find((o) => o.id === id);
                  if (target?.derivContractId) {
                    await derivService.closeRealPosition(String(target.derivContractId));
                  } else if (target?.mt5Ticket && mt5Account) {
                    const token = getMentorToken();
                    const batch = await closeMt5Positions(token, mt5Account.login, [String(target.mt5Ticket)]);
                    await pollMt5Close(token, batch.closes[0].id);
                  } else if (target && !target.derivContractId && !target.mt5Ticket) {
                    throw new Error('This order has no MT5 position ticket yet — wait for it to fill first.');
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
                  const tickets = orders
                    .filter((o) => !o.derivContractId && o.mt5Ticket)
                    .map((o) => String(o.mt5Ticket));
                  if (tickets.length > 0) {
                    if (!mt5Account) throw new Error('Connect an MT5 account before closing MT5 positions.');
                    const token = getMentorToken();
                    const batch = await closeMt5Positions(token, mt5Account.login, tickets);
                    await Promise.all(batch.closes.map((close) => pollMt5Close(token, close.id)));
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
                onDisconnect={handleDisconnect}
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
                className="w-full max-w-sm rounded-2xl bg-[#18181b] border border-[#26262b] p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {tradeNotice.outcome === 'accepted'
                      ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                      : <CircleAlert className={`h-5 w-5 shrink-0 ${tradeNotice.outcome === 'unconfirmed' || tradeNotice.outcome === 'partial' ? 'text-amber-400' : 'text-rose-400'}`} />}
                    <h2 id="trade-result-title" className="text-base font-bold text-white">
                      {tradeNotice.outcome === 'accepted' ? 'Accepted by MT5'
                        : tradeNotice.outcome === 'partial' ? 'Partially accepted'
                          : tradeNotice.outcome === 'unconfirmed' ? 'Trade result unconfirmed'
                            : tradeNotice.outcome === 'rejected' ? 'Trade rejected'
                              : tradeNotice.success ? 'Request accepted' : 'Trade not placed'}
                    </h2>
                  </div>
                  <button type="button" onClick={() => setTradeNotice(null)} className="p-1 text-[#52525b] hover:text-white" aria-label="Close dialog">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 text-sm text-[#a1a1aa]">{tradeNotice.message}</p>
                {(!tradeNotice.success || tradeNotice.errorMessage) && (
                  <p className="mt-2 text-xs text-[#52525b]">
                    {tradeNotice.errorMessage || tradeNotice.message}
                  </p>
                )}
                {tradeNotice.trades.length > 0 && (
                  <div className="mt-4 max-h-48 space-y-2 overflow-y-auto border-y border-[#26262b] py-3">
                    {tradeNotice.trades.map((trade, index) => (
                      <div key={`${trade.contractId || trade.symbol}-${index}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#fafafa]">
                          {trade.orderType ? `${trade.orderType.replace('_', ' ')} ` : `${trade.direction} `}{trade.symbol}
                        </span>
                        <span className="text-right font-mono text-[#52525b]">
                          {trade.status ?? 'submitted'}{trade.lotSize ? ` · ${trade.lotSize} lots` : ''}{trade.contractId ? ` · #${trade.contractId}` : ''}
                        </span>
                        {trade.resultMessage && (
                          <span className="basis-full text-left text-[11px] text-rose-400">{trade.resultMessage}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  {tradeNotice.trades.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setTradeNotice(null); setActiveTab('orders'); }}
                      className="flex-1 rounded-full bg-[#d6f655] px-3 py-2.5 text-xs font-bold text-[#0e0e10] hover:opacity-90"
                    >
                      View order status
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTradeNotice(null)}
                    className="rounded-full border border-[#26262b] px-3 py-2.5 text-xs font-bold text-[#a1a1aa] hover:bg-[#1f1f23]"
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
