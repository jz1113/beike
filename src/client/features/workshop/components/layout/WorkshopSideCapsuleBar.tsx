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
    <nav aria-label="电商图文模块导航" className={`flex items-center gap-1 ${className}`}>
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={id === activeTab ? 'page' : undefined}
        onClick={() => onSelectTab(id)}
        className={`flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold shadow-sm transition-colors focus-visible:outline-indigo-500 sm:text-sm ${id === activeTab ? 'border-slate-300 bg-white text-slate-950 dark:border-white/20 dark:bg-[#26262B] dark:text-white' : 'border-slate-200 bg-white/90 text-slate-500 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-[#1B1B1E]/90 dark:text-slate-300 dark:hover:bg-[#26262B] dark:hover:text-white'}`}>
        <Icon className="h-4 w-4" />{label}
      </button>)}
    </nav>
  );
}
