import { Settings } from 'lucide-react';
import type { AppView } from '@/store/view';
import { handleWindowDrag, handleWindowDoubleClick } from '@/lib/windowDrag';
import { NavHomeIcon, NavGenerateIcon } from '@/shared/icons';

interface Props {
  currentView: AppView;
  onNavigateHub: () => void;
  onNavigateGenerate: () => void;
  onNavigateAssets: () => void;
  onOpenSettings: () => void;
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
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
      onDoubleClick={handleWindowDoubleClick}
      className="w-12 xl:w-[78px] flex-shrink-0 h-full bg-transparent flex flex-col items-center justify-between pt-3 pb-3 xl:pt-4 xl:pb-5 select-none z-20 relative cursor-default"
    >
      {/* 🌟 1. 顶部：窗口拖拽区域 + 系统品牌 LOGO */}
      <div
        data-tauri-drag-region
        onMouseDown={handleWindowDrag}
        onDoubleClick={handleWindowDoubleClick}
        className="w-full flex flex-col items-center pt-0.5"
      >
        <button
          onClick={onNavigateHub}
          className="w-10 h-10 xl:w-14 xl:h-14 flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer group relative focus:outline-none"
          title="贝壳云图 · 回到首页"
        >
          <div className="relative w-9.5 h-9.5 xl:w-13.5 xl:h-13.5 flex items-center justify-center">
            <img 
              src="/app_logo.png" 
              alt="贝壳云图" 
              draggable={false}
              className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(239,68,68,0.3)] group-hover:drop-shadow-[0_4px_14px_rgba(239,68,68,0.5)] transition-all duration-300"
            />
          </div>

          {/* 悬停浮动品牌微气泡 */}
          <div className="absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold tracking-wide shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-800 flex items-center gap-1 z-50">
            <span>贝壳云图 · 首页</span>
          </div>
        </button>
      </div>

      {/* 🌟 2. 中间导航按钮组 */}
      <nav className="flex flex-col items-center gap-2 xl:gap-4 w-full my-auto py-2">
        {/* 1. 首页 */}
        <button
          onClick={onNavigateHub}
          className={`group flex flex-col items-center justify-center gap-0 xl:gap-1.5 w-9 xl:w-16 py-2 xl:py-2.5 rounded-2xl transition-all cursor-pointer ${
            currentView === 'home'
              ? 'text-slate-950 font-bold'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
          title="首页 / 灵感展馆"
        >
          {/* 现代极简优雅 Home 图标 */}
          <div className="relative w-6 h-6 xl:w-7 xl:h-7 flex items-center justify-center transition-transform group-hover:scale-110">
            <NavHomeIcon active={currentView === 'home'} />
          </div>
          <span className={`hidden xl:block text-[13px] tracking-tight leading-none ${currentView === 'home' ? 'font-bold text-slate-950' : 'font-medium text-slate-600 group-hover:text-slate-900'}`}>
            首页
          </span>
        </button>

        {/* 2. 生成工作区 */}
        <button
          onClick={onNavigateGenerate}
          className={`group flex flex-col items-center justify-center gap-0 xl:gap-1.5 w-9 xl:w-16 py-2 xl:py-2.5 rounded-2xl transition-all cursor-pointer ${
            currentView === 'generate'
              ? 'text-slate-950 font-bold'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
          title="生成 · AI 对话与极速生成工作区"
        >
          {/* 精美 AI 创作双星光芒图标 (生成) */}
          <div className="relative w-6 h-6 xl:w-7 xl:h-7 flex items-center justify-center transition-transform group-hover:scale-110">
            <NavGenerateIcon active={currentView === 'generate'} />
          </div>
          <span className={`hidden xl:block text-[13px] tracking-tight leading-none ${currentView === 'generate' ? 'font-bold text-slate-950' : 'font-medium text-slate-600 group-hover:text-slate-900'}`}>
            生成
          </span>
        </button>

        {/* 3. 资产中心 */}
        <button
          onClick={onNavigateAssets}
          className={`group flex flex-col items-center justify-center gap-0 xl:gap-1.5 w-9 xl:w-16 py-2 xl:py-2.5 rounded-2xl transition-all cursor-pointer ${
            currentView === 'assets'
              ? 'text-slate-950 font-bold'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
          title="资产 · 生成历史与媒体资产库"
        >
          {/* 高保真现代数字媒体资产画廊图标 (资产) */}
          <div className="relative w-6 h-6 xl:w-7 xl:h-7 flex items-center justify-center transition-transform group-hover:scale-110">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              {currentView === 'assets' ? (
                <>
                  <rect x="2.5" y="5.5" width="19" height="15" rx="3.5" className="fill-slate-950 stroke-slate-950 stroke-[1.2]" />
                  <path d="M6 3.5H18" className="stroke-slate-950 stroke-[2]" strokeLinecap="round" />
                  <circle cx="8" cy="10.5" r="1.5" className="fill-white" />
                  <path d="M21 16.5L15.5 12L6.5 19.5" className="stroke-white stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <>
                  <rect x="2.5" y="5.5" width="19" height="15" rx="3.5" className="stroke-slate-500 group-hover:stroke-slate-900 stroke-[1.8]" />
                  <path d="M6 3.5H18" className="stroke-slate-400 group-hover:stroke-slate-700 stroke-[1.8]" strokeLinecap="round" />
                  <circle cx="8" cy="10.5" r="1.5" className="fill-slate-500 group-hover:fill-slate-900" />
                  <path d="M21 16.5L15.5 12L6.5 19.5" className="stroke-slate-500 group-hover:stroke-slate-900 stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
          </div>
          <span className={`hidden xl:block text-[13px] tracking-tight leading-none ${currentView === 'assets' ? 'font-bold text-slate-950' : 'font-medium text-slate-600 group-hover:text-slate-900'}`}>
            资产
          </span>
        </button>
      </nav>

      {/* 🌟 3. 底部操作区：系统设置 */}
      <div className="flex flex-col items-center pb-2 w-full px-2">
        <button
          onClick={onOpenSettings}
          className={`group flex flex-col items-center justify-center gap-0 xl:gap-1.5 w-9 xl:w-16 py-2 xl:py-2.5 rounded-2xl transition-all cursor-pointer select-none ${
            currentView === 'settings'
              ? 'text-slate-950 font-bold bg-slate-100/80'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
          title="系统设置 / 模型与接口配置"
        >
          <div className="relative w-6 h-6 xl:w-7 xl:h-7 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-45">
            <Settings className={`w-5 h-5 xl:w-6 xl:h-6 stroke-[1.8] ${currentView === 'settings' ? 'stroke-slate-950 text-slate-950' : 'stroke-slate-500 group-hover:stroke-slate-900'} transition-colors`} />
          </div>
          <span className={`hidden xl:block text-[13px] tracking-tight leading-none mt-0.5 ${currentView === 'settings' ? 'font-bold text-slate-950' : 'font-medium text-slate-600 group-hover:text-slate-900'}`}>
            设置
          </span>
        </button>
      </div>
    </aside>
  );
}
