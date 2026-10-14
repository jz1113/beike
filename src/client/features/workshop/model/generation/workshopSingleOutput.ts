import { parseOutputDimensions } from '@shared/domain/media/outputDimensions';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { generationRecoveryError } from '@client/shared/api/generation/generationRecovery';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { resizeImageBlob } from '@client/shared/media/imageResize';
import { verifyWorkshopImageSize } from './workshopImageSize';

/** The upstream canvas and delivered shot are separate contracts, frozen before submission. */
export async function finishWorkshopSingleOutput(
  generated: { url: string; temporary: boolean },
  generationSize?: string,
  outputSize?: string,
  filename = 'workshop-shot.jpg',
): Promise<{ url: string; temporary: boolean }> {
  try {
    // Old single-shot attempts did not store a separate upstream canvas size.
    if (generationSize || outputSize) await verifyWorkshopImageSize(generated.url, generationSize || outputSize!);
    if (!outputSize || !generationSize || outputSize === generationSize) return generated;
    const dimensions = parseOutputDimensions(outputSize);
    if (!dimensions) throw new Error('分镜交付尺寸无效');
    const blob = await resizeImageBlob(await fetchMediaBlob(generated.url), dimensions.width, dimensions.height);
    const form = new FormData();
    form.append('category', 'generated/images');
    form.append('customConfig', JSON.stringify(readClientStorageConfig()));
    form.append('file', blob, filename);
    const response = await apiFetch('/api/assets/storage/upload', { method: 'POST', headers: storageConfigHeaders(), body: form });
    const data = await response.json();
    const url = data.urls?.[0] || data.url;
    if (!response.ok || data.success === false || typeof url !== 'string' || !url) throw new Error(data.error || '分镜图片保存失败');
    return { url, temporary: false };
  } catch (error) {
    throw generationRecoveryError(`原图已生成，分镜尺寸处理或保存未完成：${error instanceof Error ? error.message : '网络异常'}；可核对原任务恢复，不必重新生图。`);
  }
}
