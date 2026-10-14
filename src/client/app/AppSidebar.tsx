import { Settings } from 'lucide-react';
import type { AppView } from '@client/store/appView';
import { NavHomeIcon, NavGenerateIcon } from '@client/shared/icons';

interface Props {
  currentView: AppView;
  onNavigateHub: () => void;
  onNavigateGenerate: () => void;
  onNavigateAssets: () => void;
  onOpenSettings: () => void;
}

function SidebarTooltip({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
      {children}
    </span>
  );
}

export default function AppSidebar({
  currentView,
  onNavigateHub,
  onNavigateGenerate,
  onNavigateAssets,
  onOpenSettings
}: Props) {
  return (
    <aside
      className="w-12 xl:w-[78px] flex-shrink-0 h-full bg-transparent flex flex-col items-center justify-between pt-3 pb-3 xl:pt-4 xl:pb-5 select-none z-20 relative cursor-default"
    >
      {/* 🌟 1. 顶部：窗口拖拽区域 + 系统品牌 LOGO */}
      <div
        className="w-full flex flex-col items-center pt-0.5"
      >
        <button
          onClick={onNavigateHub}
          aria-label="贝壳云图首页"
          className="group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25"
        >
          <div className="relative flex h-10 w-10 items-center justify-center pointer-events-none">
            <img 
              src="/app_logo.png" 
              alt="贝壳云图" 
              draggable={false}
              className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(239,68,68,0.3)] group-hover:drop-shadow-[0_4px_14px_rgba(239,68,68,0.5)] transition-all duration-300 pointer-events-none"
            />
          </div>
        </button>
      </div>

      {/* 🌟 2. 中间导航按钮组 */}
      <nav className="flex w-full flex-col items-center gap-3 py-2">
        {/* 1. 首页 */}
        <button
          onClick={onNavigateHub}
          aria-label="首页"
          className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
            currentView === 'home'
              ? 'bg-slate-950 text-white shadow-sm'
              : 'text-slate-400 hover:bg-white/85 hover:text-slate-950'
          }`}
          title="首页 / 灵感展馆"
        >
          {/* 现代极简优雅 Home 图标 */}
          <div className="relative flex h-6 w-6 items-center justify-center transition-transform group-hover:scale-110 pointer-events-none">
            <NavHomeIcon active={currentView === 'home'} />
          </div>
          <SidebarTooltip>首页</SidebarTooltip>
        </button>

        {/* 2. 生成工作区 */}
        <button
          onClick={onNavigateGenerate}
          aria-label="生成"
          className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
            currentView === 'generate'
              ? 'bg-slate-950 text-white shadow-sm'
              : 'text-slate-400 hover:bg-white/85 hover:text-slate-950'
          }`}
          title="生成 · AI 对话与极速生成工作区"
        >
          {/* 精美 AI 创作双星光芒图标 (生成) */}
          <div className="relative flex h-6 w-6 items-center justify-center transition-transform group-hover:scale-110 pointer-events-none">
            <NavGenerateIcon active={currentView === 'generate'} />
          </div>
          <SidebarTooltip>生成</SidebarTooltip>
        </button>

        {/* 3. 资产中心 */}
        <button
          onClick={onNavigateAssets}
          aria-label="资产"
          className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
            currentView === 'assets'
              ? 'bg-slate-950 text-white shadow-sm'
              : 'text-slate-400 hover:bg-white/85 hover:text-slate-950'
          }`}
          title="资产 · 生成历史与媒体资产库"
        >
          {/* 高保真现代数字媒体资产画廊图标 (资产) */}
          <div className="relative flex h-6 w-6 items-center justify-center transition-transform group-hover:scale-110 pointer-events-none">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              {currentView === 'assets' ? (
                <>
                  <rect x="2.5" y="5.5" width="19" height="15" rx="3.5" className="fill-current stroke-current stroke-[1.2]" />
                  <path d="M6 3.5H18" className="stroke-current stroke-[2]" strokeLinecap="round" />
                  <circle cx="8" cy="10.5" r="1.5" className="fill-slate-950" />
                  <path d="M21 16.5L15.5 12L6.5 19.5" className="stroke-slate-950 stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <>
                  <rect x="2.5" y="5.5" width="19" height="15" rx="3.5" className="stroke-current stroke-[1.8]" />
                  <path d="M6 3.5H18" className="stroke-current stroke-[1.8]" strokeLinecap="round" />
                  <circle cx="8" cy="10.5" r="1.5" className="fill-current" />
                  <path d="M21 16.5L15.5 12L6.5 19.5" className="stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
          </div>
          <SidebarTooltip>资产</SidebarTooltip>
        </button>
      </nav>

      {/* 🌟 3. 底部操作区：系统设置 */}
      <div className="flex w-full flex-col items-center border-t border-slate-200/70 pt-3">
        <button
          onClick={onOpenSettings}
          aria-label="设置"
          className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-100 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
            currentView === 'settings'
              ? 'bg-slate-950 text-white shadow-sm'
              : 'text-slate-400 hover:bg-white/85 hover:text-slate-950'
          }`}
          title="设置"
        >
          <div className="relative flex h-6 w-6 items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-45 pointer-events-none">
            <Settings className="h-5 w-5 stroke-current stroke-[1.8] transition-colors" />
          </div>
          <SidebarTooltip>设置</SidebarTooltip>
        </button>
      </div>
    </aside>
  );
}
