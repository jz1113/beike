import { createContext, useCallback, useEffect, useMemo, useRef } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { pollGenerationTask } from '@client/shared/api/generation/generationApi';
import { appendLegacyCommerceOutputs, validateNativeCommerceInputs, type LegacyCommerceOutput } from '../model/creativeWorkflowProjects';
import { useAppStore } from '@client/store';
import { isImageTaskFailed } from '@shared/domain/core/taskStatus';
import { filterStudioConnections } from '../model/studioConnections';
import {
  executeStudioNodeGeneration,
  executeStudioTextNodeAnalysis,
} from '../model/studioHostExecution';
import {
  applyStudioTaskResult,
  normalizeStudioNode,
  recoverLoadedStudioScene,
} from '../model/studioHostRuntime';
import { syncStudioPreviews } from '../model/studioPreview';
import { syncCanvasGraphToStudioScene } from '../model/studioSceneAdapter';
import {
  recoverStudioTaskRecord,
  stopStudioNode,
  studioNodeTaskId,
  type StudioTaskCommands,
} from '../model/studioTaskState';
import type { StudioScene } from '../model/types';
import { setCanvasProjectSerializer } from '../store/canvasProjectDefaults';
import { hydrateCanvasScene } from '../store/canvasArchiveStorage';
import { saveCanvasProjects, useCanvasStore } from '../store/useCanvasStore';
import { useVideoPromptReview } from './useCanvasSelectionActions';

export const NativeStudioCommandsContext = createContext<StudioTaskCommands | null>(null);

export interface UseNativeStudioCommandsOptions {
  projectId: string;
  onFocusNode?: (nodeId: string) => void;
  onOpenCompiler?: (payload: {
    nodeId: string;
    commands: StudioTaskCommands;
    textModel?: string;
    finish: (approved: boolean) => void;
  }) => void;
}

