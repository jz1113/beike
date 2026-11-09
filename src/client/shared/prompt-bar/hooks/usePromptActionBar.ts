import { useAppStore } from '@client/store';
import { resolveSkillKind } from '@shared/domain/assistant/skills/types';
import { useState, useRef, useEffect, useCallback, useLayoutEffect, type ChangeEvent, type FocusEvent, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useScrollLock } from '@client/shared/hooks/useSafeTimeout';
import { 
  VIDEO_ASPECT_RATIOS, 
  VIDEO_REF_MODES,
  getVideoModelById,
  resolveVideoResolution,
} from '@shared/domain/media/video';
import { resolveVideoMode, videoDurationOptions, videoModes, videoRatioLocked, videoResolutionOptions } from '@shared/domain/media/videoCapabilities';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { readFileAsDataUrl } from '@client/shared/api/mediaUpload';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { matchesStoredModel, usePromptBarWorkflowModels } from './usePromptBarWorkflowModels';
import { useAppLayoutMode } from '@client/shared/hooks/useCompactLayout';

export interface DropdownMenuState<T extends HTMLElement = HTMLDivElement> {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggle: () => void;
  close: () => void;
  ref: RefObject<T | null>;
}

/**
 * 轻量下拉菜单状态 Hook（自包含点击外部关闭逻辑）
 */
