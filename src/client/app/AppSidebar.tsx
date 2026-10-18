import { FolderOpen, Moon, MoreHorizontal, PanelLeft, Settings, Sun, UserRound, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppView } from '@client/store/appView';
import { useToast } from '@client/shared/hooks/useToast';
import { useI18n } from '@client/shared/i18n';
import { NavGenerateIcon } from '@client/shared/icons';
import { SidebarHistory } from './SidebarHistory';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { useCreatorProfile } from '@client/features/settings/hooks/useCreatorProfile';
import { queueSettingsSection, type SettingsNavSection } from '@client/features/settings/model/settingsNavigation';

const SIDEBAR_COLLAPSED_KEY = 'beike.sidebar.collapsed';

interface Props {
  currentView: AppView;
  onNavigateHub: () => void;
  onNavigateAssets: () => void;
  onNavigateSkills: () => void;
  onOpenSettings: () => void;
  onOpenSession: (id: string) => void;
  onCreateConversation: () => void;
}

function readCollapsed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function SidebarTooltip({ children, desktopHidden = false }: { children: string; desktopHidden?: boolean }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 ${desktopHidden ? 'md:hidden' : ''}`}>
      {children}
    </span>
  );
}

function NavItem({
  label,
  active,
  onClick,
  icon,
  showLabel,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  showLabel: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
        showLabel ? 'md:h-[44px] md:w-full md:justify-start md:gap-[12px] md:rounded-[10px] md:px-[14px]' : ''
      } ${
        active
          ? 'bg-white dark:bg-[#1F1F24] text-slate-900 dark:text-white shadow-xs border border-black/[0.04] dark:border-white/[0.06]'
          : 'text-slate-600 dark:text-[#8E8E93] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-[#EDEDED]'
      }`}
    >
      <span className={`flex shrink-0 items-center justify-center ${showLabel ? 'h-5 w-5 md:h-[20px] md:w-[20px]' : 'h-5 w-5'}`}>{icon}</span>
      {showLabel && <span className="hidden min-w-0 truncate text-[15px] font-medium leading-none md:inline">{label}</span>}
      <SidebarTooltip desktopHidden={showLabel}>{label}</SidebarTooltip>
    </button>
  );
}

function CreatorAvatar({ name, avatar }: { name: string; avatar?: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E7D3C5] text-[13px] font-semibold text-[#9A3412]">
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1)}
    </span>
  );
}

