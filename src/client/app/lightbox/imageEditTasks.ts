import type { GenerationTask } from '@client/store/appStoreTypes';
import { buildGenerationPromptBatch, type BatchGenerationSettings } from '@client/shared/agent/buildGenerationPromptBatch';
import { buildMultiAnglePrompt, buildSmartEditPrompt } from '@shared/domain/media/drawing';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import type { MarkerPoint } from '@client/shared/modals/lightbox/smartEditTypes';

export type ImageEditRequest = {
  kind: 'smart_edit' | 'multi_angle' | 'outpaint';
  source: string;
  originalPrompt?: string;
  prompt?: string;
  markers?: MarkerPoint[];
  azimuth?: number;
  elevation?: number;
  angleName?: string;
  model: string;
  quality: string;
  aspectRatio?: string;
};

/** Shared by the homepage and image result tools, including channel/capability validation. */
export function buildImageEditTask(request: ImageEditRequest, settings: BatchGenerationSettings): GenerationTask {
  if (!request.source || !/^(data:image\/|https?:\/\/|\/storage\/|\/api\/assets\/storage\/)/i.test(request.source)) {
    throw new Error('原图不可用，请重新上传或选择有效图片');
  }
  if (request.kind === 'smart_edit' && !request.prompt?.trim()) throw new Error('请填写修改要求');
  const prompt = request.kind === 'smart_edit'
    ? buildSmartEditPrompt({ originalPrompt: request.originalPrompt || '', userPrompt: request.prompt!.trim(), markers: request.markers || [] })
    : request.kind === 'multi_angle'
      ? buildMultiAnglePrompt({ originalPrompt: request.originalPrompt || '', azimuth: request.azimuth ?? 0, elevation: request.elevation ?? 0, angleName: request.angleName || '自定义' }) + '\n不可见部分仅为生成推测，保持已知商品结构和标识，不添加配件或功效。'
      : request.prompt?.trim() || request.originalPrompt || '保持原图主体、文字、材质与画风，自然延伸画面背景。';
  const title = request.kind === 'smart_edit' ? `图片编辑：${request.prompt!.slice(0, 24)}`
    : request.kind === 'multi_angle' ? `多角度：${request.angleName || '自定义'}` : '图片扩图';
  const quality = request.quality === 'high' || request.quality === '4K' ? 'high' : request.quality === 'low' || request.quality === '1K' ? 'low' : 'medium';
  const [task] = buildGenerationPromptBatch([{ id: 'image-edit', title, prompt, mediaType: 'image', referenceIndexes: [0] }],
    [{ type: 'image', url: request.source }], { ...settings, imageModel: request.model, imageQuality: quality, imageAspect: request.aspectRatio || 'smart' });
  if (getApprovedModel(task.model)?.supportEdits === false) throw new Error('所选模型不支持参考图编辑，请切换支持图片编辑的模型');
  return { ...task, taskType: request.kind === 'outpaint' ? undefined : request.kind,
    angleName: request.angleName, sourceImageUrl: request.source };
}