export function useDropdownMenu<T extends HTMLElement = HTMLDivElement>(
  initialOpen = false
): DropdownMenuState<T> {
  const [isOpen, setIsOpen] = useState<boolean>(initialOpen);
  const ref = useRef<T | null>(null);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (target instanceof Element && target.closest('[data-dropdown-portal]')) {
        return;
      }
      if (ref.current && !ref.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return {
    isOpen,
    setIsOpen,
    toggle,
    close,
    ref,
  };
}

const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_ANY_ARRAY: unknown[] = [];

export function usePromptBarStoreState() {
  return useAppStore(
    useShallow((s) => ({
      quickGenMode: s.quickGenMode ?? 'agent',
      setQuickGenMode: s.setQuickGenMode,
      quickDepthStyle: s.quickDepthStyle ?? 'mocap',
      setQuickDepthStyle: s.setQuickDepthStyle,
      quickDepthQuality: s.quickDepthQuality ?? 'standard',
      setQuickDepthQuality: s.setQuickDepthQuality,
      quickPrompt: s.quickPrompt,
      setQuickPrompt: s.setQuickPrompt,
      quickRefImages: s.quickRefImages ?? EMPTY_STRING_ARRAY,
      setQuickRefImages: s.setQuickRefImages,
      addQuickRefImage: s.addQuickRefImage,
      removeQuickRefImage: s.removeQuickRefImage,
      quickModel: s.quickModel,
      setQuickModel: s.setQuickModel,
      quickAspectId: s.quickAspectId,
      setQuickAspectId: s.setQuickAspectId,
      quickQuality: s.quickQuality,
      setQuickQuality: s.setQuickQuality,
      quickCount: s.quickCount,
      setQuickCount: s.setQuickCount,
      quickAudioModel: s.quickAudioModel ?? '',
      setQuickAudioModel: s.setQuickAudioModel,
      quickVideoModel: s.quickVideoModel ?? '',
      setQuickVideoModel: s.setQuickVideoModel,
      quickVideoDuration: s.quickVideoDuration ?? 5,
      quickVideoContextIrEnabled: s.quickVideoContextIrEnabled ?? true,
      setQuickVideoContextIrEnabled: s.setQuickVideoContextIrEnabled,
      setQuickVideoDuration: s.setQuickVideoDuration,
      quickVideoResolution: s.quickVideoResolution ?? '480P',
      setQuickVideoResolution: s.setQuickVideoResolution,
      quickVideoAspectId: s.quickVideoAspectId ?? '16:9',
      setQuickVideoAspectId: s.setQuickVideoAspectId,
      quickVideoRefMode: s.quickVideoRefMode ?? 'omni',
      setQuickVideoRefMode: s.setQuickVideoRefMode,
      quickVideoFirstFrame: s.quickVideoFirstFrame,
      quickVideoLastFrame: s.quickVideoLastFrame,
      setQuickVideoFirstFrame: s.setQuickVideoFirstFrame,
      setQuickVideoLastFrame: s.setQuickVideoLastFrame,
      swapVideoFirstLastFrames: s.swapVideoFirstLastFrames,
      quickVideoMultiFrames: s.quickVideoMultiFrames ?? EMPTY_STRING_ARRAY,
      setQuickVideoMultiFrames: s.setQuickVideoMultiFrames,
      addQuickVideoMultiFrame: s.addQuickVideoMultiFrame,
      removeQuickVideoMultiFrame: s.removeQuickVideoMultiFrame,
      quickVideoCount: s.quickVideoCount ?? 1,
      setQuickVideoCount: s.setQuickVideoCount,
      currentView: s.currentView,
      images: s.images ?? EMPTY_ANY_ARRAY,
    })),
  );
}

import type { RichPromptInputRef } from '@client/shared/prompt-bar/RichPromptInput';
import { ALL_IMAGE_RATIO_ITEMS, IMAGE_RATIO_ITEMS, type SubjectItem } from '@client/shared/prompt-bar/promptBarConstants';
import { useDepthEnvCheck } from '@client/shared/api/generation/depthGeneration';
import { isDepthGenMode, type QuickGenMode } from '@shared/domain/media/depthVideo';
import {
  resolvePromptPlaceholder,
  resolveFileAccept,
  resolveModeButtonClass,
  hasSidebarRefMedia,
  resolveUseTopStrip,
  calculateImageDimensions,
} from '@client/shared/prompt-bar/promptBarDisplay';
import { usePromptBarMedia } from './usePromptBarMedia';
import { usePromptBarSubmit } from './usePromptBarSubmit';


export interface PromptActionBarOptions {
  dropdownPlacement?: 'up' | 'down' | 'auto';
  collapsible?: boolean;
  /** 首页外层已有欢迎区时，避免重复渲染品牌 Hero。 */
  showBrandHero?: boolean;
  /** Optional surface copy without changing mode-specific placeholders elsewhere. */
  inputPlaceholder?: string;
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
    quickAudioModel,
    setQuickAudioModel,
    quickVideoDuration,
    quickVideoContextIrEnabled,
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
  const [controlsDropdownOpen, setControlsDropdownOpen] = useState(false);
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
  const { availableImageModels, availableVideoModels, availableAudioModels } = usePromptBarWorkflowModels(
    setQuickModel,
    setQuickVideoModel,
    setQuickAudioModel,
  );

  const activeImageModelObj = availableImageModels.find(m => matchesStoredModel(m, quickModel)) || availableImageModels[0] || { id: '', name: '请从网关拉取生图模型', provider: 'Gateway' };
  const activeImageRatioObj = ALL_IMAGE_RATIO_ITEMS.find(r => r.id === quickAspectId) || IMAGE_RATIO_ITEMS[0];
  const activeVideoModelObj = availableVideoModels.find(m => matchesStoredModel(m, quickVideoModel)) || availableVideoModels[0] || { id: '', name: '请从网关拉取视频模型', provider: 'Gateway' };
  const activeVideoRefModeObj = VIDEO_REF_MODES.find(m => m.id === quickVideoRefMode) || VIDEO_REF_MODES[0];
  const activeVideoRatioObj = VIDEO_ASPECT_RATIOS.find(r => r.id === quickVideoAspectId) || VIDEO_ASPECT_RATIOS.find(item => item.id === '16:9')!;
  const videoModelId = ('upstreamId' in activeVideoModelObj ? activeVideoModelObj.upstreamId : undefined) || activeVideoModelObj.id || quickVideoModel;
  const videoDurations = videoDurationOptions(videoModelId, quickVideoResolution, quickVideoRefMode, getGatewayClientBaseUrl(quickVideoModel));
  const videoDurationBounds = { min: videoDurations[0], max: videoDurations.at(-1) || videoDurations[0] };

  useVideoParameterConstraints();

  const imageModelId = ('upstreamId' in activeImageModelObj ? activeImageModelObj.upstreamId : undefined) || activeImageModelObj.id || quickModel;
  const { w: currentW, h: currentH, sizeStr } = calculateImageDimensions({
    quickModel: imageModelId,
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
    showToast: showToastBridge,
    setQuickVideoFirstFrame,
    setQuickVideoLastFrame,
    addQuickVideoMultiFrame,
  });

  const {
    isSubmitting,
    toastMsg,
    showToast,
    canSend,
    readingAttachments,
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
    quickVideoContextIrEnabled,
    currentView,
    availableImageModelsLength: availableImageModels.length,
    availableVideoModelsLength: currentView === 'canvas' ? Math.max(availableVideoModels.length, 1) : availableVideoModels.length,
    availableAudioModelsLength: availableAudioModels.length,
    quickAudioModel,
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
    controlsDropdownOpen ||
    media.showAtMenu;

  useScrollLock(
    anyDropdownOpen,
    currentView === 'generate' ? '[data-generate-scroll]' : '[data-hub-scroll]',
  );

  const handleModeSwitch = useCallback((next: QuickGenMode) => {
    if (next !== quickGenMode && next !== 'agent') {
      const activeSkill = useAppStore.getState().getActiveAssistantSkill();
      if (activeSkill && resolveSkillKind(activeSkill) === 'creation') useAppStore.getState().setActiveAssistantSkillId(null);
    }
    setQuickGenMode(next);
    modeMenu.close();
  }, [quickGenMode, setQuickGenMode, modeMenu]);

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

  const isExpanded = !isCollapsible || isDockFocused || hasContent || anyDropdownOpen || quickGenMode === 'agent';
  const handleComposerFocus = usePromptBarFocus(isExpanded, richInputRef, setIsDockFocused, setIsComposerFocused);

  useEffect(() => {
    onExpandChange?.(isExpanded);
  }, [isExpanded, onExpandChange]);

  const isComposerExpanded = (isComposerFocused && Boolean(quickPrompt.trim())) || quickPrompt.trim().length > 30;

  const layoutMode = useAppLayoutMode();
  const isCompactLayout = layoutMode === 'compact';

  const visualRefCount = quickRefImages.filter((url) => !url.startsWith('agent-file:')).length;
  const hasSidebar = hasSidebarRefMedia({
    isDepthMode,
    quickGenMode,
    quickVideoRefMode,
    hasRefImages: visualRefCount > 0,
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
    visualRefCount > 0 ||
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
    setControlsDropdownOpen,
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
    readingAttachments,
    isSubmitting,
    fileAccept,
    toastMsg,
    showToast,
  };
}

/** Restore focus when the collapsed editor is replaced by the expanded editor. */
function usePromptBarFocus(
  expanded: boolean,
  inputRef: RefObject<RichPromptInputRef | null>,
  setDockFocused: (focused: boolean) => void,
  setComposerFocused: (focused: boolean) => void,
) {
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (expanded && restoreFocus.current) {
      restoreFocus.current = false;
      inputRef.current?.focus();
    }
  }, [expanded, inputRef]);

  return (event: FocusEvent<HTMLDivElement>) => {
    const editorFocused = event.target.getAttribute('contenteditable') === 'true';
    // Keep the collapsed upload button mounted until its click opens the file picker.
    if (!expanded && !editorFocused) return;
    if (!expanded && editorFocused) restoreFocus.current = true;
    setDockFocused(true);
    setComposerFocused(editorFocused);
  };
}

interface UsePromptBarVideoFramesOptions {
  showToast: (message: string) => void;
  setQuickVideoFirstFrame: (frame: string | null) => void;
  setQuickVideoLastFrame: (frame: string | null) => void;
  addQuickVideoMultiFrame: (frame: string) => void;
}

function usePromptBarVideoFrames({
  showToast,
  setQuickVideoFirstFrame,
  setQuickVideoLastFrame,
  addQuickVideoMultiFrame,
}: UsePromptBarVideoFramesOptions) {
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const multiFrameInputRef = useRef<HTMLInputElement>(null);

  const uploadFrames = (event: ChangeEvent<HTMLInputElement>, apply: (url: string) => void) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    void useAppStore.getState().readPromptAttachments(async () => {
      const urls = await Promise.all(files.map(readFileAsDataUrl));
      urls.forEach(apply);
    }).catch(() => showToast('无法读取参考帧，请重新选择图片'));
  };

  return {
    firstFrameInputRef,
    lastFrameInputRef,
    multiFrameInputRef,
    handleUploadFirstFrame: (event: ChangeEvent<HTMLInputElement>) => uploadFrames(event, setQuickVideoFirstFrame),
    handleUploadLastFrame: (event: ChangeEvent<HTMLInputElement>) => uploadFrames(event, setQuickVideoLastFrame),
    handleUploadMultiFrame: (event: ChangeEvent<HTMLInputElement>) => uploadFrames(event, addQuickVideoMultiFrame),
  };
}

