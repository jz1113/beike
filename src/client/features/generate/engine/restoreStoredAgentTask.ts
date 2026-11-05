import { useAppStore, type GenerationTask } from '@client/store';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';
import { deriveTurnView } from '@client/shared/agent/turnItems';
import { recoverAgentTurn, restoreAgentTurnItems } from './recoverAgentTurn';
import type { TaskUpdater } from './generationTaskTypes';

/** Recovery reads the accepted turn; it never dispatches another model or replays client actions. */
export async function restoreStoredAgentTask(task: GenerationTask, update: TaskUpdater, signal: AbortSignal): Promise<boolean> {
  const turnId = task.agentTurn?.turnId || task.taskId;
  const threadId = task.agentTurn?.threadId || task.sessionId;
  if (!turnId || !threadId) return false;
  const snapshot = await recoverAgentTurn(turnId, threadId, signal, snapshot => {
    const current = useAppStore.getState().generationTasks.find(item => item.id === task.id);
    if (signal.aborted || !current || !isImageTaskActive(current.status) || !current.submissionRecoveryRequired) return;
    const items = restoreAgentTurnItems(current.agentTurn?.items || [], snapshot);
    const view = deriveTurnView(items);
    const finished = !['running', 'awaiting_approval'].includes(snapshot.status);
    const success = snapshot.status === 'completed' && Boolean(view.content.trim());
    update(task.id, {
      status: finished ? success ? 'SUCCESS' : 'FAILURE' : 'IN_PROGRESS',
      progress: finished ? success ? '100%' : '0%' : current.progress,
      submissionRecoveryRequired: !finished,
      failReason: finished ? success ? undefined : snapshot.error || '对话已中断，可重试' : '正在核对原对话结果…',
      agentTurn: { ...current.agentTurn, turnId, threadId, items, reply: view.content || (finished ? '' : current.agentTurn?.reply), thinking: view.thinking || (finished ? '' : current.agentTurn?.thinking),
        toolActivity: view.toolActivity, modelUsed: snapshot.modelUsed || current.agentTurn?.modelUsed,
        statusText: finished ? undefined : snapshot.status === 'awaiting_approval' ? '原对话等待确认' : '正在恢复对话进度…' },
    });
  });
  return Boolean(snapshot);
}
