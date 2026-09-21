import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, ArrowUp } from 'lucide-react';
import { useScrollLock } from '@/shared/hooks/useScrollLock';
import { useDropdownMenu } from '@/shared/hooks/useDropdownMenu';
import { 
  VIDEO_ASPECT_RATIOS, 
  VIDEO_REF_MODES, 
  getVideoDurationBounds,
  clampVideoDuration 
} from '@beike/domain/video';
import { usePromptBarWorkflowModels } from '../../hooks/usePromptBarWorkflowModels';
import { usePromptBarStoreState } from '../../hooks/usePromptBarStoreState';
import { densityComposerPad, composerContainer } from '@/shared/ui/layoutClasses';
import { useAppLayoutMode } from '@/shared/hooks/useCompactLayout';

import { RichPromptInput, RichPromptInputRef } from '@/shared/prompt-bar/RichPromptInput';
import { IMAGE_RATIO_ITEMS, type SubjectItem } from '@/shared/prompt-bar/promptBarConstants';
import { PromptBarAtMenu } from './controls/PromptBarAtMenu';
import PromptBarBrandHero from './PromptBarBrandHero';
import PromptBarRefMediaPanel from './media/PromptBarRefMediaPanel';
import { useDepthEnvCheck } from '@/shared/api/depthGeneration';
import { isDepthGenMode, type QuickGenMode } from '@beike/domain/depthVideo';
import {
  resolvePromptPlaceholder,
  resolveFileAccept,
  resolveModeButtonClass,
  hasSidebarRefMedia,
  resolveUseTopStrip,
  calculateImageDimensions,
} from '@/shared/prompt-bar/promptBarDisplay';
import { usePromptBarVideoFrames } from '../../hooks/usePromptBarVideoFrames';
import { usePromptBarMedia } from '../../hooks/usePromptBarMedia';
import { usePromptBarSubmit } from '../../hooks/usePromptBarSubmit';
import { PromptBarControlsRow } from './controls/PromptBarControlsRow';

interface Props {
  dropdownPlacement?: 'up' | 'down' | 'auto';
  collapsible?: boolean;
  /** 首页外层已有欢迎区时，避免重复渲染品牌 Hero。 */
  showBrandHero?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  onSubmitSuccess?: (info: { prompt: string; refImages: string[]; mode: QuickGenMode; tasks: any[] }) => void;
  extraSubjects?: SubjectItem[];
}

export type { SubjectItem } from '@/shared/prompt-bar/promptBarConstants';

