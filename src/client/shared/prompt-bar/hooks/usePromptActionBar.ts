import { useState, useRef, useEffect, useCallback } from 'react';
import { useScrollLock } from '@client/shared/hooks/useScrollLock';
import { useDropdownMenu } from '@client/shared/hooks/useDropdownMenu';
import { 
  VIDEO_ASPECT_RATIOS, 
  VIDEO_REF_MODES, 
  getVideoDurationBounds
} from '@shared/domain/media/video';
import { useVideoParameterConstraints } from './useVideoParameterConstraints';
import { usePromptBarWorkflowModels } from './usePromptBarWorkflowModels';
import { usePromptBarStoreState } from './usePromptBarStoreState';
import { useAppLayoutMode } from '@client/shared/hooks/useCompactLayout';

import type { RichPromptInputRef } from '@client/shared/prompt-bar/RichPromptInput';
import { IMAGE_RATIO_ITEMS, type SubjectItem } from '@client/shared/prompt-bar/promptBarConstants';
import { useDepthEnvCheck } from '@client/shared/api/depthGeneration';
import { isDepthGenMode, type QuickGenMode } from '@shared/domain/media/depthVideo';
import {
  resolvePromptPlaceholder,
  resolveFileAccept,
  resolveModeButtonClass,
  hasSidebarRefMedia,
  resolveUseTopStrip,
  calculateImageDimensions,
} from '@client/shared/prompt-bar/promptBarDisplay';
import { usePromptBarVideoFrames } from './usePromptBarVideoFrames';
import { usePromptBarMedia } from './usePromptBarMedia';
import { usePromptBarSubmit } from './usePromptBarSubmit';
import { usePromptBarFocus } from './usePromptBarFocus';


export interface PromptActionBarOptions {
  dropdownPlacement?: 'up' | 'down' | 'auto';
  collapsible?: boolean;
  /** 首页外层已有欢迎区时，避免重复渲染品牌 Hero。 */
  showBrandHero?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  onSubmitSuccess?: Parameters<typeof usePromptBarSubmit>[0]['onSubmitSuccess'];
  extraSubjects?: SubjectItem[];
}


export function usePromptActionBar({ 
  dropdownPlacement = 'auto',
  collapsible,
  showBrandHero,
  onExpandChange,
  onSubmitSuccess,
  extraSubjects,
}: PromptActionBarOptions) {
  const store = usePromptBarStoreState();
  const {
    quickGenMode,
    setQuickGenMode,
    quickDepthStyle,
    quickDepthQuality,
    quickPrompt,
    setQuickPrompt,
    quickRefImages,
    setQuickRefImages,
    addQuickRefImage,
    removeQuickRefImage,
    quickModel,
    setQuickModel,
    quickAspectId,
    quickQuality,
    quickCount,
    quickVideoModel,
    setQuickVideoModel,
    quickVideoDuration,
    quickVideoResolution,
    quickVideoAspectId,
    quickVideoRefMode,
    quickVideoFirstFrame,
    quickVideoLastFrame,
    setQuickVideoFirstFrame,
    setQuickVideoLastFrame,
    quickVideoMultiFrames,
    setQuickVideoMultiFrames,
    addQuickVideoMultiFrame,
    quickVideoCount,
    currentView,
    images,
  } = store;

  // 根据当前视图或参数智能判定弹窗朝上展开还是朝下展开
  const isUp = dropdownPlacement === 'up' || (dropdownPlacement === 'auto' && currentView === 'generate');

  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const richInputRef = useRef<RichPromptInputRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  const activeVideoRatioObj = VIDEO_ASPECT_RATIOS.find(r => r.id === quickVideoAspectId) || VIDEO_ASPECT_RATIOS.find(item => item.id === '16:9')!;
  const videoDurationBounds = getVideoDurationBounds(activeVideoModelObj?.id || quickVideoModel);

  useVideoParameterConstraints();

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
    composerRef: containerRef,
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
  const handleComposerFocus = usePromptBarFocus(isExpanded, richInputRef, setIsDockFocused, setIsComposerFocused);

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

  return {
    store,
    containerRef,
    handleComposerFocus,
    handleContainerBlur,
    anyDropdownOpen,
    isFloatingDock,
    shouldShowBrandHero,
    isExpanded,
    useTopStrip,
    media,
    videoFrames,
    showInlinePolaroid,
    isGenerateDock,
    isComposerExpanded,
    richInputRef,
    handleComposerKeyDown,
    placeholder,
    isUp,
    isDepthMode,
    modeMenu,
    modeButtonClass,
    handleModeSwitch,
    modelMenu,
    activeVideoModelObj,
    activeImageModelObj,
    availableVideoModels,
    availableImageModels,
    depthStyleMenu,
    depthQualityMenu,
    videoRefModeMenu,
    activeVideoRefModeObj,
    aspectMenu,
    activeVideoRatioObj,
    activeImageRatioObj,
    currentW,
    currentH,
    durationMenu,
    videoDurationBounds,
    handleSendPrompt,
    canSend,
    isSubmitting,
    fileAccept,
    toastMsg,
  };
}
