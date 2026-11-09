import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useAppStore } from '@client/store';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { createGenerationAttemptId } from '@client/shared/media/generationAttempt';
import { IMAGE_RATIO_ITEMS } from '@client/shared/prompt-bar/promptBarConstants';
import { calculateImageDimensions } from '@client/shared/prompt-bar/promptBarDisplay';
import { isImageTaskActive, isImageTaskFailed, isImageTaskSucceeded } from '@shared/domain/core/taskStatus';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import { getEnabledImageModelsFromSettings, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';
import { persistCanvasMedia } from '../model/canvasNodeFactory';
import { appendNodeRun } from '../model/canvasGraph';
import { prepareStudioRetry } from '../model/studioTaskState';
import type { CanvasNode, CanvasProject } from '../model/types';
import { hasCanvasReadFailure } from '../store/canvasProjectDefaults';
import { saveCanvasProjects, useCanvasStore } from '../store/useCanvasStore';

export function useCanvasHydrated() {
  const [ready, setReady] = useState(() => useCanvasStore.persist.hasHydrated() && !hasCanvasReadFailure());
  useEffect(() => {
    const check = () => setReady(useCanvasStore.persist.hasHydrated() && !hasCanvasReadFailure());
    const stop = useCanvasStore.persist.onFinishHydration(check);
    window.addEventListener('canvas-save-error', check);
    check();
    return () => {
      stop();
      window.removeEventListener('canvas-save-error', check);
    };
  }, []);
  return ready;
}

export function useCanvasFileDrop(projectId: string, readView: () => { pan: { x: number; y: number }; zoom: number }) {
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types || []).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const { pan, zoom } = readView();
    const x = (event.clientX - rect.left - pan.x) / zoom;
    const y = (event.clientY - rect.top - pan.y) / zoom;
    setErrors([]);
    setPending((value) => value + files.length);
    for (const [index, file] of files.entries()) {
      try {
        const media = await persistCanvasMedia(file, 0, 0);
        useCanvasStore.getState().addNode(projectId, {
          ...media,
          x: Math.round(x + (index % 3) * 332),
          y: Math.round(y + Math.floor(index / 3) * 512),
        });
      } catch (error) {
        setErrors((previous) => [...previous, `${file.name}：${error instanceof Error ? error.message : '上传失败，请重试'}`]);
      } finally {
        setPending((value) => value - 1);
      }
    }
  };
  return {
    pending,
    errors,
    dismissErrors: () => setErrors([]),
    dropProps: {
      onDragOver,
      onDrop,
    },
  };
}

