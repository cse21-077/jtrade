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
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-[360px] px-3">
      <nav className="bg-white/95 backdrop-blur-md rounded-full border border-slate-100 shadow-[0_10px_35px_rgba(0,0,0,0.07)] px-3 py-2 flex items-center justify-between">
        {/* Tab 1: Home */}
        <button
          onClick={() => onChangeTab('home')}
          className={`cursor-pointer transition-all duration-200 flex items-center gap-2 px-3.5 py-1.5 rounded-full ${
            activeTab === 'home'
              ? 'bg-[#dcf0fa] text-slate-900 font-bold text-xs'
              : 'text-slate-800 hover:text-black p-2'
          }`}
        >
          <Home className="w-4 h-4 stroke-[2]" />
          {activeTab === 'home' && <span>Home</span>}
        </button>

        {/* Tab 2: Grid f(x) */}
        <button
          onClick={() => onChangeTab('grid')}
          className={`cursor-pointer transition-all duration-200 flex items-center gap-2 px-3.5 py-1.5 rounded-full ${
            activeTab === 'grid'
              ? 'bg-[#dcf0fa] text-slate-900 font-bold text-xs'
              : 'text-slate-800 hover:text-black p-2'
          }`}
        >
          <Play className="w-4 h-4 stroke-[2]" />
          {activeTab === 'grid' && <span>Grid</span>}
        </button>

        {/* Tab 3: Orders */}
        <button
          onClick={() => onChangeTab('orders')}
          className={`relative cursor-pointer transition-all duration-200 flex items-center gap-2 px-3.5 py-1.5 rounded-full ${
            activeTab === 'orders'
              ? 'bg-[#dcf0fa] text-slate-900 font-bold text-xs'
              : 'text-slate-800 hover:text-black p-2'
          }`}
        >
          <BookOpen className="w-4 h-4 stroke-[2]" />
          {activeTab === 'orders' && <span>Orders</span>}
          {pendingCount > 0 && activeTab !== 'orders' && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-slate-900" />
          )}
        </button>

        {/* Tab 4: Profile */}
        <button
          onClick={() => onChangeTab('profile')}
          className={`cursor-pointer transition-all duration-200 flex items-center gap-2 px-3.5 py-1.5 rounded-full ${
            activeTab === 'profile'
              ? 'bg-[#dcf0fa] text-slate-900 font-bold text-xs'
              : 'text-slate-800 hover:text-black p-2'
          }`}
        >
          <User className="w-4 h-4 stroke-[2]" />
          {activeTab === 'profile' && <span>Profile</span>}
        </button>
      </nav>
    </div>
  );
};
