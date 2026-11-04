import { getGatewayClientHeaders, getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { apiRequest } from '@client/shared/api/apiRequest';
import { sleepWhilePolling } from '@client/shared/api/generation/generationAbort';

export interface SalesMediaJob {
  id: string;
  kind: 'analysis' | 'video' | 'mix';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'partial' | 'canceled';
  name: string;
  selection?: string;
  trace?: { scriptId?: string; scriptVersion?: number; templateVersion?: string; adaptVersion?: string; promptDigest?: string; references?: string[] };
  createdAt: string;
  startedAt: string;
  updatedAt: string;
  error?: string;
  result?: Record<string, unknown>;
}

export async function fetchSalesMediaJob(id: string, signal: AbortSignal): Promise<SalesMediaJob> {
  const response = await apiRequest('GET', '/api/sales/media-jobs', { search: new URLSearchParams({ id }).toString(), signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok || data.job?.id !== id) throw new Error(data.error || '读取任务详情失败');
  return data.job;
}

export async function updateSalesMediaJob(job: SalesMediaJob, action: 'cancel' | 'retry') {
  let headers: Record<string,string> = {};
  if (action === 'retry' && job.selection) {
    if (job.kind === 'analysis') {
      const route = getMultimodalClientOverrides(job.selection);
      headers = { 'x-custom-base-url': route.customBaseUrl || '', 'x-custom-api-key': route.customApiKey || '' };
    } else if (job.kind === 'video') headers = getGatewayClientHeaders(job.selection);
  }
  const response = await apiRequest('POST', '/api/sales/media-jobs', { search: new URLSearchParams({ id:job.id, action }).toString(), headers });
  if (!response.ok) throw new Error((await response.json()).error || '任务操作失败');
}

export async function waitSalesMediaJob(id: string, signal: AbortSignal, progress?: (message: string) => void, onChannelTask?: (id: string) => void | Promise<void>): Promise<Record<string, unknown>> {
  progress?.('后台已接管，可离开页面。');
  let channelTaskId = '';
  while (true) {
    signal.throwIfAborted();
    await sleepWhilePolling(1500, () => signal.aborted);
    const response = await apiRequest('GET', '/api/sales/media-jobs', { search: new URLSearchParams({ id }).toString(), cache: 'no-store', signal });
    const data = await response.json();
    const job: SalesMediaJob = data.job;
    if (!response.ok || job?.id !== id) throw new Error(data.error || `查询中断，可到后台任务查看 ${id}`);
    if (typeof job.result?.taskId === 'string' && job.result.taskId && job.result.taskId !== channelTaskId) {
      channelTaskId = job.result.taskId;
      await onChannelTask?.(channelTaskId);
    }
    if (job.status === 'failed' || job.status === 'canceled') throw new Error(job.error || '后台任务已停止');
    if ((job.status === 'completed' || job.status === 'partial') && job.result) return job.result;
    progress?.(job.status === 'queued' ? '后台排队中' : typeof job.result?.stage === 'string' ? job.result.stage : '后台处理中');
  }
}

export async function salesMediaResult(data: Record<string, unknown>, signal: AbortSignal) {
  const job = data.job as SalesMediaJob | undefined;
  return job?.id ? waitSalesMediaJob(job.id, signal) : data;
}
