import test from 'node:test';
import assert from 'node:assert/strict';
import { getMt5MidPrice, isMt5QuoteFresh } from './marketPrice';

test('returns the midpoint only from a fresh MT5 quote', () => {
  const quote = { bid: 101.25, ask: 101.35, ageSec: 5 };

  assert.equal(getMt5MidPrice({ EURUSD: quote }, 'EURUSD'), 101.3);
  assert.equal(isMt5QuoteFresh(quote), true);
});

test('rejects stale MT5 quotes instead of using a fallback source', () => {
  const quote = { bid: 101.25, ask: 101.35, ageSec: 90 };

  assert.equal(getMt5MidPrice({ EURUSD: quote }, 'EURUSD'), null);
  assert.equal(isMt5QuoteFresh(quote), false);
});

test('maps Deriv-style symbols to MT5 broker symbols', () => {
  assert.equal(getMt5MidPrice({ XAUUSD: { bid: 2000, ask: 2001, ageSec: 2 } }, 'frxXAUUSD'), 2000.5);
});
