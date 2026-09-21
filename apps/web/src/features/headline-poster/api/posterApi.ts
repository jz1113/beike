import { apiFetch } from '@/shared/api/apiClient';
import { retryWhenLocalApiUnavailable } from '@/shared/api/localApiRetry';
import { submitImageGenTask } from '@/shared/api/generationApi';
import type { ReservedArtDirection } from '../reservedArtDirections';
import { exportCoverJpeg, loadImageForCanvas } from '../model/coverExport';
import {
  normalizeCoverTitle,
  type CoverDesignPlan,
  type HeadlineDesignResponse,
  type HeadlineTitleResponse,
  type ImageQuality,
  type PosterItem,
} from '../model/posterTypes';
import type { CoverFormat } from '../coverFormat';

export async function rewriteCoverTitle(item: PosterItem, titleModel: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await retryWhenLocalApiUnavailable(() => apiFetch('/api/generate/headline-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: titleModel,
        originalTitle: item.originalTitle,
        productName: item.productName,
        imageUrls: [item.sourceImageUrl],
      }),
      signal,
    }), { signal });
    const data = await response.json().catch(() => ({}));
    const title = normalizeCoverTitle((data?.data as HeadlineTitleResponse | undefined)?.title || '');
    if (data?.success && title.length >= 7 && title.length <= 12) return title;
    throw new Error(data?.error || '标题改写模型没有返回 7–12 字的有效标题');
  } catch (error) {
    throw new Error(`标题改写阶段失败，已停止后续封面设计和生图：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function directCoverDesign(
  item: PosterItem,
  coverTitle: string,
  artDirection: ReservedArtDirection,
  titleModel: string,
  signal?: AbortSignal,
): Promise<HeadlineDesignResponse> {
  try {
    const response = await retryWhenLocalApiUnavailable(() => apiFetch('/api/generate/headline-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: titleModel,
        originalTitle: item.originalTitle,
        coverTitle,
        productName: item.productName,
        aspectRatio: item.format.aspectRatio,
        reservedArtDirection: artDirection,
        imageUrls: [item.sourceImageUrl],
      }),
      signal,
    }), { signal });
    const data = await response.json().catch(() => ({}));
    if (data?.success && data?.data && typeof data.data === 'object') return data.data as HeadlineDesignResponse;
    throw new Error(data?.error || '封面设计模型没有返回可用方案');
  } catch (error) {
    throw new Error(`封面设计阶段失败，已停止后续生图：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function generateFinalCover(
  productReferenceUrl: string,
  originalTitle: string,
  coverTitle: string,
  productName: string,
  format: CoverFormat,
  plan: CoverDesignPlan,
  prompt: string,
  imageModel: string,
  imageQuality: ImageQuality,
  isAborted: () => boolean = () => false,
): Promise<string> {
  const generatedSceneUrl = await submitImageGenTask({
    model: imageModel,
    aspectRatio: format.aspectRatio,
    size: format.id === 'square' ? '1440x1440' : undefined,
    quality: imageQuality,
    source: 'headline_poster_direct_final',
    useReferenceImage: true,
    referenceImageUrl: productReferenceUrl,
    referenceImages: [productReferenceUrl],
    prompt,
    metadata: {
      workflow: 'headline_poster_direct_final',
      designName: plan.name,
      titleLines: plan.titleLines,
      outputFormat: format.importValue,
      outputSize: format.width + 'x' + format.height,
      originalTitle,
      coverTitle,
      productName,
      promptVersion: 'integrated-cover-v3',
    },
  }, { isAborted });
  const { image, revoke } = await loadImageForCanvas(generatedSceneUrl);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const expectedRatio = format.width / format.height;
    if (Math.abs(canvas.width / canvas.height - expectedRatio) > 0.02) {
      throw new Error('生图结果不是 ' + format.aspectRatio + '，已停止导出以避免拉伸或裁掉标题');
    }
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法导出封面');
    context.drawImage(image, 0, 0);
    return await exportCoverJpeg(canvas, format);
  } finally {
    revoke();
  }
}