export default function PromptActionBar({ 
  dropdownPlacement = 'auto',
  collapsible,
  showBrandHero,
  onExpandChange,
  onSubmitSuccess,
  extraSubjects,
}: Props) {
  const {
    quickGenMode,
    setQuickGenMode,
    quickDepthStyle,
    setQuickDepthStyle,
    quickDepthQuality,
    setQuickDepthQuality,
    quickPrompt,
    setQuickPrompt,
    quickRefImages,
    setQuickRefImages,
    addQuickRefImage,
    removeQuickRefImage,
    quickModel,
    setQuickModel,
    quickAspectId,
    setQuickAspectId,
    quickQuality,
    setQuickQuality,
    quickCount,
    setQuickCount,
    quickVideoModel,
    setQuickVideoModel,
    quickVideoDuration,
    setQuickVideoDuration,
    quickVideoResolution,
    setQuickVideoResolution,
    quickVideoAspectId,
    setQuickVideoAspectId,
    quickVideoRefMode,
    setQuickVideoRefMode,
    quickVideoFirstFrame,
    quickVideoLastFrame,
    setQuickVideoFirstFrame,
    setQuickVideoLastFrame,
    swapVideoFirstLastFrames,
    quickVideoMultiFrames,
    setQuickVideoMultiFrames,
    addQuickVideoMultiFrame,
    removeQuickVideoMultiFrame,
    quickVideoCount,
    setQuickVideoCount,
    currentView,
    images,
  } = usePromptBarStoreState();

  // 根据当前视图或参数智能判定弹窗朝上展开还是朝下展开
  const isUp = dropdownPlacement === 'up' || (dropdownPlacement === 'auto' && currentView === 'generate');

  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const richInputRef = useRef<RichPromptInputRef>(null);

  // 下拉菜单 Hook 集群
  const modeMenu = useDropdownMenu();
  const depthStyleMenu = useDropdownMenu();
  const depthQualityMenu = useDropdownMenu();
  const modelMenu = useDropdownMenu();
  const aspectMenu = useDropdownMenu();
  const videoRefModeMenu = useDropdownMenu();
  const durationMenu = useDropdownMenu();

  const isDepthMode = isDepthGenMode(quickGenMode);
  const depthEnv = useDepthEnvCheck(isDepthMode);

  // 动态加载生图与视频模型
  const { availableImageModels, availableVideoModels } = usePromptBarWorkflowModels(
    setQuickModel,
    setQuickVideoModel,
  );

  const activeImageModelObj = availableImageModels.find(m => m.id === quickModel) || availableImageModels[0] || { id: '', name: '请从网关拉取生图模型', provider: 'Gateway' };
  const activeImageRatioObj = IMAGE_RATIO_ITEMS.find(r => r.id === quickAspectId) || IMAGE_RATIO_ITEMS[0];
  const activeVideoModelObj = availableVideoModels.find(m => m.id === quickVideoModel) || availableVideoModels[0] || { id: '', name: '请从网关拉取视频模型', provider: 'Gateway' };
  const activeVideoRefModeObj = VIDEO_REF_MODES.find(m => m.id === quickVideoRefMode) || VIDEO_REF_MODES[0];
  const activeVideoRatioObj = VIDEO_ASPECT_RATIOS.find(r => r.id === quickVideoAspectId) || VIDEO_ASPECT_RATIOS[1];
  const videoDurationBounds = getVideoDurationBounds(activeVideoModelObj?.id || quickVideoModel);

  // 切换视频模型时将时长吸附到该模型支持范围
  useEffect(() => {
    if (quickGenMode !== 'video') return;
    const next = clampVideoDuration(activeVideoModelObj?.id || quickVideoModel, quickVideoDuration);
    if (next !== quickVideoDuration) {
      setQuickVideoDuration(next);
    }
  }, [quickGenMode, quickVideoModel, activeVideoModelObj?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { w: currentW, h: currentH, sizeStr } = calculateImageDimensions({
    quickModel,
    quickAspectId,
    quickQuality,
    baseRatio: activeImageRatioObj,
  });

  const showToastRef = useRef<(msg: string) => void>(() => {});
  const showToastBridge = useCallback((msg: string) => {
    showToastRef.current(msg);
  }, []);

  const media = usePromptBarMedia({
    quickGenMode,
    isDepthMode,
    quickPrompt,
    setQuickPrompt,
    quickRefImages,
    setQuickRefImages,
    addQuickRefImage,
    removeQuickRefImage,
    setQuickVideoFirstFrame,
    setQuickVideoLastFrame,
    setQuickVideoMultiFrames,
    images,
    showToast: showToastBridge,
    richInputRef,
    extraSubjects,
  });

  const videoFrames = usePromptBarVideoFrames({
    setQuickVideoFirstFrame,
    setQuickVideoLastFrame,
    addQuickVideoMultiFrame,
  });

  const {
    isSubmitting,
    toastMsg,
    showToast,
    canSend,
    handleSendPrompt,
    handleComposerKeyDown,
  } = usePromptBarSubmit({
    quickGenMode,
    isDepthMode,
    quickPrompt,
    quickRefImages,
    activeSubjects: media.activeSubjects,
    allSubjects: media.allSubjects,
    quickVideoRefMode,
    quickVideoFirstFrame,
    quickVideoLastFrame,
    quickVideoMultiFrames,
    quickCount,
    quickVideoCount,
    quickModel,
    quickVideoModel,
    sizeStr,
    quickQuality,
    quickVideoAspectId,
    quickVideoResolution,
    quickVideoDuration,
    currentView,
    availableImageModelsLength: availableImageModels.length,
    availableVideoModelsLength: currentView === 'canvas' ? Math.max(availableVideoModels.length, 1) : availableVideoModels.length,
    quickDepthStyle,
    quickDepthQuality,
    refMediaFile: media.refMediaFile,
    depthModelReady: depthEnv.depthModelReady,
    setupCommand: depthEnv.setupCommand,
    clearComposerMedia: media.clearComposerMedia,
    setActiveSubjects: media.setActiveSubjects,
    onSubmitSuccess,
  });

  showToastRef.current = showToast;

  const anyDropdownOpen =
    modeMenu.isOpen ||
    depthStyleMenu.isOpen ||
    depthQualityMenu.isOpen ||
    modelMenu.isOpen ||
    aspectMenu.isOpen ||
    videoRefModeMenu.isOpen ||
    durationMenu.isOpen ||
    media.showAtMenu;

  useScrollLock(
    anyDropdownOpen,
    currentView === 'generate' ? '[data-generate-scroll]' : '[data-hub-scroll]',
  );

  const handleModeSwitch = useCallback((next: QuickGenMode) => {
    if (next !== quickGenMode) {
      media.clearComposerMedia();
    }
    setQuickGenMode(next);
    modeMenu.close();
  }, [media, quickGenMode, setQuickGenMode, modeMenu]);

  const isGenerateDock = currentView === 'generate';
  const isCollapsible = collapsible ?? isGenerateDock;

  const [isDockFocused, setIsDockFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 容器失焦管理：焦点移出并且无内容时自动收回常态
  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDockFocused(false);
      setIsComposerFocused(false);
    }
  };

  const hasContent = Boolean(
    quickPrompt.trim() ||
    quickRefImages.length > 0 ||
    quickVideoFirstFrame ||
    quickVideoLastFrame ||
    quickVideoMultiFrames.length > 0 ||
    isSubmitting
  );

  const isExpanded = !isCollapsible || isDockFocused || hasContent || anyDropdownOpen;

  useEffect(() => {
    onExpandChange?.(isExpanded);
  }, [isExpanded, onExpandChange]);

  const isComposerExpanded = (isComposerFocused && Boolean(quickPrompt.trim())) || quickPrompt.trim().length > 30;

  const layoutMode = useAppLayoutMode();
  const isCompactLayout = layoutMode === 'compact';

  const hasSidebar = hasSidebarRefMedia({
    isDepthMode,
    quickGenMode,
    quickVideoRefMode,
    hasRefImages: quickRefImages.length > 0,
  });

  const useTopStrip = resolveUseTopStrip({
    isDepthMode,
    quickGenMode,
    quickVideoRefMode,
    isCompactLayout,
    hasSidebarRefMedia: hasSidebar,
  });

  const showInlinePolaroid = !useTopStrip;

  const hasRefMedia =
    quickRefImages.length > 0 ||
    Boolean(quickVideoFirstFrame) ||
    Boolean(quickVideoLastFrame) ||
    quickVideoMultiFrames.length > 0;

  const placeholder = resolvePromptPlaceholder({
    isDepthMode,
    quickGenMode,
    quickVideoRefMode,
    isGenerateDock,
    hasRefMedia,
  });

  const fileAccept = resolveFileAccept(quickGenMode);

  const modeButtonClass = resolveModeButtonClass({
    quickGenMode,
    isDepthMode,
    showModeDropdown: modeMenu.isOpen,
  });

  const isFloatingDock = isGenerateDock || currentView === 'canvas';

  // 🌟 首页品牌标题仅在首页展示（生成页与画布页均不展示）
  const shouldShowBrandHero = showBrandHero ?? currentView === 'home';

  return (
    <div
      ref={containerRef}
      onFocusCapture={() => setIsDockFocused(true)}
      onBlur={handleContainerBlur}
      className={`w-full relative ${anyDropdownOpen ? 'z-40' : 'z-20'} ${!isFloatingDock ? composerContainer : ''}`}
    >
      {shouldShowBrandHero && <PromptBarBrandHero />}

      <div
        {...media.dropZoneProps}
        className={`w-full transition-[background-color,border-color,box-shadow,border-radius] duration-200 ease-out relative ${
          anyDropdownOpen ? 'z-40' : 'z-20'
        } group/composer ${
          isExpanded
            ? `bg-white border border-slate-200/90 shadow-none rounded-2xl ${
                isFloatingDock ? 'pt-3 px-3 sm:px-3.5 pb-2 flex flex-col gap-2.5 sm:gap-3' : `${densityComposerPad} flex flex-col gap-2.5 sm:gap-3`
              }`
            : 'bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] rounded-full px-3.5 py-1.5 sm:py-2 flex flex-col hover:border-slate-300'
        }`}
      >
        {isExpanded ? (
          <div className="flex flex-col gap-2.5 sm:gap-3 h-full animate-fade-in">
            {/* 🌟 展开面板（参考图3）：点击全部展开后在顶部展示全功能面板 */}
            {(useTopStrip || (media.isExpandedRefImages && quickRefImages.length > 0)) && (
              <div className="pb-2">
                <PromptBarRefMediaPanel
                  layout="strip"
                  quickGenMode={quickGenMode}
                  quickVideoRefMode={quickVideoRefMode}
                  quickVideoFirstFrame={quickVideoFirstFrame}
                  quickVideoLastFrame={quickVideoLastFrame}
                  quickVideoMultiFrames={quickVideoMultiFrames}
                  quickRefImages={quickRefImages}
                  isExpandedRefImages={media.isExpandedRefImages}
                  setIsExpandedRefImages={media.setIsExpandedRefImages}
                  setQuickVideoFirstFrame={setQuickVideoFirstFrame}
                  setQuickVideoLastFrame={setQuickVideoLastFrame}
                  swapVideoFirstLastFrames={swapVideoFirstLastFrames}
                  removeQuickVideoMultiFrame={removeQuickVideoMultiFrame}
                  removeQuickRefImage={media.handleRemoveRefImage}
                  onUploadClick={() => media.fileInputRef.current?.click()}
                  onFirstFrameClick={() => videoFrames.firstFrameInputRef.current?.click()}
                  onLastFrameClick={() => videoFrames.lastFrameInputRef.current?.click()}
                  onMultiFrameClick={() => videoFrames.multiFrameInputRef.current?.click()}
                  refImagesContainerRef={media.refImagesContainerRef}
                  onMouseEnterRefImages={media.handleMouseEnterRefImages}
                  onMouseLeaveRefImages={media.handleMouseLeaveRefImages}
                  resolveMediaFile={media.resolveMediaFile}
                  resolveMediaKind={media.resolveMediaKind}
                  allSubjects={media.allSubjects}
                  onSelectSubject={media.handleSelectSubject}
                  onClearAll={media.handleClearAllRefImages}
                />
              </div>
            )}

            <div className="flex items-start w-full relative">
              {showInlinePolaroid && !media.isExpandedRefImages && (
                <div className="shrink-0 relative z-20">
                  <PromptBarRefMediaPanel
                    layout="sidebar"
                    frameExpanded={!isGenerateDock && isComposerExpanded}
                    quickGenMode={quickGenMode}
                    quickVideoRefMode={quickVideoRefMode}
                    quickVideoFirstFrame={quickVideoFirstFrame}
                    quickVideoLastFrame={quickVideoLastFrame}
                    quickVideoMultiFrames={quickVideoMultiFrames}
                    quickRefImages={quickRefImages}
                    isExpandedRefImages={media.isExpandedRefImages}
                    setIsExpandedRefImages={media.setIsExpandedRefImages}
                    setQuickVideoFirstFrame={setQuickVideoFirstFrame}
                    setQuickVideoLastFrame={setQuickVideoLastFrame}
                    swapVideoFirstLastFrames={swapVideoFirstLastFrames}
                    removeQuickVideoMultiFrame={removeQuickVideoMultiFrame}
                    removeQuickRefImage={media.handleRemoveRefImage}
                    onUploadClick={() => media.fileInputRef.current?.click()}
                    onFirstFrameClick={() => videoFrames.firstFrameInputRef.current?.click()}
                    onLastFrameClick={() => videoFrames.lastFrameInputRef.current?.click()}
                    onMultiFrameClick={() => videoFrames.multiFrameInputRef.current?.click()}
                    refImagesContainerRef={media.refImagesContainerRef}
                    onMouseEnterRefImages={media.handleMouseEnterRefImages}
                    onMouseLeaveRefImages={media.handleMouseLeaveRefImages}
                    resolveMediaFile={media.resolveMediaFile}
                    resolveMediaKind={media.resolveMediaKind}
                    allSubjects={media.allSubjects}
                    onSelectSubject={media.handleSelectSubject}
                    onClearAll={media.handleClearAllRefImages}
                  />
                </div>
              )}

              <div className="flex-1 min-w-0 relative z-10 overflow-x-hidden scrollbar-none no-scrollbar">
                <RichPromptInput
                  ref={richInputRef}
                  variant={isGenerateDock ? 'default' : 'composer'}
                  expanded={!isGenerateDock && isComposerExpanded}
                  value={quickPrompt}
                  onChange={setQuickPrompt}
                  onKeyDown={handleComposerKeyDown}
                  onPasteFiles={media.handlePasteFiles}
                  placeholder={placeholder}
                  allSubjects={media.allSubjects}
                  quickRefImages={quickRefImages}
                  onTriggerAtMenu={(pos, query) => {
                    media.setCursorPosition(pos);
                    media.setAtMenuQuery(query || '');
                    media.setAtMenuTrigger('input');
                    media.setShowAtMenu(true);
                  }}
                  onCloseAtMenu={() => {
                    if (media.atMenuTrigger === 'input') {
                      media.setShowAtMenu(false);
                      media.setAtMenuTrigger(null);
                    }
                  }}
                />
              </div>
            </div>

            {/* 🌟 键盘输入 @ 触发时：紧贴输入框下方展现（图 1 同款高级空态/列表） */}
            {media.showAtMenu && media.atMenuTrigger === 'input' && (
              <PromptBarAtMenu
                atMenuRef={media.atMenuRef}
                isUp={false}
                atMenuQuery={media.atMenuQuery}
                allSubjects={media.allSubjects}
                activeSubjects={media.activeSubjects}
                onCreateSubjectClick={() => media.createSubjectInputRef.current?.click()}
                onSelectSubject={media.handleSelectSubject}
              />
            )}

            <PromptBarControlsRow
              isUp={isUp}
              anyDropdownOpen={anyDropdownOpen}
              quickGenMode={quickGenMode}
              isDepthMode={isDepthMode}
              modeMenu={modeMenu}
              modeButtonClass={modeButtonClass}
              handleModeSwitch={handleModeSwitch}
              modelMenu={modelMenu}
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
              quickDepthStyle={quickDepthStyle}
              setQuickDepthStyle={setQuickDepthStyle}
              depthStyleMenu={depthStyleMenu}
              quickDepthQuality={quickDepthQuality}
              setQuickDepthQuality={setQuickDepthQuality}
              depthQualityMenu={depthQualityMenu}
              videoRefModeMenu={videoRefModeMenu}
              activeVideoRefModeObj={activeVideoRefModeObj}
              quickVideoRefMode={quickVideoRefMode}
              setQuickVideoRefMode={setQuickVideoRefMode}
              aspectMenu={aspectMenu}
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
              durationMenu={durationMenu}
              videoDurationBounds={videoDurationBounds}
              quickPrompt={quickPrompt}
              setQuickPrompt={setQuickPrompt}
              media={media}
              richInputRef={richInputRef}
              handleSendPrompt={handleSendPrompt}
              canSend={canSend}
              isSubmitting={isSubmitting}
            />
          </div>
        ) : (
          /* 🌟 当处于常态折叠状态时 (!isExpanded，严格参考画布常态设计) */
          <div className="flex items-center gap-2.5 sm:gap-3 w-full">
            {/* 左侧微倾斜参考素材插槽 (对齐截图2红框) */}
            <div className="shrink-0 flex items-center justify-center">
              <button
                type="button"
                onClick={() => media.fileInputRef.current?.click()}
                className="w-[34px] h-[40px] -rotate-6 hover:rotate-0 hover:scale-105 active:scale-95 rounded-[7px] border border-slate-200/90 bg-slate-50/90 hover:bg-slate-100 flex flex-col items-center justify-center transition-all cursor-pointer shadow-2xs group/mini-add shrink-0"
                title="上传参考素材"
              >
                <Plus className="w-3.5 h-3.5 text-slate-400 group-hover/mini-add:text-slate-700 stroke-[1.8] transition-colors" />
              </button>
            </div>

            {/* 中间单行输入区 (极简占位提示) */}
            <div className="flex-1 min-w-0 relative z-10 overflow-x-hidden scrollbar-none no-scrollbar flex items-center">
              <RichPromptInput
                ref={richInputRef}
                variant="composer"
                expanded={false}
                singleLine={true}
                value={quickPrompt}
                onChange={setQuickPrompt}
                onKeyDown={handleComposerKeyDown}
                onPasteFiles={media.handlePasteFiles}
                placeholder={
                  quickGenMode === 'video'
                    ? 'Seedance 2.0全能参考，上传参考、输入文字或 @ 主体'
                    : placeholder
                }
                allSubjects={media.allSubjects}
                quickRefImages={quickRefImages}
                onTriggerAtMenu={(pos, query) => {
                  media.setCursorPosition(pos);
                  media.setAtMenuQuery(query || '');
                  media.setAtMenuTrigger('input');
                  media.setShowAtMenu(true);
                }}
                onCloseAtMenu={() => {
                  if (media.atMenuTrigger === 'input') {
                    media.setShowAtMenu(false);
                    media.setAtMenuTrigger(null);
                  }
                }}
              />
            </div>

            {/* 右侧圆形发送按钮 (对齐截图2红框) */}
            <div className="shrink-0 flex items-center">
              <button
                type="button"
                onClick={handleSendPrompt}
                disabled={!canSend}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all select-none active:scale-95 shrink-0 ${
                  canSend
                    ? 'bg-slate-900 hover:bg-black text-white shadow-2xs cursor-pointer'
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
                <ArrowUp className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 隐藏的系统文件选择器与拖拽入口 */}
      <input
        ref={media.fileInputRef}
        type="file"
        accept={fileAccept}
        multiple={!isDepthMode}
        className="hidden"
        onChange={media.handleFileUpload}
      />
      <input
        ref={media.createSubjectInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={media.handleCreateSubject}
      />
      <input
        ref={videoFrames.firstFrameInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={videoFrames.handleUploadFirstFrame}
      />
      <input
        ref={videoFrames.lastFrameInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={videoFrames.handleUploadLastFrame}
      />
      <input
        ref={videoFrames.multiFrameInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={videoFrames.handleUploadMultiFrame}
      />

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-medium shadow-xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
