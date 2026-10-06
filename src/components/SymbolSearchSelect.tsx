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
      <div className="flex items-center gap-2 rounded-full bg-[#18181b] border border-[#26262b] px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-[#52525b]" />
        <input
          type="text"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setIsOpen(true); }}
          onFocus={() => { if (blurTimer.current) window.clearTimeout(blurTimer.current); setIsOpen(true); }}
          onBlur={handleBlur}
          placeholder={`Search pair… (${selectedSymbol.displayName})`}
          className="w-full min-w-0 bg-transparent font-mono text-sm font-bold text-white outline-none placeholder:font-sans placeholder:font-medium placeholder:text-[#52525b]"
        />
        <ChevronDown className="h-4 w-4 shrink-0 text-[#52525b]" />
      </div>

      {isOpen && (
        <ul className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-[#26262b] bg-[#18181b] py-1 shadow-lg" role="listbox">
          {results.length === 0 && !trimmedQuery && (
            <li className="px-3 py-2 text-xs text-[#52525b]">Type to search synthetic indices, forex, metals, crypto…</li>
          )}
          {results.map((item) => (
            <li key={item.symbol}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#1f1f23]"
                role="option"
                aria-selected={selectedSymbol.symbol === item.symbol}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-[#fafafa]">{item.displayName}</span>
                  <span className="block font-mono text-[10px] text-[#52525b]">{item.symbol} · {item.category}</span>
                </span>
                {selectedSymbol.symbol === item.symbol && <Check className="h-4 w-4 shrink-0 text-[#d6f655]" />}
              </button>
            </li>
          ))}
          {trimmedQuery && !exactMatch && (
            <li>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(customSymbol(trimmedQuery))}
                className="flex w-full items-center gap-2 border-t border-[#26262b] px-3 py-2 text-left hover:bg-[#1f1f23]"
                role="option"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-[#fafafa]">Use “{trimmedQuery.toUpperCase()}”</span>
                  <span className="block text-[10px] text-[#52525b]">Custom symbol — works if your MT5 account has it in Market Watch</span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
