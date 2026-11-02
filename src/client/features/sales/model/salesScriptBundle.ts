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
export function readPausedScriptBundles(): SalesScriptBundleJob[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PAUSED_KEY) || 'null');
    return saved?.workspace === getWorkspaceSecret() && Array.isArray(saved.jobs)
      ? saved.jobs.filter((job: SalesScriptBundleJob) => job && typeof job.videoUrl === 'string' && typeof job.operationId === 'string') : [];
  } catch { return []; }
}
export function savePausedScriptBundles(jobs: SalesScriptBundleJob[]): void {
  localStorage.setItem(PAUSED_KEY, JSON.stringify({ workspace: getWorkspaceSecret(), jobs }));
}
