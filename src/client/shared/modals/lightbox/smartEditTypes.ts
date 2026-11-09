import type { ChatSession, GenerationTask } from '@client/store/appStoreTypes';
import { buildGenerationPromptBatch, type BatchGenerationSettings } from '@client/shared/agent/buildGenerationPromptBatch';
import { buildMultiAnglePrompt, buildSmartEditPrompt } from '@shared/domain/media/drawing';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';

export interface MarkerPoint {
  id: string;
  x: number; // 百分比 0 ~ 100
  y: number; // 百分比 0 ~ 100
  index: number;
  type?: 'point' | 'box';
  width?: number; // 百分比 0 ~ 100 (框选)
  height?: number; // 百分比 0 ~ 100 (框选)
}

export interface DragBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SmartEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  originalPrompt?: string;
  onSubmitSmartEdit: (params: {
    markers: MarkerPoint[];
    prompt: string;
    model: string;
    quality: string;
    aspectRatio?: string;
  }) => void | boolean;
  quickModel?: string;
  quickQuality?: string;
  quickAspectId?: string;
  onChangeQuickModel?: (id: string) => void;
  onChangeQuickQuality?: (quality: 'low' | 'medium' | 'high') => void;
  onChangeQuickAspectId?: (id: string) => void;
}

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

/** Preserve queued IDs while replacing their snapshots with live conversation records. */
export function resolveTaskPreviewQueue(
  previewTask: GenerationTask | null,
  previewQueue: GenerationTask[],
  generationTasks: GenerationTask[],
  sessions: ChatSession[],
): GenerationTask[] {
  if (!previewTask) return [];
  const liveTasks = new Map<string, GenerationTask>();
  const queuedIds = new Set(previewQueue.map((task) => task.id));
  const remember = (task: GenerationTask) => {
    const wanted = previewQueue.length ? queuedIds.has(task.id) : task.id === previewTask.id ||
      Boolean(previewTask.batchId && task.batchId === previewTask.batchId);
    if (wanted) liveTasks.set(task.id, task);
  };
  for (const session of sessions) {
    for (const task of session.tasks) remember(task);
  }
  for (const task of generationTasks) remember(task);
  const source = previewQueue.length ? previewQueue : previewTask.batchId
    ? [...liveTasks.values()].filter((task) => task.batchId === previewTask.batchId) : [previewTask];
  const queue = source.length ? source : [previewTask];
  return queue.map((task) => liveTasks.get(task.id) || task);
}

const referenceFields = ['referenceImages', 'images', 'referenceImageUrl', 'sourceImageUrl', 'productImageUrl',
  'firstFrameUrl', 'first_frame_image', 'refImages', 'refImageUrls', 'inputImages', 'inputImage',
  'sourceImages', 'productImages'] as const;

/** Collect legacy reference fields in their original order, with cycle protection. */
export function extractTaskReferenceImages(task: unknown): string[] {
  const result: string[] = [];
  const visited = new Set<object>();
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) result.push(value.trim());
    else if (Array.isArray(value) && !visited.has(value)) {
      visited.add(value); value.forEach(push);
    }
  };
  const extract = (value: unknown) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    const item = value as Record<string, unknown>;
    referenceFields.forEach(field => push(item[field]));
    for (const [group, keys] of [['params', ['referenceImages', 'referenceImageUrl', 'images']],
      ['options', ['referenceImages', 'images', 'referenceImageUrl']], ['extra', ['referenceImages']]] as const) {
      const nested = item[group];
      if (nested && typeof nested === 'object') keys.forEach(key => push((nested as Record<string, unknown>)[key]));
    }
    extract(item.rawTask);
  };
  extract(task);
  return [...new Set(result)];
}
