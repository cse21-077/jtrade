export interface MarketPriceQuote {
  bid: number;
  ask: number;
  ageSec: number;
}

export const MT5_PRICE_MAX_AGE_SEC = 60;
export const MT5_PRICE_STALE_AFTER_SEC = 30;

const toMt5Symbol = (symbol: string): string => {
  const code = symbol.trim().toUpperCase();
  if (code.startsWith('FRX') || code.startsWith('CRY')) return code.slice(3);
  return code;
};

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
  const quote = prices[toMt5Symbol(symbol)];
  if (!isMt5QuoteFresh(quote)) return null;
  return (quote.bid + quote.ask) / 2;
};
