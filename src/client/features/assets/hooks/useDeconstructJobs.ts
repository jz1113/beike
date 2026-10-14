import { useEffect, useSyncExternalStore } from 'react';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { listDeconstructJobs, stopDeconstructJob } from '../api/deconstructJobsClient';
import { readDeconstructJobReceiptState } from '../model/deconstructQueueStorage';
import {
  getDeconstructJobsState, subscribeDeconstructJobs, updateDeconstructJobsState,
  upsertDeconstructJob, isDeconstructJobActive, mergeDeconstructJobSnapshot,
} from '../model/deconstructJobsState';

export function useDeconstructJobsState() {
  return useSyncExternalStore(subscribeDeconstructJobs, getDeconstructJobsState, getDeconstructJobsState);
}

/** One app-level observer; the server owns work even when no observer is mounted. */
export function useDeconstructJobObserver() {
  const state = useDeconstructJobsState();
  useEffect(() => {
    let alive = true;
    let polling = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failureCount = 0;
    let workspace = '';
    const poll = async () => {
      if (!alive || polling) return;
      polling = true;
      if (timer) clearTimeout(timer);
      const currentWorkspace = getWorkspaceSecret();
      const storageKey = `deconstruct_job_dismissed:${currentWorkspace.slice(-16)}`;
      if (workspace !== currentWorkspace) {
        workspace = currentWorkspace;
        let dismissed: string[] = [];
        try { dismissed = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { /* optional preferences */ }
        updateDeconstructJobsState({ jobs: [], connectionError: null, viewJobId: null, dismissed: Array.isArray(dismissed) ? dismissed : [] });
      }
      try {
        const jobs = await listDeconstructJobs();
        if (alive && getWorkspaceSecret() === currentWorkspace) {
          failureCount = 0;
          const current = getDeconstructJobsState().jobs;
          if (jobs.some(job => !isDeconstructJobActive(job) && current.some(previous => previous.jobId === job.jobId && isDeconstructJobActive(previous)))) invalidateGlobalAssetCache();
          const merged = new Map(current.map(job => [job.jobId, job]));
          for (const job of jobs) {
            merged.set(job.jobId, mergeDeconstructJobSnapshot(job, merged.get(job.jobId)));
          }
          const sorted = [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          updateDeconstructJobsState({ jobs: [...sorted.filter(isDeconstructJobActive), ...sorted.filter(job => !isDeconstructJobActive(job)).slice(0, 50)], connectionError: null });
        }
      } catch {
        failureCount++;
        if (alive && getWorkspaceSecret() === currentWorkspace && (getDeconstructJobsState().jobs.some(isDeconstructJobActive) || readDeconstructJobReceiptState())) {
          updateDeconstructJobsState({ connectionError: '暂时无法同步进度，已提交任务状态待核对。连接恢复后会自动更新。' });
        }
      } finally {
        polling = false;
        if (alive) timer = setTimeout(() => { void poll(); }, failureCount ? Math.min(30_000, failureCount * 5_000)
          : getDeconstructJobsState().jobs.some(isDeconstructJobActive) ? 2_500 : 20_000);
      }
    };
    const refresh = () => { void poll(); };
    const visibility = () => { if (!document.hidden) refresh(); };
    window.addEventListener('deconstruct-jobs-refresh', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', visibility);
    refresh();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener('deconstruct-jobs-refresh', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('storage', refresh);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  return {
    ...state,
    visibleJobs: state.jobs.filter(job => isDeconstructJobActive(job) || !state.dismissed.includes(job.jobId)),
    dismissJob: (jobId: string) => {
      const current = getDeconstructJobsState();
      if (current.jobs.some(job => job.jobId === jobId && isDeconstructJobActive(job))) return;
      const dismissed = [...new Set([...current.dismissed, jobId])].slice(-200);
      updateDeconstructJobsState({ dismissed });
      try { localStorage.setItem(`deconstruct_job_dismissed:${getWorkspaceSecret().slice(-16)}`, JSON.stringify(dismissed)); } catch { /* optional preference */ }
    },
    stopJob: async (jobId: string) => {
      const workspace = getWorkspaceSecret();
      try {
        const job = await stopDeconstructJob(jobId);
        if (getWorkspaceSecret() === workspace) upsertDeconstructJob(job);
      }
      catch (error) {
        if (getWorkspaceSecret() === workspace) updateDeconstructJobsState({ connectionError: error instanceof Error ? error.message : '停止请求未确认，请稍后核对任务状态' });
      }
      window.dispatchEvent(new Event('deconstruct-jobs-refresh'));
    },
  };
}
