import { useEffect, useState } from 'react';
import { apiFetch, storageConfigHeaders } from '@client/shared/api/apiClient';
import { recordModelUsage } from '@client/shared/utils/usageTracker';
import { DEPTH_MODEL_SETUP_COMMAND, type DepthQuality, type DepthVideoStyle } from '@shared/domain/media/depthVideo';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { getDerived, putDerived } from '@client/shared/media/idbMediaCache';
import { resolveRefMediaFile } from '@client/shared/media/refMediaRegistry';
import { throwIfGenerationAborted } from '@client/shared/api/generation/generationAbort';
import { generationRecoveryError, SUBMISSION_RECOVERY_HINT } from '@client/shared/api/generation/generationRecovery';
import {
  type DepthSubmitPayload,
  depthSubmitMap,
} from '@client/shared/api/generation/depthSubmitRegistry';

export type { DepthSubmitPayload };

const depthSubmitRegistry = depthSubmitMap();

export function registerDepthSubmit(taskId: string, payload: DepthSubmitPayload): void {
  depthSubmitRegistry.set(taskId, payload);

  // 同步持久化至 IndexedDB，确保浏览器刷新、切换会话或立即重试后 100% 恢复 File 与参数
  try {
    const metaJson = JSON.stringify({
      fileName: payload.file.name,
      style: payload.style,
      quality: payload.quality,
      mode: payload.mode,
    });
    void putDerived(`depth_meta:${taskId}`, new Blob([metaJson], { type: 'application/json' }));

    // 确保以标准 Blob 格式持久化，避免 WKWebView/Safari 的 File DataCloneError
    const fileObj = payload.file as any;
    const blobPayload = fileObj instanceof Blob 
      ? fileObj 
      : new Blob([fileObj], { type: fileObj?.type || (payload.mode === 'depth-video' ? 'video/mp4' : 'image/jpeg') });
    void putDerived(`depth_file:${taskId}`, blobPayload, fileObj?.type || 'application/octet-stream');
  } catch {
    /* ignore IDB storage quota errors */
  }
}

/** 复制已有任务的深度载荷到新任务（如再次生成、分支重试） */
export function cloneDepthSubmit(fromTaskId: string, toTaskId: string): boolean {
  const existing = depthSubmitRegistry.get(fromTaskId);
  if (existing) {
    registerDepthSubmit(toTaskId, existing);
    return true;
  }
  return false;
}

/** 非破坏性读取，允许多次 peek（提交 effect 重跑时不会丢 File） */
export function peekDepthSubmit(taskId: string): DepthSubmitPayload | undefined {
  return depthSubmitRegistry.get(taskId);
}

export function consumeDepthSubmit(taskId: string): DepthSubmitPayload | undefined {
  const payload = depthSubmitRegistry.get(taskId);
  if (payload) depthSubmitRegistry.delete(taskId);
  return payload;
}

export function clearDepthSubmit(taskId: string): void {
  depthSubmitRegistry.delete(taskId);
}

/**
 * Recover only this task's payload or its exact reference URL.
 * 1. 内存注册表 (depthSubmitRegistry 按 taskId)
 * 2. IndexedDB 离线持久化存储 (按 taskId 恢复 File 对象)
 * 3. 参考素材 URL 映射恢复 (resolveRefMediaFile)
 * 4. 参考素材 URL / Blob 重建 fetch
 */
