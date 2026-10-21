import { useCallback, useRef } from 'react';
import { useAppStore, type GenerationTask } from '@client/store';
import { cleanPromptText, getAspectRatioFromSize, stripWorkshopPromptGuards } from '@shared/domain/media/drawing';
import { peekDepthSubmit } from '@client/shared/api/generation/depthGeneration';
import { registerRefMedia } from '@client/shared/media/refMediaRegistry';
import { createGenerationAttemptId, prepareGenerationAttempt } from '@client/shared/media/generationAttempt';
import { isDepthImageTask, isDepthVideoTask } from '@client/shared/media/generationTaskMedia';
import { isGenerateVideoTask } from '../model/generateWorkspaceLayout';

function getLiveTask(task: GenerationTask): GenerationTask {
  const store = useAppStore.getState();
  const current = store.generationTasks.find((item) => item.id === task.id);
  if (current) return current;
  for (const session of store.sessions) {
    const item = session.tasks.find((candidate) => candidate.id === task.id);
    if (item) return item;
  }
  return task;
}

export function useGenerateTaskActions(onShowToast: (message: string) => void) {
  const pendingAttemptsRef = useRef(new Set<string>());

  const handleReuseTask = useCallback((task: GenerationTask) => {
    const store = useAppStore.getState();
    const depthVideo = isDepthVideoTask(task);
    const depthImage = isDepthImageTask(task);
    const video = isGenerateVideoTask(task);
    let references = task.referenceImages?.length ? task.referenceImages : task.images?.length ? task.images :
      [task.referenceImageUrl || task.sourceImageUrl || task.productImageUrl].filter((url): url is string => Boolean(url));
    store.setQuickPrompt(stripWorkshopPromptGuards(cleanPromptText(task.prompt || '')));
    store.setQuickGenMode(depthVideo ? 'depth-video' : depthImage ? 'depth-image' : video ? 'video' : 'image');
    store.setQuickCount(1);
    store.setQuickVideoCount(1);
    store.setQuickVideoFirstFrame(null);
    store.setQuickVideoLastFrame(null);
    store.setQuickVideoMultiFrames([]);
    if (depthVideo || depthImage) {
      if (task.depthStyle) store.setQuickDepthStyle(task.depthStyle);
      if (['fast', 'standard', 'high'].includes(task.quality)) {
        store.setQuickDepthQuality(task.quality as 'fast' | 'standard' | 'high');
      }
      const payload = peekDepthSubmit(task.id);
      if (payload?.file) {
        const url = URL.createObjectURL(payload.file);
        registerRefMedia(url, payload.file);
        references = [url];
      }
      onShowToast(payload?.file ? '已恢复深度生成参数和参考文件' : '已恢复深度生成参数，请确认参考文件后生成');
    } else if (video) {
      if (task.model) store.setQuickVideoModel(task.model);
      store.setQuickVideoAspectId(getAspectRatioFromSize(task.size));
      store.setQuickVideoDuration(task.videoDuration || 5);
      const resolution = task.videoResolution || task.quality;
      store.setQuickVideoResolution(['480P', '720P', '1080P', '4K'].includes(resolution)
        ? resolution as '480P' | '540P' | '720P' | '1080P' | '2K' | '4K' : '720P');
      const refMode = task.videoRefMode || 'omni';
      store.setQuickVideoRefMode(refMode);
      if (refMode === 'first_last_frame') {
        store.setQuickVideoFirstFrame(references[0] || null);
        store.setQuickVideoLastFrame(references[1] || null);
      } else if (refMode === 'multi_frame') {
        store.setQuickVideoMultiFrames(references);
      }
    } else {
      if (task.model) store.setQuickModel(task.model);
      store.setQuickAspectId(getAspectRatioFromSize(task.size));
      store.setQuickQuality(['high', 'medium', 'low'].includes(task.quality)
        ? task.quality as 'high' | 'medium' | 'low' : 'high');
    }
    store.setQuickRefImages([...new Set(references)]);
  }, [onShowToast]);

  const startAttempts = useCallback(async (tasks: GenerationTask[], file?: File) => {
    if (!tasks.length) return false;
    const liveTasks = tasks.map(getLiveTask);
    if (liveTasks.some((task) => task.submissionRecoveryRequired)) {
      onShowToast('原任务提交结果待核对，请先核对原任务后再重试');
      return false;
    }
    const operationKey = tasks.map((task) => task.id).join(',');
    if (pendingAttemptsRef.current.has(operationKey)) return false;
    pendingAttemptsRef.current.add(operationKey);
    const sessionId = useAppStore.getState().currentSessionId;
    try {
      const batchId = createGenerationAttemptId('batch');
      const attempts = await Promise.all(liveTasks.map((task) => prepareGenerationAttempt(task, batchId, file)));
      if (attempts.some((task) => !task)) {
        onShowToast('无法恢复原参考文件，请重新选择文件后生成');
        return false;
      }
      const store = useAppStore.getState();
      if (store.currentSessionId !== sessionId) {
        onShowToast('对话已切换，请在目标对话中重新点击生成');
        return false;
      }
      if (tasks.map(getLiveTask).some((task) => task.submissionRecoveryRequired)) {
        onShowToast('原任务提交结果待核对，请先核对原任务后再重试');
        return false;
      }
      const ready = attempts as GenerationTask[];
      if (ready.length === 1) store.addGenerationTask(ready[0], false);
      else store.addBatchGenerationTasks(ready, undefined, false);
      return true;
    } catch {
      onShowToast('无法准备生成任务，请重新选择参考文件后再试');
      return false;
    } finally {
      pendingAttemptsRef.current.delete(operationKey);
    }
  }, [onShowToast]);

  return {
    handleReuseTask,
    handleRetryTask: useCallback((task: GenerationTask) => startAttempts([task]), [startAttempts]),
    handleRegenerateTask: useCallback((task: GenerationTask) => startAttempts([task]), [startAttempts]),
    handleRegenerateBatch: useCallback((tasks: GenerationTask[]) => startAttempts(tasks), [startAttempts]),
    handleRetryWithFile: useCallback((task: GenerationTask, file: File) => startAttempts([task], file), [startAttempts]),
  };
}
