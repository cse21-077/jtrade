import React from 'react';
import { Home, Play, BookOpen, User } from 'lucide-react';

export type AppTab = 'home' | 'grid' | 'orders' | 'profile';

interface BottomNavBarProps {
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
  pendingCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onChangeTab,
  pendingCount = 0,
}) => {
  const sideButton = (tab: AppTab, label: string, Icon: typeof Home, key: string) => (
    <button
      key={key}
      onClick={() => onChangeTab(tab)}
      className={`cursor-pointer transition-all duration-200 flex flex-col items-center gap-0.5 px-3 py-1 ${
        activeTab === tab ? 'text-[#d6f655]' : 'text-[#52525b] hover:text-[#a1a1aa]'
      }`}
    >
      <span className="relative">
        <Icon className="w-5 h-5 stroke-[2]" />
        {tab === 'orders' && pendingCount > 0 && activeTab !== 'orders' && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#d6f655]" />
        )}
      </span>
      <span className="text-[9px] font-bold">{label}</span>
    </button>
  );

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-md">
      <nav className="bg-[#131315] border-t border-[#26262b] px-6 pt-2 pb-3 flex items-end justify-between">
        {sideButton('home', 'Home', Home, 'home')}

        {/* Center action: Order Desk */}
        <button
          onClick={() => onChangeTab('grid')}
          aria-label="Order Desk"
          className="cursor-pointer transition-all duration-200 rounded-full p-3 -mt-6 bg-[#d6f655] text-[#0e0e10] border border-[#d6f655] active:scale-95"
        >
          <Play className="w-5 h-5 stroke-[2.5] fill-current" />
        </button>

        {sideButton('orders', 'Orders', BookOpen, 'orders')}
        {sideButton('profile', 'Profile', User, 'profile')}
      </nav>
    </div>
  );
};
