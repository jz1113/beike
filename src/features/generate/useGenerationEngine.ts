'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import { normalizeImageUrlToStandardJpg, formatDisplayModel } from '@/lib/drawing';
import { isVideoMediaUrl } from '@/lib/mediaHelper';
import { getClientStorageHeaders } from '@/lib/storageClient';
import { recordModelUsage } from '@/lib/usageTracker';
import { logLatencyAudit } from '@/lib/latencyAudit';
import { apiFetch } from '@/lib/apiClient';

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

function getAiCreds() {
  if (typeof window === 'undefined') return { url: undefined as string | undefined, key: undefined as string | undefined };
  return {
    url: localStorage.getItem('ai_base_url') || undefined,
    key: localStorage.getItem('ai_api_key') || undefined,
  };
}

/**
 * 全局生图/视频任务引擎：与视图解耦，挂在 page 级即可在切页后继续提交与轮询。
 */
export function useGenerationEngine() {
  const hubGenerations = useAppStore((s) => s.hubGenerations);
  const updateHubGeneration = useAppStore((s) => s.updateHubGeneration);
  const syncDatabaseTasks = useAppStore((s) => s.syncDatabaseTasks);

  const submittingTaskIdsRef = useRef<Set<string>>(new Set());
  const pollCountsRef = useRef<Record<string, number>>({});
  const recoveredOnceRef = useRef<Set<string>>(new Set());

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
        const { url: localUrl, key: localKey } = getAiCreds();
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
                ...getClientStorageHeaders(),
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
                customApiKey: localKey,
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
                customApiKey: localKey,
            };
            // 已有单槽 URL 时不再重复塞整表 images
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
                ...getClientStorageHeaders(),
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
            failReason: networkErr?.message || '网络连接异常，请检查网络后重试',
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
          failReason: err?.message || '网络连接异常或模型接口错误',
        });
      } finally {
        submittingTaskIdsRef.current.delete(t.id);
      }
    });
  }, [unsubmittedTasksKey, taskList, updateHubGeneration]);

  // 轮询进行中任务
  useEffect(() => {
    const ongoingTasks = taskList.filter((t) => t.status === 'IN_PROGRESS' && t.taskId && !t.resultUrl);
    if (ongoingTasks.length === 0) return;

    const interval = setInterval(async () => {
      const { url: localUrl, key: localKey } = getAiCreds();

      for (const t of ongoingTasks) {
        const video = isVideoTask(t);
        const maxCount = video ? 300 : 180;
        const count = (pollCountsRef.current[t.id] || 0) + 1;
        pollCountsRef.current[t.id] = count;

        if (count > maxCount) {
          updateHubGeneration(t.id, {
            status: 'FAILURE',
            failReason: '渲染超时，请点击下方重试',
          });
          continue;
        }

        const dynamicProgress = Math.min(97, Math.floor(15 + (count / maxCount) * 82));
        updateHubGeneration(t.id, { progress: `${dynamicProgress}%` });

        try {
          const pollEndpoint = video ? '/api/generate/video' : '/api/generate/image';
          const queryParams = new URLSearchParams({ taskId: t.taskId! });

          const res = await apiFetch(`${pollEndpoint}?${queryParams.toString()}`, {
            headers: {
              ...getClientStorageHeaders(),
              ...(localKey ? { 'x-custom-api-key': localKey } : {}),
              ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
            },
          }).catch(() => null);

          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if ((data?.status === 'SUCCESS' || Boolean(data?.resultUrl)) && data?.resultUrl) {
              const startedAt = (pollCountsRef.current as any)[`_start_${t.id}`] as number | undefined;
              const e2eMs = startedAt ? Date.now() - startedAt : undefined;
              logLatencyAudit({
                hypothesisId: 'H5',
                location: 'useGenerationEngine.ts:poll-success',
                message: 'generation completed',
                data: {
                  taskLocalId: t.id,
                  taskId: t.taskId,
                  video,
                  model: t.model,
                  pollCount: count,
                  e2eMs,
                  e2eSec: e2eMs ? Math.round(e2eMs / 1000) : null,
                  anomaly: (e2eMs || 0) > 180000 || count > 90,
                },
              });
              delete pollCountsRef.current[t.id];
              delete (pollCountsRef.current as any)[`_start_${t.id}`];
              updateHubGeneration(t.id, {
                status: 'SUCCESS',
                resultUrl: data.resultUrl,
                progress: '100%',
                failReason: undefined,
              });
            } else if (data?.status === 'FAILURE') {
              delete pollCountsRef.current[t.id];
              updateHubGeneration(t.id, {
                status: 'FAILURE',
                failReason: data.failReason || '模型渲染失败',
              });
            }
          }
        } catch (e) {
          console.warn(`[generationEngine] 轮询任务 ${t.id} 失败:`, e);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [ongoingTasksKey, taskList, updateHubGeneration]);

  // 周期性探测「超时失败但可能已就绪」的任务（不只在 mount）
  useEffect(() => {
    const probe = async () => {
      const timeoutTasks = taskList.filter(
        (t) => t.status === 'FAILURE' && t.taskId && (!t.resultUrl || t.resultUrl.trim() === '')
      );
      if (timeoutTasks.length === 0) return;

      const { url: localUrl, key: localKey } = getAiCreds();

      for (const t of timeoutTasks) {
        if (recoveredOnceRef.current.has(t.id)) continue;
        try {
          const video = isVideoTask(t);
          const pollEndpoint = video ? '/api/generate/video' : '/api/generate/image';
          const queryParams = new URLSearchParams({ taskId: t.taskId! });

          const res = await apiFetch(`${pollEndpoint}?${queryParams.toString()}`, {
            headers: {
              ...getClientStorageHeaders(),
              ...(localKey ? { 'x-custom-api-key': localKey } : {}),
              ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
            },
          }).catch(() => null);

          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if ((data?.status === 'SUCCESS' || Boolean(data?.resultUrl)) && data?.resultUrl) {
              recoveredOnceRef.current.add(t.id);
              updateHubGeneration(t.id, {
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
    };

    probe();
    const id = setInterval(probe, 30000);
    return () => clearInterval(id);
  }, [taskList, updateHubGeneration]);
}
