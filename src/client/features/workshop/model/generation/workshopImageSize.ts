import { normalizeOpenAiImageRequest } from '@shared/domain/models/model-adapters/image/normalizeOpenAiImageModel';
import { resolveGptImageSizeForModel } from '@shared/domain/models/model-adapters/image/gptImageSafeSizes';
import { generationRecoveryError } from '@client/shared/api/generation/generationRecovery';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';

/** Use the same normalized pixel contract as the API, not the pre-normalized preset. */
export function resolveWorkshopImageSize(aspect: string, model: string, quality: 'high' | 'medium' | 'low', lockedSize?: string): string {
  const size = normalizeOpenAiImageRequest(model, lockedSize || resolveGptImageSizeForModel(aspect, model, quality), quality, aspect).size;
  if (lockedSize && size !== lockedSize) {
    throw new Error(`当前模型无法按原分镜尺寸 ${lockedSize} 重画（会调整为 ${size}）；请改用支持该尺寸的模型或整组重新生成，未提交计费任务。`);
  }
  return size;
}

/** Read original bytes; an upstream size adjustment does not invalidate a generated image. */
export async function readWorkshopImageSize(url: string): Promise<{ width: number; height: number }> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(await fetchMediaBlob(url));
    if (!bitmap.width || !bitmap.height) throw new Error('原图尺寸无效');
    return { width: bitmap.width, height: bitmap.height };
  } catch (error) {
    throw generationRecoveryError(error instanceof Error && 'recoveryRequired' in error
      ? error.message : '原图已生成，但无法读取原图尺寸；请核对原任务，不要重复生成。');
  } finally {
    bitmap?.close();
  }
}
