import type { DeconstructJobSnapshot } from '@shared/contracts/deconstructJobs';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { promptGroupSubcategoryOptions } from '@shared/domain/assets/promptGroupSubcategory';
import type { ImageSetQueueItem } from './assetPromptConstants';

export type DeconstructJobsState = {
  jobs: DeconstructJobSnapshot[];
  connectionError: string | null;
  viewJobId: string | null;
  dismissed: string[];
};
let state: DeconstructJobsState = { jobs: [], connectionError: null, viewJobId: null, dismissed: [] };
const listeners = new Set<() => void>();
export const getDeconstructJobsState = () => state;
export function subscribeDeconstructJobs(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function updateDeconstructJobsState(next: Partial<DeconstructJobsState>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}
export function upsertDeconstructJob(job: DeconstructJobSnapshot) {
  const merged = mergeDeconstructJobSnapshot(job, state.jobs.find(value => value.jobId === job.jobId));
  updateDeconstructJobsState({ jobs: [merged, ...state.jobs.filter(value => value.jobId !== job.jobId)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}
export function mergeDeconstructJobSnapshot(incoming: DeconstructJobSnapshot, previous?: DeconstructJobSnapshot) {
  if (!previous) return incoming;
  if (previous.updatedAt > incoming.updatedAt) return previous;
  const regressesStatus = previous.updatedAt === incoming.updatedAt
    && ((!isDeconstructJobActive(previous) && isDeconstructJobActive(incoming))
      || (previous.status === 'stopping' && (incoming.status === 'queued' || incoming.status === 'running')));
  const snapshot = regressesStatus ? previous : incoming;
  const detailSource = regressesStatus ? incoming : previous;
  return { ...snapshot, items: snapshot.items.map(item => {
    const old = detailSource.items.find(value => value.id === item.id);
    return item.result?.ok && item.result.data === null && old?.result?.ok && old.result.data !== null
      ? { ...item, result: { ...item.result, data: old.result.data } } : item;
  }) };
}
export function isDeconstructJobActive(job: Pick<DeconstructJobSnapshot, 'status'>) {
  return job.status === 'queued' || job.status === 'running' || job.status === 'stopping';
}
export function requestDeconstructJobView(jobId: string) { updateDeconstructJobsState({ viewJobId: jobId }); }

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

export function deconstructSubcategoryOptions(majorId: string, categories: AssetProductCategory[] = []) {
  if (!categories.some(category => category.id === majorId && !category.parentId && !category.isArchived)) return [];
  return promptGroupSubcategoryOptions(categories, majorId);
}

/** Send the folder identity, including for legacy phone/case selections. */
export function selectableDeconstructSubcategory(
  value: string | null | undefined, majorId: string, categories: AssetProductCategory[] = [],
): string {
  if (!value) return '';
  return deconstructSubcategoryOptions(majorId, categories)
    .find(option => option.id === value || option.folderId === value)?.folderId || '';
}

export function deconstructImportTargetHint(
  majorId: string, subcategory: string, categories: AssetProductCategory[] = [],
): string {
  const major = categories.find(category => category.id === majorId && !category.parentId && !category.isArchived);
  if (!major) return '按每套图集识别商品及归档文件夹，无法判断时保留在待分类。';
  const child = deconstructSubcategoryOptions(majorId, categories).find(option => option.folderId === subcategory);
  if (child) return `本批待反推图集统一归档至「${major.name} / ${child.label}」。`;
  return deconstructSubcategoryOptions(majorId, categories).length
    ? `归档至「${major.name}」，自动匹配二级文件夹；无法判断时保留在该大类的待分类。`
    : `归档至「${major.name}」；该大类暂无二级文件夹。`;
}
