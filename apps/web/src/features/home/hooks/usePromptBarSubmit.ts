import { useState, useRef, useEffect, useCallback } from 'react';
import { TOAST_DURATION_MS } from '@/shared/constants/timing';
import { registerRefMedia } from '@/shared/media/refMediaRegistry';
import { useAppStore } from '@/store';
import { buildPromptBarGenerationTasks, canSubmitPromptBar } from '@/shared/prompt-bar/promptBarSubmit';
import { registerDepthSubmit } from '@/shared/api/depthGeneration';
import type { QuickGenMode } from '@beike/domain/depthVideo';
import type { SubjectItem } from '@/shared/prompt-bar/promptBarConstants';

interface UsePromptBarSubmitOptions {
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
  currentView: string;
  availableImageModelsLength: number;
  availableVideoModelsLength?: number;
  quickDepthStyle: any;
  quickDepthQuality: any;
  refMediaFile: File | null;
  depthModelReady: boolean;
  setupCommand: string;
  clearComposerMedia: () => void;
  setActiveSubjects: React.Dispatch<React.SetStateAction<SubjectItem[]>>;
  onSubmitSuccess?: (info: { prompt: string; refImages: string[]; mode: QuickGenMode; tasks: any[] }) => void;
}

export function usePromptBarSubmit({
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
  currentView,
  availableImageModelsLength,
  availableVideoModelsLength,
  quickDepthStyle,
  quickDepthQuality,
  refMediaFile,
  depthModelReady,
  setupCommand,
  clearComposerMedia,
  setActiveSubjects,
  onSubmitSuccess,
}: UsePromptBarSubmitOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🌟 生产事故级防重：物理节流冷却锁（至少 3 秒冷却，杜绝连击、双击或回车与点击并发提交）
  const lastSubmitTimeRef = useRef<number>(0);
  const submittingLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (submittingLockTimerRef.current) clearTimeout(submittingLockTimerRef.current);
    };
  }, []);

  const handleSendPrompt = useCallback(() => {
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < 3000) {
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
      currentView,
      hasImageModels: availableImageModelsLength > 0,
      hasVideoModels: (availableVideoModelsLength ?? 0) > 0,
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
      prompt: quickPrompt,
      refImages: quickRefImages,
      mode: quickGenMode,
      tasks: result.tasks,
    });
    clearComposerMedia();

    // 保持 2 秒按钮禁用冷却，给予用户明确反馈并防止快速连续点击
    if (submittingLockTimerRef.current) clearTimeout(submittingLockTimerRef.current);
    submittingLockTimerRef.current = setTimeout(() => {
      setIsSubmitting(false);
      submittingLockTimerRef.current = null;
    }, 2000);
  }, [
    quickGenMode,
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
    currentView,
    availableImageModelsLength,
    quickDepthStyle,
    quickDepthQuality,
    refMediaFile,
    depthModelReady,
    isDepthMode,
    setupCommand,
    clearComposerMedia,
    showToast,
  ]);

  const handleSendPromptRef = useRef(handleSendPrompt);
  useEffect(() => {
    handleSendPromptRef.current = handleSendPrompt;
  });

  useEffect(() => {
    const handleTrigger = () => {
      handleSendPromptRef.current();
    };
    window.addEventListener('app:trigger-generate', handleTrigger);
    return () => window.removeEventListener('app:trigger-generate', handleTrigger);
  }, []);

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

  const canSend = canSubmitPromptBar({
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
    handleSendPrompt,
    handleComposerKeyDown,
  };
}
