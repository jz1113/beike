import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Film, FolderOpen, Layers, RefreshCw, Search, X } from 'lucide-react';

interface Props {
  filters?: ReactNode;
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
  filters,
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
    <header className="relative z-30 shrink-0 px-5 pb-4 pt-5 sm:px-8">
      <div className="grid w-full min-w-0 items-center gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        {filters}
        <div
          role="tablist"
          aria-label="技能类型"
          className="flex max-w-full items-center justify-self-end rounded-full bg-slate-200/70 p-1 dark:bg-white/[0.06] lg:col-start-2 lg:row-start-1"
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
                    ? 'bg-white text-slate-950 shadow-2xs dark:bg-[#303030] dark:text-white'
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

        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2.5 sm:w-auto sm:justify-self-end lg:col-start-2 lg:row-start-2">
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
              aria-haspopup="menu"
              aria-controls="skill-create-options"
              onClick={() => setOpen((value) => !value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
              }}
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

interface CreateSkillDropdownProps {
  purpose?: 'agent' | 'creation';
  isOpen: boolean;
  onClose: () => void;
  onSelectAgentCreate: () => void;
  onSelectLocalUpload: () => void;
  onSelectManualCreate: () => void;
  onSelectReference?: () => void;
  onSelectWorkshop?: () => void;
}

function CreateSkillDropdown({
  isOpen,
  onClose,
  onSelectAgentCreate,
  onSelectLocalUpload,
  onSelectManualCreate,
}: CreateSkillDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!menuRef.current?.contains(target) && !target.closest('[data-skill-create-trigger]')) {
        closeRef.current();
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        document.querySelector<HTMLButtonElement>('[data-skill-create-trigger]')?.focus();
      } else if (event.key === 'Tab') {
        closeRef.current();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        if (!menuRef.current?.contains(document.activeElement)) return;
        event.preventDefault();
        const items = Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('button'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', keyboard);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const actions = [
    { label: '通过Agent创建', action: onSelectAgentCreate },
    { label: '上传本地Skill', action: onSelectLocalUpload },
    { label: '手动创建Skill', action: onSelectManualCreate },
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="创建技能方式"
      className="absolute right-0 top-full z-50 mt-2.5 w-44 rounded-[22px] border border-slate-200/80 bg-white/95 p-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#22242A]/95 dark:shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
    >
      {actions.map(({ label, action }) => (
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          key={label}
          onClick={() => {
            onClose();
            action();
          }}
          className="flex w-full cursor-pointer items-center rounded-xl px-4 py-2.5 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100/90 hover:text-slate-950 focus:outline-none focus-visible:bg-slate-100/90 dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white dark:focus-visible:bg-white/[0.08]"
        >
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
