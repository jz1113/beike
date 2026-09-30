import type { DeconstructJobSnapshot } from '@shared/contracts/deconstructJobs';

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
