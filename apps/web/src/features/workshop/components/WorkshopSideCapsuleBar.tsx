import React from 'react';
import type { WorkshopTab } from '@/types/store';
import { 
  Sparkles, 
  Type, 
  Camera, 
  Package, 
  Settings2 
} from 'lucide-react';
import { useAppStore } from '@/store';
import Dock, { type DockItemData } from '@/shared/ui/Dock';

export interface WorkshopSideCapsuleBarProps {
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
  className?: string;
}

interface NavItem {
  id: WorkshopTab;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function WorkshopSideCapsuleBar({
  activeTab,
  onSelectTab,
  className = '',
}: WorkshopSideCapsuleBarProps) {
  const setIsWorkshopConfigOpen = useAppStore((s) => s.setIsWorkshopConfigOpen);
  const navItems: NavItem[] = [
    {
      id: 'studio',
      label: '创作工作台',
      desc: '批量采编与AI流水线',
      icon: Sparkles,
    },
    {
      id: 'prompt_assets',
      label: '提示词资产库',
      desc: '行业高转化爆款提示词',
      icon: Type,
    },
    {
      id: 'recipes',
      label: '类目拍摄架构',
      desc: '珠宝/服饰/数码镜头模版',
      icon: Camera,
    },
    {
      id: 'products',
      label: '商品主体库',
      desc: '已采编入库商品资产',
      icon: Package,
    },
  ];
  // Keep the workshop dock visually and physically consistent with the
  // headline-poster studio: high-contrast idle icons and a spring magnifier.
  const dockButtonClass = '!border-slate-200 !bg-white !text-slate-950 shadow-sm hover:!border-slate-300 hover:!bg-slate-50';
  const activeDockButtonClass = '!border-indigo-600 !bg-indigo-600 !text-white shadow-sm shadow-indigo-500/25 hover:!border-indigo-600 hover:!bg-indigo-600 hover:!text-white';
  const dockItems: DockItemData[] = [
    ...navItems.map((item) => {
      const Icon = item.icon;
      return {
        icon: <Icon className="h-4 w-4 stroke-[2.25]" />,
        label: item.label,
        onClick: () => onSelectTab(item.id),
        className: item.id === activeTab ? activeDockButtonClass : dockButtonClass,
      };
    }),
  ];

  return (
    <aside
      aria-label="工坊模块导航"
      className={`absolute left-1/2 top-2.5 z-40 flex -translate-x-1/2 items-center gap-1.5 select-none transition-all ${className}`}
    >
      {activeTab === 'studio' && (
        <div id="workshop-batch-new-anchor" className="flex items-center" />
      )}

      <Dock
        items={dockItems}
        positioned={false}
        expandsOnHover={false}
        showLabels
        labelPlacement="bottom"
        panelHeight={56}
        dockHeight={56}
        baseItemSize={42}
        magnification={58}
        distance={140}
        className="!h-[56px] !gap-1.5 !border-transparent !bg-transparent !p-0 !shadow-none"
      />

      {activeTab === 'studio' && (
        <div id="workshop-batch-history-anchor" className="flex items-center" />
      )}
      <button
        type="button"
        onClick={() => setIsWorkshopConfigOpen(true)}
        aria-label="工坊生产预设"
        title="工坊生产预设"
        className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm transition-[transform,colors,box-shadow] duration-200 ease-out hover:scale-110 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-95"
      >
        <Settings2 className="h-4 w-4 stroke-[2]" />
      </button>
    </aside>
  );
}
