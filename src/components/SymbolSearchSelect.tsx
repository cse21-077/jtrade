import React, { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { MarketSymbol } from '../types/trading';
import { customSymbol, searchSymbols } from '../data/symbols';

interface SymbolSearchSelectProps {
  symbols: MarketSymbol[];
  selectedSymbol: MarketSymbol;
  onSelect: (symbol: MarketSymbol) => void;
}

export const SymbolSearchSelect: React.FC<SymbolSearchSelectProps> = ({
  symbols,
  selectedSymbol,
  onSelect,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const results = useMemo(() => searchSymbols(query), [query]);
  const exactMatch = results.some((item) => item.symbol === query.trim().toUpperCase());
  const trimmedQuery = query.trim();

  const choose = (symbol: MarketSymbol) => {
    onSelect(symbol);
    setQuery('');
    setIsOpen(false);
  };

  const handleBlur = () => {
    blurTimer.current = window.setTimeout(() => setIsOpen(false), 150);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-2xl bg-[#f4f5f7] px-3 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setIsOpen(true); }}
          onFocus={() => { if (blurTimer.current) window.clearTimeout(blurTimer.current); setIsOpen(true); }}
          onBlur={handleBlur}
          placeholder={`Search markets… (${selectedSymbol.displayName})`}
          className="w-full min-w-0 bg-transparent font-mono text-sm font-bold text-slate-900 outline-none placeholder:font-sans placeholder:font-medium placeholder:text-slate-400"
        />
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </div>

      {isOpen && (
        <ul className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-100 bg-white py-1 shadow-lg" role="listbox">
          {results.length === 0 && !trimmedQuery && (
            <li className="px-3 py-2 text-xs text-slate-400">Type to search Deriv synthetic indices, forex, metals, crypto…</li>
          )}
          {results.map((item) => (
            <li key={item.symbol}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#f4f5f7]"
                role="option"
                aria-selected={selectedSymbol.symbol === item.symbol}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-slate-900">{item.displayName}</span>
                  <span className="block font-mono text-[10px] text-slate-400">{item.symbol} · {item.category}</span>
                </span>
                {selectedSymbol.symbol === item.symbol && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
              </button>
            </li>
          ))}
          {trimmedQuery && !exactMatch && (
            <li>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(customSymbol(trimmedQuery))}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left hover:bg-[#f4f5f7]"
                role="option"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-slate-900">Use “{trimmedQuery.toUpperCase()}”</span>
                  <span className="block text-[10px] text-slate-400">Custom symbol — works if your Deriv account has access to it</span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
