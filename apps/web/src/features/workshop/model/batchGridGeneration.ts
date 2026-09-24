import type { ShotPrompt } from '@beike/domain/vision';
import { resolveGptImageSizeForModel } from '@beike/domain/modelAdapters/image/gptImageSafeSizes';
import { submitImageGenTaskResult, compressProductImageIfNeeded } from '@/shared/api/generationApi';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@/shared/api/apiClient';
import { sliceGridImage2x2 } from '@/shared/media/imageGridSlicer';
import { fetchMediaBlob } from '@/shared/media/downloadMedia';
import type { BatchProductItem } from './batchTypes';
import type { TaskExecutionConfig } from './batchTaskExecution';

export async function runGridImageTask(
  item: BatchProductItem,
  pendingShots: ShotPrompt[],
  config: TaskExecutionConfig,
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  bumpProgress: (ok: boolean, n: number) => void,
) {
  const shots = item.prompts.filter((shot) => shot.selected !== false);
  const pending = new Set(pendingShots.map((shot) => shot.shot_no));
  const patch = (update: Partial<BatchProductItem['tasks'][number]>) => setItems((items) => items.map((entry) => entry.id === item.id
    ? { ...entry, tasks: entry.tasks.map((task) => pending.has(task.shot_no) ? { ...task, ...update } : task) } : entry));
  patch({ status: 'IN_PROGRESS', error: undefined });
  let slices: string[] = [];
  try {
    if (shots.length !== 4 || !item.gridPrompt?.trim()) throw new Error('四宫格需要完整的 4 镜和整组提示词，请重新分析');
    const reference = item.selectedProductImages[0] || item.coverImage;
    if (!reference) throw new Error('缺少商品垫图，请先勾选商品图');
    const productImageUrl = await compressProductImageIfNeeded(reference);
    const size = resolveGptImageSizeForModel(config.selectedAspect, config.selectedImageGenModel, config.selectedQuality);
    const generated = await submitImageGenTaskResult({
      prompt: item.gridPrompt.trim(), model: config.selectedImageGenModel, size,
      aspectRatio: config.selectedAspect, quality: config.selectedQuality,
      productImageUrl, referenceImageUrl: productImageUrl, useReferenceImage: true,
      padSocialRef: false, isGrid2x2: true, workshopMode: 'storyboard_generate',
      productTitle: item.title, productFingerprint: item.productFingerprint || item.title,
      productRole: item.productRole, has_human: shots.some((shot) => shot.has_human !== false),
    }, { isAborted: config.isAborted, isPaused: config.isPaused, idempotencyKey: config.idempotencyKey });
    setItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, masterGridUrl: generated.url } : entry));
    const [width, height] = size.split('x').map(Number);
    slices = await sliceGridImage2x2(generated.url, {
      targetWidth: Math.max(1, Math.floor(width / 2)), targetHeight: Math.max(1, Math.floor(height / 2)),
    });
    for (let index = 0; index < shots.length; index++) {
      const shot = shots[index];
      if (!pending.has(shot.shot_no)) continue;
      try {
        const form = new FormData();
        form.append('category', 'generated/images');
        form.append('customConfig', JSON.stringify(readClientStorageConfig()));
        form.append('file', await fetchMediaBlob(slices[index]), `${item.id}-${shot.shot_no}.jpg`);
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
            ? { ...task, status: 'FAILURE', error: error instanceof Error ? error.message : '分镜保存失败' } : task),
        } : entry));
        bumpProgress(false, 1);
      }
    }
  } catch (error) {
    patch({ status: 'FAILURE', error: error instanceof Error ? error.message : '四宫格生图失败' });
    bumpProgress(false, pendingShots.length);
  } finally {
    slices.forEach((url) => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
  }
}
