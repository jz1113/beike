import { useState, useRef, useEffect, useCallback } from 'react';
import { TOAST_DURATION_MS } from '@client/shared/constants/timing';
import { registerRefMedia } from '@client/shared/media/refMediaRegistry';
import { useAppStore } from '@client/store';
import { buildPromptBarGenerationTasks, canSubmitPromptBar } from '@client/shared/prompt-bar/promptBarSubmit';
import { registerDepthSubmit } from '@client/shared/api/generation/depthGeneration';
import type { QuickGenMode } from '@shared/domain/media/depthVideo';
import type { SubjectItem } from '@client/shared/prompt-bar/promptBarConstants';
import { claimPromptBarShortcut } from '../promptBarShortcut';

interface UsePromptBarSubmitOptions {
  composerRef: React.RefObject<HTMLElement | null>;
  quickGenMode: QuickGenMode;
  isDepthMode: boolean;
  quickPrompt: string;
  quickRefImages: string[];
  activeSubjects: SubjectItem[];
  allSubjects: SubjectItem[];
  quickVideoRefMode: string;
  quickVideoFirstFrame?: string | null;
  quickVideoLastFrame?: string | null;
  quickVideoMultiFrames: string[];
  quickCount: number;
  quickVideoCount: number;
  quickModel: string;
  quickVideoModel: string;
  sizeStr: string;
  quickQuality: string;
  quickVideoAspectId: string;
  quickVideoResolution: string;
  quickVideoDuration: number;
  quickVideoContextIrEnabled?: boolean;
  currentView: string;
  availableImageModelsLength: number;
  availableVideoModelsLength?: number;
  availableAudioModelsLength?: number;
  quickAudioModel?: string;
  quickDepthStyle: any;
  quickDepthQuality: any;
  refMediaFile: File | null;
  depthModelReady: boolean;
  setupCommand: string;
  clearComposerMedia: () => void;
  setActiveSubjects: React.Dispatch<React.SetStateAction<SubjectItem[]>>;
  onSubmitSuccess?: (info: { prompt: string; refImages: string[]; mode: QuickGenMode; tasks: any[] }) => void;
}

const SUBMIT_COOLDOWN_MS = 3000;

