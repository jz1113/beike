'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import { normalizeImageUrlToStandardJpg, formatDisplayModel } from '@/lib/drawing';
import { isVideoMediaUrl } from '@/lib/mediaHelper';
import { getGatewayClientHeaders, getGatewayClientOverrides } from '@/lib/gatewayClient';
import { recordModelUsage } from '@/lib/usageTracker';
import { logLatencyAudit } from '@/lib/latencyAudit';
import { apiFetch } from '@/lib/apiClient';
import { formatUserError } from '@/lib/upstreamErrors';

const SLOW_POLL_HINT = '生成较慢，后台继续等待…';

function isVideoTask(t: GenerationTask): boolean {
  const m = t.model?.toLowerCase() || '';
  return (
    t.mediaType === 'video' ||
    Boolean(t.resultUrl?.includes('.mp4')) ||
    m.includes('seedance') ||
    m.includes('veo') ||
    m.includes('kling') ||
    m.includes('sora') ||
    m.includes('gen3') ||
    m.includes('minimax') ||
    m.includes('h3') ||
    m.includes('hailuo') ||
    m.includes('wan') ||
    m.includes('vidu') ||
    m.includes('luma') ||
    m.includes('hunyuan')
  );
}

function getMaxPollCount(t: GenerationTask): number {
  if (isVideoTask(t)) return 300;
  const q = (t.quality || '').toLowerCase();
  const size = (t.size || '').toLowerCase();
  const model = (t.model || '').toLowerCase();
  const is4K =
    q === 'high' ||
    model.includes('4k') ||
    /4k|2448|3264|4096|3840|2160/.test(size);
  if (is4K) return 450;
  if (q === 'medium' || /2k|1632|2048/.test(size)) return 300;
  return 180;
}

function getGatewayBaseUrl(): string | undefined {
  return getGatewayClientOverrides().customBaseUrl;
}

type TaskUpdater = (id: string, updates: Partial<GenerationTask>) => void;

