import { generationTaskRepository } from '@server/repositories/generationTasks';
import { isImageTaskTerminal } from '@shared/domain/core/taskStatus';
import { jsonResponse } from '../../core/http';

export const mutableGenerationStatuses = ['PENDING', 'IN_PROGRESS'];

async function savedTerminalResponse(taskId: string, recheckFailure = false): Promise<Response | null> {
  const task = await generationTaskRepository.findStatus(taskId);
  if (!task || !isImageTaskTerminal(task.status) || (recheckFailure && task.status === 'FAILURE')) return null;
  return jsonResponse({
    success: true, taskId, status: task.status,
    progress: task.status === 'SUCCESS' ? '100%' : '0%',
    resultUrl: task.resultUrl || '', failReason: task.failReason || '',
  });
}

/** Reconcile again after upstream I/O: another poll may have committed a terminal state meanwhile. */
export async function withPersistedGenerationStatus(req: Request, poll: () => Promise<Response>, recheckFailure = false): Promise<Response> {
  const taskId = new URL(req.url).searchParams.get('taskId');
  if (!taskId) return poll();
  try {
    const saved = await savedTerminalResponse(taskId, recheckFailure);
    if (saved) return saved;
    const response = await poll();
    return await savedTerminalResponse(taskId, recheckFailure) || response;
  } catch (error) {
    console.error('[Generation] persisted state reconciliation failed', error);
    return jsonResponse({ success: false, error: '任务状态暂时无法核对，请稍后查询原任务', retryable: true }, 503);
  }
}