/** Queue image tools through the same durable task engine used by the drawing editor. */
export function enqueueCanvasImageTool(projectId: string, node: Omit<CanvasNode, 'id' | 'createdAt'>) {
  const canvas = useCanvasStore.getState();
  const store = useAppStore.getState();
  if (!store.generationHistoryReady) throw new Error('正在恢复生成历史，请稍后重试');
  const project = canvas.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('画布项目已关闭，请重新打开后生成');
  const config = node.drawing;
  if (!config || !node.referenceImageUrl) throw new Error('参考图片不可用，请重新添加素材');
  const model = config.model || store.quickModel;
  const profile = getApprovedModel(model);
  if (!getEnabledImageModelsFromSettings(readWorkflowModelsFromStorage()).some((item) => item.id === model)) {
    throw new Error('请先选择已启用的生图模型');
  }
  if (!profile?.supportEdits) throw new Error('当前模型不支持参考图编辑，请切换模型');
  if (profile.supportedQualities && !profile.supportedQualities.some((quality) => quality === config.quality)) {
    throw new Error('当前模型不支持所选画质，请重新选择');
  }
  const ratios = IMAGE_RATIO_ITEMS.filter((item) => item.id !== 'smart');
  const source = project.nodes.find((item) => item.imageUrl === node.referenceImageUrl);
  const sourceRatio =
    source?.resultWidth && source.resultHeight ? source.resultWidth / source.resultHeight : node.width / node.height;
  const ratio =
    config.aspect === 'smart'
      ? ratios.reduce((best, item) =>
          Math.abs(Math.log(item.w / item.h / sourceRatio)) < Math.abs(Math.log(best.w / best.h / sourceRatio)) ? item : best,
        )
      : ratios.find((item) => item.id === config.aspect);
  if (!ratio) throw new Error('请选择有效的输出比例');
  const { sizeStr } = calculateImageDimensions({
    quickModel: model,
    quickAspectId: ratio.id,
    quickQuality: config.quality,
    baseRatio: ratio,
  });
  const task: GenerationTask = {
    id: createGenerationAttemptId(),
    canvasProjectId: projectId,
    sessionTitle: project.title,
    title: node.title || '图片编辑',
    prompt: node.content || '',
    model,
    size: sizeStr,
    quality: config.quality,
    mediaType: 'image',
    referenceImageUrl: node.referenceImageUrl,
    referenceImages: [node.referenceImageUrl],
    images: [node.referenceImageUrl],
    sourceImageUrl: node.referenceImageUrl,
    useReferenceImage: true,
    taskType: 'smart_edit',
    status: 'IN_PROGRESS',
    progress: '15%',
    createdAt: Date.now(),
  };
  const nodeId = `canvas-node-${crypto.randomUUID()}`;
  canvas.addNode(projectId, {
    ...node,
    id: nodeId,
    taskId: task.id,
    status: 'generating',
    progress: 0,
    drawing: { ...config, model, aspect: ratio.id },
    generationSize: sizeStr,
  });
  try {
    store.addGenerationTask(task, false);
  } catch (error) {
    canvas.deleteNode(projectId, nodeId);
    throw error;
  }
}

/** Retry binds a fresh attempt to the existing node, retaining its exact model and input slots. */
export async function retryCanvasGeneration(projectId: string, node: CanvasNode) {
  const store = useAppStore.getState();
  if (!store.generationHistoryReady) throw new Error('正在恢复生成历史，请稍后重试');
  const tasks = [...store.generationTasks, ...store.sessions.flatMap((session) => session.tasks)];
  const taskId = node.taskId || node.id;
  const task = tasks.find((item) => item.id === taskId || item.taskId === taskId);
  if (!task) throw new Error('原生成任务不可用，请重新添加参考素材后生成');
  const attempt = await prepareStudioRetry(task.id);
  const canvas = useCanvasStore.getState();
  const current = canvas.projects.find((project) => project.id === projectId)?.nodes.find((item) => item.id === node.id);
  if (!current || current.taskId !== node.taskId || current.status === 'generating') return;
  if (!useAppStore.getState().generationHistoryReady) throw new Error('正在恢复生成历史，请稍后重试');
  canvas.updateNode(projectId, node.id, {
    taskId: attempt.id,
    generationIntent: attempt,
    status: 'generating',
    progress: 0,
    imageUrl: undefined,
    videoUrl: undefined,
  });
  try {
    await saveCanvasProjects();
    const saved = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id);
    if (saved?.taskId !== attempt.id || saved.status !== 'generating') return;
    store.addGenerationTask({ ...attempt, canvasProjectId: projectId }, false);
  } catch (error) {
    canvas.updateNode(projectId, node.id, current);
    throw error;
  }
}

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

