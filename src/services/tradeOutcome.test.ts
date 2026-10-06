import test from 'node:test';
import assert from 'node:assert/strict';
import { getTradeOutcome } from './tradeOutcome';

test('only a fully broker-accepted batch is reported as accepted', () => {
  assert.equal(getTradeOutcome(5, 0, 0), 'accepted');
});

test('a wholly rejected batch is reported as rejected', () => {
  assert.equal(getTradeOutcome(0, 5, 0), 'rejected');
});

test('mixed accepted and rejected orders are reported as partial', () => {
  assert.equal(getTradeOutcome(2, 3, 0), 'partial');
});

test('queued, claimed, or unobserved orders are never reported as accepted', () => {
  assert.equal(getTradeOutcome(0, 0, 5), 'unconfirmed');
  assert.equal(getTradeOutcome(2, 0, 3), 'unconfirmed');
  assert.equal(getTradeOutcome(0, 0, 0), 'unconfirmed');
});