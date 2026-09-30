import { requiresGenerationRecovery } from '@client/shared/api/generationRecovery';
import type { ShotPrompt } from '@shared/domain/prompts/vision';
import { resolveWorkshopImageSize, verifyWorkshopImageSize } from './workshopImageSize';
import { submitImageGenTaskResult, compressProductImageIfNeeded } from '@client/shared/api/generationApi';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { sliceGridImage2x2Blobs } from '@client/shared/media/imageGridSlicer';
import type { BatchProductItem } from '../batchTypes';
import type { TaskExecutionConfig } from './batchTaskExecution';
import { resolveGridRecoverySource } from './gridRecoverySource';
import { parseOutputDimensions } from '@shared/domain/media/outputDimensions';
import { savedWorkshopOutputSize } from './workshopOutputSize';

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
  const attempts = new Map(item.tasks.map(task => [task.id, task.idempotencyKey]));
  const matchesAttempt = (task: BatchProductItem['tasks'][number]) => pending.has(task.shot_no) && attempts.has(task.id) && attempts.get(task.id) === task.idempotencyKey;
  const patch = (update: Partial<BatchProductItem['tasks'][number]>) => setItems((items) => items.map((entry) => entry.id === item.id
    ? { ...entry, tasks: entry.tasks.map((task) => matchesAttempt(task) ? { ...task, ...update } : task) } : entry));
  const previous = item.tasks.find(task => pending.has(task.shot_no) && (task.gridTaskKey || task.gridSourceUrl));
  const taskKey = previous?.gridTaskKey || config.idempotencyKey;
  let sourceUrl = resolveGridRecoverySource({
    recoveryOnly, masterGridUrl: item.masterGridUrl, tasks: item.tasks, pendingShotNos: [...pending],
  });
  let uncertain = Boolean(previous?.gridTaskKey || recoveryOnly);
  let stage = '提交或查询';
  patch({ status: 'IN_PROGRESS', error: undefined });
  let slices: Blob[] = [];
  try {
    if (shots.length !== 4 || !item.gridPrompt?.trim()) throw new Error('四宫格需要完整的 4 镜和整组提示词，请重新分析');
    const size = previous?.gridSize || resolveWorkshopImageSize(config.selectedAspect, config.selectedImageGenModel, config.selectedQuality);
    const savedOutput = savedWorkshopOutputSize(item.tasks.find(task => pending.has(task.shot_no)));
    const outputSize = savedOutput || config.gridOutputSize || savedWorkshopOutputSize({ gridSize: size })!;
    const output = parseOutputDimensions(outputSize);
    if (!output) throw new Error('切图尺寸无效，请设置 1–4096 的整数像素宽高');
    let verifySource = Boolean(previous?.outputSize);
    if (!sourceUrl && (previous?.gridTaskKey || recoveryOnly)) {
      const upstream = previous?.upstreamTaskId;
      const query = upstream ? `taskId=${encodeURIComponent(upstream)}` : `taskKey=${encodeURIComponent(taskKey || '')}`;
      const response = await apiFetch(`/api/generate/image?${query}&recheck_failed=1`, { headers: storageConfigHeaders() });
      const data = await response.json();
      if (data.taskId) patch({ upstreamTaskId: data.taskId });
      if (!response.ok || data.status !== 'SUCCESS' || !data.resultUrl) {
        if (response.ok && data.status === 'FAILURE') uncertain = false;
        throw new Error(data.status === 'FAILURE' ? `原任务返回失败：${data.failReason || data.error || '请核对网关记录'}` : data.error || '原任务仍在处理，请稍后恢复结果');
      }
      sourceUrl = data.resultUrl;
    }
    if (!sourceUrl) {
      const reference = item.selectedProductImages[0] || item.coverImage;
      if (!reference) throw new Error('缺少商品垫图，请先勾选商品图');
      const productReferenceCandidates = Array.from(new Set([
        reference,
        ...item.selectedProductImages,
      ].filter((img): img is string => Boolean(img)))).slice(0, 4);
      const productReferenceImages = await Promise.all(
        productReferenceCandidates.map((img) => compressProductImageIfNeeded(img)),
      );
      const productImageUrl = productReferenceImages[0];
      const safeAnchorFaceUrl = config.anchorFaceUrl
        ? await compressProductImageIfNeeded(config.anchorFaceUrl)
        : undefined;
      patch({ gridTaskKey: taskKey, gridSize: size, outputSize, upstreamTaskId: undefined });
      await config.beforeSubmit?.();
      verifySource = true;
      const generated = await submitImageGenTaskResult({
      prompt: item.gridPrompt.trim(), model: config.selectedImageGenModel, size,
      aspectRatio: config.selectedAspect, quality: config.selectedQuality,
      productImageUrl, referenceImageUrl: productImageUrl,
      referenceImages: productReferenceImages, productReferenceImages,
      useReferenceImage: true,
      padSocialRef: false, isGrid2x2: true, workshopMode: 'storyboard_generate',
      productTitle: item.title, productFingerprint: item.productFingerprint || item.title,
      productRole: item.productRole,
      anchorFaceImageUrl: safeAnchorFaceUrl,
      has_human: shots.some((shot) => shot.has_human !== false),
    }, { isAborted: config.isAborted, isPaused: config.isPaused, idempotencyKey: taskKey, onTaskSubmitted: async upstreamTaskId => {
      patch({ upstreamTaskId });
      await config.beforeSubmit?.();
    } });
      sourceUrl = generated.url;
    }
    patch({ gridSourceUrl: sourceUrl, gridTaskKey: taskKey, gridSize: size, outputSize });
    setItems((items) => items.map((entry) => entry.id === item.id
      && entry.tasks.some(task => matchesAttempt(task) && task.resultStatus !== 'superseded')
      ? { ...entry, masterGridUrl: sourceUrl } : entry));
    stage = '下载或拆分';
    if (verifySource) await verifyWorkshopImageSize(sourceUrl!, size);
    slices = await sliceGridImage2x2Blobs(sourceUrl!, {
      targetWidth: output.width, targetHeight: output.height,
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
          ...entry, tasks: entry.tasks.map((task) => task.shot_no === shot.shot_no && matchesAttempt(task)
            ? { ...task, status: 'SUCCESS', resultUrl: url, temporaryUrl: false, error: undefined, recoveryRequired: false } : task),
        } : entry));
        bumpProgress(true, 1);
      } catch (error) {
        setItems((items) => items.map((entry) => entry.id === item.id ? {
          ...entry, tasks: entry.tasks.map((task) => task.shot_no === shot.shot_no && matchesAttempt(task)
            ? { ...task, status: 'FAILURE', recoveryRequired: true, error: `原图已生成，分镜保存失败，可恢复结果：${error instanceof Error ? error.message : '网络异常'}` } : task),
        } : entry));
        bumpProgress(false, 1);
      }
    }
  } catch (error) {
    const recoveryRequired = Boolean(sourceUrl) || uncertain || requiresGenerationRecovery(error);
    patch({ status: 'FAILURE', recoveryRequired,
      error: `${sourceUrl ? '原图已生成，' : recoveryRequired ? '结果待核对，' : ''}${stage}未完成：${error instanceof Error ? error.message : '网络异常'}${recoveryRequired ? '；请优先核对原任务，不必重新生图' : ''}` });
    bumpProgress(false, pendingShots.length);
  }
}