export async function resolveDepthSubmit(
  taskId: string,
  fallbackUrl?: string,
  fallbackOpts?: Partial<DepthSubmitPayload>,
  signal?: AbortSignal,
): Promise<DepthSubmitPayload | undefined> {
  const assertActive = () => throwIfGenerationAborted(() => Boolean(signal?.aborted));
  assertActive();

  // 1. 内存命中
  const inMemory = depthSubmitRegistry.get(taskId);
  if (inMemory) return inMemory;

  // 2. 从 IndexedDB 离线持久化恢复 (抗刷新、抗关闭重启)
  try {
    const [metaBlob, fileBlob] = await Promise.all([
      getDerived(`depth_meta:${taskId}`).catch(() => null),
      getDerived(`depth_file:${taskId}`).catch(() => null),
    ]);
    assertActive();
    if (fileBlob) {
      let meta: {
        fileName?: string;
        style?: DepthVideoStyle;
        quality?: DepthQuality;
        mode?: 'depth-image' | 'depth-video';
      } = {};
      if (metaBlob) {
        try {
          meta = JSON.parse(await metaBlob.text());
        } catch {
          /* ignore json parse */
        }
      }
      const isImg = (meta.mode || fallbackOpts?.mode) === 'depth-image';
      const fileName = meta.fileName || (isImg ? 'image.jpg' : 'video.mp4');
      const file = new File([fileBlob], fileName, {
        type: fileBlob.type || (isImg ? 'image/jpeg' : 'video/mp4'),
      });
      const restored: DepthSubmitPayload = {
        file,
        style: meta.style || fallbackOpts?.style || 'mocap',
        quality: meta.quality || fallbackOpts?.quality || 'standard',
        mode: meta.mode || fallbackOpts?.mode || (isImg ? 'depth-image' : 'depth-video'),
      };
      assertActive();
      depthSubmitRegistry.set(taskId, restored);
      return restored;
    }
  } catch {
    assertActive();
    /* ignore IDB read errors */
  }

  // 3. 参考素材 URL 内存恢复
  if (fallbackUrl) {
    const refFile = resolveRefMediaFile(fallbackUrl);
    if (refFile) {
      const isImg = fallbackOpts?.mode === 'depth-image';
      const restored: DepthSubmitPayload = {
        file: refFile,
        style: fallbackOpts?.style || 'mocap',
        quality: fallbackOpts?.quality || 'standard',
        mode: fallbackOpts?.mode || (isImg ? 'depth-image' : 'depth-video'),
      };
      registerDepthSubmit(taskId, restored);
      return restored;
    }

    // 4. 参考素材 URL 重新 fetch blob 还原 File
    try {
      const res = await fetch(fallbackUrl, { signal });
      if (res.ok) {
        const blob = await res.blob();
        assertActive();
        const isImg = fallbackOpts?.mode === 'depth-image';
        const file = new File([blob], isImg ? 'reference.jpg' : 'reference.mp4', {
          type: blob.type || (isImg ? 'image/jpeg' : 'video/mp4'),
        });
        const restored: DepthSubmitPayload = {
          file,
          style: fallbackOpts?.style || 'mocap',
          quality: fallbackOpts?.quality || 'standard',
          mode: fallbackOpts?.mode || (isImg ? 'depth-image' : 'depth-video'),
        };
        registerDepthSubmit(taskId, restored);
        return restored;
      }
    } catch {
      assertActive();
      /* ignore fetch error */
    }
  }

  return undefined;
}

export interface DepthEnvState {
  depthModelReady: boolean;
  setupCommand: string;
  envHint: string | null;
  loading: boolean;
}

