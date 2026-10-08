import { MarketSymbol } from '../types/trading';

export const SYMBOL_CATALOG: MarketSymbol[] = [
  // Gold is the only tradable instrument.
  { symbol: 'XAUUSD', displayName: 'Gold / USD', category: 'Metals', decimals: 2, minLot: 0.01, lotStep: 0.01, defaultPrice: 2653.0 },
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