function CreatorDock({
  collapsed,
  onOpenSettings,
}: {
  collapsed: boolean;
  onOpenSettings: () => void;
}) {
  const { profile } = useCreatorProfile();
  const { isDark, toggleTheme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const openSection = (section: SettingsNavSection) => {
    queueSettingsSection(section);
    setOpen(false);
    onOpenSettings();
  };

  return (
    <div ref={rootRef} className="relative w-full">
      {open ? (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+8px)] left-0 z-50 min-w-[196px] overflow-hidden rounded-xl border border-slate-200/80 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#1B1B1E]"
        >
          <button type="button" role="menuitem" onClick={() => openSection('profile')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100 dark:text-[#EDEDED] dark:hover:bg-white/10">
            <UserRound className="h-4 w-4" />创作档案
          </button>
          <button type="button" role="menuitem" onClick={() => openSection('appearance')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100 dark:text-[#EDEDED] dark:hover:bg-white/10">
            {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-500" />}外观与主题
          </button>
          <button type="button" role="menuitem" onClick={() => { toggleTheme(); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100 dark:text-[#EDEDED] dark:hover:bg-white/10">
            {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-500" />}
            {isDark ? '切换至浅色模式' : '切换至深色模式'}
          </button>
          <button type="button" role="menuitem" onClick={() => openSection('api')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100 dark:text-[#EDEDED] dark:hover:bg-white/10">
            <Settings className="h-4 w-4" />系统设置
          </button>
        </div>
      ) : null}
      <div className={`flex w-full items-center ${collapsed ? 'justify-center' : 'gap-1 rounded-xl px-1.5 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}>
        <button
          type="button"
          onClick={() => {
            const wide = window.matchMedia('(min-width: 768px)').matches;
            if (!wide || collapsed) setOpen((value) => !value);
            else openSection('profile');
          }}
          aria-label={profile.name}
          className={`group relative flex min-w-0 items-center ${collapsed ? 'h-10 w-10 justify-center rounded-xl' : 'h-10 flex-1 gap-2.5 rounded-lg px-1.5'}`}
        >
          <CreatorAvatar name={profile.name} avatar={profile.avatar} />
          {!collapsed ? <span className="hidden min-w-0 truncate text-[14px] font-medium text-slate-800 dark:text-[#EDEDED] md:inline">{profile.name}</span> : null}
          {collapsed ? <SidebarTooltip>{profile.name}</SidebarTooltip> : null}
        </button>
        {!collapsed ? (
          <button
            type="button"
            aria-label="更多"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-black/[0.05] hover:text-slate-800 dark:text-[#8E8E93] dark:hover:bg-white/10 dark:hover:text-white md:flex"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function AppSidebar({
  currentView,
  onNavigateHub,
  onNavigateAssets,
  onNavigateSkills,
  onOpenSettings,
  onOpenSession,
  onCreateConversation,
}: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [logoHover, setLogoHover] = useState(false);
  const { message: toastMsg } = useToast(2500);
  const { t } = useI18n();
  const showLabel = !collapsed;
  const showExpandOnLogo = collapsed && logoHover;

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* 记住失败时仍切换当前这次 */
      }
      return next;
    });
  };

  return (
    <aside
      className={`relative z-20 flex h-full w-12 flex-shrink-0 cursor-default select-none flex-col items-center overflow-visible border-r border-slate-200/80 dark:border-white/10 bg-[#F7F7F8] dark:bg-[#101012] px-1 py-3 transition-[width] duration-200 ${
        collapsed ? 'md:w-[64px] md:px-[8px] md:py-[16px]' : 'md:w-[280px] md:items-stretch md:px-[16px] md:py-[16px]'
      }`}
    >
      <div className={`flex w-full flex-col items-center gap-4 ${collapsed ? '' : 'md:items-stretch md:gap-[20px]'}`}>
        <div className={`flex w-full items-center justify-center ${collapsed ? '' : 'md:h-[56px] md:justify-between md:gap-[12px]'}`}>
          <button
            type="button"
            onMouseEnter={() => {
              if (window.matchMedia('(min-width: 768px)').matches) setLogoHover(true);
            }}
            onMouseLeave={() => setLogoHover(false)}
            onClick={() => {
              if (showExpandOnLogo) toggleCollapsed();
              else onNavigateHub();
            }}
            aria-label={showExpandOnLogo ? t('sidebar.expand') : '贝壳云图首页'}
            className={`group flex h-11 w-11 items-center justify-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
              collapsed ? '' : 'md:h-[56px] md:min-w-0 md:flex-1 md:justify-start md:gap-[10px]'
            }`}
          >
            {showExpandOnLogo ? (
              <span className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 md:flex">
                <PanelLeft className="h-5 w-5" strokeWidth={1.8} />
              </span>
            ) : null}
            <img
              src="/app_logo.png"
              alt=""
              draggable={false}
              className={`shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(239,68,68,0.3)] ${showLabel ? 'h-8 w-8 md:h-[32px] md:w-[32px]' : 'h-9 w-9'} ${showExpandOnLogo ? 'md:hidden' : ''}`}
            />
            {showLabel && <span className="hidden truncate text-[16px] font-semibold tracking-wide text-slate-900 dark:text-white md:inline">贝壳云图</span>}
          </button>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={t('sidebar.collapse')}
              aria-expanded
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25 md:flex"
            >
              <PanelLeft className="h-5 w-5" strokeWidth={1.8} />
            </button>
          )}
        </div>

        <nav className={`flex w-full flex-col items-center gap-1 ${collapsed ? '' : 'md:items-stretch md:gap-[6px]'}`} aria-label="主导航">
          <NavItem
            label={t('sidebar.create')}
            active={currentView === 'home'}
            onClick={onNavigateHub}
            showLabel={showLabel}
            icon={<NavGenerateIcon className="h-[20px] w-[20px]" strokeWidth={1.8} />}
          />
          <NavItem
            label={t('sidebar.skills')}
            active={currentView === 'skills'}
            onClick={onNavigateSkills}
            showLabel={showLabel}
            icon={<Wrench className="h-[20px] w-[20px]" strokeWidth={1.8} />}
          />
          <NavItem
            label={t('sidebar.assets')}
            active={currentView === 'assets'}
            onClick={onNavigateAssets}
            showLabel={showLabel}
            icon={<FolderOpen className="h-[20px] w-[20px]" strokeWidth={1.8} />}
          />
        </nav>
      </div>

      {showLabel && (
        <div className="hidden min-h-0 w-full flex-1 md:flex">
          <SidebarHistory
            currentView={currentView}
            onOpenSession={onOpenSession}
            onCreateConversation={onCreateConversation}
          />
        </div>
      )}

      <div className={`mt-auto flex w-full flex-col items-center border-t border-slate-200/80 pt-3 dark:border-white/10 ${collapsed ? '' : 'md:items-stretch md:pb-1 md:pt-3'}`}>
        <CreatorDock collapsed={!showLabel} onOpenSettings={onOpenSettings} />
      </div>

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-xl bg-slate-900/90 backdrop-blur text-white text-xs font-semibold shadow-xl flex items-center gap-2 border border-slate-700/80 pointer-events-none animate-fade-in"
        >
          <span>{toastMsg}</span>
        </div>
      )}
    </aside>
  );
}
