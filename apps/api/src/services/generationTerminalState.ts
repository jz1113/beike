import { prisma } from '@beike/server-kit/prisma';
import { jsonResponse } from '../core/http';

export const mutableGenerationStatuses = ['PENDING', 'IN_PROGRESS'];

async function savedTerminalResponse(taskId: string): Promise<Response | null> {
  const task = await prisma.imageTask.findUnique({
    where: { taskId }, select: { status: true, resultUrl: true, failReason: true },
  });
  if (!task || !['SUCCESS', 'FAILURE', 'CANCELLED'].includes(task.status)) return null;
  return jsonResponse({
    success: true, taskId, status: task.status,
    progress: task.status === 'SUCCESS' ? '100%' : '0%',
    resultUrl: task.resultUrl || '', failReason: task.failReason || '',
  });
}

/** Reconcile again after upstream I/O: another poll may have committed a terminal state meanwhile. */
export async function withPersistedGenerationStatus(req: Request, poll: () => Promise<Response>): Promise<Response> {
  const taskId = new URL(req.url).searchParams.get('taskId');
  if (!taskId) return poll();
  try {
    const saved = await savedTerminalResponse(taskId);
    if (saved) return saved;
    const response = await poll();
    return await savedTerminalResponse(taskId) || response;
  } catch (error) {
    console.error('[Generation] persisted state reconciliation failed', error);
    return jsonResponse({ success: false, error: '任务状态暂时无法核对，请稍后查询原任务', retryable: true }, 503);
  }
}
