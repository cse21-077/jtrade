import { useEffect, useRef, useState } from 'react';
import { getMentorToken, getMt5Prices } from '../services/joemoneyMt5Api';
import { MarketPriceQuote, resolveMt5Quote, toMt5Symbol } from '../services/marketPrice';

export interface Mt5Quote extends MarketPriceQuote {
  symbol: string;
  volumeMin?: number;
  volumeMax?: number;
  volumeStep?: number;
  volumeLimitsKnown?: boolean;
}

export const MT5_STALE_AFTER_SEC = 30;
export const MT5_MAX_AGE_SEC = 60;

const POLL_INTERVAL_MS = 4000;

export { toMt5Symbol };

export const getMt5Quote = (
  prices: Record<string, Mt5Quote>,
  symbol: string
): Mt5Quote | null => resolveMt5Quote(prices, symbol);

export const getMt5QuoteSymbol = (
  prices: Record<string, Mt5Quote>,
  symbol: string
): string | null => getMt5Quote(prices, symbol)?.symbol ?? null;

export const useMt5Prices = (login?: string) => {
  const [prices, setPrices] = useState<Record<string, Mt5Quote>>({});
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastGood = useRef<Record<string, Mt5Quote>>({});
  const lastGoodAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    lastGood.current = {};
    lastGoodAt.current = null;
    setPrices({});
    setLastUpdated(null);

    const load = async () => {
      try {
        const payload = await getMt5Prices(getMentorToken(), login ? { login } : undefined);
        if (cancelled) return;
        const freshest: Record<string, Mt5Quote> = {};
        for (const tick of payload.prices) {
          const key = tick.symbol.trim().toUpperCase();
          const existing = freshest[key];
          if (!existing || tick.age_sec < existing.ageSec) {
            freshest[key] = {
              symbol: tick.symbol.trim(),
              bid: tick.bid,
              ask: tick.ask,
              ageSec: tick.age_sec,
              volumeMin: tick.volume_min,
              volumeMax: tick.volume_max,
              volumeStep: tick.volume_step,
              volumeLimitsKnown: tick.volume_limits_known,
            };
          }
        }
        lastGood.current = freshest;
        lastGoodAt.current = Date.now();
        setPrices(freshest);
        setLastUpdated(Date.now());
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Could not load MT5 prices.');
        const elapsedSec = lastGoodAt.current === null ? 0 : (Date.now() - lastGoodAt.current) / 1000;
        setPrices(Object.fromEntries(
          Object.entries(lastGood.current).map(([symbol, quote]) => [
            symbol,
            { ...quote, ageSec: quote.ageSec + elapsedSec },
          ])
        ));
      }
    };

    void load();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [login]);

  return { prices, lastUpdated, error };
};
