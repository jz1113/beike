import React from 'react';
import { ShoppingBag } from 'lucide-react';
import type { WorkshopTab } from '@client/store/types';
import { useAppStore } from '@client/store';
import { ToolSuiteMark } from '@client/shared/icons';

export interface WorkshopTopBarProps {
  assetToolbarRef?: React.Ref<HTMLDivElement>;
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
}

export function WorkshopTopBar({ assetToolbarRef, activeTab }: WorkshopTopBarProps) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const studioTitle = '电商工坊';
  return (
    <header
      className="relative w-full min-h-14 pt-3 pb-2 px-4 sm:px-6 xl:pr-8 bg-transparent flex items-center justify-between gap-3 shrink-0 z-30 select-none cursor-default transition-all"
    >
      {activeTab === 'prompt_assets' && (
        <div
          ref={assetToolbarRef}
          className="hidden 2xl:block absolute top-0 left-[13rem] right-4 xl:right-6 h-12"
        />
      )}

      {/* 左上角：工坊入口 */}
      <button
        type="button"
        onClick={() => setCurrentView('home')}
        className="group flex h-10 items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#1B1B1E]/90 px-3 text-sm font-black tracking-tight text-slate-900 dark:text-white shadow-sm backdrop-blur transition-colors hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-[#26262B] select-none cursor-pointer active:scale-98"
        title={`${studioTitle} · 点击返回首页`}
      >
        <ToolSuiteMark>
          <ShoppingBag className="h-4 w-4 stroke-[2]" />
        </ToolSuiteMark>
        <span className="truncate leading-none">{studioTitle}</span>
      </button>

      {/* 🌟 3. 右侧：保持通透留白（已彻底清除右侧生产预设冗余按钮，预设统一位于左侧悬浮胶囊栏） */}
      <div className="w-7 shrink-0" />
    </header>
  );
}
