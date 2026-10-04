import React, { useState } from 'react';
import { DerivAccount, MarketSymbol, PlacedOrder, TradeNotice } from '../types/trading';
import { Zap, Loader2 } from 'lucide-react';
import { MascotHead } from './MascotHead';
import { derivService } from '../services/derivWs';

interface HomeScreenProps {
  account: DerivAccount;
  spotPrice: number;
  selectedSymbol: MarketSymbol;
  onDeployOrder?: (order: PlacedOrder) => void;
  onTradeNotice: (notice: TradeNotice) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  account,
  spotPrice,
  selectedSymbol,
  onDeployOrder,
  onTradeNotice,
}) => {
  const [isExecutingTest, setIsExecutingTest] = useState(false);

  const handleTestMarketTrade = async () => {
    setIsExecutingTest(true);

    try {
      const res = await derivService.executeRealTrade({
        symbol: selectedSymbol.symbol,
        direction: 'BUY',
        lotSize: selectedSymbol.minLot,
      });

      if (res.success && res.contractId) {
        onTradeNotice({
          success: true,
          message: `Market test opened on ${selectedSymbol.displayName}.`,
          trades: [{
            symbol: selectedSymbol.symbol,
            direction: 'BUY',
            price: spotPrice,
            lotSize: selectedSymbol.minLot,
            contractId: res.contractId,
          }],
        });

        if (onDeployOrder) {
          onDeployOrder({
            id: `test-${Date.now()}`,
            symbol: selectedSymbol.symbol,
            direction: 'BUY',
            orderType: 'MARKET_GRID',
            price: spotPrice,
            lotSize: selectedSymbol.minLot,
            levelIndex: 1,
            subIndex: 1,
            status: 'FILLED',
            derivContractId: res.contractId,
            createdAt: Date.now(),
            filledAt: Date.now(),
          });
        }
      } else {
        onTradeNotice({
          success: false,
          message: res.message || 'Trade execution failed on Deriv.',
          errorMessage: res.message || 'Deriv did not open the trade.',
          trades: [],
        });
      }
    } catch (e: any) {
      onTradeNotice({
        success: false,
        message: e?.message || 'Trade failed.',
        errorMessage: e?.message || 'Trade failed.',
        trades: [],
      });
    } finally {
      setIsExecutingTest(false);
    }
  };

  const accountId = account.loginId || account.mt5Login || 'Demo-Account';

  return (
    <div className="min-h-[calc(100dvh-1rem)] flex items-center justify-center px-4 pt-4 pb-24 font-sans select-none bg-white">
      <div className="w-full max-w-[400px] space-y-5">
        <div className="flex justify-center">
          <MascotHead status="success" size={140} />
        </div>

        <div className="bg-[#18181b] rounded-2xl p-5 text-white space-y-4 text-center">
          <div className="space-y-1">
            <h1 className="text-lg font-black tracking-tight font-mono text-white break-words">{accountId}</h1>
            <p className="text-sm font-mono text-neutral-300">
              {account.currency || 'USD'} {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <button
            type="button"
            disabled={isExecutingTest}
            onClick={handleTestMarketTrade}
            className="w-full py-3 rounded-xl bg-white hover:bg-neutral-100 text-slate-900 font-extrabold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {isExecutingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-amber-500" />}
            <span>{isExecutingTest ? 'Testing market...' : `Test market buy · ${selectedSymbol.displayName.split(' ')[0]}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
