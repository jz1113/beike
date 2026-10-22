import { Sparkles, Type, Settings2, Plus, History } from 'lucide-react';
import type { WorkshopTab } from '@client/store/types';
import { useAppStore } from '@client/store';
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
  const neutralClass = 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white';
  const tabItems = tabs.map(({ id, label, icon: Icon }) => ({
    id, icon: <Icon className="h-4 w-4 stroke-[2.25]" />, label, onClick: () => onSelectTab(id),
    active: id === activeTab,
    className: id === activeTab
      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200'
      : neutralClass,
  }));
  const dockItems = [
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
  return <aside aria-label="工坊模块导航" className={`absolute inset-x-4 top-16 z-40 flex justify-center lg:inset-x-auto lg:left-1/2 lg:top-3 lg:-translate-x-1/2 ${className}`}>
    <nav aria-label="工坊功能" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 p-1 shadow-sm backdrop-blur-xl dark:border-white/8 dark:bg-[#1b1b22]/95">
      {dockItems.map(item => <button key={item.id} type="button" onClick={item.onClick} disabled={'disabled' in item && item.disabled}
        aria-current={'active' in item && item.active ? 'page' : undefined} aria-label={item.label} title={item.label}
        className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2.5 ${item.className}`}>
        <span className={tabs.some(tab => tab.id === item.id) ? 'hidden sm:inline-flex' : 'inline-flex'}>{item.icon}</span>
        <span className={tabs.some(tab => tab.id === item.id) ? 'hidden sm:inline' : 'hidden xl:inline'}>{item.label}</span>
        {tabs.some(tab => tab.id === item.id) && <span className="sm:hidden">{item.id === 'studio' ? '工作台' : item.id === 'prompt_assets' ? '素材与技能' : item.label}</span>}
      </button>)}
    </nav>
  </aside>;
}
