import { normalizeOpenAiImageRequest } from '@beike/domain/modelAdapters/image/normalizeOpenAiImageModel';
import { resolveGptImageSizeForModel } from '@beike/domain/modelAdapters/image/gptImageSafeSizes';
import { generationRecoveryError } from '@/shared/api/generationRecovery';
import { fetchMediaBlob } from '@/shared/media/downloadMedia';

/** Use the same normalized pixel contract as the API, not the pre-normalized preset. */
export function resolveWorkshopImageSize(aspect: string, model: string, quality: 'high' | 'medium' | 'low', lockedSize?: string): string {
  const size = normalizeOpenAiImageRequest(model, lockedSize || resolveGptImageSizeForModel(aspect, model, quality), quality, aspect).size;
  if (lockedSize && size !== lockedSize) {
    throw new Error(`当前模型无法按原分镜尺寸 ${lockedSize} 重画（会调整为 ${size}）；请改用支持该尺寸的模型或整组重新生成，未提交计费任务。`);
  }
  return size;
}

export function assertWorkshopImageSize(width: number, height: number, expected: string): void {
  const actual = `${width}x${height}`;
  if (actual !== expected) {
    throw generationRecoveryError(`成图尺寸不一致：要求 ${expected}，实际 ${actual}。已拦截交付，不会拉伸商品或自动重新计费；请核对原任务。`);
  }
}

/** Check original bytes, never a thumbnail; failure retains the billable task for recovery. */
export async function verifyWorkshopImageSize(url: string, expected: string): Promise<void> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(await fetchMediaBlob(url));
    assertWorkshopImageSize(bitmap.width, bitmap.height, expected);
  } catch (error) {
    throw generationRecoveryError(error instanceof Error && 'recoveryRequired' in error
      ? error.message : '原图已生成，但无法读取原图尺寸；请核对原任务，不要重复生成。');
  } finally {
    bitmap?.close();
  }
}
