import { apiRequest } from '@client/shared/api/apiRequest';
import { getModelCredentials } from '@client/shared/api/gatewayClient';
import { pollSingleTaskResult, submitImageGenTaskResult } from '@client/shared/api/generation/generationApi';
import { convertImageToJpeg } from '@client/shared/media/imageJpeg';
import { salesAssetViewGridResponseSchema } from '@shared/contracts/salesAssetViews';
import { imageCapabilities } from '@shared/domain/media/imageCapabilities';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import { resolveGptImageSizeForModel } from '@shared/domain/models/model-adapters/image/gptImageSafeSizes';
import { PERSONA_VIEWS } from '../model/salesPersonaViews';
import { SCENE_VIEWS } from '../model/salesSceneViews';
import { listSalesPrompts } from './salesPrompts';
import { uploadSalesCustomAsset } from './salesProduction';

import type { AssetViewRequest } from '../model/salesAssetViews';
export type { AssetViewRequest } from '../model/salesAssetViews';

export type AssetViewStage = 'prompt' | 'analyzing' | 'creating' | 'generating' | 'cropping';

export async function uploadSalesViewImage(blob: Blob, filename: string, signal: AbortSignal): Promise<string> {
  const jpeg = await convertImageToJpeg(blob, signal);
  signal.throwIfAborted();
  const name = `${filename.replace(/\.[^.]+$/, '') || 'view'}.jpg`;
  return uploadSalesCustomAsset(new File([jpeg], name, { type: 'image/jpeg' }), 'assets', signal);
}

export function gridImageSettings(kind: 'persona' | 'scene', selection: string) {
  const model = upstreamModalityModelId('image', selection);
  const credentials = getModelCredentials(selection);
  const capabilities = imageCapabilities(model, credentials.protocol, credentials.baseUrl);
  const resolution = ['4K', '2K', '1K'].find((size) => capabilities.resolutions.some((item) => item === size));
  const quality = resolution === '1K' ? 'low' : resolution === '2K' ? 'medium' : 'high';
  const aspectRatio = kind === 'persona' ? '16:9' : '4:3';
  return { aspectRatio, size: resolveGptImageSizeForModel(aspectRatio, model, quality), quality, maxReferenceImages: capabilities.maxReferenceImages };
}

export async function generateSalesAssetGrid(kind: 'persona' | 'scene', request: AssetViewRequest, signal: AbortSignal, onStage?: (stage: AssetViewStage) => void, onProgress?: () => void): Promise<Record<string, string>> {
  signal.throwIfAborted();
  if (request.images) return request.images;
  if (!request.resultUrl && !request.taskId && !request.prompt) {
    onStage?.('prompt');
    const prompts = await listSalesPrompts(signal);
    signal.throwIfAborted();
    const template = prompts.find((item) => item.id === `${kind}-grid`);
    if (!template) throw new Error('当前后端尚未加载视角图提示词，请重启贝壳服务后重试；刷新页面无法更新后端。本次未提交生图任务。');
    if (!template.configured || !template.prompt.trim()) throw new Error(`请先在提示词管理中保存「${template.title}」，本次未提交生图任务。`);
    request.layout = kind === 'persona' ? '1x4' : '3x3';
    request.prompt = template.prompt;
    request.promptVersion = template.version;
    onProgress?.();
  }
  const isAborted = () => signal.aborted;
  if (!request.resultUrl) {
    onStage?.('generating');
    const { maxReferenceImages, ...settings } = gridImageSettings(kind, request.model);
    const references = maxReferenceImages ? request.references.slice(0, maxReferenceImages) : request.references;
    const result = request.taskId
      ? await pollSingleTaskResult(request.taskId, isAborted, undefined, request.model)
      : await submitImageGenTaskResult({
        model: upstreamModalityModelId('image', request.model), prompt: request.prompt!, ...settings,
        useReferenceImage: true, referenceImageUrl: references[0], referenceImages: references,
        source: `sales_${kind}_view`, metadata: { workflow: `sales_${kind}_view`, layout: request.layout || '3x3', promptVersion: request.promptVersion },
      }, { isAborted, idempotencyKey: request.key, onTaskSubmitted: (id) => { request.taskId = id; onProgress?.(); } });
    // A crop/storage retry must reuse the one paid generation, including synchronous results without task IDs.
    request.resultUrl = result.url;
    onProgress?.();
  }
  signal.throwIfAborted();
  onStage?.('cropping');
  const response = await apiRequest('POST', '/api/sales/asset-view-grid', {
    headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ kind, layout: request.layout || '3x3', ...(request.layout === '1x4' ? { whole: true } : {}), imageUrl: request.resultUrl }),
  });
  const data: unknown = await response.json().catch(() => null);
  signal.throwIfAborted();
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '视角图已生成，但裁切保存失败，请继续处理原图';
    throw new Error(error);
  }
  const parsed = salesAssetViewGridResponseSchema.safeParse(data);
  const expected = request.layout === '1x4' ? ['sheet'] : (kind === 'persona' ? PERSONA_VIEWS : SCENE_VIEWS).filter(({ id }) => id !== 'main').map(({ id }) => String(id));
  if (!parsed.success || !expected.every((id) => parsed.data.images.some(({ view }) => view === id)) || (request.layout === '1x4' && parsed.data.images.length !== expected.length)) {
    throw new Error('视角图裁切结果不完整，请继续处理原图');
  }
  request.images = Object.fromEntries(parsed.data.images.map(({ view, url }) => [view, url]));
  onProgress?.();
  return request.images;
}
