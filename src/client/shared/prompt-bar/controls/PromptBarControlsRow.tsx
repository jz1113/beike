import React from 'react';
import {
  densityComposerPill,
  densityComposerSendBtn,
} from '@client/shared/ui/layoutClasses';
import { ArrowUp, Loader2 } from 'lucide-react';
import PromptBarModeSelector from './PromptBarModeSelector';
import PromptBarModelPicker from './PromptBarModelPicker';
import PromptBarDepthStylePill from './PromptBarDepthStylePill';
import PromptBarDepthQualityPill from './PromptBarDepthQualityPill';
import {
  PromptBarVideoRefModePill,
  PromptBarVideoDurationPill,
} from './PromptBarVideoControls';
import PromptBarAspectPicker from './PromptBarAspectPicker';
import { PromptBarAtMenu } from './PromptBarAtMenu';
import { HomeSyncToggle } from '@client/shared/home-publish/HomeSyncToggle';
import type { DepthVideoStyle, DepthQuality, QuickGenMode } from '@shared/domain/media/depthVideo';

interface PromptBarControlsRowProps {
  isUp: boolean;
  anyDropdownOpen?: boolean;
  quickGenMode: QuickGenMode;
  isDepthMode: boolean;
  modeMenu: any;
  modeButtonClass: string;
  handleModeSwitch: (mode: QuickGenMode) => void;
  modelMenu: any;
  activeVideoModelObj: any;
  activeImageModelObj: any;
  availableVideoModels: any[];
  availableImageModels: any[];
  quickVideoModel: string;
  quickModel: string;
  quickVideoDuration: number;
  setQuickVideoModel: (m: string) => void;
  setQuickVideoDuration: (d: number) => void;
  setQuickModel: (m: string) => void;
  quickDepthStyle: DepthVideoStyle;
  setQuickDepthStyle: (s: DepthVideoStyle) => void;
  depthStyleMenu: any;
  quickDepthQuality: DepthQuality;
  setQuickDepthQuality: (q: DepthQuality) => void;
  depthQualityMenu: any;
  videoRefModeMenu: any;
  activeVideoRefModeObj: any;
  quickVideoRefMode: string;
  setQuickVideoRefMode: (mode: any) => void;
  aspectMenu: any;
  activeVideoRatioObj: any;
  quickVideoResolution: string;
  quickVideoCount: number;
  activeImageRatioObj: any;
  quickQuality: string;
  quickCount: number;
  quickVideoAspectId: string;
  setQuickVideoAspectId: (id: string) => void;
  setQuickVideoResolution: (res: any) => void;
  setQuickVideoCount: (c: number) => void;
  quickAspectId: string;
  setQuickAspectId: (id: string) => void;
  setQuickQuality: (q: any) => void;
  setQuickCount: (c: number) => void;
  currentW: number;
  currentH: number;
  durationMenu: any;
  videoDurationBounds: any;
  quickPrompt: string;
  setQuickPrompt: (p: string) => void;
  media: any;
  richInputRef: any;
  handleSendPrompt: () => void;
  canSend: boolean;
  isSubmitting: boolean;
}