export function useDepthEnvCheck(enabled = true): DepthEnvState {
  const [depthModelReady, setDepthModelReady] = useState(false);
  const [setupCommand, setSetupCommand] = useState(DEPTH_MODEL_SETUP_COMMAND);
  const [envHint, setEnvHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    void apiFetch('/api/system/depth-env')
      .then((res) => res.json())
      .then((data) => {
        if (data?.message) setEnvHint(String(data.message));
        setDepthModelReady(Boolean(data?.depthModelReady));
        if (data?.setupCommand) setSetupCommand(String(data.setupCommand));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [enabled]);

  return { depthModelReady, setupCommand, envHint, loading };
}

interface DepthSubmitResponse {
  success?: boolean;
  resultUrl?: string;
  taskId?: string;
  recordId?: string;
  status?: string;
  error?: string;
  failReason?: string;
  submissionUnknown?: boolean;
  submissionRejected?: boolean;
}

async function postDepthFile(endpoint: string, form: FormData, signal?: AbortSignal, operationId?: string): Promise<DepthSubmitResponse> {
  throwIfGenerationAborted(() => Boolean(signal?.aborted));
  if (operationId) form.append('clientTaskId', operationId);
  let res: Response;
  try {
    res = await apiFetch(endpoint, {
      method: 'POST', body: form, signal,
      headers: { ...storageConfigHeaders(), ...(operationId ? { 'x-idempotency-key': operationId } : {}) },
    });
  } catch (error) {
    throw generationRecoveryError(formatUserError(error, SUBMISSION_RECOVERY_HINT));
  }
  const data = await res.json().catch(() => null) as DepthSubmitResponse | null;
  if (data?.submissionRejected || data?.status === 'FAILURE' ||
    (!res.ok && res.status < 500 && !data?.submissionUnknown)) {
    throw new Error(data?.error || data?.failReason || `深度任务提交失败 (HTTP ${res.status})`);
  }
  if (signal?.aborted || !res.ok || !data?.success) throw generationRecoveryError(data?.error || SUBMISSION_RECOVERY_HINT);
  return data;
}

export async function submitDepthImage(
  file: File,
  style: DepthVideoStyle,
  quality: DepthQuality,
  signal?: AbortSignal,
  operationId?: string,
): Promise<{ resultUrl: string }> {
  throwIfGenerationAborted(() => Boolean(signal?.aborted));
  const form = new FormData();
  form.append('image', file);
  form.append('style', style);
  form.append('quality', quality);
  const data = await postDepthFile('/api/generate/depth-image', form, signal, operationId);
  if (!data.resultUrl) throw generationRecoveryError(SUBMISSION_RECOVERY_HINT);
  recordModelUsage({
    modelId: 'depth-image',
    modelName: `深度图生成 (${style})`,
    provider: '本地算力 / 视觉生成',
    type: 'image',
    mediaCount: 1,
    costUsd: 0,
    success: true,
  });
  return { resultUrl: data.resultUrl };
}

export async function submitDepthVideo(
  file: File,
  style: DepthVideoStyle,
  quality: DepthQuality,
  signal?: AbortSignal,
  operationId?: string,
): Promise<{ taskId: string; recordId?: string }> {
  throwIfGenerationAborted(() => Boolean(signal?.aborted));
  const form = new FormData();
  form.append('video', file);
  form.append('style', style);
  form.append('quality', quality);
  const data = await postDepthFile('/api/generate/depth-video', form, signal, operationId);
  if (!data.taskId) throw generationRecoveryError(SUBMISSION_RECOVERY_HINT);
  recordModelUsage({
    modelId: 'depth-video',
    modelName: `深度动作捕捉 (${style})`,
    provider: '本地算力 / 视频生成',
    type: 'video',
    mediaCount: 1,
    costUsd: 0,
    success: true,
  });
  return { taskId: data.taskId, recordId: data.recordId };
}

export async function pollDepthVideoTask(taskId: string): Promise<{
  status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
  resultUrl?: string;
  progress?: string;
  stage?: string;
  failReason?: string;
}> {
  const res = await apiFetch(`/api/generate/depth-video?taskId=${encodeURIComponent(taskId)}`);
  const data = await res.json();
  if (!data?.success) {
    throw new Error(data?.error || '查询深度动作捕捉任务失败');
  }

  if (data.status === 'SUCCESS' && data.resultUrl) {
    return { status: 'SUCCESS', resultUrl: data.resultUrl, progress: '100%' };
  }
  if (data.status === 'FAILURE') {
    return {
      status: 'FAILURE',
      failReason: data.failReason || '深度动作捕捉生成失败',
    };
  }
  return {
    status: 'IN_PROGRESS',
    progress: data.progress ? String(data.progress) : undefined,
    stage: data.stage ? String(data.stage) : undefined,
  };
}

export function formatDepthSubmitError(error: unknown, fallback: string): string {
  return formatUserError(error, fallback);
}
