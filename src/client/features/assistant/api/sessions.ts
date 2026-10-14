import { apiRequest } from '@client/shared/api/apiRequest';
import type { AssistantSession } from '@client/store/appStoreTypes';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

// A delayed snapshot must finish before a newer snapshot or deletion reaches the server.
let mutationQueue: Promise<unknown> = Promise.resolve();
function enqueueMutation<T>(run: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(run, run);
  mutationQueue = result.catch(() => undefined);
  return result;
}

export async function deleteAssistantSessionRemote(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await enqueueMutation(async () => {
      const res = await apiRequest('DELETE', '/api/assistant/sessions', { search: `id=${encodeURIComponent(id)}` });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        return { success: false, error: data.error || `删除失败 (HTTP ${res.status})` };
      }
      return { success: true };
    });
  } catch (e: unknown) {
    return { success: false, error: formatUserError(e, '删除请求失败') };
  }
}

export async function putAssistantSessionsRemote(sessions: AssistantSession[], currentId?: string): Promise<void> {
  await enqueueMutation(async () => {
    // Preserve full histories across API limits. A suffix chunk is merged into
    // the stored thread, and the whole save remains ahead of any queued deletion.
    const encoder = new TextEncoder();
    const maxBatchBytes = 40_000_000;
    let batch: AssistantSession[] = [];
    let batchBytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const res = await apiRequest('PUT', '/api/assistant/sessions', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: batch, currentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) throw new Error(data?.error || `保存对话失败 (HTTP ${res.status})`);
      batch = []; batchBytes = 0;
    };
    const add = async (session: AssistantSession) => {
      const bytes = encoder.encode(JSON.stringify(session)).byteLength;
      if (bytes > maxBatchBytes) throw new Error('单条消息内容过大，请减少附件后重试');
      if (batch.length >= 50 || batchBytes + bytes > maxBatchBytes) await flush();
      batch.push(session); batchBytes += bytes;
    };
    for (const session of sessions) {
      let messages: AssistantSession['messages'] = [];
      let bytes = 0;
      for (const message of session.messages) {
        const messageBytes = encoder.encode(JSON.stringify(message)).byteLength;
        if (messages.length >= 500 || (messages.length && bytes + messageBytes > maxBatchBytes - 10_000)) {
          await add({ ...session, messages }); messages = []; bytes = 0;
        }
        messages.push(message); bytes += messageBytes;
      }
      if (messages.length || !session.messages.length) await add({ ...session, messages });
    }
    await flush();
  });
}

export async function fetchAssistantSessionsRemote(): Promise<AssistantSession[] | null> {
  const res = await apiRequest('GET', '/api/assistant/sessions');
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.success || !Array.isArray(data.sessions)) return null;
  return data.sessions;
}
