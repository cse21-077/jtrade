export interface MarketPriceQuote {
  symbol?: string;
  bid: number;
  ask: number;
  ageSec: number;
}

export const MT5_PRICE_MAX_AGE_SEC = 60;
export const MT5_PRICE_STALE_AFTER_SEC = 30;

const MT5_SYMBOL_ALIASES: Record<string, string> = {
  R_10: 'VOLATILITY 10 INDEX',
  R_25: 'VOLATILITY 25 INDEX',
  R_50: 'VOLATILITY 50 INDEX',
  R_75: 'VOLATILITY 75 INDEX',
  R_100: 'VOLATILITY 100 INDEX',
  '1HZ10V': 'VOLATILITY 10 (1S) INDEX',
  '1HZ25V': 'VOLATILITY 25 (1S) INDEX',
  '1HZ50V': 'VOLATILITY 50 (1S) INDEX',
  '1HZ75V': 'VOLATILITY 75 (1S) INDEX',
  '1HZ100V': 'VOLATILITY 100 (1S) INDEX',
  BOOM500: 'BOOM 500 INDEX',
  BOOM1000: 'BOOM 1000 INDEX',
  CRASH500: 'CRASH 500 INDEX',
  CRASH1000: 'CRASH 1000 INDEX',
  JD10: 'STEP INDEX 10',
  JD25: 'STEP INDEX 25',
  JD50: 'STEP INDEX 50',
  JD75: 'STEP INDEX 75',
  JD100: 'STEP INDEX 100',
};

export const toMt5Symbol = (symbol: string): string => {
  const code = symbol.trim().toUpperCase();
  if (MT5_SYMBOL_ALIASES[code]) return MT5_SYMBOL_ALIASES[code];
  if (code.startsWith('FRX') || code.startsWith('CRY')) return code.slice(3);
  return code;
};

export const resolveMt5Quote = <T extends MarketPriceQuote>(
  prices: Record<string, T>,
  symbol: string
): T | null => {
  const normalized = toMt5Symbol(symbol);
  const exact = prices[normalized];
  if (exact) return exact;
  const candidates = Object.entries(prices).filter(([key]) =>
    key.startsWith(normalized) && key.length > normalized.length
  );
  return candidates.length === 1 ? candidates[0][1] : null;
};

export const getResolvedMt5Symbol = <T extends MarketPriceQuote>(
  prices: Record<string, T>,
  symbol: string
): string | null => resolveMt5Quote(prices, symbol)?.symbol ?? null;

export const isMt5QuoteFresh = (quote: MarketPriceQuote | null | undefined): boolean =>
  typeof quote?.bid === 'number' &&
  typeof quote?.ask === 'number' &&
  Number.isFinite(quote.bid) &&
  Number.isFinite(quote.ask) &&
  quote.ageSec >= 0 &&
  quote.ageSec < MT5_PRICE_MAX_AGE_SEC;

export const getMt5MidPrice = (
  prices: Record<string, MarketPriceQuote>,
  symbol: string
): number | null => {
  const quote = resolveMt5Quote(prices, symbol);
  if (!isMt5QuoteFresh(quote)) return null;
  return (quote.bid + quote.ask) / 2;
};
