import { useRef, useState } from 'react';
import { Film, FolderOpen, Layers, RefreshCw, Search, X } from 'lucide-react';
import { CreateSkillDropdown } from './CreateSkillDropdown';

interface Props {
  purpose: 'agent' | 'creation';
  onPurposeChange: (next: 'agent' | 'creation') => void;
  typeCounts: { creation: number; agent: number };
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectAgentCreate: () => void;
  onSelectLocalUpload: () => void;
  onSelectManualCreate: () => void;
  onSelectReference?: () => void;
  onSelectWorkshop?: () => void;
  onRefresh: () => void;
  loading: boolean;
  onFilesLocation?: () => void;
}

export function SkillsTopNav({
  purpose,
  onPurposeChange,
  typeCounts,
  searchQuery,
  onSearchChange,
  loading,
  onRefresh,
  onFilesLocation,
  ...createActions
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = () => setOpen(false);

  return (
    <header className="relative z-30 shrink-0 px-5 pb-3 pt-5 sm:px-8 lg:px-10">
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="技能类型"
          className="flex items-center rounded-full bg-slate-200/70 p-1 dark:bg-white/[0.06]"
        >
          {([
            ['creation', '创作技能', Film],
            ['agent', 'Agent 运行技能', Layers],
          ] as const).map(([value, label, Icon]) => {
            const active = purpose === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                id={`skill-tab-${value}`}
                aria-selected={active}
                aria-controls="skill-library-panel"
                onClick={() => onPurposeChange(value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    const next = value === 'creation' ? 'agent' : 'creation';
                    onPurposeChange(next);
                    document.getElementById(`skill-tab-${next}`)?.focus();
                  }
                }}
                tabIndex={active ? 0 : -1}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-white text-slate-950 shadow-2xs dark:bg-[#252830] dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={13} />
                <span>{label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-medium ${
                    active
                      ? 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {typeCounts[value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex w-full items-center gap-2.5 sm:w-auto">
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200/80 bg-slate-200/55 px-3.5 transition focus-within:border-slate-300 focus-within:bg-white sm:w-64 dark:border-white/10 dark:bg-white/[0.05] dark:focus-within:border-white/25 dark:focus-within:bg-white/[0.08]">
            <Search size={15} className="shrink-0 text-slate-400 dark:text-slate-500" />
            <input
              aria-label="搜索技能"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索技能"
              className="min-w-0 w-full bg-transparent text-xs outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => onSearchChange('')}
                className="rounded-full p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            type="button"
            aria-label="刷新技能库"
            title="刷新技能库"
            disabled={loading}
            onClick={onRefresh}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200/60 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          {onFilesLocation && (
            <button
              type="button"
              aria-label="技能文件管理"
              title="技能文件管理"
              onClick={onFilesLocation}
              className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs text-slate-500 transition hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-white/10"
            >
              <FolderOpen size={16} />
              <span className="hidden lg:inline">技能文件</span>
            </button>
          )}

          <div className="relative shrink-0">
            <button
              ref={triggerRef}
              data-skill-create-trigger
              type="button"
              aria-expanded={open}
              aria-controls="skill-create-options"
              onClick={() => setOpen((value) => !value)}
              className="flex h-9 cursor-pointer items-center justify-center rounded-full bg-slate-900 px-4 text-xs font-semibold text-white shadow-2xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <span>创建技能</span>
            </button>
            <div id="skill-create-options">
              <CreateSkillDropdown isOpen={open} onClose={closeMenu} purpose={purpose} {...createActions} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
