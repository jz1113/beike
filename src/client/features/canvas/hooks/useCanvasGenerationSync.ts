import { useEffect } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import type { CanvasProject } from '../model/types';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { isImageTaskActive, isImageTaskFailed, isImageTaskSucceeded } from '@shared/domain/core/taskStatus';

type GenerationCompletionDetail = Partial<GenerationTask> & {
  url?: string;
  updates?: Partial<GenerationTask> & { outputUrl?: string };
};

function parseGenerationProgress(progress: unknown): number | undefined {
  if (typeof progress === 'number' && Number.isFinite(progress)) return progress;
  if (typeof progress === 'string') {
    const parsed = Number.parseFloat(progress.replace(/%/g, '').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function useCanvasGenerationSync(currentProject: CanvasProject | null | undefined, generationTasks: GenerationTask[], updateNode: ReturnType<typeof useCanvasStore.getState>['updateNode']) {
  const projectId = currentProject?.id;
  // 🌟 1. 监听全局任务完成事件，实现生成成功后 100% 自动揭晓与真实图片展示
  useEffect(() => {
    if (!projectId) return;
    const handleTaskCompleted = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      const detail = (e as CustomEvent<GenerationCompletionDetail>).detail;
      if (!detail) return;

      const targetId = detail.id || detail.taskId || detail.updates?.id || detail.updates?.taskId;
      const resultUrl = detail.resultUrl || detail.updates?.resultUrl || detail.updates?.outputUrl || detail.url;
      const status = detail.status || detail.updates?.status;

      const currProj = useCanvasStore.getState().projects.find((p) => p.id === projectId);
      if (!currProj) return;

      const targetNode = currProj.nodes.find(
        (n) => targetId && (n.taskId ? n.taskId === targetId : n.id === targetId)
      );

      if (targetNode) {
        if (resultUrl) {
          updateNode(projectId, targetNode.id, {
            status: 'success',
            progress: 100,
            imageUrl: targetNode.type === 'video' || targetNode.generationKind === 'video' ? undefined : resultUrl,
            videoUrl: (targetNode.type === 'video' || targetNode.generationKind === 'video') ? resultUrl : undefined,
          });
        } else if (isImageTaskFailed(status)) {
          updateNode(projectId, targetNode.id, {
            status: 'error',
            progress: 0,
          });
        }
      }
    };

    window.addEventListener('azhuo:generation-completed', handleTaskCompleted);
    return () => {
      window.removeEventListener('azhuo:generation-completed', handleTaskCompleted);
    };
  }, [projectId, updateNode]);

  // 🌟 2. 实时响应全局 generationTasks 队列变化与状态自愈
  useEffect(() => {
    if (!projectId || !generationTasks || generationTasks.length === 0) return;

    const currProj = useCanvasStore.getState().projects.find((p) => p.id === projectId);
    if (!currProj) return;

    currProj.nodes.forEach((node) => {
      const matchedTask = generationTasks.find(
        (t) =>
          t.id === (node.taskId || node.id) || t.taskId === (node.taskId || node.id)
      );

      if (!matchedTask) return;

      if ((isImageTaskSucceeded(matchedTask.status) || matchedTask.resultUrl) && matchedTask.resultUrl) {
        if ((node.videoUrl || node.imageUrl) !== matchedTask.resultUrl || node.status !== 'success') {
          updateNode(projectId, node.id, {
            status: 'success',
            progress: 100,
            imageUrl: node.type === 'video' || node.generationKind === 'video' ? undefined : matchedTask.resultUrl,
            videoUrl: (node.type === 'video' || node.generationKind === 'video') ? matchedTask.resultUrl : undefined,
          });
        }
      } else if (isImageTaskFailed(matchedTask.status)) {
        if (node.status !== 'error') {
          updateNode(projectId, node.id, {
            status: 'error',
            progress: 0,
          });
        }
      } else if (isImageTaskActive(matchedTask.status)) {
        const parsed = parseGenerationProgress(matchedTask.progress);
        if (parsed == null) return;
        const progress = parsed >= 100 ? 99 : parsed;
        if (progress > (node.progress || 0) || node.status !== 'generating') {
          updateNode(projectId, node.id, { status: 'generating', progress });
        }
      }
    });
  }, [generationTasks, projectId, updateNode]);

}
