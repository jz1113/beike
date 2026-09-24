import type { ShotPrompt } from '@beike/domain/vision';
import { resolveGptImageSizeForModel } from '@beike/domain/modelAdapters/image/gptImageSafeSizes';
import { submitImageGenTaskResult, compressProductImageIfNeeded } from '@/shared/api/generationApi';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@/shared/api/apiClient';
import { sliceGridImage2x2Blobs } from '@/shared/media/imageGridSlicer';
import type { BatchProductItem } from './batchTypes';
import type { TaskExecutionConfig } from './batchTaskExecution';
import { resolveGridRecoverySource } from './gridRecoverySource';

export async function runGridImageTask(
  item: BatchProductItem,
  pendingShots: ShotPrompt[],
  config: TaskExecutionConfig,
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  bumpProgress: (ok: boolean, n: number) => void,
  recoveryOnly = false,
) {
  const shots = item.prompts.filter((shot) => shot.selected !== false);
  const pending = new Set(pendingShots.map((shot) => shot.shot_no));
  const patch = (update: Partial<BatchProductItem['tasks'][number]>) => setItems((items) => items.map((entry) => entry.id === item.id
    ? { ...entry, tasks: entry.tasks.map((task) => pending.has(task.shot_no) ? { ...task, ...update } : task) } : entry));
  const previous = item.tasks.find(task => pending.has(task.shot_no) && (task.gridTaskKey || task.gridSourceUrl));
  const taskKey = previous?.gridTaskKey || config.idempotencyKey;
  let sourceUrl = resolveGridRecoverySource({
    recoveryOnly, masterGridUrl: item.masterGridUrl, tasks: item.tasks, pendingShotNos: [...pending],
  });
  let stage = '提交或查询';
  patch({ status: 'IN_PROGRESS', error: undefined });
  let slices: Blob[] = [];
  try {
    if (shots.length !== 4 || !item.gridPrompt?.trim()) throw new Error('四宫格需要完整的 4 镜和整组提示词，请重新分析');
    const size = previous?.gridSize || resolveGptImageSizeForModel(config.selectedAspect, config.selectedImageGenModel, config.selectedQuality);
    if (!sourceUrl && (previous?.gridTaskKey || recoveryOnly)) {
      const upstream = previous?.upstreamTaskId;
      const query = upstream ? `taskId=${encodeURIComponent(upstream)}` : `taskKey=${encodeURIComponent(taskKey || '')}`;
      const response = await apiFetch(`/api/generate/image?${query}&recheck_failed=1`, { headers: storageConfigHeaders() });
      const data = await response.json();
      if (data.taskId) patch({ upstreamTaskId: data.taskId });
      if (!response.ok || data.status !== 'SUCCESS' || !data.resultUrl) {
        throw new Error(data.status === 'FAILURE' ? `原任务返回失败：${data.failReason || data.error || '请核对网关记录'}` : data.error || '原任务仍在处理，请稍后恢复结果');
      }
      sourceUrl = data.resultUrl;
    }
    if (!sourceUrl) {
      const reference = item.selectedProductImages[0] || item.coverImage;
      if (!reference) throw new Error('缺少商品垫图，请先勾选商品图');
      const productImageUrl = await compressProductImageIfNeeded(reference);
      patch({ gridTaskKey: taskKey, gridSize: size, upstreamTaskId: undefined });
      const generated = await submitImageGenTaskResult({
      prompt: item.gridPrompt.trim(), model: config.selectedImageGenModel, size,
      aspectRatio: config.selectedAspect, quality: config.selectedQuality,
      productImageUrl, referenceImageUrl: productImageUrl, useReferenceImage: true,
      padSocialRef: false, isGrid2x2: true, workshopMode: 'storyboard_generate',
      productTitle: item.title, productFingerprint: item.productFingerprint || item.title,
      productRole: item.productRole, has_human: shots.some((shot) => shot.has_human !== false),
    }, { isAborted: config.isAborted, isPaused: config.isPaused, idempotencyKey: taskKey, onTaskSubmitted: upstreamTaskId => patch({ upstreamTaskId }) });
      sourceUrl = generated.url;
    }
    patch({ gridSourceUrl: sourceUrl, gridTaskKey: taskKey, gridSize: size });
    setItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, masterGridUrl: sourceUrl } : entry));
    stage = '下载或拆分';
    const [width, height] = size.split('x').map(Number);
    slices = await sliceGridImage2x2Blobs(sourceUrl!, {
      targetWidth: Math.max(1, Math.floor(width / 2)), targetHeight: Math.max(1, Math.floor(height / 2)),
    });
    for (let index = 0; index < shots.length; index++) {
      const shot = shots[index];
      if (!pending.has(shot.shot_no)) continue;
      try {
        const form = new FormData();
        form.append('category', 'generated/images');
        form.append('customConfig', JSON.stringify(readClientStorageConfig()));
        form.append('file', slices[index], `${item.id}-${shot.shot_no}.jpg`);
        const response = await apiFetch('/api/assets/storage/upload', { method: 'POST', headers: storageConfigHeaders(), body: form });
        const data = await response.json();
        const url = data.urls?.[0] || data.url;
        if (!response.ok || data.success === false || !url) throw new Error(data.error || '分镜图片保存失败');
        setItems((items) => items.map((entry) => entry.id === item.id ? {
          ...entry, tasks: entry.tasks.map((task) => task.shot_no === shot.shot_no
            ? { ...task, status: 'SUCCESS', resultUrl: url, temporaryUrl: false, error: undefined, recoveryRequired: false } : task),
        } : entry));
        bumpProgress(true, 1);
      } catch (error) {
        setItems((items) => items.map((entry) => entry.id === item.id ? {
          ...entry, tasks: entry.tasks.map((task) => task.shot_no === shot.shot_no
            ? { ...task, status: 'FAILURE', recoveryRequired: true, error: `原图已生成，分镜保存失败，可恢复结果：${error instanceof Error ? error.message : '网络异常'}` } : task),
        } : entry));
        bumpProgress(false, 1);
      }
    }
  } catch (error) {
    patch({ status: 'FAILURE', recoveryRequired: Boolean(taskKey || sourceUrl), error: `${sourceUrl ? '原图已生成，' : '结果待核对，'}${stage}未完成：${error instanceof Error ? error.message : '网络异常'}；请恢复结果，不必重新生图` });
    bumpProgress(false, pendingShots.length);
  }
}
