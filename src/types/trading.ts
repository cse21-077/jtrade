export type OrderDirection = 'SELL' | 'BUY';

export type OrderType = 'LIMIT' | 'STOP' | 'MARKET_GRID';

export interface GridParameters {
  symbol: string;
  symbolName: string;
  direction: OrderDirection;
  // Mathematical parameters from user specification:
  // u = spot price
  u: number;
  autoUpdateSpot: boolean;
  // x = offset from spot (base entry = u - x for SELL, or u + x / u - x for BUY)
  x: number;
  basePriceMode: 'offset' | 'fixed';
  fixedBasePrice: number;
  // t = lot size per order
  t: number;
  // s = orders per price level
  s: number;
  // y = step interval distance
  y: number;
  // z = number of step multiples (levels 0 to z)
  z: number;
  // Step direction: 'down' (e.g. 4170 - x - k*y) or 'up' (4170 - x + k*y)
  stepDirection: 'down' | 'up';
  // Risk management
  takeProfitDistance: number;
  stopLossDistance: number;
  enableTP: boolean;
  enableSL: boolean;
}

export interface LadderLevel {
  levelIndex: number; // 0, 1, 2, ..., z
  formula: string;    // e.g. "4170 - 5.0 - (2 × 0.10)"
  price: number;      // Calculated target price
  ordersCount: number; // s
  lotSize: number;    // t
  totalLotsAtLevel: number; // s * t
  cumulativeLots: number;
  tpPrice?: number;
  slPrice?: number;
  distanceFromSpot: number;
}

export interface PlacedOrder {
  id: string;
  levelIndex: number;
  subIndex: number; // 1 to s
  symbol: string;
  direction: OrderDirection;
  orderType: OrderType;
  price: number;
  lotSize: number;
  status: 'PENDING' | 'TRIGGERED' | 'FILLED' | 'CANCELLED';
  tpPrice?: number;
  slPrice?: number;
  pnl?: number;
  createdAt: number;
  filledAt?: number;
  derivContractId?: string | number;
}

export type ConnectionMode = 'mt5' | 'token' | 'demo';

export interface DerivAccount {
  isConnected: boolean;
  isDemo: boolean;
  connectionType?: ConnectionMode;
  token?: string;
  appId: number;
  loginId?: string;
  email?: string;
  balance: number;
  currency: string;
  fullName?: string;
  latencyMs?: number;
  mt5Server?: string;
  mt5Login?: string;
}

export interface MarketSymbol {
  symbol: string;
  displayName: string;
  category: 'Metals' | 'Synthetics' | 'Forex' | 'Crypto';
  decimals: number;
  minLot: number;
  lotStep: number;
  defaultPrice: number;
}
