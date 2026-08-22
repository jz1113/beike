'use client';
import { 
  Settings 
} from 'lucide-react';

interface Props {
  currentView: 'hub' | 'generate' | 'buyer_show' | 'assets';
  onNavigateHub: () => void;
  onNavigateGenerate: () => void;
  onNavigateBuyerShow: () => void;
  onNavigateAssets: () => void;
  onOpenProductVault: () => void;
  onOpenPromptVault: () => void;
  onOpenSettings: () => void;
}

export default function AppSidebar({
  currentView,
  onNavigateHub,
  onNavigateGenerate,
  onNavigateBuyerShow,
  onNavigateAssets,
  onOpenProductVault,
  onOpenPromptVault,
  onOpenSettings
}: Props) {
  return (
    <aside className="w-[56px] lg:w-[78px] flex-shrink-0 h-full bg-white border-r border-slate-100/90 flex flex-col items-center justify-between py-4 lg:py-5 select-none z-40 relative shadow-2xs">
      {/* 🌟 1. 顶部：系统品牌 LOGO (原生纯粹无框，高质感悬浮) */}
      <div className="flex flex-col items-center pt-1">
        <button
          onClick={onNavigateHub}
          className="w-9 h-9 lg:w-12 lg:h-12 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer group relative focus:outline-none"
          title="贝壳云图 · 回到灵感首页"
        >
          <div className="relative w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center">
            <img 
              src="/app_logo.png" 
              alt="贝壳云图" 
              draggable={false}
              className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(239,68,68,0.2)] group-hover:drop-shadow-[0_4px_14px_rgba(239,68,68,0.35)] transition-all duration-300"
            />
          </div>

          {/* 悬停浮动品牌微气泡 */}
          <div className="absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-bold tracking-wide shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-slate-700/50 flex items-center gap-1 z-50">
            <span>贝壳云图 · 首页</span>
          </div>
        </button>
      </div>

      {/* 🌟 2. 中间导航按钮组 (大号现代矢量图标 + 放大字号) */}
      <nav className="flex flex-col items-center gap-3 lg:gap-5 w-full my-auto py-2">
        {/* 灵感 (首页展馆) */}
        <button
          onClick={onNavigateHub}
          className={`group flex flex-col items-center justify-center gap-0 lg:gap-1.5 w-10 lg:w-16 py-2.5 lg:py-2 rounded-2xl transition-all cursor-pointer ${
            currentView === 'hub'
              ? 'text-slate-950 font-bold'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
          title="灵感展馆 / 首页"
        >
          {/* 高级璀璨四角星标 (灵感) */}
          <div className="relative w-7 h-7 flex items-center justify-center transition-transform group-hover:scale-110">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              {currentView === 'hub' ? (
                <>
                  <path 
                    d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z" 
                    className="fill-slate-950 stroke-slate-950 stroke-[1.2]" 
                  />
                  <circle cx="19" cy="5" r="1.5" className="fill-slate-950" />
                  <circle cx="5" cy="19" r="1" className="fill-slate-950" />
                </>
              ) : (
                <>
                  <path 
                    d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z" 
                    className="stroke-slate-500 group-hover:stroke-slate-900 stroke-[1.8]" 
                    strokeLinejoin="round"
                  />
                  <circle cx="19" cy="5" r="1.2" className="stroke-slate-500 group-hover:stroke-slate-900 stroke-[1.5]" />
                </>
              )}
            </svg>
          </div>
          <span className={`hidden lg:block text-[13px] tracking-tight leading-none ${currentView === 'hub' ? 'font-bold text-slate-950' : 'font-medium text-slate-600 group-hover:text-slate-900'}`}>
            灵感
          </span>
        </button>

        {/* 生成工作区 */}
        <button
          onClick={onNavigateGenerate}
          className={`group flex flex-col items-center justify-center gap-0 lg:gap-1.5 w-10 lg:w-16 py-2.5 lg:py-2 rounded-2xl transition-all cursor-pointer ${
            currentView === 'generate'
              ? 'text-slate-950 font-bold'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
          title="AI 对话与极速生图/生视频工作区"
        >
          {/* 精美 AI 创作光束星标 (生成) */}
          <div className="relative w-7 h-7 flex items-center justify-center transition-transform group-hover:scale-110">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              {currentView === 'generate' ? (
                <>
                  <path 
                    d="M12 2.5L14.8 9.2L21.5 12L14.8 14.8L12 21.5L9.2 14.8L2.5 12L9.2 9.2L12 2.5Z" 
                    className="fill-slate-950 stroke-slate-950 stroke-[1.2]" 
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12" r="2" className="fill-white" />
                </>
              ) : (
                <>
                  <path 
                    d="M12 2.5L14.8 9.2L21.5 12L14.8 14.8L12 21.5L9.2 14.8L2.5 12L9.2 9.2L12 2.5Z" 
                    className="stroke-slate-500 group-hover:stroke-slate-900 stroke-[1.8]" 
                    strokeLinejoin="round"
                  />
                  <path d="M12 8V16M8 12H16" className="stroke-slate-400 group-hover:stroke-slate-700 stroke-[1.5]" strokeLinecap="round" />
                </>
              )}
            </svg>
          </div>
          <span className={`hidden lg:block text-[13px] tracking-tight leading-none ${currentView === 'generate' ? 'font-bold text-slate-950' : 'font-medium text-slate-600 group-hover:text-slate-900'}`}>
            生成
          </span>
        </button>

        {/* 种草工坊 */}
        <button
          onClick={onNavigateBuyerShow}
          className={`group flex flex-col items-center justify-center gap-0 lg:gap-1.5 w-10 lg:w-16 py-2.5 lg:py-2 rounded-2xl transition-all cursor-pointer ${
            currentView === 'buyer_show'
              ? 'text-slate-950 font-bold'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
          title="种草工坊 · 爆款换人换品"
        >
          <div className="w-6.5 h-6.5 rounded-lg overflow-hidden flex items-center justify-center shadow-xs border border-blue-100 transition-transform group-hover:scale-110">
            <img 
              src="/brand/workshop_icon.png" 
              alt="种草工坊" 
              draggable={false}
              className="w-full h-full object-contain" 
            />
          </div>
          <span className={`hidden lg:block text-[13px] tracking-tight leading-none ${currentView === 'buyer_show' ? 'font-bold text-slate-950' : 'font-medium text-slate-600 group-hover:text-slate-900'}`}>
            工坊
          </span>
        </button>

        {/* 资产中心 */}
        <button
          onClick={onNavigateAssets}
          className={`group flex flex-col items-center justify-center gap-0 lg:gap-1.5 w-10 lg:w-16 py-2.5 lg:py-2 rounded-2xl transition-all cursor-pointer ${
            currentView === 'assets'
              ? 'text-slate-950 font-bold'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
          title="资产中心 (生成历史 / 商品素材 / 风格配方)"
        >
          {/* 精致 3D 叠层资产库图标 (资产) */}
          <div className="relative w-7 h-7 flex items-center justify-center transition-transform group-hover:scale-110">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              {currentView === 'assets' ? (
                <>
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" className="fill-slate-950 stroke-slate-950 stroke-[1.2]" strokeLinejoin="round" />
                  <path d="M2 12L12 17L22 12" className="stroke-slate-950 stroke-[2]" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 17L12 22L22 17" className="stroke-slate-950 stroke-[2]" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <>
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" className="stroke-slate-500 group-hover:stroke-slate-900 stroke-[1.8]" strokeLinejoin="round" />
                  <path d="M2 12L12 17L22 12" className="stroke-slate-500 group-hover:stroke-slate-900 stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 17L12 22L22 17" className="stroke-slate-500 group-hover:stroke-slate-900 stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
          </div>
          <span className={`hidden lg:block text-[13px] tracking-tight leading-none ${currentView === 'assets' ? 'font-bold text-slate-950' : 'font-medium text-slate-600 group-hover:text-slate-900'}`}>
            资产
          </span>
        </button>
      </nav>

      {/* 🌟 3. 底部操作区：系统设置 */}
      <div className="flex flex-col items-center pb-2 w-full px-2">
        <button
          onClick={onOpenSettings}
          className="group flex flex-col items-center justify-center gap-0 lg:gap-1.5 w-10 lg:w-16 py-2.5 lg:py-2 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all cursor-pointer select-none"
          title="系统设置 / 模型与接口配置"
        >
          <div className="relative w-7 h-7 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-45">
            <Settings className="w-5.5 h-5.5 stroke-slate-500 group-hover:stroke-slate-900 stroke-[1.8]" />
          </div>
          <span className="hidden lg:block text-[13px] font-medium text-slate-600 group-hover:text-slate-900 tracking-tight leading-none">
            设置
          </span>
        </button>
      </div>
    </aside>
  );
}
