import type { SalesCreativeAsset, VideoSalesScript } from '@shared/domain/video-sales';
import { generateSalesReferenceFrame } from './generateShotAsset';

/** Query saved receipts without applying the currently edited draft to already-paid work. */
export async function recoverSalesAssetReceipts(input: {
  script: VideoSalesScript;
  isAborted: () => boolean;
  updateAsset: (id: string, patch: Partial<SalesCreativeAsset>) => void;
}, generate = generateSalesReferenceFrame): Promise<void> {
  for (const asset of input.script.assets || []) {
    if (!asset.taskId || !['generating', 'uncertain'].includes(asset.status || '')) continue;
    if (input.isAborted()) throw new DOMException('已停止查询', 'AbortError');
    try {
      const url = await generate({ existingTaskId: asset.taskId, imageModel: asset.modelId,
        prompt: '', isAborted: input.isAborted });
      input.updateAsset(asset.id, { url, status: 'done', validation: 'pending', error: undefined });
    } catch (error) {
      input.updateAsset(asset.id, { status: error instanceof Error && error.name === 'ImageGenBusinessError' ? 'failed' : 'uncertain',
        error: error instanceof Error ? error.message : '原图片任务结果未确认' });
      throw error;
    }
  }
}