export function usePromptBarSubmit({
  composerRef,
  quickGenMode,
  isDepthMode,
  quickPrompt,
  quickRefImages,
  activeSubjects,
  allSubjects,
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
  availableImageModelsLength,
  availableVideoModelsLength,
  availableAudioModelsLength,
  quickAudioModel,
  quickDepthStyle,
  quickDepthQuality,
  refMediaFile,
  depthModelReady,
  setupCommand,
  clearComposerMedia,
  setActiveSubjects,
  onSubmitSuccess,
}: UsePromptBarSubmitOptions) {
  const readingAttachments = useAppStore(state => state.pendingAttachmentReads > 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🌟 生产事故级防重：物理节流冷却锁（至少 3 秒冷却，杜绝连击、双击或回车与点击并发提交）
  const lastSubmitTimeRef = useRef<number>(0);
  // The home view can be hidden while a task runs. Resume the same deadline when it reopens.
  useEffect(() => {
    if (!isSubmitting) return;
    const remaining = lastSubmitTimeRef.current + SUBMIT_COOLDOWN_MS - Date.now();
    const timer = setTimeout(() => setIsSubmitting(false), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [isSubmitting]);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToastMsg(null);
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleSendPrompt = useCallback(() => {
    if (useAppStore.getState().pendingAttachmentReads > 0) return;
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < SUBMIT_COOLDOWN_MS) {
      console.warn('[usePromptBarSubmit] 拦截 3 秒内的重复提交操作，保障资金安全');
      return;
    }

    const result = buildPromptBarGenerationTasks({
      quickGenMode,
      quickPrompt,
      quickRefImages,
      activeSubjects,
      allSubjects,
      quickVideoRefMode,
      quickVideoFirstFrame: quickVideoFirstFrame ?? null,
      quickVideoLastFrame: quickVideoLastFrame ?? null,
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
      hasImageModels: availableImageModelsLength > 0,
      hasVideoModels: (availableVideoModelsLength ?? 0) > 0,
      hasAudioModels: (availableAudioModelsLength ?? 0) > 0,
      quickAudioModel,
      assistantModel: useAppStore.getState().assistantModel,
      quickDepthStyle,
      quickDepthQuality,
      refMediaFile,
      depthModelReady,
    });

    if (!result.ok) {
      showToast(result.error);
      return;
    }

    // 立即打上物理时间戳锁与 UI 禁用锁
    lastSubmitTimeRef.current = now;
    setIsSubmitting(true);

    if (isDepthMode) {
      if (!refMediaFile) {
        setIsSubmitting(false);
        showToast('无法读取上传文件，请重新上传');
        return;
      }
      if (!depthModelReady) {
        setIsSubmitting(false);
        showToast(`深度模型未就绪，请在终端执行：${setupCommand}`);
        return;
      }
      result.tasks.forEach((task) => {
        registerDepthSubmit(task.id, {
          file: refMediaFile,
          style: quickDepthStyle,
          quality: quickDepthQuality,
          mode: quickGenMode as 'depth-image' | 'depth-video',
        });
        if (task.referenceImageUrl) {
          registerRefMedia(task.referenceImageUrl, refMediaFile);
        }
      });
    }

    if (currentView !== 'canvas') {
      useAppStore.getState().setCurrentView('generate');
    }
    useAppStore
      .getState()
      .addBatchGenerationTasks(
        result.tasks,
        result.sessionTitle,
        result.shouldCreateNewSession
      );
    onSubmitSuccess?.({
      prompt: result.cleanedPrompt,
      refImages: quickRefImages,
      mode: quickGenMode,
      tasks: result.tasks,
    });
    clearComposerMedia();

  }, [quickGenMode, quickPrompt, quickRefImages, activeSubjects, allSubjects, quickVideoRefMode, quickVideoFirstFrame, quickVideoLastFrame, quickVideoMultiFrames, quickCount, quickVideoCount, quickModel, quickVideoModel, quickAudioModel, sizeStr, quickQuality, quickVideoAspectId, quickVideoResolution, quickVideoDuration, quickVideoContextIrEnabled, currentView, availableImageModelsLength, availableVideoModelsLength, availableAudioModelsLength, quickDepthStyle, quickDepthQuality, refMediaFile, depthModelReady, isDepthMode, onSubmitSuccess, clearComposerMedia, showToast, setupCommand]);

  const handleSendPromptRef = useRef(handleSendPrompt);
  useEffect(() => {
    handleSendPromptRef.current = handleSendPrompt;
  });

  useEffect(() => {
    const handleTrigger = (event: Event) => {
      if (claimPromptBarShortcut(event, composerRef.current)) handleSendPromptRef.current();
    };
    window.addEventListener('app:trigger-generate', handleTrigger);
    return () => window.removeEventListener('app:trigger-generate', handleTrigger);
  }, [composerRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Backspace' && !quickPrompt && activeSubjects.length > 0) {
        setActiveSubjects((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isSubmitting) return;
        handleSendPrompt();
      }
    },
    [quickPrompt, activeSubjects.length, setActiveSubjects, handleSendPrompt, isSubmitting]
  );

  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (isDepthMode) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSendPrompt();
        }
        return;
      }
      handleKeyDown(e);
    },
    [isDepthMode, handleKeyDown, handleSendPrompt]
  );

  const canSend = !readingAttachments && canSubmitPromptBar({
    quickGenMode,
    quickPrompt,
    quickRefImages,
    activeSubjects,
    allSubjects,
    quickVideoRefMode,
    quickVideoFirstFrame: quickVideoFirstFrame ?? null,
    quickVideoLastFrame: quickVideoLastFrame ?? null,
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
    hasImageModels: availableImageModelsLength > 0,
    hasVideoModels: (availableVideoModelsLength ?? 0) > 0,
    hasAudioModels: (availableAudioModelsLength ?? 0) > 0,
    quickAudioModel,
    isSubmitting,
    quickDepthStyle,
    quickDepthQuality,
    refMediaFile,
    depthModelReady,
  });

  return {
    isSubmitting,
    toastMsg,
    showToast,
    canSend,
    readingAttachments,
    handleSendPrompt,
    handleComposerKeyDown,
  };
}
