import { ShoppingBag, Plus, History, Settings2 } from 'lucide-react';
import type { WorkshopTab } from '@client/store/types';
import { useAppStore } from '@client/store';
import { ToolSuiteMark } from '@client/shared/icons';
import Dock, { type DockItemData } from '@client/shared/ui/Dock';
import { WorkshopSideCapsuleBar } from './WorkshopSideCapsuleBar';
import { useWorkshopDockActions } from './WorkshopDockActionsContext';
import type { Ref } from 'react';
import './workshopTopBar.css';

export interface WorkshopTopBarProps {
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
  assetNavigationRef?: Ref<HTMLDivElement>;
}

export function WorkshopTopBar({ activeTab, onSelectTab, assetNavigationRef }: WorkshopTopBarProps) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setIsWorkshopConfigOpen = useAppStore((s) => s.setIsWorkshopConfigOpen);
  const { actions } = useWorkshopDockActions();
  const studioTitle = '电商图文';
  const dockButtonClass = '!border-slate-200 !bg-white !text-slate-950 shadow-sm hover:!border-slate-300 hover:!bg-slate-50 dark:!border-white/10 dark:!bg-[#1B1B1E] dark:!text-white dark:hover:!bg-[#26262B] dark:hover:!border-white/20';
  const dockItems: DockItemData[] = [
    ...(activeTab === 'studio' ? [
      { icon: <Plus className="h-4 w-4" />, label: '新建批次', onClick: () => actions?.onCreate(), disabled: !actions || actions.createDisabled, className: dockButtonClass },
      { icon: <History className="h-4 w-4" />, label: '历史批次', onClick: () => actions?.onHistory(), disabled: !actions || actions.disabled, className: dockButtonClass },
    ] : []),
    { icon: <Settings2 className="h-4 w-4" />, label: '生产设置', onClick: () => { onSelectTab('studio'); setIsWorkshopConfigOpen(true); }, className: dockButtonClass },
  ];
  return (
    <header
      className={`workshop-topbar relative z-30 flex min-h-[88px] w-full shrink-0 flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-6 lg:px-8 ${activeTab === 'prompt_assets' ? 'workshop-topbar-assets' : ''}`}
    >
      {/* 左上角：电商图文入口 */}
      <button
        type="button"
        onClick={() => setCurrentView('home')}
        className="group flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm font-black tracking-tight text-slate-900 shadow-sm backdrop-blur transition-colors hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-[#1B1B1E]/90 dark:text-white dark:hover:border-white/20 dark:hover:bg-[#26262B] select-none cursor-pointer active:scale-98"
        title={`${studioTitle} · 点击返回首页`}
      >
        <ToolSuiteMark>
          <ShoppingBag className="h-4 w-4 stroke-[2]" />
        </ToolSuiteMark>
        <span className="truncate leading-none">{studioTitle}</span>
      </button>

      {activeTab === 'prompt_assets' && <div ref={assetNavigationRef} className="workshop-assets-navigation" />}

      <div className="contents sm:ml-auto sm:flex sm:max-w-full sm:items-center sm:justify-end sm:gap-2">
        <WorkshopSideCapsuleBar activeTab={activeTab} onSelectTab={onSelectTab} className="order-3 w-full justify-center sm:order-none sm:w-auto" />
        {activeTab === 'studio' && <Dock items={dockItems} positioned={false} expandsOnHover={false} showLabels labelPlacement="bottom" panelHeight={56} dockHeight={56} baseItemSize={42} className="!border-transparent !bg-transparent !shadow-none" />}
      </div>
    </header>
  );
}
