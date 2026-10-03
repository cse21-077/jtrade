import React, { useState, useEffect } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { ConnectPortal } from './components/ConnectPortal';
import { HomeScreen } from './components/HomeScreen';
import { GridInputsScreen } from './components/GridInputsScreen';
import { OrdersScreen } from './components/OrdersScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { BottomNavBar, AppTab } from './components/BottomNavBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { derivService } from './services/derivWs';
import { DerivAccount, ConnectionMode, MarketSymbol, PlacedOrder } from './types/trading';

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
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (sessionStorage.getItem('pwa_bypassed') === 'true') return true;
    return checkIsStandalone();
  });
  const [showSplash, setShowSplash] = useState(true);
  const [selectedInitialMode, setSelectedInitialMode] = useState<ConnectionMode>('mt5');
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

  // Check order triggers on spot tick
  useEffect(() => {
    if (orders.length === 0) return;

    setOrders((prev) => {
      let changed = false;
      const updated = prev.map((order) => {
        if (order.status !== 'PENDING') return order;
        const reached =
          order.direction === 'SELL'
            ? spotPrice <= order.price || Math.abs(spotPrice - order.price) < 0.2
            : spotPrice >= order.price || Math.abs(spotPrice - order.price) < 0.2;

        if (reached) {
          changed = true;
          return { ...order, status: 'FILLED' as const, filledAt: Date.now() };
        }
        return order;
      });
      return changed ? updated : prev;
    });
  }, [spotPrice]);

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

  const handleConnectSuccess = (acc: DerivAccount) => {
    setAccount(acc);
    setShowConnectModal(false);
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
          onBypass={() => {
            sessionStorage.setItem('pwa_bypassed', 'true');
            setIsStandalone(true);
          }}
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
                onOpenGrid={(preset) => {
                  setActiveTab('grid');
                }}
                onOpenConnect={() => setShowConnectModal(true)}
                onDisconnect={handleDisconnect}
                onDeployOrder={(order) => setOrders((prev) => [order, ...prev])}
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

          {/* Connect Modal (Deriv MT5 Login / Deriv API Token / Sandbox) */}
          {showConnectModal && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
              <ConnectPortal
                initialMode={selectedInitialMode}
                currentAccount={account}
                onSuccess={handleConnectSuccess}
                onCancel={() => setShowConnectModal(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
