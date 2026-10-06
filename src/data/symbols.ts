import { MarketSymbol } from '../types/trading';

export const SYMBOL_CATALOG: MarketSymbol[] = [
  // Synthetic indices — Volatility (continuous)
  { symbol: 'Volatility 10 Index', displayName: 'Volatility 10 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 6300 },
  { symbol: 'Volatility 25 Index', displayName: 'Volatility 25 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 2450 },
  { symbol: 'Volatility 50 Index', displayName: 'Volatility 50 Index', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 380 },
  { symbol: 'Volatility 75 Index', displayName: 'Volatility 75 Index', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 10800 },
  { symbol: 'Volatility 100 Index', displayName: 'Volatility 100 Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 1550 },
  // Synthetic indices — Volatility (1s tick)
  { symbol: 'Volatility 10 (1s) Index', displayName: 'Volatility 10 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 5900 },
  { symbol: 'Volatility 25 (1s) Index', displayName: 'Volatility 25 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 2950 },
  { symbol: 'Volatility 50 (1s) Index', displayName: 'Volatility 50 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 3200 },
  { symbol: 'Volatility 75 (1s) Index', displayName: 'Volatility 75 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 890.25 },
  { symbol: 'Volatility 100 (1s) Index', displayName: 'Volatility 100 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.1, lotStep: 0.1, defaultPrice: 1420.5 },
  // Synthetic indices — Boom & Crash
  { symbol: 'Boom 500 Index', displayName: 'Boom 500 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 8600 },
  { symbol: 'Boom 1000 Index', displayName: 'Boom 1000 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 16500 },
  { symbol: 'Crash 500 Index', displayName: 'Crash 500 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 5900 },
  { symbol: 'Crash 1000 Index', displayName: 'Crash 1000 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 5200 },
  // Synthetic indices — Jump
  { symbol: 'Step Index 10', displayName: 'Step Index 10', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 116000 },
  { symbol: 'Step Index 25', displayName: 'Step Index 25', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 56500 },
  { symbol: 'Step Index 50', displayName: 'Step Index 50', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 3280 },
  { symbol: 'Step Index 75', displayName: 'Step Index 75', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 10300 },
  { symbol: 'Step Index 100', displayName: 'Step Index 100', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 6100 },
  // Metals
  { symbol: 'XAUUSD', displayName: 'Gold / USD', category: 'Metals', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 2653.0 },
  { symbol: 'XAGUSD', displayName: 'Silver / USD', category: 'Metals', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 31.5 },
  // Forex majors
  { symbol: 'EURUSD', displayName: 'EUR / USD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 1.085 },
  { symbol: 'GBPUSD', displayName: 'GBP / USD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 1.27 },
  { symbol: 'USDJPY', displayName: 'USD / JPY', category: 'Forex', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 149.5 },
  { symbol: 'AUDUSD', displayName: 'AUD / USD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 0.655 },
  { symbol: 'USDCAD', displayName: 'USD / CAD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 1.36 },
  { symbol: 'USDCHF', displayName: 'USD / CHF', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 0.88 },
  { symbol: 'EURGBP', displayName: 'EUR / GBP', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 0.855 },
  { symbol: 'NZDUSD', displayName: 'NZD / USD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 0.61 },
  // Crypto
  { symbol: 'BTCUSD', displayName: 'Bitcoin / USD', category: 'Crypto', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 65420.0 },
  { symbol: 'ETHUSD', displayName: 'Ethereum / USD', category: 'Crypto', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 3420.0 },
];

export const searchSymbols = (query: string): MarketSymbol[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return SYMBOL_CATALOG;
  return SYMBOL_CATALOG.filter((item) =>
    item.symbol.toLowerCase().includes(needle) ||
    item.displayName.toLowerCase().includes(needle) ||
    item.category.toLowerCase().includes(needle)
  );
};

export const customSymbol = (code: string): MarketSymbol => {
  const symbol = code.trim().toUpperCase();
  return {
    symbol,
    displayName: symbol,
    category: 'Custom',
    decimals: 2,
    minLot: 0.01,
    lotStep: 0.01,
    defaultPrice: 0,
  };
};
