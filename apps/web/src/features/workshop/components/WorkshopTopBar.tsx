import React from 'react';
import type { WorkshopTab } from '@/types/store';
import { handleWindowDrag, handleWindowDoubleClick } from '@/shared/desktop/windowDrag';
import { 
  Sparkles, 
  BookOpen, 
  Camera, 
  Package, 
  Check, 
  ChevronRight
} from 'lucide-react';
import { useAppStore } from '@/store';

export interface WorkshopTopBarProps {
  assetToolbarRef?: React.Ref<HTMLDivElement>;
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
  // 流水线步骤相关（当 activeTab === 'studio' 时呈现）
  currentStage?: number;
  setCurrentStage?: (stage: number) => void;
  itemsCount?: number;
  readyProductCount?: number;
  successfulItemsCount?: number;
  batchMode?: 'original' | 'replication';
  onSwitchMode?: (mode: 'original' | 'replication') => void;
  isAutoPilotRunning?: boolean;
}

export function WorkshopTopBar({ assetToolbarRef, activeTab, currentStage = 1, setCurrentStage, itemsCount = 0, readyProductCount = 0, successfulItemsCount = 0 }: WorkshopTopBarProps) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const tabsConfig = [
    { id: 'studio' as WorkshopTab, label: '创作工作台', desc: '批量采编与AI流水线作业', icon: Sparkles },
    { id: 'prompt_assets' as WorkshopTab, label: '提示词资产库', desc: '行业高转化爆款提示词库', icon: BookOpen },
    { id: 'recipes' as WorkshopTab, label: '类目拍摄架构', desc: '珠宝/服饰/数码专业镜头模版', icon: Camera },
    { id: 'products' as WorkshopTab, label: '商品主体库', desc: '已采编入库的商品数字资产', icon: Package },
  ];

  const currentTabObj = tabsConfig.find((t) => t.id === activeTab) || tabsConfig[0];

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
      onDoubleClick={handleWindowDoubleClick}
      className="relative w-full min-h-24 pt-14 pb-2 px-4 sm:px-6 xl:pr-8 bg-transparent flex items-center justify-between gap-3 shrink-0 z-30 select-none cursor-default transition-all"
    >
      {activeTab === 'prompt_assets' && (
        <div ref={assetToolbarRef} className="hidden xl:block absolute top-0 left-24 right-6 h-12" />
      )}
      {/* 🌟 1. 左侧：原创种草工坊专属程序胶囊（带种草工坊官方 Logo） */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-wrap">
        <button
          type="button"
          onClick={() => setCurrentView('home')}
          className="flex items-center gap-2.5 h-10 px-3.5 sm:px-4 rounded-xl bg-white hover:bg-slate-50/90 border border-slate-200/90 text-[15px] font-medium select-none shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-98 group"
          title="原创种草工坊 · 点击返回首页"
        >
          <img
            src="/brand/workshop_icon.png"
            alt="原创种草工坊"
            draggable={false}
            className="w-5.5 h-5.5 object-contain shrink-0 group-hover:scale-105 transition-transform"
          />
          <span className="font-bold text-slate-900 truncate leading-none">
            原创种草工坊
          </span>
        </button>

        {/* 仅在非 studio 工作台（资产库/架构/商品库）时展示子模块面包屑 */}
        {activeTab !== 'studio' && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium select-none">
            <span className="text-slate-300">/</span>
            <span className="text-slate-600 font-semibold">{currentTabObj.label}</span>
          </div>
        )}
      </div>

      {/* 🌟 2. 中间：极简微拟物步骤导轨（绝对水平居中，消解视觉偏移） */}
      {activeTab === 'studio' && setCurrentStage && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 hidden lg:flex items-center pointer-events-auto">
          <nav aria-label="工坊流水线步骤" className="flex items-center gap-0.5 p-1 bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/60 shadow-2xs select-none">
            {/* 步骤 1: 批量采编 */}
            <button
              type="button"
              onClick={() => setCurrentStage(1)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                currentStage === 1
                  ? 'bg-slate-900 text-white shadow-xs'
                  : itemsCount > 0
                  ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/60'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-mono font-bold ${
                currentStage === 1
                  ? 'bg-white/20 text-white'
                  : itemsCount > 0
                  ? 'bg-emerald-200/80 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {currentStage > 1 && itemsCount > 0 ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : '1'}
              </span>
              <span>采编</span>
              {itemsCount > 0 && (
                <span className={`px-1 rounded text-[9px] font-mono ${currentStage === 1 ? 'bg-slate-800 text-slate-200' : 'bg-emerald-100 text-emerald-800'}`}>
                  {itemsCount}
                </span>
              )}
            </button>

            <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />

            {/* 步骤 2: 选图与架构 */}
            <button
              type="button"
              disabled={successfulItemsCount === 0}
              onClick={() => setCurrentStage(2)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                currentStage === 2
                  ? 'bg-slate-900 text-white shadow-xs'
                  : readyProductCount > 0
                  ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/60'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-mono font-bold ${
                currentStage === 2
                  ? 'bg-white/20 text-white'
                  : readyProductCount > 0
                  ? 'bg-emerald-200/80 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {currentStage > 2 && readyProductCount > 0 ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : '2'}
              </span>
              <span>选图</span>
            </button>

            <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />

            {/* 步骤 3: 分镜提示词 */}
            <button
              type="button"
              disabled={successfulItemsCount === 0}
              onClick={() => setCurrentStage(3)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                currentStage === 3
                  ? 'bg-slate-900 text-white shadow-xs'
                  : currentStage > 3
                  ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/60'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-mono font-bold ${
                currentStage === 3
                  ? 'bg-white/20 text-white'
                  : currentStage > 3
                  ? 'bg-emerald-200/80 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {currentStage > 3 ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : '3'}
              </span>
              <span>提示词</span>
            </button>

            <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />

            {/* 步骤 4: 交付与队列 */}
            <button
              type="button"
              disabled={successfulItemsCount === 0}
              onClick={() => setCurrentStage(4)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                currentStage === 4
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-mono font-bold ${
                currentStage === 4 ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                4
              </span>
              <span>生产交付</span>
            </button>
          </nav>
        </div>
      )}

      {/* 🌟 3. 右侧：保持通透留白（已彻底清除右侧生产预设冗余按钮，预设统一位于左侧悬浮胶囊栏） */}
      <div className="w-7 shrink-0" />
    </header>
  );
}