/** Keep persisted controls valid when changing model, workflow, or output quality. */
function useVideoParameterConstraints() {
  const state = useAppStore(useShallow(s => ({
    mode: s.quickGenMode, model: s.quickVideoModel, refMode: s.quickVideoRefMode,
    resolution: s.quickVideoResolution, aspect: s.quickVideoAspectId, duration: s.quickVideoDuration,
    references: s.quickRefImages,
  })));
  const baseUrl = getGatewayClientBaseUrl(state.model);
  useEffect(() => {
    if (state.mode !== 'video') return;
    const modelId = upstreamModalityModelId('video', state.model);
    const profile = getVideoModelById(modelId, baseUrl);
    if (!profile) return;
    const store = useAppStore.getState();
    const resolved = resolveVideoMode(modelId, state.refMode, state.references.filter(url => !isVideoMediaUrl(url)).length, state.references.filter(isVideoMediaUrl).length);
    const modes = videoModes(modelId, baseUrl);
    const mode = modes.some(item => item.id === resolved) ? resolved : modes[0].id;
    const resolution = resolveVideoResolution(state.resolution, videoResolutionOptions(modelId, mode, baseUrl));
    const aspect = videoRatioLocked(modelId, mode, baseUrl) ? 'adaptive' : profile.supportedAspectRatios.includes(state.aspect) ? state.aspect : profile.supportedAspectRatios[0];
    const durations = videoDurationOptions(modelId, resolution, mode, baseUrl);
    const duration = durations.includes(state.duration) ? state.duration : durations.reduce((best, value) => Math.abs(value - state.duration) < Math.abs(best - state.duration) ? value : best);
    if (state.refMode !== mode) store.setQuickVideoRefMode(mode);
    if (state.resolution !== resolution) store.setQuickVideoResolution(resolution);
    if (state.aspect !== aspect) store.setQuickVideoAspectId(aspect);
    if (state.duration !== duration) store.setQuickVideoDuration(duration);
  }, [state, baseUrl]);
}
