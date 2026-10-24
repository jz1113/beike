import { Sparkles, LibraryBig } from 'lucide-react';
import type { WorkshopTab } from '@client/store/types';

export interface WorkshopSideCapsuleBarProps {
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
  className?: string;
}

const tabs = [
  { id: 'studio', label: '生产工作台', icon: Sparkles },
  { id: 'prompt_assets', label: '素材与技能', icon: LibraryBig },
] as const;

export function WorkshopSideCapsuleBar({ activeTab, onSelectTab, className = '' }: WorkshopSideCapsuleBarProps) {
  return (
    <nav aria-label="工坊模块导航" className={`flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5 ${className}`}>
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={id === activeTab ? 'page' : undefined}
        onClick={() => onSelectTab(id)}
        className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-indigo-500 sm:px-4 ${id === activeTab ? 'bg-white text-indigo-700 shadow-sm dark:bg-white/10 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
        <Icon className="h-4 w-4" />{label}
      </button>)}
    </nav>
  );
}
