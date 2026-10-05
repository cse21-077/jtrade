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

// Maps Deriv-style symbol codes (frxXAUUSD, cryBTCUSD) to the MT5 broker names.
export const toMt5Symbol = (symbol: string): string => {
  const code = symbol.trim().toUpperCase();
  if (code.startsWith('FRX') || code.startsWith('CRY')) return code.slice(3);
  return code;
};

export const getMt5Quote = (
  prices: Record<string, Mt5Quote>,
  symbol: string
): Mt5Quote | null => prices[toMt5Symbol(symbol)] ?? null;

export const useMt5Prices = () => {
  const [prices, setPrices] = useState<Record<string, Mt5Quote>>({});
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastGood = useRef<Record<string, Mt5Quote>>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const payload = await getMt5Prices(getMentorToken());
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
        setPrices(freshest);
        setLastUpdated(Date.now());
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Could not load MT5 prices.');
        setPrices(lastGood.current);
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
  }, []);

  return { prices, lastUpdated, error };
};
