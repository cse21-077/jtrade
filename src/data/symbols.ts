import { MarketSymbol } from '../types/trading';

export const SYMBOL_CATALOG: MarketSymbol[] = [
  // Synthetic indices — Volatility (continuous)
  { symbol: 'R_10', displayName: 'Volatility 10 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 6300 },
  { symbol: 'R_25', displayName: 'Volatility 25 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 2450 },
  { symbol: 'R_50', displayName: 'Volatility 50 Index', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 380 },
  { symbol: 'R_75', displayName: 'Volatility 75 Index', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 10800 },
  { symbol: 'R_100', displayName: 'Volatility 100 Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 1550 },
  // Synthetic indices — Volatility (1s tick)
  { symbol: '1HZ10V', displayName: 'Volatility 10 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 5900 },
  { symbol: '1HZ25V', displayName: 'Volatility 25 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 2950 },
  { symbol: '1HZ50V', displayName: 'Volatility 50 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 3200 },
  { symbol: '1HZ75V', displayName: 'Volatility 75 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 890.25 },
  { symbol: '1HZ100V', displayName: 'Volatility 100 (1s) Index', category: 'Synthetics', decimals: 2, minLot: 0.1, lotStep: 0.1, defaultPrice: 1420.5 },
  // Synthetic indices — Boom & Crash
  { symbol: 'BOOM500', displayName: 'Boom 500 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 8600 },
  { symbol: 'BOOM1000', displayName: 'Boom 1000 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 16500 },
  { symbol: 'CRASH500', displayName: 'Crash 500 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 5900 },
  { symbol: 'CRASH1000', displayName: 'Crash 1000 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 5200 },
  // Synthetic indices — Jump
  { symbol: 'JD10', displayName: 'Jump 10 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 116000 },
  { symbol: 'JD25', displayName: 'Jump 25 Index', category: 'Synthetics', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 56500 },
  { symbol: 'JD50', displayName: 'Jump 50 Index', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 3280 },
  { symbol: 'JD75', displayName: 'Jump 75 Index', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 10300 },
  { symbol: 'JD100', displayName: 'Jump 100 Index', category: 'Synthetics', decimals: 4, minLot: 0.01, lotStep: 0.01, defaultPrice: 6100 },
  // Metals
  { symbol: 'frxXAUUSD', displayName: 'Gold / USD', category: 'Metals', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 2653.0 },
  { symbol: 'frxXAGUSD', displayName: 'Silver / USD', category: 'Metals', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 31.5 },
  // Forex majors
  { symbol: 'frxEURUSD', displayName: 'EUR / USD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 1.085 },
  { symbol: 'frxGBPUSD', displayName: 'GBP / USD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 1.27 },
  { symbol: 'frxUSDJPY', displayName: 'USD / JPY', category: 'Forex', decimals: 3, minLot: 0.01, lotStep: 0.01, defaultPrice: 149.5 },
  { symbol: 'frxAUDUSD', displayName: 'AUD / USD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 0.655 },
  { symbol: 'frxUSDCAD', displayName: 'USD / CAD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 1.36 },
  { symbol: 'frxUSDCHF', displayName: 'USD / CHF', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 0.88 },
  { symbol: 'frxEURGBP', displayName: 'EUR / GBP', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 0.855 },
  { symbol: 'frxNZDUSD', displayName: 'NZD / USD', category: 'Forex', decimals: 5, minLot: 0.01, lotStep: 0.01, defaultPrice: 0.61 },
  // Crypto
  { symbol: 'cryBTCUSD', displayName: 'Bitcoin / USD', category: 'Crypto', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 65420.0 },
  { symbol: 'cryETHUSD', displayName: 'Ethereum / USD', category: 'Crypto', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 3420.0 },
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
