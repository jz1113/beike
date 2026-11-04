import type { SalesScriptDomain } from '@shared/domain/sales';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';

export interface SalesScriptBundleJob {
  pendingScript?: { script: SalesScriptDomain; model: string; promptVersion: string; videoHash: string; saveWarning?: string };
  pendingScriptId?: string;
  durationSec?: number;
  videoUrl: string;
  name: string;
  model: string;
  scriptId: string;
  operationId: string;
  taskId: string;
  resultUrl: string;
  depthState: 'prepared' | 'submitted' | 'failed' | 'ready';
  analysisError: string;
  depthError: string;
}
const KEY = 'beike_sales_script_bundle_v1';
export function readScriptBundleJob(): SalesScriptBundleJob | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    const job = saved?.job;
    return saved?.workspace === getWorkspaceSecret() && job
      && ['videoUrl', 'name', 'model', 'scriptId', 'operationId', 'taskId', 'resultUrl', 'analysisError', 'depthError'].every((key) => typeof job[key] === 'string')
      && ['prepared', 'submitted', 'failed', 'ready'].includes(job.depthState) ? job : null;
  } catch { return null; }
}
export function saveScriptBundleJob(job: SalesScriptBundleJob | null): void {
  if (job) localStorage.setItem(KEY, JSON.stringify({ workspace: getWorkspaceSecret(), job }));
  else localStorage.removeItem(KEY);
}

const PAUSED_KEY = 'beike_sales_script_bundle_paused_v1';
function readPausedState(): { jobs: SalesScriptBundleJob[]; removed: SalesScriptBundleJob[] } {
  try {
    const saved = JSON.parse(localStorage.getItem(PAUSED_KEY) || 'null');
    const valid = (value: unknown): SalesScriptBundleJob[] => Array.isArray(value)
      ? value.filter((job: SalesScriptBundleJob) => job && typeof job.videoUrl === 'string' && typeof job.operationId === 'string') : [];
    return saved?.workspace === getWorkspaceSecret() ? { jobs: valid(saved.jobs), removed: valid(saved.removed) } : { jobs: [], removed: [] };
  } catch { return { jobs: [], removed: [] }; }
}
export function readPausedScriptBundles(): SalesScriptBundleJob[] { return readPausedState().jobs; }
export function readRemovedScriptBundles(): SalesScriptBundleJob[] { return readPausedState().removed; }
export function savePausedScriptBundles(jobs: SalesScriptBundleJob[]): void {
  const { removed } = readPausedState();
  localStorage.setItem(PAUSED_KEY, JSON.stringify({ workspace: getWorkspaceSecret(), jobs, removed }));
}
export function moveScriptBundleProgress(record: string | SalesScriptBundleJob, undo = false): { jobs: SalesScriptBundleJob[]; removed: SalesScriptBundleJob[] } {
  const state = readPausedState();
  const source = undo ? state.removed : state.jobs;
  const item = typeof record === 'string' ? source.find((entry) => entry.operationId === record) : record;
  if (!item) return state;
  const { operationId } = item;
  const jobs = state.jobs.filter((entry) => entry.operationId !== operationId);
  const removed = state.removed.filter((entry) => entry.operationId !== operationId);
  (undo ? jobs : removed).push(item);
  localStorage.setItem(PAUSED_KEY, JSON.stringify({ workspace: getWorkspaceSecret(), jobs, removed }));
  return { jobs, removed };
}
export function purgeRemovedScriptBundles(operationIds: string[]): SalesScriptBundleJob[] {
  const state = readPausedState();
  const selected = new Set(operationIds);
  const removed = state.removed.filter((entry) => !selected.has(entry.operationId));
  if (removed.length !== state.removed.length) {
    localStorage.setItem(PAUSED_KEY, JSON.stringify({ workspace: getWorkspaceSecret(), jobs: state.jobs, removed }));
  }
  return removed;
}
