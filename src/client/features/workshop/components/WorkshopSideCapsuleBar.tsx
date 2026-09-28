import { Sparkles, Type, Camera, Package, Settings2 } from 'lucide-react';
import type { WorkshopTab } from '@client/store/types';
import { useAppStore } from '@client/store';
import Dock, { type DockItemData } from '@client/shared/ui/Dock';

export interface WorkshopSideCapsuleBarProps {
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
  className?: string;
}
const tabs = [
  { id: 'studio', label: '创作工作台', icon: Sparkles },
  { id: 'prompt_assets', label: '提示词资产库', icon: Type },
  { id: 'recipes', label: '拍摄架构', icon: Camera },
  { id: 'categories', label: '商品类目', icon: Package },
] as const;

export function WorkshopSideCapsuleBar({ activeTab, onSelectTab, className = '' }: WorkshopSideCapsuleBarProps) {
  const setIsWorkshopConfigOpen = useAppStore(s => s.setIsWorkshopConfigOpen);
  const dockItems: DockItemData[] = tabs.map(({ id, label, icon: Icon }) => ({
    icon: <Icon className="h-4 w-4 stroke-[2.25]" />, label, onClick: () => onSelectTab(id),
    className: id === activeTab
      ? '!border-indigo-600 !bg-indigo-600 !text-white shadow-sm shadow-indigo-500/25 hover:!border-indigo-600 hover:!bg-indigo-600 hover:!text-white'
      : '!border-slate-200 !bg-white !text-slate-950 shadow-sm hover:!border-slate-300 hover:!bg-slate-50',
  }));
  return <aside aria-label="工坊模块导航" className={`absolute left-1/2 top-2.5 z-40 flex -translate-x-1/2 items-center gap-1.5 select-none transition-all ${className}`}>
    <div hidden={activeTab !== 'studio'} id="workshop-batch-new-anchor" className="items-center" />
    <Dock items={dockItems} positioned={false} expandsOnHover={false} showLabels labelPlacement="bottom"
      panelHeight={56} dockHeight={56} baseItemSize={42} magnification={58} distance={140}
      className="!h-[56px] !gap-1.5 !border-transparent !bg-transparent !p-0 !shadow-none" />
    <div hidden={activeTab !== 'studio'} id="workshop-batch-history-anchor" className="items-center" />
    <button type="button" onClick={() => { onSelectTab('studio'); setIsWorkshopConfigOpen(true); }}
      aria-label="工坊生产预设" title="工坊生产预设"
      className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm transition-[transform,colors,box-shadow] duration-200 ease-out hover:scale-110 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-95">
      <Settings2 className="h-4 w-4 stroke-[2]" />
    </button>
  </aside>;
}
