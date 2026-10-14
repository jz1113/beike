import { apiRequest } from '@client/shared/api/apiRequest';
import type { AssistantTurn } from '@shared/domain/assistant/types';
import { normalizeAssistantItems, normalizeAssistantTask } from '@shared/domain/assistant/normalizeAssistantItems';

export interface ActiveRun {
  turnId: string;
  threadId: string;
  status: 'running' | 'awaiting_approval' | 'completed' | 'interrupted' | 'failed';
  model?: string | null;
  startedAt: number;
  completedAt?: number | null;
  usage?: { inputTokens: number; outputTokens: number };
}

export async function fetchAssistantRuns(): Promise<ActiveRun[]> {
  const res = await apiRequest('GET', '/api/assistant/runs');
  if (!res.ok) throw new Error(`读取助手任务失败 (HTTP ${res.status})`);
  const data = await res.json();
  if (data.success === false) throw new Error(data.error || '读取助手任务失败');
  return Array.isArray(data.runs) ? data.runs : [];
}

async function readSnapshotResponse(res: Response, turnId: string, threadId?: string): Promise<AssistantTurn | null> {
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const snapshot = data?.snapshot;
  if (data?.success !== true || !snapshot || snapshot.id !== turnId || typeof snapshot.threadId !== 'string'
    || (threadId && snapshot.threadId !== threadId)
    || !['running', 'awaiting_approval', 'completed', 'interrupted', 'failed'].includes(snapshot.status)) return null;
  return { ...snapshot, items: normalizeAssistantItems(snapshot.items), task: normalizeAssistantTask(snapshot.task),
    modelUsed: typeof snapshot.modelUsed === 'string' ? snapshot.modelUsed : undefined };
}

export async function fetchAssistantTurnSnapshot(turnId: string, threadId?: string): Promise<AssistantTurn | null> {
  const res = await apiRequest('GET', '/api/assistant/turns/{turnId}/snapshot', { pathParams: { turnId } });
  return readSnapshotResponse(res, turnId, threadId);
}

export async function recoverAssistantTurn(turnId: string, threadId?: string): Promise<AssistantTurn | null> {
  const res = await apiRequest('POST', '/api/assistant/turns/{turnId}/recover', { pathParams: { turnId } });
  return readSnapshotResponse(res, turnId, threadId);
}
