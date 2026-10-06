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
  const mt5Degraded = mt5PriceAge === null || mt5PriceAge >= MT5_STALE_AFTER_SEC;

  return (
    <div className="min-h-[calc(100dvh-1rem)] flex items-center justify-center px-4 pt-4 pb-24 font-sans select-none">
      <div className="w-full max-w-[400px] space-y-5">
        <div className="flex justify-center">
          <MascotHead status="success" size={120} />
        </div>

        <div className="bg-[#18181b] border border-[#26262b] rounded-2xl p-5 text-white space-y-4 text-center">
          <div className="space-y-2">
            <h1 className="text-lg font-black tracking-tight font-mono text-white break-words">
              {mt5Account ? `MT5 ${mt5Account.login}` : accountId}
            </h1>
            {mt5Account && <Mt5StatusCard account={mt5Account} />}
          </div>

          <div className="pt-3 border-t border-[#26262b] space-y-1">
            <div className="flex items-center justify-center gap-2">
              <span
                className={`text-3xl font-black font-mono tracking-tight ${
                  mt5Degraded ? 'text-amber-300' : 'text-white'
                }`}
              >
                {mt5Degraded
                  ? 'Quote unavailable'
                  : spotPrice.toLocaleString('en-US', {
                    minimumFractionDigits: selectedSymbol.decimals,
                    maximumFractionDigits: selectedSymbol.decimals,
                  })}
              </span>
              {mt5PriceAge !== null && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest ${
                    mt5Degraded
                      ? 'bg-[#1f1f23] text-[#52525b] border border-[#26262b]'
                      : 'bg-[#d6f655] text-[#0e0e10]'
                  }`}
                >
                  MT5
                </span>
              )}
            </div>
            <p className="text-[10px] font-mono text-[#52525b]">
              {selectedSymbol.displayName} · {mt5Degraded
                ? mt5PriceAge === null ? 'No MT5 quote received' : `MT5 quote stale (${mt5PriceAge.toFixed(1)}s)`
                : 'MT5 VPS quote'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
