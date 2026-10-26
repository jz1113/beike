import type { VideoSalesScript, VideoSalesShot } from '@shared/domain/sales';
import type { SalesRenderGenerators } from './renderSalesVideo';

/** Queries receipts only. Historical clips never enter generation or composition. */
export async function queryHistoricalSalesShots(input: {
  script: VideoSalesScript;
  signal: AbortSignal;
  videoModel?: string;
  getShots: () => VideoSalesShot[];
  patchShot: (index: number, patch: Partial<VideoSalesShot>) => void;
}, query: SalesRenderGenerators['generateVideo']): Promise<void> {
  for (let index = 0; index < input.script.shots.length; index += 1) {
    if (input.signal.aborted) return;
    const shot = input.getShots()[index];
    if (!shot || shot.assetUrl || !shot.taskId || !['generating', 'uncertain'].includes(shot.status || '')) continue;
    try {
      const url = await query({
        existingTaskId: shot.taskId, prompt: '', duration: shot.modelDuration || shot.duration,
        videoModel: input.videoModel, isAborted: () => input.signal.aborted,
      });
      if (!input.signal.aborted) input.patchShot(index, { status: 'done', assetUrl: url, failReason: undefined });
    } catch (err) {
      if (input.signal.aborted) return;
      input.patchShot(index, {
        status: err instanceof Error && err.name === 'ImageGenBusinessError' ? 'failed' : 'generating',
        failReason: err instanceof Error ? err.message : '原镜头结果未确认',
      });
    }
  }
}
