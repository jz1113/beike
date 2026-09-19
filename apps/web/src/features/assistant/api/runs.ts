import { apiFetch } from '@/lib/apiClient';

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
  const res = await apiFetch('/api/assistant/runs');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.runs) ? data.runs : [];
}

export async function recoverAssistantTurn(turnId: string): Promise<unknown | null> {
  const res = await apiFetch(`/api/assistant/turns/${encodeURIComponent(turnId)}/recover`, { method: 'POST' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.snapshot || null;
}
