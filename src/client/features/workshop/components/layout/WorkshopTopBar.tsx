import React from 'react';
import { ShoppingBag, Plus, History, Settings2 } from 'lucide-react';
import type { WorkshopTab } from '@client/store/types';
import { useAppStore } from '@client/store';
import { ToolSuiteMark } from '@client/shared/icons';
import { WorkshopSideCapsuleBar } from './WorkshopSideCapsuleBar';
import { useWorkshopDockActions } from './WorkshopDockActionsContext';

export interface WorkshopTopBarProps {
  assetToolbarRef?: React.Ref<HTMLDivElement>;
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
}

export function WorkshopTopBar({ assetToolbarRef, activeTab, onSelectTab }: WorkshopTopBarProps) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setIsWorkshopConfigOpen = useAppStore((s) => s.setIsWorkshopConfigOpen);
  const { actions } = useWorkshopDockActions();
  const studioTitle = '电商工坊';
  return (
    <header
      className="relative z-30 flex w-full shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-6 dark:border-white/10 dark:bg-[#151619]/95"
    >
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

      <WorkshopSideCapsuleBar activeTab={activeTab} onSelectTab={onSelectTab} className="order-3 w-full justify-center sm:order-none sm:w-auto" />
      <div className="flex items-center gap-1.5">
        {activeTab === 'studio' && <>
          <button type="button" onClick={() => actions?.onCreate()} disabled={!actions || actions.createDisabled}
            aria-label="新建批次" title="新建批次，当前内容保留到历史" className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/5"><Plus className="h-4 w-4" /><span className="hidden lg:inline">新建批次</span></button>
          <button type="button" onClick={() => actions?.onHistory()} disabled={!actions || actions.disabled}
            aria-label="批次历史" title="查看批次历史" className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/5"><History className="h-4 w-4" /><span className="hidden lg:inline">批次历史</span></button>
        </>}
        <button type="button" onClick={() => { onSelectTab('studio'); setIsWorkshopConfigOpen(true); }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"><Settings2 className="h-4 w-4" />生产设置</button>
      </div>
      {activeTab === 'prompt_assets' && <div ref={assetToolbarRef} className="hidden w-full 2xl:block" />}
    </header>
  );
}
