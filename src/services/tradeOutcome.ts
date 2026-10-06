import { TradeOutcome } from '../types/trading';

export const getTradeOutcome = (
  acceptedCount: number,
  rejectedCount: number,
  waitingCount: number
): TradeOutcome => {
  if (waitingCount > 0 || acceptedCount + rejectedCount === 0) return 'unconfirmed';
  if (rejectedCount === 0) return 'accepted';
  if (acceptedCount === 0) return 'rejected';
  return 'partial';
};