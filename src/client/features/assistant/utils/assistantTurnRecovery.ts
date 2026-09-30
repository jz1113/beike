import type { AssistantTurn } from '@shared/domain/assistant/types';

type ReceiptStorage = Pick<Storage, 'getItem' | 'setItem'>;
const receiptKey = (sessionId: string, messageId: string) => `ai_assistant_turn_receipt:${encodeURIComponent(sessionId)}:${encodeURIComponent(messageId)}`;
function browserStorage(): ReceiptStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
/** Only execution identities are saved when chat autosave is disabled. */
export function readAssistantTurnReceipt(sessionId: string, messageId: string, storage = browserStorage()): string | undefined {
  if (!storage) return undefined;
  try {
    const receipt = JSON.parse(storage.getItem(receiptKey(sessionId, messageId)) || 'null');
    if (receipt?.sessionId === sessionId && receipt?.messageId === messageId && typeof receipt?.turnId === 'string' && receipt.turnId.trim()) return receipt.turnId;
  } catch { /* An unreadable identity does not authorize another execution. */ }
  return undefined;
}
export function saveAssistantTurnReceipt(sessionId: string, messageId: string, turnId: string, storage = browserStorage()): void {
  if (!storage) throw new Error('原任务标识无法保存，本次未提交');
  try { storage.setItem(receiptKey(sessionId, messageId), JSON.stringify({ sessionId, messageId, turnId })); }
  catch { throw new Error('原任务标识无法保存，本次未提交'); }
  if (readAssistantTurnReceipt(sessionId, messageId, storage) !== turnId) throw new Error('原任务标识尚未确认保存，本次未提交');
}
export async function submitPreparedAssistantTurn(turnId: string, persist: (id: string) => void | Promise<void>, submit: () => Promise<Response>, signal: AbortSignal): Promise<Response> {
  await persist(turnId);
  signal.throwIfAborted();
  return submit();
}

type RetryDecision = { kind: 'completed'; snapshot: AssistantTurn } | { kind: 'retry' } | { kind: 'blocked'; message: string };
export async function readAssistantRetryDecision(turnId: string | undefined, sessionId: string, request: (url: string) => Promise<Response>): Promise<RetryDecision> {
  if (!turnId) return { kind: 'blocked', message: '缺少原任务标识，无法核实执行结果，已阻止重复提交' };
  try {
    const response = await request(`/api/assistant/turns/${encodeURIComponent(turnId)}/snapshot`);
    const data = await response.json(), snapshot = data.snapshot as AssistantTurn | undefined;
    if (!response.ok || !data.success || !snapshot || snapshot.id !== turnId || snapshot.threadId !== sessionId || !Array.isArray(snapshot.items)) throw new Error('无法核实');
    if (snapshot.status === 'completed') return { kind: 'completed', snapshot };
    if (['failed', 'cancelled', 'interrupted'].includes(snapshot.status)) return { kind: 'retry' };
    return { kind: 'blocked', message: '原任务尚未确认失败，请稍后再检查；为避免重复扣费，本次不会重新提交' };
  } catch {
    return { kind: 'blocked', message: '暂时无法核实原任务结果，已阻止重复提交，请恢复连接后再试' };
  }
}