export const PromptBarControlsRow = React.memo(function PromptBarControlsRow({
  isUp,
  anyDropdownOpen = false,
  quickGenMode,
  isDepthMode,
  modeMenu,
  modeButtonClass,
  handleModeSwitch,
  modelMenu,
  activeVideoModelObj,
  activeImageModelObj,
  availableVideoModels,
  availableImageModels,
  quickVideoModel,
  quickModel,
  quickVideoDuration,
  setQuickVideoModel,
  setQuickVideoDuration,
  setQuickModel,
  quickDepthStyle,
  setQuickDepthStyle,
  depthStyleMenu,
  quickDepthQuality,
  setQuickDepthQuality,
  depthQualityMenu,
  videoRefModeMenu,
  activeVideoRefModeObj,
  quickVideoRefMode,
  setQuickVideoRefMode,
  aspectMenu,
  activeVideoRatioObj,
  quickVideoResolution,
  quickVideoCount,
  activeImageRatioObj,
  quickQuality,
  quickCount,
  quickVideoAspectId,
  setQuickVideoAspectId,
  setQuickVideoResolution,
  setQuickVideoCount,
  quickAspectId,
  setQuickAspectId,
  setQuickQuality,
  setQuickCount,
  currentW,
  currentH,
  durationMenu,
  videoDurationBounds,
  media,
  richInputRef,
  handleSendPrompt,
  canSend,
  isSubmitting,
}: PromptBarControlsRowProps) {
  return (
    <div className={`flex items-center justify-between gap-1.5 pt-1.5 sm:pt-2 mt-auto relative ${anyDropdownOpen ? 'z-30' : 'z-10'}`}>
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        {/* 药丸 0: 模式切换药丸 */}
        <PromptBarModeSelector
          isUp={isUp}
          quickGenMode={quickGenMode}
          isDepthMode={isDepthMode}
          isOpen={modeMenu.isOpen}
          onToggle={modeMenu.toggle}
          menuRef={modeMenu.ref}
          modeButtonClass={modeButtonClass}
          onSelectMode={handleModeSwitch}
        />

        {!isDepthMode && (
          <PromptBarModelPicker
            isUp={isUp}
            quickGenMode={quickGenMode}
            showModelDropdown={modelMenu.isOpen}
            setShowModelDropdown={modelMenu.setIsOpen}
            modelDropdownRef={modelMenu.ref}
            activeVideoModelObj={activeVideoModelObj}
            activeImageModelObj={activeImageModelObj}
            availableVideoModels={availableVideoModels}
            availableImageModels={availableImageModels}
            quickVideoModel={quickVideoModel}
            quickModel={quickModel}
            quickVideoDuration={quickVideoDuration}
            setQuickVideoModel={setQuickVideoModel}
            setQuickVideoDuration={setQuickVideoDuration}
            setQuickModel={setQuickModel}
          />
        )}

        {isDepthMode && (
          <>
            <PromptBarDepthStylePill
              isUp={isUp}
              quickDepthStyle={quickDepthStyle}
              setQuickDepthStyle={setQuickDepthStyle}
              showStyleDropdown={depthStyleMenu.isOpen}
              setShowStyleDropdown={depthStyleMenu.setIsOpen}
              styleDropdownRef={depthStyleMenu.ref}
            />
            <PromptBarDepthQualityPill
              isUp={isUp}
              quickDepthQuality={quickDepthQuality}
              setQuickDepthQuality={setQuickDepthQuality}
              showQualityDropdown={depthQualityMenu.isOpen}
              setShowQualityDropdown={depthQualityMenu.setIsOpen}
              qualityDropdownRef={depthQualityMenu.ref}
            />
          </>
        )}

        {/* 比例、分辨率与数量 */}
        {!isDepthMode && (
          <PromptBarAspectPicker
            isUp={isUp}
            quickGenMode={quickGenMode}
            isOpen={aspectMenu.isOpen}
            onToggle={aspectMenu.toggle}
            aspectMenuRef={aspectMenu.ref}
            activeVideoRatioObj={activeVideoRatioObj}
            quickVideoResolution={quickVideoResolution}
            quickVideoCount={quickVideoCount}
            activeImageRatioObj={activeImageRatioObj}
            quickQuality={quickQuality}
            quickCount={quickCount}
            quickVideoAspectId={quickVideoAspectId}
            setQuickVideoAspectId={setQuickVideoAspectId}
            setQuickVideoResolution={setQuickVideoResolution}
            setQuickVideoCount={setQuickVideoCount}
            quickAspectId={quickAspectId}
            setQuickAspectId={setQuickAspectId}
            setQuickQuality={setQuickQuality}
            setQuickCount={setQuickCount}
            currentW={currentW}
            currentH={currentH}
            quickModel={quickModel}
          />
        )}

        {quickGenMode === 'video' && (
          <div className="min-w-0">
            <PromptBarVideoRefModePill
              isUp={isUp}
              showVideoRefModeDropdown={videoRefModeMenu.isOpen}
              setShowVideoRefModeDropdown={videoRefModeMenu.setIsOpen}
              videoRefModeDropdownRef={videoRefModeMenu.ref}
              activeVideoRefModeObj={activeVideoRefModeObj}
              quickVideoRefMode={quickVideoRefMode}
              setQuickVideoRefMode={setQuickVideoRefMode}
            />
          </div>
        )}

        {quickGenMode === 'video' && (
          <PromptBarVideoDurationPill
            isUp={isUp}
            showDurationDropdown={durationMenu.isOpen}
            setShowDurationDropdown={durationMenu.setIsOpen}
            durationDropdownRef={durationMenu.ref}
            quickVideoDuration={quickVideoDuration}
            setQuickVideoDuration={setQuickVideoDuration}
            videoDurationBounds={videoDurationBounds}
            activeVideoModelObj={activeVideoModelObj}
            quickVideoModel={quickVideoModel}
          />
        )}

        {/* 快捷操作: @ 主体快捷键 */}
        {!isDepthMode && (
          <div className="relative" ref={media.atMenuButtonRef}>
            <button
              type="button"
              aria-label="选择参考素材或主体"
              aria-haspopup="dialog"
              aria-expanded={media.showAtMenu && media.atMenuTrigger === 'button'}
              onClick={() => {
                if (media.showAtMenu && media.atMenuTrigger === 'button') {
                  media.setShowAtMenu(false);
                  media.setAtMenuTrigger?.(null);
                } else {
                  media.setAtMenuTrigger?.('button');
                  media.setShowAtMenu(true);
                }
                richInputRef.current?.focus();
              }}
              className={`${densityComposerPill} rounded-2xl ${
                media.showAtMenu && media.atMenuTrigger === 'button'
                  ? 'bg-slate-100 text-slate-950 border-0 shadow-none'
                  : 'bg-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-0 shadow-none'
              } flex items-center justify-center transition-all cursor-pointer shrink-0 font-bold text-xs`}
              title="快速 @ 引用图片主体或参考素材"
            >
              <span>@</span>
            </button>

            {/* 🌟 点击底栏 @ 按钮触发时：在底栏 @ 按钮正上方展开 */}
            {media.showAtMenu && media.atMenuTrigger === 'button' && (
              <PromptBarAtMenu
                atMenuRef={media.atMenuRef}
                anchorRef={media.atMenuButtonRef}
                isUp={isUp}
                atMenuQuery={media.atMenuQuery}
                allSubjects={media.allSubjects}
                activeSubjects={media.activeSubjects}
                onCreateSubjectClick={() => {
                  media.createSubjectInputRef.current?.click();
                }}
                onSelectSubject={media.handleSelectSubject}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center ml-auto shrink-0 gap-2">
        <HomeSyncToggle />
        <button
          type="button"
          onClick={handleSendPrompt}
          disabled={!canSend}
          className={`${densityComposerSendBtn} rounded-full flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
            canSend
              ? 'bg-slate-900 hover:bg-black text-white'
              : 'bg-[#E3E5EB] text-slate-400 cursor-not-allowed'
          }`}
          title={
            quickGenMode === 'depth-image'
              ? '生成深度图片'
              : quickGenMode === 'depth-video'
                ? '生成深度动作捕捉'
                : quickGenMode === 'video'
                  ? '开始生成视频'
                  : '立即生成图片'
          }
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <ArrowUp className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
          )}
        </button>
      </div>
    </div>
  );
});
