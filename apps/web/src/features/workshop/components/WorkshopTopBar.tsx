import React from 'react';
import type { WorkshopTab } from '@/types/store';
import { handleWindowDrag, handleWindowDoubleClick } from '@/shared/desktop/windowDrag';
import { useAppStore } from '@/store';
import { isMacOs, isTauriDesktop } from '@/shared/desktop/desktopRuntime';

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
  isAutoPilotRunning?: boolean;
}

export function WorkshopTopBar({ assetToolbarRef, activeTab }: WorkshopTopBarProps) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const macOverlayPad = isTauriDesktop() && isMacOs();
  const studioTitle = '原创种草工坊';
  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleWindowDrag}
      onDoubleClick={handleWindowDoubleClick}
      className={`relative w-full min-h-14 ${macOverlayPad ? 'pt-14' : 'pt-3'} pb-2 px-4 sm:px-6 xl:pr-8 bg-transparent flex items-center justify-between gap-3 shrink-0 z-30 select-none cursor-default transition-all`}
    >
      {activeTab === 'prompt_assets' && (
        <div
          ref={assetToolbarRef}
          className="hidden 2xl:block absolute top-0 left-[13rem] right-4 xl:right-6 h-12"
        />
      )}

      {/* 左上角：工坊入口 */}
      <button
        type="button"
        onClick={() => setCurrentView('home')}
        className="flex items-center gap-2.5 h-10 px-3.5 sm:px-4 rounded-xl bg-white hover:bg-slate-50/90 border border-slate-200/90 text-[15px] font-medium select-none shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-98 group"
        title={`${studioTitle} · 点击返回首页`}
      >
        <img
          src="/brand/workshop_icon.png"
          alt=""
          draggable={false}
          className="w-5.5 h-5.5 object-contain shrink-0 group-hover:scale-105 transition-transform"
        />
        <span className="font-bold text-slate-900 truncate leading-none">{studioTitle}</span>
      </button>

      {/* 🌟 3. 右侧：保持通透留白（已彻底清除右侧生产预设冗余按钮，预设统一位于左侧悬浮胶囊栏） */}
      <div className="w-7 shrink-0" />
    </header>
  );
}