export function useNativeStudioCommands({
  projectId,
  onFocusNode,
  onOpenCompiler,
}: UseNativeStudioCommandsOptions) {
  const { requestReview, review } = useVideoPromptReview();
  const mediaSession = useRef<Awaited<ReturnType<typeof hydrateCanvasScene>> | undefined>(
    undefined,
  );
  const focusRef = useRef(onFocusNode);
  focusRef.current = onFocusNode;
  const compilerRef = useRef(onOpenCompiler);
  compilerRef.current = onOpenCompiler;

  const readCurrentScene = useCallback((): StudioScene => {
    const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
    if (!project) {
      return {
        nodes: [],
        connections: [],
        groups: [],
        strokes: [],
        textBoxes: [],
        view: { x: 0, y: 0, zoom: 1 },
      };
    }
    if (project.nodes.length > 0) {
      return syncCanvasGraphToStudioScene(project);
    }
    return (
      project.studioScene || {
        nodes: [],
        connections: [],
        groups: [],
        strokes: [],
        textBoxes: [],
        view: project.viewport || { x: 0, y: 0, zoom: 1 },
      }
    );
  }, [projectId]);

  const commitScene = useCallback(
    (scene: StudioScene): StudioScene => {
      const synced = syncStudioPreviews(scene);
      useCanvasStore.getState().syncStudioScene(projectId, synced);
      return synced;
    },
    [projectId],
  );

  const saveScene = useCallback(
    async (scene?: StudioScene) => {
      if (scene) commitScene(scene);
      await saveCanvasProjects();
    },
    [commitScene],
  );

  const taskCommands = useMemo<StudioTaskCommands>(() => {
    const commands: StudioTaskCommands = {
      read: () => readCurrentScene(),
      connect: (connections) => {
        const current = readCurrentScene();
        commitScene({
          ...current,
          connections: filterStudioConnections(current, connections),
        });
      },
      insert: (node) => {
        const current = readCurrentScene();
        commitScene({
          ...current,
          nodes: [...current.nodes.filter((item) => item.id !== node.id), normalizeStudioNode(node)],
        });
      },
      update: (nodeId, expectedTaskId, updates) => {
        const current = readCurrentScene();
        let changed = false;
        const nodes = current.nodes.map((node) => {
          if (node.id !== nodeId) return node;
          if (expectedTaskId !== undefined && studioNodeTaskId(node) !== expectedTaskId) {
            return node;
          }
          changed = true;
          const nextSettings = updates.settings
            ? {
                ...((node.settings as Record<string, unknown>) || {}),
                ...(updates.settings as Record<string, unknown>),
              }
            : node.settings;
          return normalizeStudioNode({
            ...node,
            ...updates,
            ...(updates.settings ? { settings: nextSettings } : {}),
          });
        });
        if (changed) commitScene({ ...current, nodes });
      },
      stop: (nodeId, taskId) => {
        const current = readCurrentScene();
        commitScene({
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === nodeId ? stopStudioNode(node, taskId) : node,
          ),
        });
      },
      focus: (nodeId) => {
        useCanvasStore.getState().selectNode(nodeId);
        focusRef.current?.(nodeId);
      },
      run: async (nodeId, signal) => {
        const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
        validateNativeCommerceInputs(project, nodeId);
        const submitted = await executeStudioNodeGeneration(nodeId, {
          projectId,
          projectTitle: project?.title || '未命名项目',
          commands,
          saveScene,
          requestReview,
        }, signal);
        if (!submitted || !signal) return submitted;
        signal.throwIfAborted();
        const taskId = commands.read().nodes.find((node) => node.id === nodeId)?.beikeLastTaskId;
        return new Promise<boolean>((resolve, reject) => {
          const cleanup = () => {
            unsubscribe();
            signal.removeEventListener('abort', abort);
          };
          const abort = () => {
            cleanup();
            reject(signal.reason);
          };
          const check = () => {
            const node = commands.read().nodes.find((item) => item.id === nodeId);
            const sameTask = Boolean(taskId && node?.beikeLastTaskId === taskId);
            if (sameTask && node?.isGenerating) return;
            cleanup();
            resolve(sameTask && !node?.beikeTaskStopped && !node?.errorMsg);
          };
          const unsubscribe = useCanvasStore.subscribe(check);
          signal.addEventListener('abort', abort, { once: true });
          check();
        });
      },
      runCompiler: (nodeId) =>
        new Promise<boolean>((resolve) => {
          const node = commands.read().nodes.find((item) => item.id === nodeId);
          if (!node || !compilerRef.current) {
            resolve(false);
            return;
          }
          const settings = (node.settings as Record<string, unknown>) || {};
          commands.update(nodeId, studioNodeTaskId(node), {
            beikeCompilerRunning: true,
            errorMsg: '',
          });
          compilerRef.current({
            nodeId,
            commands,
            textModel:
              typeof settings.textNodeChatModel === 'string'
                ? settings.textNodeChatModel
                : undefined,
            finish: resolve,
          });
        }),
      runText: (nodeId, signal) =>
        executeStudioTextNodeAnalysis(projectId, nodeId, commands, saveScene, signal),
    };
    return commands;
  }, [projectId, readCurrentScene, commitScene, saveScene, requestReview]);

  // Hydrate cached local-asset:// references and recover interrupted tasks on mount
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      while (!cancelled) {
        const store = useCanvasStore.getState();
        const project = store.projects.find(item => item.id === projectId);
        if (!project?.studioScene) return;
        const source = project.studioScene;
        const graphNodes = new Map(project.nodes.map(node => [node.id, node]));
        const recovered = recoverLoadedStudioScene(projectId, {
          ...source,
          nodes: source.nodes.map(node => {
            const graph = graphNodes.get(node.id);
            if (!graph?.taskId || node.beikeTaskId || node.beikeLastTaskId || node.beikeCanvasTaskId) return node;
            return { ...node, beikeCanvasTaskId: graph.taskId };
          }),
        });
        const session = await hydrateCanvasScene(projectId, recovered).catch(() => undefined);
        const current = useCanvasStore.getState().projects.find(item => item.id === projectId);
        if (cancelled || current?.studioScene !== source) {
          session?.dispose();
          continue;
        }
        if (session) {
          mediaSession.current = session;
          setCanvasProjectSerializer(projectId, session.serialize);
        }
        store.syncStudioScene(projectId, session?.scene ?? recovered);
        return;
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
      const session = mediaSession.current;
      if (!session) return;
      useCanvasStore.setState(state => ({
        projects: state.projects.map(project => project.id === projectId ? session.serialize(project) : project),
      }));
      setCanvasProjectSerializer(projectId);
      session.dispose();
      mediaSession.current = undefined;
    };
  }, [projectId]);

  useEffect(() => {
    const project = useCanvasStore.getState().projects.find(item => item.id === projectId);
    const legacy = project?.nativeCommerce?.legacyScene;
    if (!project || !legacy || project.nativeCommerce?.legacyRecoveryComplete) return;
    if (!legacy.nodes.some(node => node.isGenerating || (node.settings as Record<string, unknown> | undefined)?.beikeBusinessState === 'running')) return;
    const controller = new AbortController();
    const { signal } = controller;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      const outputs: LegacyCommerceOutput[] = [];
      let pending = false;
      try {
        const batchId = project.workshop?.batchId;
        if (batchId) {
          const response = await apiFetch('/api/catalog/workshop-batches/' + encodeURIComponent(batchId), { signal, cache: 'no-store' });
          if (!response.ok) throw new Error('无法读取原图文批次');
          const data = await response.json();
          for (const item of data.batch?.snapshot?.items ?? []) {
            for (const task of item.tasks ?? []) {
              if (task.resultStatus === 'superseded' || typeof task.id !== 'string') continue;
              let result = task.status === 'SUCCESS' ? task.resultUrl : undefined;
              if (!result && (task.status === 'IN_PROGRESS' || task.recoveryRequired)) {
                const receipt = task.upstreamTaskId
                  ? await pollGenerationTask(task.upstreamTaskId, 'image', task.learningContext?.model, { signal }).catch(() => undefined)
                  : task.idempotencyKey
                    ? await apiFetch('/api/generate/image?taskKey=' + encodeURIComponent(task.idempotencyKey), { signal, cache: 'no-store' })
                        .then(res => res.ok ? res.json() : undefined).catch(() => undefined)
                    : undefined;
                result = receipt?.status === 'SUCCESS' ? receipt.resultUrl : undefined;
                pending ||= !result && !['FAILURE', 'FAILED', 'CANCELED', 'CANCELLED'].includes(receipt?.status);
              }
              if (typeof result === 'string' && result) outputs.push({ id: task.id, title: `${item.title || '商品'} · 图${task.shot_no ?? ''}`, type: 'image', value: result });
            }
            if (typeof item.id === 'string' && typeof item.copywriting?.content === 'string' && item.copywriting.content.trim()) {
              outputs.push({ id: item.id + '-copy', title: item.copywriting.title || '发布文案', type: 'text',
                value: [item.copywriting.title, item.copywriting.content].filter(Boolean).join('\n\n') });
            }
          }
        }
        const plan = (project.sales?.draft as { productionPlan?: Record<string, unknown> } | undefined)?.productionPlan;
        if (plan) for (const [suffix, field, savedField, title, type] of [
          ['raw', 'pendingVideoTask', 'generatedVideoUrl', '生成原片', 'video'],
          ['voice', 'pendingVoiceTask', 'voiceoverAudioUrl', '旁白配音', 'audio'],
          ['final', 'pendingMixTask', 'mixedVideoUrl', '合成成片', 'video'],
        ] as const) {
          let value = plan[savedField];
          const task = plan[field] as { taskId?: string; model?: string; modelSelection?: string } | undefined;
          if (!value && task?.taskId) {
            if (task.taskId.startsWith('sales_media_') || type === 'audio' || suffix === 'final') {
              const response = await apiFetch('/api/sales/media-jobs?id=' + encodeURIComponent(task.taskId), { signal, cache: 'no-store' });
              if (!response.ok) throw new Error('无法查询原电商视频任务');
              const { job } = await response.json();
              value = job?.status === 'completed' ? job.result?.resultUrl || job.result?.videoUrl || job.result?.audioUrl : undefined;
              pending ||= job?.status === 'queued' || job?.status === 'running';
            } else {
              const receipt = await pollGenerationTask(task.taskId, 'video', task.model, { modelSelection: task.modelSelection, signal });
              value = receipt?.status === 'SUCCESS' ? receipt.resultUrl : undefined;
              pending ||= !value && !['FAILURE', 'FAILED', 'CANCELED', 'CANCELLED'].includes(receipt?.status);
            }
          }
          if (typeof value === 'string' && value) outputs.push({ id: 'sales-' + suffix, title, type, value });
        }
      } catch { pending = true; }
      if (signal.aborted) return;
      const store = useCanvasStore.getState();
      const current = store.projects.find(item => item.id === projectId);
      if (!current) return;
      const scene = appendLegacyCommerceOutputs(current, outputs);
      if (scene) commitScene(scene);
      if (pending && Date.now() - started < 360_000) timer = setTimeout(() => void refresh(), 5000);
      if (!pending && (project.workshop?.batchId || outputs.length) && current.nativeCommerce) {
        useCanvasStore.setState(state => ({ projects: state.projects.map(item => item.id === projectId && item.nativeCommerce
          ? { ...item, nativeCommerce: { ...item.nativeCommerce, legacyRecoveryComplete: true } } : item) }));
      }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, commitScene]);

  // Synchronize completed/failed background generationTasks back into StudioScene & CanvasNodes
  useEffect(() => {
    const restoredTaskIds = new Set<string>();
    const current = readCurrentScene();
    for (const node of current.nodes) {
      const id = studioNodeTaskId(node);
      if (id && (node.isGenerating || (node.beikeTaskStopped && node.beikeTaskRecord))) {
        restoredTaskIds.add(id);
      }
    }

    const syncTasks = () => {
      const state = useAppStore.getState();
      if (!state.generationHistoryReady) return;
      const scene = readCurrentScene();
      const waiting = scene.nodes.filter(
        (node) =>
          node.type !== 'gen-speech' &&
          ((node.beikeTaskId && node.isGenerating) ||
            (node.beikeTaskStopped && node.beikeTaskRecord)),
      );
      if (!waiting.length) return;
      const allTasks = [...state.generationTasks, ...state.sessions.flatMap((s) => s.tasks)];
      let mutated = false;
      const nextNodes = scene.nodes.map((node) => {
        if (node.type === 'gen-speech' || !(node.beikeTaskId && node.isGenerating)) return node;
        const taskId = studioNodeTaskId(node);
        const task = allTasks.find((item) => item.id === taskId);
        if (!task && taskId && restoredTaskIds.delete(taskId)) {
          const recovered = recoverStudioTaskRecord(node);
          if (recovered) {
            state.addGenerationTask({ ...recovered, canvasProjectId: projectId }, false);
            return node;
          }
          mutated = true;
          return applyStudioTaskResult(
            node,
            taskId,
            undefined,
            '上次提交准备已中断或任务记录缺失，请检查生成历史后重试',
          );
        }
        if (node.beikeTaskStopped || !task || (!task.resultUrl && !isImageTaskFailed(task.status))) {
          return node;
        }
        mutated = true;
        return applyStudioTaskResult(
          node,
          task.id,
          task.resultUrl,
          task.resultUrl
            ? undefined
            : task.failReason || '生成失败，请在贝壳云图的「生成历史」查看详情。',
        );
      });
      if (mutated) {
        commitScene({ ...scene, nodes: nextNodes });
      }
    };

    syncTasks();
    return useAppStore.subscribe((state, prev) => {
      if (
        state.generationTasks !== prev.generationTasks ||
        state.sessions !== prev.sessions ||
        state.generationHistoryReady !== prev.generationHistoryReady
      ) {
        syncTasks();
      }
    });
  }, [projectId, readCurrentScene, commitScene]);

  return {
    taskCommands,
    saveScene,
    review,
  };
}
