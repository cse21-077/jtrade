import React from 'react';
import { DerivAccount, MarketSymbol } from '../types/trading';
import { MascotHead } from './MascotHead';
import { Mt5StatusCard } from './Mt5StatusCard';
import { StoredMt5Account } from '../services/joemoneyMt5Api';
import { MT5_STALE_AFTER_SEC } from '../hooks/useMt5Prices';

interface HomeScreenProps {
  account: DerivAccount;
  spotPrice: number;
  selectedSymbol: MarketSymbol;
  mt5PriceAge?: number | null;
  mt5Account?: StoredMt5Account | null;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  account,
  spotPrice,
  selectedSymbol,
  mt5PriceAge = null,
  mt5Account,
}) => {
  const accountId = account.loginId || account.mt5Login || 'Demo-Account';
  const mt5Degraded = mt5PriceAge !== null && mt5PriceAge >= MT5_STALE_AFTER_SEC;

  return (
    <div className="min-h-[calc(100dvh-1rem)] flex items-center justify-center px-4 pt-4 pb-24 font-sans select-none bg-white">
      <div className="w-full max-w-[400px] space-y-5">
        <div className="flex justify-center">
          <MascotHead status="success" size={140} />
        </div>

        {mt5Account && <Mt5StatusCard account={mt5Account} />}

        <div className="bg-[#18181b] rounded-2xl p-5 text-white space-y-4 text-center">
          <div className="space-y-1">
            <h1 className="text-lg font-black tracking-tight font-mono text-white break-words">{accountId}</h1>
            <p className="text-sm font-mono text-neutral-300">
              {account.currency || 'USD'} {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="pt-3 border-t border-neutral-800 space-y-1">
            <div className="flex items-center justify-center gap-2">
              <span
                className={`text-2xl font-black font-mono tracking-tight ${
                  mt5Degraded ? 'text-neutral-400' : 'text-white'
                }`}
              >
                {spotPrice.toLocaleString('en-US', {
                  minimumFractionDigits: selectedSymbol.decimals,
                  maximumFractionDigits: selectedSymbol.decimals,
                })}
              </span>
              {mt5PriceAge !== null && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest ${
                    mt5Degraded ? 'bg-neutral-700 text-neutral-400' : 'bg-sky-500/20 text-sky-300'
                  }`}
                >
                  MT5
                </span>
              )}
            </div>
            <p className="text-[10px] font-mono text-neutral-500">
              {selectedSymbol.displayName} · {mt5PriceAge !== null ? 'MT5 VPS quote' : 'Deriv live quote'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
