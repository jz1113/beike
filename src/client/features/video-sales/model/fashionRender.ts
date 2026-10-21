import { videoInputError } from '@shared/domain/media/videoCapabilities';
import { fashionReferenceError, type FashionReference } from '@shared/domain/video-sales';
import type { SalesFrameGenerator } from './salesAssetHelpers';

export function fashionSubmitError(input: {
  modelId?: string;
  prompt?: string;
  references: FashionReference[];
  duration: number;
  resolution?: string;
  aspectRatio: string;
}): string | null {
  const prompt = input.prompt?.trim() || '';
  if (!prompt) return '还没有完整视频提示词，请重新生成方案';
  const referenceError = fashionReferenceError(input.references);
  if (referenceError) return referenceError;
  const modelId = input.modelId?.trim() || '';
  if (!modelId) return '请先配置视频模型';
  return videoInputError({
    model: modelId,
    refMode: 'omni',
    images: input.references.map((ref) => ref.url),
    duration: input.duration,
    resolution: input.resolution,
    aspectRatio: input.aspectRatio,
  });
}

export async function prepareFashionStills(input: {
  personPrompt?: string;
  scenePrompt?: string;
  personFrameUrl?: string;
  sceneFrameUrl?: string;
  personRefs: string[];
  sceneRefs: string[];
  imageModel?: string;
  aspectRatio: string;
  isAborted: () => boolean;
  generateFrame: SalesFrameGenerator;
}): Promise<{ personFrameUrl: string; sceneFrameUrl: string }> {
  if (!input.imageModel?.trim()) throw new Error('请先配置绘图模型');
  const personPrompt = input.personPrompt?.trim() || '';
  const scenePrompt = input.scenePrompt?.trim() || '';
  if (!personPrompt || !scenePrompt) throw new Error('请按服饰带货重新生成方案');
  if (!input.personRefs.some((url) => url.trim())) throw new Error('请上传出镜人物');
  const generate = input.generateFrame;
  const personFrameUrl = input.personFrameUrl?.trim() || await generate({
    prompt: personPrompt,
    imageModel: input.imageModel,
    referenceImages: input.personRefs,
    aspectRatio: input.aspectRatio,
    isAborted: input.isAborted,
  });
  const sceneFrameUrl = input.sceneFrameUrl?.trim() || await generate({
    prompt: scenePrompt,
    imageModel: input.imageModel,
    referenceImages: input.sceneRefs,
    aspectRatio: input.aspectRatio,
    isAborted: input.isAborted,
  });
  return { personFrameUrl, sceneFrameUrl };
}
