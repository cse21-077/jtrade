import { useEffect, useRef, useState } from 'react';
import { getMentorToken, getMt5Prices } from '../services/joemoneyMt5Api';

export interface Mt5Quote {
  bid: number;
  ask: number;
  ageSec: number;
}

export const MT5_STALE_AFTER_SEC = 30;
export const MT5_MAX_AGE_SEC = 60;

const POLL_INTERVAL_MS = 4000;

const SYNTHETIC_MT5_SYMBOLS: Record<string, string> = {
  R_10: 'Volatility 10 Index',
  R_25: 'Volatility 25 Index',
  R_50: 'Volatility 50 Index',
  R_75: 'Volatility 75 Index',
  R_100: 'Volatility 100 Index',
  '1HZ10V': 'Volatility 10 (1s) Index',
  '1HZ25V': 'Volatility 25 (1s) Index',
  '1HZ50V': 'Volatility 50 (1s) Index',
  '1HZ75V': 'Volatility 75 (1s) Index',
  '1HZ100V': 'Volatility 100 (1s) Index',
  BOOM500: 'Boom 500 Index',
  BOOM1000: 'Boom 1000 Index',
  CRASH500: 'Crash 500 Index',
  CRASH1000: 'Crash 1000 Index',
  JD10: 'Step Index 10',
  JD25: 'Step Index 25',
  JD50: 'Step Index 50',
  JD75: 'Step Index 75',
  JD100: 'Step Index 100',
};

// Maps legacy app codes and Deriv-style symbols to exact MT5 broker names.
export const toMt5Symbol = (symbol: string): string => {
  const code = symbol.trim().toUpperCase();
  if (SYNTHETIC_MT5_SYMBOLS[code]) return SYNTHETIC_MT5_SYMBOLS[code].toUpperCase();
  if (code.startsWith('FRX') || code.startsWith('CRY')) return code.slice(3);
  return code;
};

export const getMt5Quote = (
  prices: Record<string, Mt5Quote>,
  symbol: string
): Mt5Quote | null => prices[toMt5Symbol(symbol)] ?? null;

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
            freshest[key] = { bid: tick.bid, ask: tick.ask, ageSec: tick.age_sec };
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
