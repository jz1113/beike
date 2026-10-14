import { FolderOpen, PanelLeft, PanelLeftClose, Settings, Sparkle, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AppView } from '@client/store/appView';
import { useToast } from '@client/shared/hooks/useToast';
import { SidebarHistory } from './SidebarHistory';

const SIDEBAR_COLLAPSED_KEY = 'beike.sidebar.collapsed';

interface Props {
  currentView: AppView;
  onNavigateHub: () => void;
  onNavigateAssets: () => void;
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
          ? 'bg-[#ECEDEF] text-slate-950'
          : 'text-slate-500 hover:bg-[#ECEDEF]/80 hover:text-slate-950'
      }`}
    >
      <span className={`flex shrink-0 items-center justify-center ${showLabel ? 'h-5 w-5 md:h-[20px] md:w-[20px]' : 'h-5 w-5'}`}>{icon}</span>
      {showLabel && <span className="hidden min-w-0 truncate text-[15px] font-medium leading-none md:inline">{label}</span>}
      <SidebarTooltip desktopHidden={showLabel}>{label}</SidebarTooltip>
    </button>
  );
}

export default function AppSidebar({
  currentView,
  onNavigateHub,
  onNavigateAssets,
  onOpenSettings,
  onOpenSession,
  onCreateConversation,
}: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [logoHover, setLogoHover] = useState(false);
  const { message: toastMsg, show: showToast } = useToast(2500);
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
      className={`relative z-20 flex h-full w-12 flex-shrink-0 cursor-default select-none flex-col items-center overflow-hidden border-r border-slate-200/80 bg-[#F6F7F9] px-1 py-3 transition-[width] duration-200 ${
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
            aria-label={showExpandOnLogo ? '展开侧栏' : '贝壳云图首页'}
            className={`group flex h-11 w-11 items-center justify-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
              collapsed ? '' : 'md:h-[56px] md:min-w-0 md:flex-1 md:justify-start md:gap-[10px]'
            }`}
          >
            {showExpandOnLogo ? (
              <span className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 md:flex">
                <PanelLeft className="h-5 w-5" strokeWidth={1.8} />
              </span>
            ) : null}
            <img
              src="/app_logo.png"
              alt=""
              draggable={false}
              className={`shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(239,68,68,0.3)] ${showLabel ? 'h-8 w-8 md:h-[32px] md:w-[32px]' : 'h-9 w-9'} ${showExpandOnLogo ? 'md:hidden' : ''}`}
            />
            {showLabel && <span className="hidden truncate text-[16px] font-semibold tracking-wide text-slate-900 md:inline">贝壳云图</span>}
          </button>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="收起侧栏"
              aria-expanded
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/80 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25 md:flex"
            >
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.8} />
            </button>
          )}
        </div>

        <nav className={`flex w-full flex-col items-center gap-1 ${collapsed ? '' : 'md:items-stretch md:gap-[6px]'}`} aria-label="主导航">
          <NavItem
            label="创作"
            active={currentView === 'home'}
            onClick={onNavigateHub}
            showLabel={showLabel}
            icon={<Sparkle className="h-[20px] w-[20px]" strokeWidth={1.8} />}
          />
          <NavItem
            label="技能"
            active={false}
            onClick={() => showToast('技能功能建设中，敬请期待')}
            showLabel={showLabel}
            icon={<Wrench className="h-[20px] w-[20px]" strokeWidth={1.8} />}
          />
          <NavItem
            label="资产"
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

      <div className={`mt-auto flex w-full flex-col items-center border-t border-slate-200/80 pt-3 ${collapsed ? '' : 'md:items-stretch md:pb-1 md:pt-4'}`}>
        <NavItem
          label="设置"
          active={currentView === 'settings'}
          onClick={onOpenSettings}
          showLabel={showLabel}
          icon={<Settings className="h-[20px] w-[20px] transition-transform duration-300 group-hover:rotate-45" strokeWidth={1.8} />}
        />
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
