import { Sparkles, Type, Settings2, Plus, History } from 'lucide-react';
import type { WorkshopTab } from '@client/store/types';
import { useAppStore } from '@client/store';
import Dock, { type DockItemData } from '@client/shared/ui/Dock';
import { studioDockClass } from '@client/shared/ui/studio';
import { useWorkshopDockActions } from './WorkshopDockActionsContext';

export interface WorkshopSideCapsuleBarProps {
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
  className?: string;
}

const tabs = [
  { id: 'studio', label: '创作工作台', icon: Sparkles },
  { id: 'prompt_assets', label: '素材与技能', icon: Type },
] as const;

export function WorkshopSideCapsuleBar({ activeTab, onSelectTab, className = '' }: WorkshopSideCapsuleBarProps) {
  const setIsWorkshopConfigOpen = useAppStore(s => s.setIsWorkshopConfigOpen);
  const { actions } = useWorkshopDockActions();

  const tabItems: DockItemData[] = tabs.map(({ id, label, icon: Icon }) => ({
    id,
    icon: <Icon className="h-4 w-4 stroke-[2.25]" />,
    label,
    onClick: () => onSelectTab(id),
    active: id === activeTab,
    className: studioDockClass(id === activeTab),
  }));

  const dockItems: DockItemData[] = [
    ...(activeTab === 'studio' ? [{
      id: 'new-batch',
      icon: <Plus className="h-4 w-4" />,
      label: '新建批次',
      onClick: () => actions?.onCreate(),
      disabled: !actions || actions.disabled,
      className: studioDockClass(false),
    }] : []),
    ...tabItems.map((item, index) => index === 0 && activeTab === 'studio'
      ? { ...item, className: `${item.className} ml-1.5` } : item),
    ...(activeTab === 'studio' ? [{
      id: 'batch-history',
      icon: <History className="h-4 w-4" />,
      label: '批次历史',
      onClick: () => actions?.onHistory(),
      disabled: !actions || actions.disabled,
      className: `${studioDockClass(false)} ml-1.5`,
    }] : []),
    {
      id: 'workshop-settings',
      icon: <Settings2 className="h-4 w-4 stroke-[2]" />,
      label: '工坊生产预设',
      onClick: () => { onSelectTab('studio'); setIsWorkshopConfigOpen(true); },
      className: activeTab === 'studio' ? studioDockClass(false) : `${studioDockClass(false)} ml-1.5`,
    },
  ];

  return (
    <aside aria-label="工坊模块导航" className={`absolute left-1/2 top-2.5 z-40 flex -translate-x-1/2 items-center gap-1.5 select-none transition-all ${className}`}>
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
        className="!h-[56px] !items-center !gap-1.5 !border-transparent !bg-transparent !p-0 !shadow-none"
      />
    </aside>
  );
}
