import type { VideoSalesScript } from '@shared/domain/video-sales';

/** A new unsubmitted draft; the original unknown receipt remains in history. */
export function createSalesVideoRetry(script: VideoSalesScript, id: string): VideoSalesScript {
  if (script.renderStatus !== 'uncertain' || script.renderTaskId) throw new Error('请继续查询已有回执，不能另建任务');
  return { ...script, id, renderStatus: 'pending', renderTaskId: undefined, renderSubmissionKey: undefined,
    renderSnapshot: undefined, renderError: undefined, renderResultUrl: undefined };
}
