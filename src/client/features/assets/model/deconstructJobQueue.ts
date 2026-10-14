import type { DeconstructJobSnapshot } from '@shared/contracts/deconstructJobs';
import type { ImageSetQueueItem } from './assetPromptConstants';

export function applyDeconstructJobToQueue(job: DeconstructJobSnapshot, queue: ImageSetQueueItem[]): ImageSetQueueItem[] {
  const existing = new Map(queue.map(item => [item.id, item]));
  const items = job.items.map(item => {
    const previous = existing.get(item.id) || { id: item.id, name: item.name, images: item.images, status: 'pending' as const };
    if (item.result?.ok) return { ...previous, status: 'done' as const, error: undefined, partial: item.result.partial,
      result: item.result.data as Record<string, unknown>, deconstructStats: item.result.stats as ImageSetQueueItem['deconstructStats'], reviewId: item.result.reviewId };
    if (item.status === 'error' || item.status === 'interrupted') return { ...previous, status: 'error' as const,
      error: item.error || (item.result && !item.result.ok ? item.result.error : '') || '服务器重启，任务结果未确认。请先核对资产库后再决定是否重试。' };
    return { ...previous, status: item.status === 'queued' || item.status === 'running' ? 'processing' as const : 'pending' as const,
      error: undefined };
  });
  const jobIds = new Set(job.items.map(item => item.id));
  return [...items, ...queue.filter(item => !jobIds.has(item.id))];
}
