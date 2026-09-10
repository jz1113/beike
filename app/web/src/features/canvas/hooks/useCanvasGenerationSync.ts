import { useEffect } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import type { CanvasProject } from '../types';
import type { GenerationTask } from '@/types/app-store';
export function useCanvasGenerationSync(currentProject: CanvasProject | null | undefined, generationTasks: GenerationTask[], updateNode: ReturnType<typeof useCanvasStore.getState>['updateNode']) {
  // 🌟 1. 监听全局任务完成事件，实现生成成功后 100% 自动揭晓与真实图片展示
  useEffect(() => {
    if (!currentProject) return;
    const handleTaskCompleted = (e: any) => {
      const detail = e.detail;
      if (!detail) return;

      const targetId = detail.id || detail.taskId || detail.updates?.id || detail.updates?.taskId;
      const resultUrl = detail.resultUrl || detail.updates?.resultUrl || detail.updates?.outputUrl || detail.url;
      const status = detail.status || detail.updates?.status;

      const currProj = useCanvasStore.getState().projects.find((p) => p.id === currentProject.id);
      if (!currProj) return;

      const targetNode = currProj.nodes.find(
        (n) => targetId && (n.id === targetId || n.taskId === targetId)
      );

      if (targetNode) {
        if (resultUrl) {
          updateNode(currentProject.id, targetNode.id, {
            status: 'success',
            progress: 100,
            imageUrl: targetNode.type === 'video' || targetNode.generationKind === 'video' ? undefined : resultUrl,
            videoUrl: (targetNode.type === 'video' || targetNode.generationKind === 'video') ? resultUrl : undefined,
          });
        } else if (status === 'FAILURE') {
          updateNode(currentProject.id, targetNode.id, {
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
  }, [currentProject?.id, updateNode]);

  // 🌟 2. 实时响应全局 generationTasks 队列变化与状态自愈
  useEffect(() => {
    if (!currentProject || !generationTasks || generationTasks.length === 0) return;

    const currProj = useCanvasStore.getState().projects.find((p) => p.id === currentProject.id);
    if (!currProj) return;

    currProj.nodes.forEach((node) => {
      const matchedTask = generationTasks.find(
        (t) =>
          (t.id && (t.id === node.id || t.id === node.taskId)) ||
          (t.taskId && (t.taskId === node.taskId || t.taskId === node.id))
      );

      if (!matchedTask) return;

      if ((matchedTask.status === 'SUCCESS' || matchedTask.resultUrl) && matchedTask.resultUrl) {
        if ((node.videoUrl || node.imageUrl) !== matchedTask.resultUrl || node.status !== 'success') {
          updateNode(currentProject.id, node.id, {
            status: 'success',
            progress: 100,
            imageUrl: node.type === 'video' || node.generationKind === 'video' ? undefined : matchedTask.resultUrl,
            videoUrl: (node.type === 'video' || node.generationKind === 'video') ? matchedTask.resultUrl : undefined,
          });
        }
      } else if (matchedTask.status === 'FAILURE') {
        if (node.status !== 'error') {
          updateNode(currentProject.id, node.id, {
            status: 'error',
            progress: 0,
          });
        }
      } else if (matchedTask.status === 'IN_PROGRESS' || (matchedTask.status as string) === 'PENDING') {
        const prog = (matchedTask as any).progress;
        if (typeof prog === 'number' && prog > (node.progress || 0)) {
          updateNode(currentProject.id, node.id, { progress: prog });
        }
      }
    });
  }, [generationTasks, currentProject?.id, updateNode]);

}
