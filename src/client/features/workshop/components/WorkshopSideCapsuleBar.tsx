import { Sparkles, Type, Camera, Settings2, Plus, History } from 'lucide-react';
import type { WorkshopTab } from '@client/store/types';
import { useAppStore } from '@client/store';
import Dock, { type DockItemData } from '@client/shared/ui/Dock';
import { useWorkshopDockActions } from './WorkshopDockActionsContext';

export interface WorkshopSideCapsuleBarProps {
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
  className?: string;
}
const tabs = [
  { id: 'studio', label: '创作工作台', icon: Sparkles },
  { id: 'prompt_assets', label: '提示词资产库', icon: Type },
  { id: 'recipes', label: '类目技能', icon: Camera },
] as const;

export function WorkshopSideCapsuleBar({ activeTab, onSelectTab, className = '' }: WorkshopSideCapsuleBarProps) {
  const setIsWorkshopConfigOpen = useAppStore(s => s.setIsWorkshopConfigOpen);
  const { actions } = useWorkshopDockActions();
  const neutralClass = '!border-slate-200 !bg-white !text-slate-950 shadow-sm hover:!border-slate-300 hover:!bg-slate-50';
  const tabItems: DockItemData[] = tabs.map(({ id, label, icon: Icon }) => ({
    id, icon: <Icon className="h-4 w-4 stroke-[2.25]" />, label, onClick: () => onSelectTab(id),
    active: id === activeTab,
    className: id === activeTab
      ? '!border-indigo-600 !bg-indigo-600 !text-white shadow-sm shadow-indigo-500/25 hover:!border-indigo-600 hover:!bg-indigo-600 hover:!text-white'
      : neutralClass,
  }));
  const dockItems: DockItemData[] = [
    ...(activeTab === 'studio' ? [{
      id: 'new-batch', icon: <Plus className="h-4 w-4" />, label: '新建批次', onClick: () => actions?.onCreate(),
      disabled: !actions || actions.disabled, className: neutralClass,
    }] : []),
    ...tabItems.map((item, index) => index === 0 && activeTab === 'studio'
      ? { ...item, className: `${item.className} ml-1.5` } : item),
    ...(activeTab === 'studio' ? [{
      id: 'batch-history', icon: <History className="h-4 w-4" />, label: '批次历史', onClick: () => actions?.onHistory(),
      disabled: !actions || actions.disabled, className: `${neutralClass} ml-1.5`,
    }] : []),
    {
      id: 'workshop-settings', icon: <Settings2 className="h-4 w-4 stroke-[2]" />, label: '工坊生产预设',
      onClick: () => { onSelectTab('studio'); setIsWorkshopConfigOpen(true); },
      className: activeTab === 'studio' ? neutralClass : `${neutralClass} ml-1.5`,
    },
  ];
  return <aside aria-label="工坊模块导航" className={`absolute left-1/2 top-2.5 z-40 flex -translate-x-1/2 items-center gap-1.5 select-none transition-all ${className}`}>
    <Dock items={dockItems} positioned={false} expandsOnHover={false} showLabels labelPlacement="bottom"
      panelHeight={56} dockHeight={56} baseItemSize={42} magnification={58} distance={140}
      className="!h-[56px] !items-center !gap-1.5 !border-transparent !bg-transparent !p-0 !shadow-none" />
  </aside>;
}
