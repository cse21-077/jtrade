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

test('uses exact full MT5 names for synthetic quotes and legacy code selection', () => {
  const quotes = { 'VOLATILITY 10 INDEX': { bid: 6300, ask: 6301, ageSec: 2 } };

  assert.equal(getMt5MidPrice(quotes, 'Volatility 10 Index'), 6300.5);
  assert.equal(getMt5MidPrice(quotes, 'R_10'), 6300.5);
  assert.equal(getMt5MidPrice({ R_10: quotes['VOLATILITY 10 INDEX'] }, 'Volatility 10 Index'), null);
});