async function pollTasksOnce(
  tasks: GenerationTask[],
  update: TaskUpdater,
  pollCounts: Record<string, number>,
  slowPollIds: Set<string>,
  options?: { skipTimeout?: boolean; skipCountIncrement?: boolean; location?: string }
) {
  const localUrl = getGatewayBaseUrl();
  const gatewayHeaders = getGatewayClientHeaders();

  for (const t of tasks) {
    const video = isVideoTask(t);
    const maxCount = getMaxPollCount(t);
    let count = pollCounts[t.id] || 0;

    if (!options?.skipCountIncrement) {
      count += 1;
      pollCounts[t.id] = count;
    }

    if (!options?.skipTimeout && count > maxCount) {
      slowPollIds.add(t.id);
      update(t.id, {
        status: 'IN_PROGRESS',
        progress: '97%',
        failReason: SLOW_POLL_HINT,
      });
      continue;
    }

    if (options?.skipTimeout) {
      update(t.id, { progress: '97%', failReason: SLOW_POLL_HINT });
    } else {
      const dynamicProgress = Math.min(97, Math.floor(15 + (count / maxCount) * 82));
      update(t.id, { progress: `${dynamicProgress}%`, failReason: undefined });
    }

    try {
      const pollEndpoint = video ? '/api/generate/video' : '/api/generate/image';
      const queryParams = new URLSearchParams({ taskId: t.taskId! });

      const res = await apiFetch(`${pollEndpoint}?${queryParams.toString()}`, {
        headers: {
          ...gatewayHeaders,
          ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
        },
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if ((data?.status === 'SUCCESS' || Boolean(data?.resultUrl)) && data?.resultUrl) {
          slowPollIds.delete(t.id);
          delete pollCounts[t.id];
          update(t.id, {
            status: 'SUCCESS',
            resultUrl: data.resultUrl,
            progress: '100%',
            failReason: undefined,
          });
        } else if (data?.status === 'FAILURE') {
          slowPollIds.delete(t.id);
          delete pollCounts[t.id];
          update(t.id, {
            status: 'FAILURE',
            failReason: data.failReason || '模型渲染失败',
          });
        }
      }
    } catch (e) {
      console.warn(`[generationEngine] 轮询任务 ${t.id} 失败 (${options?.location || 'poll'}):`, e);
    }
  }
}

function getOngoingHubTasks(): GenerationTask[] {
  return useAppStore
    .getState()
    .hubGenerations.filter((t) => t.status === 'IN_PROGRESS' && t.taskId && !t.resultUrl);
}

function getOngoingWorkshopTasks(): GenerationTask[] {
  return useAppStore
    .getState()
    .generationTasks.filter((t) => t.status === 'IN_PROGRESS' && t.taskId && !t.resultUrl);
}

async function probeFailedTasks(
  tasks: GenerationTask[],
  update: TaskUpdater,
  recoveredOnce: Set<string>,
  slowPollIds: Set<string>
) {
  const localUrl = getGatewayBaseUrl();
  const gatewayHeaders = getGatewayClientHeaders();

  for (const t of tasks) {
    if (recoveredOnce.has(t.id)) continue;
    try {
      const video = isVideoTask(t);
      const pollEndpoint = video ? '/api/generate/video' : '/api/generate/image';
      const queryParams = new URLSearchParams({ taskId: t.taskId! });

      const res = await apiFetch(`${pollEndpoint}?${queryParams.toString()}`, {
        headers: {
          ...gatewayHeaders,
          ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
        },
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if ((data?.status === 'SUCCESS' || Boolean(data?.resultUrl)) && data?.resultUrl) {
          recoveredOnce.add(t.id);
          slowPollIds.delete(t.id);
          update(t.id, {
            status: 'SUCCESS',
            resultUrl: data.resultUrl,
            progress: '100%',
            failReason: undefined,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * 全局生图/视频任务引擎：与视图解耦，挂在 page 级即可在切页后继续提交与轮询。
 */
export function useGenerationEngine() {
  const hubGenerations = useAppStore((s) => s.hubGenerations);
  const generationTasks = useAppStore((s) => s.generationTasks);
  const updateHubGeneration = useAppStore((s) => s.updateHubGeneration);
  const updateGenerationTask = useAppStore((s) => s.updateGenerationTask);
  const syncDatabaseTasks = useAppStore((s) => s.syncDatabaseTasks);

  const submittingTaskIdsRef = useRef<Set<string>>(new Set());
  const pollCountsRef = useRef<Record<string, number>>({});
  const workshopPollCountsRef = useRef<Record<string, number>>({});
  const hubSlowPollIdsRef = useRef<Set<string>>(new Set());
  const workshopSlowPollIdsRef = useRef<Set<string>>(new Set());
  const recoveredOnceRef = useRef<Set<string>>(new Set());
  const workshopRecoveredOnceRef = useRef<Set<string>>(new Set());
  const prevHubTaskStateRef = useRef<Map<string, { status: string; failReason?: string }>>(new Map());
  const prevWorkshopTaskStateRef = useRef<Map<string, { status: string; failReason?: string }>>(new Map());

  const taskList = useMemo(() => {
    const map = new Map<string, GenerationTask>();
    hubGenerations.forEach((t) => {
      if (t && (t.id || t.taskId)) {
        const key = t.id || t.taskId!;
        if (!map.has(key)) map.set(key, t);
      }
    });
    return Array.from(map.values());
  }, [hubGenerations]);

  const unsubmittedTasksKey = useMemo(
    () =>
      taskList
        .filter((t) => (t.status === 'IN_PROGRESS' || t.status === 'IDLE' || !t.status) && !t.taskId && !t.resultUrl)
        .map((t) => t.id)
        .join(','),
    [taskList]
  );

  const ongoingTasksKey = useMemo(
    () =>
      taskList
        .filter((t) => t.status === 'IN_PROGRESS' && t.taskId && !t.resultUrl)
        .map((t) => t.id)
        .join(','),
    [taskList]
  );

  const workshopOngoingTasksKey = useMemo(
    () =>
      generationTasks
        .filter((t) => t.status === 'IN_PROGRESS' && t.taskId && !t.resultUrl)
        .map((t) => t.id)
        .join(','),
    [generationTasks]
  );

  const hubSlowPollTasksKey = useMemo(
    () =>
      hubGenerations
        .filter(
          (t) =>
            t.status === 'IN_PROGRESS' &&
            t.taskId &&
            !t.resultUrl &&
            (hubSlowPollIdsRef.current.has(t.id) || t.failReason === SLOW_POLL_HINT)
        )
        .map((t) => t.id)
        .join(','),
    [hubGenerations]
  );

  const workshopSlowPollTasksKey = useMemo(
    () =>
      generationTasks
        .filter(
          (t) =>
            t.status === 'IN_PROGRESS' &&
            t.taskId &&
            !t.resultUrl &&
            (workshopSlowPollIdsRef.current.has(t.id) || t.failReason === SLOW_POLL_HINT)
        )
        .map((t) => t.id)
        .join(','),
    [generationTasks]
  );

  const hubTimeoutFailureKey = useMemo(
    () =>
      hubGenerations
        .filter(
          (t) =>
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            (t.failReason || '').includes('渲染超时')
        )
        .map((t) => t.id)
        .join(','),
    [hubGenerations]
  );

  const hubOtherFailureKey = useMemo(
    () =>
      hubGenerations
        .filter(
          (t) =>
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            !(t.failReason || '').includes('渲染超时')
        )
        .map((t) => t.id)
        .join(','),
    [hubGenerations]
  );

  const workshopTimeoutFailureKey = useMemo(
    () =>
      generationTasks
        .filter(
          (t) =>
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            (t.failReason || '').includes('渲染超时')
        )
        .map((t) => t.id)
        .join(','),
    [generationTasks]
  );

  const workshopOtherFailureKey = useMemo(
    () =>
      generationTasks
        .filter(
          (t) =>
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            !(t.failReason || '').includes('渲染超时')
        )
        .map((t) => t.id)
        .join(','),
    [generationTasks]
  );

  // 重试时重置 poll 计数（FAILURE → IN_PROGRESS 且 failReason 已清空）
  useEffect(() => {
    hubGenerations.forEach((t) => {
      const prev = prevHubTaskStateRef.current.get(t.id);
      if (prev?.status === 'FAILURE' && t.status === 'IN_PROGRESS' && !t.failReason) {
        delete pollCountsRef.current[t.id];
        hubSlowPollIdsRef.current.delete(t.id);
        recoveredOnceRef.current.delete(t.id);
      }
      prevHubTaskStateRef.current.set(t.id, { status: t.status, failReason: t.failReason });
    });
  }, [hubGenerations]);

  useEffect(() => {
    generationTasks.forEach((t) => {
      const prev = prevWorkshopTaskStateRef.current.get(t.id);
      if (prev?.status === 'FAILURE' && t.status === 'IN_PROGRESS' && !t.failReason) {
        delete workshopPollCountsRef.current[t.id];
        workshopSlowPollIdsRef.current.delete(t.id);
        workshopRecoveredOnceRef.current.delete(t.id);
      }
      prevWorkshopTaskStateRef.current.set(t.id, { status: t.status, failReason: t.failReason });
    });
  }, [generationTasks]);

  // 启动时从 DB 同步历史任务（全局一次）
  useEffect(() => {
    const ac = new AbortController();
    const loadAndSyncDbTasks = async () => {
      try {
        const res = await apiFetch('/api/assets/tasks', { signal: ac.signal }).catch(() => null);
        if (res && res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.success && Array.isArray(data.tasks)) {
            const formatted: GenerationTask[] = data.tasks.map((t: any) => {
              const video = t.mediaType === 'video' || t.resultUrl?.includes('.mp4') || isVideoTask({
                ...t,
                useReferenceImage: false,
                progress: '',
                title: '',
                prompt: t.prompt || '',
                model: t.model || '',
                size: '',
                quality: '',
                status: 'SUCCESS',
                id: t.id,
              } as GenerationTask);
              return {
                id: t.id,
                taskId: t.taskId,
                title: t.prompt?.slice(0, 25) || (video ? 'AI 视频创作' : 'AI 生图'),
                prompt: t.prompt,
                model: t.model,
                mediaType: video ? 'video' : 'image',
                size: t.size || (video ? '16:9' : '3:4'),
                quality: t.quality || (video ? '720P' : 'high'),
                status: t.status || 'SUCCESS',
                resultUrl: t.resultUrl,
                failReason: t.failReason,
                progress: t.status === 'SUCCESS' ? '100%' : t.status === 'FAILURE' ? '0%' : '65%',
                createdAt: new Date(t.createdAt).getTime(),
                useReferenceImage: false,
              };
            });
            syncDatabaseTasks(formatted);
          }
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        console.warn('[generationEngine] 同步数据库任务失败:', err);
      }
    };
    loadAndSyncDbTasks();
    return () => ac.abort();
  }, [syncDatabaseTasks]);

  // 提交未发送的任务
  useEffect(() => {
    const unsubmittedTasks = taskList.filter(
      (t) => (t.status === 'IN_PROGRESS' || t.status === 'IDLE' || !t.status) && !t.taskId && !t.resultUrl
    );

    unsubmittedTasks.forEach(async (t) => {
      if (submittingTaskIdsRef.current.has(t.id)) return;
      submittingTaskIdsRef.current.add(t.id);

      try {
        const localUrl = getGatewayBaseUrl();
        const gatewayHeaders = getGatewayClientHeaders();
        const video = isVideoTask(t);
        const clientT0 = Date.now();
        const refCount = Array.isArray(t.referenceImages)
          ? t.referenceImages.length
          : Array.isArray((t as any).images)
            ? (t as any).images.length
            : t.referenceImageUrl
              ? 1
              : 0;

        let res: Response;
        try {
          if (video) {
            const rawRefs: string[] =
              Array.isArray(t.referenceImages) && t.referenceImages.length > 0
                ? t.referenceImages.filter(Boolean)
                : t.referenceImageUrl
                  ? [t.referenceImageUrl]
                  : [];

            const videoRefs = rawRefs.filter((u) => isVideoMediaUrl(u));
            const imageRefs = rawRefs
              .filter((u) => !isVideoMediaUrl(u))
              .map((img) => normalizeImageUrlToStandardJpg(img))
              .filter(Boolean) as string[];

            res = await apiFetch('/api/generate/video', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...gatewayHeaders,
              },
              body: JSON.stringify({
                prompt: t.prompt,
                model: t.model || 'doubao-seedance-2.5',
                duration: t.videoDuration || 5,
                aspect_ratio: t.size || '16:9',
                resolution: t.videoResolution || '720P',
                ref_mode: t.videoRefMode || 'omni',
                images: imageRefs,
                videos: videoRefs,
                first_frame_image: imageRefs[0] || undefined,
                last_frame_image: imageRefs.length >= 2 ? imageRefs[imageRefs.length - 1] : undefined,
                camera_motion: (t as any).cameraMotion,
                audio: (t as any).generateAudio,
                watermark: false,
                customBaseUrl: localUrl,
              }),
            });
          } else {
            const leanOne = async (u?: string) => {
              if (!u || typeof u !== 'string') return undefined;
              const n = normalizeImageUrlToStandardJpg(u) || u;
              if (n.startsWith('data:image/') && n.length > 100_000) {
                try {
                  const { compressImageToDataUrl } = await import('@/lib/image-utils');
                  const lean = await compressImageToDataUrl(n, 1280, 0.78);
                  return lean?.length && lean.length < n.length ? lean : n;
                } catch {
                  return n;
                }
              }
              return n;
            };
            const refUrl = await leanOne(t.referenceImageUrl);
            let imgList: string[] | undefined = Array.isArray(t.images)
              ? t.images
              : Array.isArray(t.referenceImages)
                ? t.referenceImages
                : undefined;
            if (imgList?.length) {
              imgList = (await Promise.all(imgList.map((x) => leanOne(x)))).filter(Boolean) as string[];
            }
            const imgBody: Record<string, unknown> = {
                prompt: t.prompt,
                model: t.model || 'gpt-image-2',
                size: t.size || '2448x3264',
                quality: t.quality || 'medium',
                productImageUrl: refUrl,
                referenceImageUrl: refUrl,
                useReferenceImage: t.useReferenceImage,
                productTitle: t.title,
                source: 'hub',
                customBaseUrl: localUrl,
            };
            if (!refUrl && imgList?.length) {
              imgBody.images = imgList;
              imgBody.referenceImages = imgList;
            }
            const imgBodyStr = JSON.stringify(imgBody);
            if (imgBodyStr.length > 8_500_000) {
              throw new Error('参考图体积过大，请压缩后重试');
            }
            res = await apiFetch('/api/generate/image', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...gatewayHeaders,
              },
              body: imgBodyStr,
            });
          }
        } catch (networkErr: any) {
          console.warn(`[generationEngine] 网络连接异常:`, networkErr?.message);
          logLatencyAudit({
            hypothesisId: 'H4',
            location: 'useGenerationEngine.ts:submit-network',
            message: 'client submit network error',
            data: {
              taskLocalId: t.id,
              video,
              model: t.model,
              refCount,
              clientMs: Date.now() - clientT0,
              error: String(networkErr?.message || networkErr),
            },
          });
          updateHubGeneration(t.id, {
            status: 'FAILURE',
            failReason: formatUserError(networkErr, '网络连接异常，请检查网络后重试'),
          });
          return;
        }

        const clientSubmitMs = Date.now() - clientT0;
        const data = await res.json().catch(() => null);
        logLatencyAudit({
          hypothesisId: 'H4',
          location: 'useGenerationEngine.ts:submit-done',
          message: 'client submit roundtrip',
          data: {
            taskLocalId: t.id,
            video,
            model: t.model,
            refCount,
            clientSubmitMs,
            httpStatus: res.status,
            ok: Boolean(data?.success),
            serverTiming: data?.timing || null,
            anomaly: clientSubmitMs > 45000,
          },
        });
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `生成任务提交失败 (HTTP ${res.status})`);
        }

        (pollCountsRef.current as any)[`_start_${t.id}`] = Date.now();

        const resolvedModelId = data.model || t.model || (video ? 'doubao-seedance-2.5' : 'gpt-image-2');

        recordModelUsage({
          modelId: resolvedModelId,
          modelName: formatDisplayModel(resolvedModelId, video),
          provider: video
            ? resolvedModelId.toLowerCase().includes('minimax')
              ? 'MiniMax'
              : '字节火山'
            : resolvedModelId.includes('gpt')
              ? 'OpenAI'
              : '字节火山',
          type: video ? 'video' : 'image',
          mediaCount: 1,
          success: true,
        });

        if (data.resultUrl) {
          updateHubGeneration(t.id, {
            status: 'SUCCESS',
            progress: '100%',
            resultUrl: data.resultUrl,
            taskId: data.taskId,
            ...(data.model ? { model: data.model } : {}),
            ...(data.recordId ? { dbId: data.recordId } : {}),
          });
        } else if (data.taskId) {
          delete pollCountsRef.current[t.id];
          hubSlowPollIdsRef.current.delete(t.id);
          updateHubGeneration(t.id, {
            status: 'IN_PROGRESS',
            progress: '25%',
            taskId: data.taskId,
            ...(data.model ? { model: data.model } : {}),
            ...(data.recordId ? { dbId: data.recordId } : {}),
          });
        } else {
          updateHubGeneration(t.id, {
            status: 'FAILURE',
            failReason: '接口未返回任务 ID 或结果',
          });
        }
      } catch (err: any) {
        console.warn(`[generationEngine] 任务 ${t.id} 失败:`, err?.message);
        updateHubGeneration(t.id, {
          status: 'FAILURE',
          failReason: formatUserError(err, '网络连接异常或模型接口错误'),
        });
      } finally {
        submittingTaskIdsRef.current.delete(t.id);
      }
    });
  }, [unsubmittedTasksKey, taskList, updateHubGeneration]);

  // 轮询进行中 Hub 任务（仅依赖 ongoingTasksKey，progress 更新不重建 interval）
  useEffect(() => {
    if (!ongoingTasksKey) return;

    const pollRound = async () => {
      const tasks = getOngoingHubTasks().filter((t) => !hubSlowPollIdsRef.current.has(t.id));
      if (tasks.length === 0) return;
      await pollTasksOnce(tasks, updateHubGeneration, pollCountsRef.current, hubSlowPollIdsRef.current, {
        location: 'hub',
      });
    };

    pollRound();
    const interval = setInterval(pollRound, 2000);
    return () => clearInterval(interval);
  }, [ongoingTasksKey, updateHubGeneration]);

  // Hub 软超时任务：5s 后台继续轮询
  useEffect(() => {
    if (!hubSlowPollTasksKey) return;

    const pollSlow = async () => {
      const tasks = getOngoingHubTasks().filter(
        (t) => hubSlowPollIdsRef.current.has(t.id) || t.failReason === SLOW_POLL_HINT
      );
      tasks.forEach((t) => hubSlowPollIdsRef.current.add(t.id));
      if (tasks.length === 0) return;
      await pollTasksOnce(tasks, updateHubGeneration, pollCountsRef.current, hubSlowPollIdsRef.current, {
        skipTimeout: true,
        skipCountIncrement: true,
        location: 'hub-slow',
      });
    };

    pollSlow();
    const interval = setInterval(pollSlow, 5000);
    return () => clearInterval(interval);
  }, [hubSlowPollTasksKey, updateHubGeneration]);

  // 轮询进行中 Workshop 分镜任务
  useEffect(() => {
    if (!workshopOngoingTasksKey) return;

    const pollRound = async () => {
      const tasks = getOngoingWorkshopTasks().filter((t) => !workshopSlowPollIdsRef.current.has(t.id));
      if (tasks.length === 0) return;
      await pollTasksOnce(tasks, updateGenerationTask, workshopPollCountsRef.current, workshopSlowPollIdsRef.current, {
        location: 'workshop',
      });
    };

    pollRound();
    const interval = setInterval(pollRound, 2000);
    return () => clearInterval(interval);
  }, [workshopOngoingTasksKey, updateGenerationTask]);

  // Workshop 软超时任务：5s 后台继续轮询
  useEffect(() => {
    if (!workshopSlowPollTasksKey) return;

    const pollSlow = async () => {
      const tasks = getOngoingWorkshopTasks().filter(
        (t) => workshopSlowPollIdsRef.current.has(t.id) || t.failReason === SLOW_POLL_HINT
      );
      tasks.forEach((t) => workshopSlowPollIdsRef.current.add(t.id));
      if (tasks.length === 0) return;
      await pollTasksOnce(tasks, updateGenerationTask, workshopPollCountsRef.current, workshopSlowPollIdsRef.current, {
        skipTimeout: true,
        skipCountIncrement: true,
        location: 'workshop-slow',
      });
    };

    pollSlow();
    const interval = setInterval(pollSlow, 5000);
    return () => clearInterval(interval);
  }, [workshopSlowPollTasksKey, updateGenerationTask]);

  // 清理无法恢复的 Workshop 脏状态（无 taskId 且超时）
  useEffect(() => {
    const staleThreshold = 3 * 60 * 1000;
    const now = Date.now();

    generationTasks.forEach((t) => {
      if (t.status === 'IN_PROGRESS' && !t.taskId && !t.resultUrl) {
        const age = t.createdAt ? now - t.createdAt : 0;
        if (age > staleThreshold) {
          updateGenerationTask(t.id, {
            status: 'FAILURE',
            failReason: '渲染状态丢失，请点击重试',
            progress: '0%',
          });
        }
      }
    });
  }, [generationTasks, updateGenerationTask]);

  // 新出现的 Workshop 进行中任务立即探测一次
  useEffect(() => {
    const recoverable = getOngoingWorkshopTasks();
    if (recoverable.length === 0) return;

    pollTasksOnce(recoverable, updateGenerationTask, workshopPollCountsRef.current, workshopSlowPollIdsRef.current, {
      skipTimeout: true,
      skipCountIncrement: true,
      location: 'workshop-recover',
    });
  }, [workshopOngoingTasksKey, updateGenerationTask]);

  // 加速 recovery：「渲染超时」失败任务每 5s 探测
  useEffect(() => {
    if (!hubTimeoutFailureKey) return;

    const probe = async () => {
      const timeoutTasks = useAppStore.getState().hubGenerations.filter(
        (t) =>
          t.status === 'FAILURE' &&
          t.taskId &&
          (!t.resultUrl || t.resultUrl.trim() === '') &&
          (t.failReason || '').includes('渲染超时')
      );
      if (timeoutTasks.length === 0) return;
      await probeFailedTasks(timeoutTasks, updateHubGeneration, recoveredOnceRef.current, hubSlowPollIdsRef.current);
    };

    probe();
    const id = setInterval(probe, 5000);
    return () => clearInterval(id);
  }, [hubTimeoutFailureKey, updateHubGeneration]);

  // 其他 Hub 失败任务每 30s 探测
  useEffect(() => {
    if (!hubOtherFailureKey) return;

    const probe = async () => {
      const failedTasks = useAppStore.getState().hubGenerations.filter(
        (t) =>
          t.status === 'FAILURE' &&
          t.taskId &&
          (!t.resultUrl || t.resultUrl.trim() === '') &&
          !(t.failReason || '').includes('渲染超时')
      );
      if (failedTasks.length === 0) return;
      await probeFailedTasks(failedTasks, updateHubGeneration, recoveredOnceRef.current, hubSlowPollIdsRef.current);
    };

    probe();
    const id = setInterval(probe, 30000);
    return () => clearInterval(id);
  }, [hubOtherFailureKey, updateHubGeneration]);

  // Workshop「渲染超时」失败任务每 5s recovery
  useEffect(() => {
    if (!workshopTimeoutFailureKey) return;

    const probe = async () => {
      const timeoutTasks = useAppStore.getState().generationTasks.filter(
        (t) =>
          t.status === 'FAILURE' &&
          t.taskId &&
          (!t.resultUrl || t.resultUrl.trim() === '') &&
          (t.failReason || '').includes('渲染超时')
      );
      if (timeoutTasks.length === 0) return;
      await probeFailedTasks(
        timeoutTasks,
        updateGenerationTask,
        workshopRecoveredOnceRef.current,
        workshopSlowPollIdsRef.current
      );
    };

    probe();
    const id = setInterval(probe, 5000);
    return () => clearInterval(id);
  }, [workshopTimeoutFailureKey, updateGenerationTask]);

  // Workshop 其他失败任务每 30s recovery
  useEffect(() => {
    if (!workshopOtherFailureKey) return;

    const probe = async () => {
      const failedTasks = useAppStore.getState().generationTasks.filter(
        (t) =>
          t.status === 'FAILURE' &&
          t.taskId &&
          (!t.resultUrl || t.resultUrl.trim() === '') &&
          !(t.failReason || '').includes('渲染超时')
      );
      if (failedTasks.length === 0) return;
      await probeFailedTasks(
        failedTasks,
        updateGenerationTask,
        workshopRecoveredOnceRef.current,
        workshopSlowPollIdsRef.current
      );
    };

    probe();
    const id = setInterval(probe, 30000);
    return () => clearInterval(id);
  }, [workshopOtherFailureKey, updateGenerationTask]);
}
