import type { CoverMemorySample } from '@shared/contracts/coverMemory';

export type CoverFeedJobStatus = 'queued' | 'uploading' | 'analyzing' | 'done' | 'failed' | 'uncertain';

export interface CoverFeedJobView {
  id: string;
  status: CoverFeedJobStatus;
  url?: string;
  sampleId?: string;
  error?: string;
}

export function coverFeedBusy(statuses: CoverFeedJobStatus[]) {
  return statuses.some((status) => status === 'uploading' || status === 'analyzing');
}

export function canStartCoverFeed(statuses: CoverFeedJobStatus[]) {
  return statuses.length > 0 && !coverFeedBusy(statuses);
}

export function coverFeedPhase(statuses: CoverFeedJobStatus[], dragging: boolean): 'idle' | 'ready' | 'dragging' | 'uploading' | 'analyzing' | 'success' | 'partial' | 'error' {
  if (coverFeedBusy(statuses)) return statuses.some((status) => status === 'analyzing') ? 'analyzing' : 'uploading';
  if (dragging) return 'dragging';
  if (statuses.length === 0) return 'idle';
  const failed = statuses.some((status) => status === 'failed' || status === 'uncertain');
  const done = statuses.some((status) => status === 'done');
  if (done && failed) return 'partial';
  if (done) return 'success';
  if (failed) return 'error';
  return 'ready';
}

export function reconcileCoverFeedJob(job: CoverFeedJobView, samples: CoverMemorySample[], startedAt: string): CoverFeedJobView {
  if (!job.url) return { ...job, status: 'uncertain', error: '上传结果不确定，请先刷新核对，不要重复投喂' };
  const matched = samples.find((sample) => sample.imageUrls.includes(job.url || '') && sample.createdAt >= startedAt);
  if (!matched) return { ...job, status: 'uncertain', error: '没有查到这次反推结果，请先刷新核对，不要重复投喂' };
  if (matched.status === 'completed') return { ...job, status: 'done', sampleId: matched.id, error: undefined };
  if (matched.status === 'failed') return { ...job, status: 'failed', sampleId: matched.id, error: matched.error || '反推失败' };
  return { ...job, status: 'uncertain', sampleId: matched.id, error: '样张仍在保存，请稍后刷新核对' };
}
