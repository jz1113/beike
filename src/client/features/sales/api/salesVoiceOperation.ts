import { domainStorage } from '@shared/domain/core/runtime';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { apiFetch } from '@client/shared/api/apiClient';
import { generationRecoveryError } from '@client/shared/api/generation/generationRecovery';
import { sleepWhilePolling } from '@client/shared/api/generation/generationAbort';

export const VOICE_OPERATION_PREFIX = 'sales_voice_op_';

/** Reserve before dispatch. Uncertain operations are never evicted or assigned a new key. */
export async function reserveVoiceOperation(input: unknown, regenerate = false): Promise<{ id: string; fresh: boolean; reject: () => void; complete: () => void }> {
  const bytes = new TextEncoder().encode(JSON.stringify([getWorkspaceSecret(), input]));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  const storage = domainStorage() || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storage) throw new Error('无法保存配音操作标识，未提交模型；请恢复浏览器存储后重试');
  const slot = `beike.sales.voice-operation.v1:${hash}`;
  const read = (): { id: string; completed: boolean } | null => {
    const raw = storage.getItem(slot);
    if (!raw) return null;
    let saved;
    try { saved = raw.startsWith(VOICE_OPERATION_PREFIX) ? { id: raw, completed: false } : JSON.parse(raw); }
    catch { throw generationRecoveryError('原配音操作标识损坏，请核对历史任务；不会重新合成'); }
    if (!saved || typeof saved.id !== 'string' || !/^sales_voice_op_[\w-]{1,256}$/.test(saved.id)) throw generationRecoveryError('原配音操作标识损坏，请核对历史任务；不会重新合成');
    return { id: saved.id, completed: saved.completed === true };
  };
  const saved = read();
  const fresh = !saved || regenerate && saved.completed;
  const id = fresh ? VOICE_OPERATION_PREFIX + crypto.randomUUID() : saved!.id;
  if (fresh) {
    storage.setItem(slot, JSON.stringify({ id, completed: false }));
    if (read()?.id !== id) throw new Error('配音操作标识保存未确认，未提交模型');
  }
  return {
    id, fresh,
    reject: () => { if (read()?.id === id) storage.removeItem(slot); },
    complete: () => { if (read()?.id === id) storage.setItem(slot, JSON.stringify({ id, completed: true })); },
  };
}

export async function pollVoiceOperation(id: string, signal: AbortSignal, progress?: (label: string) => void): Promise<Record<string, unknown>> {
  const key = id.slice(VOICE_OPERATION_PREFIX.length);
  while (true) {
    signal.throwIfAborted();
    let response: Response;
    try { response = await apiFetch(`/api/generate/audio?taskKey=${encodeURIComponent(key)}`, { signal }); }
    catch (error) { throw generationRecoveryError(error instanceof Error ? error.message : '原配音暂时无法查询'); }
    const data = await response.json().catch(() => null);
    if (data?.success === true && (data.audioUrl || data.resultUrl)) return data;
    if (data?.submissionRejected === true) throw Object.assign(new Error(data.error || '原配音请求已被拒绝'), { submissionRejected: true });
    if (response.status === 502 || response.status === 404 || response.status === 401 || response.status === 403) {
      throw generationRecoveryError(data?.error || '原配音结果待核对；不会重新合成');
    }
    progress?.('正在核对原配音操作，不会重新合成…');
    await sleepWhilePolling(1500, () => signal.aborted);
  }
}
