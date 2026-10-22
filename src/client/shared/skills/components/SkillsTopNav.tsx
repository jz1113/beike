import { useState } from 'react';
import { Search, X, Plus, ChevronDown } from 'lucide-react';
import type { SkillMainTab } from '../model/skillTypes';
import { CreateSkillDropdown } from './CreateSkillDropdown';

interface SkillsTopNavProps {
  activeTab: SkillMainTab;
  onTabChange: (tab: SkillMainTab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectAgentCreate: () => void;
  onSelectLocalUpload: () => void;
  onSelectManualCreate: () => void;
}

export function SkillsTopNav({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onSelectAgentCreate,
  onSelectLocalUpload,
  onSelectManualCreate,
}: SkillsTopNavProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const tabs: { key: SkillMainTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'my', label: '我的' },
    { key: 'favorite', label: '收藏' },
  ];

  return (
    <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-black/[0.04] dark:border-white/[0.06] px-6 md:px-8">
      {/* 左侧主要 Tab 导航 */}
      <nav className="flex items-center gap-6" aria-label="技能类型">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`relative pb-1 pt-1 text-[15px] font-medium transition-colors cursor-pointer select-none ${
                isActive
                  ? 'font-bold text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              {isActive && (
                <span
                  className="absolute bottom-[-16px] left-0 right-0 h-[2.5px] rounded-full bg-slate-900 dark:bg-white"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* 右侧功能控制区 */}
      <div className="flex items-center gap-3">
        {/* 搜索技能输入框 */}
        <div className="relative flex items-center">
          <div className="flex h-9 w-48 sm:w-60 md:w-64 items-center gap-2 rounded-full bg-slate-100/90 dark:bg-white/[0.08] px-3.5 text-xs text-slate-700 dark:text-slate-200 transition-colors focus-within:bg-slate-100 dark:focus-within:bg-white/[0.12] focus-within:ring-1 focus-within:ring-slate-300 dark:focus-within:ring-white/20">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索技能"
              className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="shrink-0 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="清空搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 创建技能触发区与下拉浮层 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            aria-expanded={isDropdownOpen}
            className="flex h-9 items-center gap-1.5 rounded-full bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 px-4 text-xs font-semibold text-white dark:text-slate-900 shadow-xs transition-all active:scale-95 cursor-pointer select-none"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>创建技能</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          <CreateSkillDropdown
            isOpen={isDropdownOpen}
            onClose={() => setIsDropdownOpen(false)}
            onSelectAgentCreate={onSelectAgentCreate}
            onSelectLocalUpload={onSelectLocalUpload}
            onSelectManualCreate={onSelectManualCreate}
          />
        </div>
      </div>
    </header>
  );
}
