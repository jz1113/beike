import { apiFetch } from '@/lib/apiClient';
import type { AssistantSession } from '@/types/app-store';
import { formatUserError } from '@beike/domain/upstreamErrors';

export async function deleteAssistantSessionRemote(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch(`/api/assistant/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      return { success: false, error: data.error || `删除失败 (HTTP ${res.status})` };
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: formatUserError(e, '删除请求失败') };
  }
}

export async function putAssistantSessionsRemote(sessions: AssistantSession[], currentId?: string): Promise<void> {
  await apiFetch('/api/assistant/sessions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions, currentId }),
  });
}

export async function fetchAssistantSessionsRemote(): Promise<AssistantSession[] | null> {
  const res = await apiFetch('/api/assistant/sessions');
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.success || !Array.isArray(data.sessions)) return null;
  return data.sessions;
}