export function useCanvasGenerationSync(
  currentProject: CanvasProject | null | undefined,
  generationTasks: GenerationTask[],
  updateNode: ReturnType<typeof useCanvasStore.getState>['updateNode'],
) {
  const projectId = currentProject?.id;
  const historyReady = useAppStore(state => state.generationHistoryReady);
  const originalTasks = useRef(new Set(currentProject?.nodes.filter(node => node.status === 'generating' && node.taskId).map(node => node.taskId)));
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

      const targetNode = currProj.nodes.find((n) => targetId && (n.taskId ? n.taskId === targetId : n.id === targetId));

      if (targetNode) {
        if ((targetNode.studioRaw?.beikeTaskId || targetNode.studioRaw?.beikeLastTaskId) && !targetNode.studioRaw?.beikeCanvasTaskId) return;
        if (resultUrl) {
          if (targetNode.status === 'success' && targetNode.runs?.some(run => (run.videoUrl || run.imageUrl) === resultUrl)) return;
          const isVideoTarget = targetNode.type === 'video' || targetNode.generationKind === 'video';
          const alreadyInRuns = (targetNode.runs || []).some(
            (r) => (isVideoTarget ? r.videoUrl : r.imageUrl) === resultUrl,
          );
          const runPatch = alreadyInRuns
            ? {}
            : appendNodeRun(targetNode, {
                taskId: targetId,
                imageUrl: isVideoTarget ? undefined : resultUrl,
                videoUrl: isVideoTarget ? resultUrl : undefined,
                prompt: targetNode.content,
                model: targetNode.drawing?.model,
                status: 'success',
              });
          updateNode(projectId, targetNode.id, {
            ...runPatch,
            status: 'success',
            generationIntent: undefined,
            progress: 100,
            imageUrl: isVideoTarget ? undefined : resultUrl,
            videoUrl: isVideoTarget ? resultUrl : undefined,
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
    if (!projectId || !historyReady) return;

    const currProj = useCanvasStore.getState().projects.find((p) => p.id === projectId);
    if (!currProj) return;

    currProj.nodes.forEach((node) => {
      if ((node.studioRaw?.beikeTaskId || node.studioRaw?.beikeLastTaskId) && !node.studioRaw?.beikeCanvasTaskId) return;
      const app = useAppStore.getState();
      const key = node.taskId || node.id;
      const matchedTask = generationTasks.find(t => t.id === key || t.taskId === key)
        ?? app.sessions.flatMap(session => session.tasks).find(t => t.id === key || t.taskId === key);
      if (!matchedTask) {
        if (node.status !== 'generating' || !originalTasks.current.delete(node.taskId)) return;
        if (node.generationIntent?.id === node.taskId && node.generationIntent) {
          app.addGenerationTask({ ...node.generationIntent, canvasProjectId: projectId,
            status: 'IN_PROGRESS', submissionRecoveryRequired: true, failReason: '正在核对上次提交结果，请勿重复生成' }, false);
        } else {
          const run = node.runs?.[node.activeRunIndex ?? 0];
          updateNode(projectId, node.id, { status: 'error', imageUrl: run?.imageUrl, videoUrl: run?.videoUrl,
            progress: 0 });
        }
        return;
      }

      if ((isImageTaskSucceeded(matchedTask.status) || matchedTask.resultUrl) && matchedTask.resultUrl) {
        if ((node.videoUrl || node.imageUrl) !== matchedTask.resultUrl || node.status !== 'success') {
          const isVideoTarget = node.type === 'video' || node.generationKind === 'video';
          const alreadyInRuns = (node.runs || []).some(
            (r) => (isVideoTarget ? r.videoUrl : r.imageUrl) === matchedTask.resultUrl,
          );
          if (alreadyInRuns && node.status === 'success') return;
          const runPatch = alreadyInRuns
            ? {}
            : appendNodeRun(node, {
                taskId: matchedTask.id,
                imageUrl: isVideoTarget ? undefined : matchedTask.resultUrl,
                videoUrl: isVideoTarget ? matchedTask.resultUrl : undefined,
                prompt: node.content,
                model: node.drawing?.model,
                status: 'success',
              });
          updateNode(projectId, node.id, {
            ...runPatch,
            status: 'success',
            generationIntent: undefined,
            progress: 100,
            imageUrl: isVideoTarget ? undefined : matchedTask.resultUrl,
            videoUrl: isVideoTarget ? matchedTask.resultUrl : undefined,
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
  }, [generationTasks, historyReady, projectId, updateNode]);
}
