import type { AssistantItem, AssistantTurn, ToolResultItem } from '@shared/domain/assistant/types';
import type { AssistantSSEEvent } from '@shared/domain/assistant/events';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import { composeSkillRuntime } from '@shared/domain/assistant/skills';
import type { AssistantMessage } from '@client/store/appStoreTypes';
import { readSseEvents } from '@client/shared/api/sseStream';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import { createUsageScope, usageDigest, type UsageScope } from '@client/shared/utils/usageScope';
import {
  applyItemEvent,
  deriveTurnView,
  finishInterruptedItems,
  makeEmptyItem,
  type DerivedTurnView,
} from '@client/shared/agent/turnItems';
import type { ToolActivityEntry, TurnStreamState } from './assistantTurnTypes';

export { applyItemEvent, finishInterruptedItems, makeEmptyItem };
export const readAssistantEvents = readSseEvents<AssistantSSEEvent>;

export function initialState(): TurnStreamState {
  return {
    content: '',
    thinking: '',
    modelUsed: '',
    toolActivity: [],
    pendingApprovals: [],
    sessionApprovals: [],
  };
}

export function deriveLegacyState(
  items: AssistantItem[],
): Pick<TurnStreamState, 'content' | 'thinking' | 'toolActivity' | 'pendingApprovals'> {
  const view: DerivedTurnView = deriveTurnView(items);
  return view;
}

/** The message owns its resource snapshot; retries must not reread an edited package. */
export function snapshotAssistantSkill(skill: AssistantSkill | null): AssistantMessage['usedSkill'] {
  const runtime = composeSkillRuntime(skill);
  if (!skill || !runtime) return undefined;
  return { ...runtime, name: skill.displayName || skill.name, libraryVersion: skill.libraryVersion };
}

const usageKey = (turnId: string) => `ai_assistant_turn_usage:${turnId}`;
function readUsageContext(turnId: string): { scope: UsageScope; modelId: string } | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(usageKey(turnId)) || 'null');
    if (
      saved &&
      typeof saved.modelId === 'string' &&
      saved.scope?.mediaType === 'chat' &&
      typeof saved.scope.workspaceId === 'string' &&
      typeof saved.scope.channelId === 'string'
    ) {
      return saved;
    }
  } catch { /* Old or damaged histories never authorize attribution to the current channel. */ }
  return undefined;
}

/** Save only digests, before persistence callbacks or network delivery can change settings. */
export function prepareAssistantUsage(turnId: string, wire: Record<string, unknown>, headers: Record<string, string> = {}): void {
  const text = (name: string) => (typeof wire[name] === 'string' ? (wire[name] as string) : '');
  const saved = {
    modelId: text('model'),
    scope: createUsageScope('chat', text('model'), {
      ...headers,
      'x-custom-base-url': text('customBaseUrl') || headers['x-custom-base-url'] || '',
      'x-custom-api-key': text('customApiKey') || headers['x-custom-api-key'] || '',
      'x-custom-protocol': text('textProtocol') || headers['x-custom-protocol'] || '',
    }),
  };
  if (headers['x-workspace-token']) saved.scope.workspaceId = usageDigest(headers['x-workspace-token']);
  const encoded = JSON.stringify(saved);
  let existing: string | null;
  try {
    existing = localStorage.getItem(usageKey(turnId));
  } catch {
    throw new Error('原对话用量范围无法读取，本次未提交模型，请检查浏览器存储');
  }
  if (existing && existing !== encoded) throw new Error('原对话用量范围不匹配，本次未提交模型');
  try {
    localStorage.setItem(usageKey(turnId), encoded);
    if (localStorage.getItem(usageKey(turnId)) !== encoded) throw new Error('write not confirmed');
  } catch {
    throw new Error('原对话用量范围保存失败，本次未提交模型，请检查浏览器存储空间');
  }
}

export function recordAssistantChatUsage(modelId: string, usage: unknown, turnId: string): void {
  if (!turnId || modelId === 'direct-collection') return;
  const saved = readUsageContext(turnId);
  if (!saved) return;
  recordChatTokens({ modelId: modelId || saved.modelId, type: 'chat', usage, operationId: `assistant:${turnId}`, scope: saved.scope });
}

type ReceiptStorage = Pick<Storage, 'getItem' | 'setItem'>;
const receiptKey = (sessionId: string, messageId: string) =>
  `ai_assistant_turn_receipt:${encodeURIComponent(sessionId)}:${encodeURIComponent(messageId)}`;
function browserStorage(): ReceiptStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Only execution identities are saved when chat autosave is disabled. */
export function readAssistantTurnReceipt(sessionId: string, messageId: string, storage = browserStorage()): string | undefined {
  if (!storage) return undefined;
  try {
    const receipt = JSON.parse(storage.getItem(receiptKey(sessionId, messageId)) || 'null');
    if (receipt?.sessionId === sessionId && receipt?.messageId === messageId && typeof receipt?.turnId === 'string' && receipt.turnId.trim()) {
      return receipt.turnId;
    }
  } catch { /* An unreadable identity does not authorize another execution. */ }
  return undefined;
}

export function saveAssistantTurnReceipt(sessionId: string, messageId: string, turnId: string, storage = browserStorage()): void {
  if (!storage) throw new Error('原任务标识无法保存，本次未提交');
  try {
    storage.setItem(receiptKey(sessionId, messageId), JSON.stringify({ sessionId, messageId, turnId }));
  } catch {
    throw new Error('原任务标识无法保存，本次未提交');
  }
  if (readAssistantTurnReceipt(sessionId, messageId, storage) !== turnId) throw new Error('原任务标识尚未确认保存，本次未提交');
}

export async function submitPreparedAssistantTurn(
  turnId: string,
  persist: (id: string) => void | Promise<void>,
  submit: () => Promise<Response>,
  signal: AbortSignal,
): Promise<Response> {
  await persist(turnId);
  signal.throwIfAborted();
  return submit();
}

type RetryDecision = { kind: 'completed'; snapshot: AssistantTurn } | { kind: 'retry' } | { kind: 'blocked'; message: string };
export async function readAssistantRetryDecision(
  turnId: string | undefined,
  sessionId: string,
  request: (url: string) => Promise<Response>,
): Promise<RetryDecision> {
  if (!turnId) return { kind: 'blocked', message: '缺少原任务标识，无法核实执行结果，已阻止重复提交' };
  try {
    const response = await request(`/api/assistant/turns/${encodeURIComponent(turnId)}/snapshot`);
    const data = await response.json();
    const snapshot = data.snapshot as AssistantTurn | undefined;
    if (!response.ok || !data.success || !snapshot || snapshot.id !== turnId || snapshot.threadId !== sessionId || !Array.isArray(snapshot.items)) {
      throw new Error('无法核实');
    }
    recordAssistantChatUsage(snapshot.modelUsed || '', snapshot.usage, turnId);
    if (snapshot.status === 'completed') return { kind: 'completed', snapshot };
    if (['failed', 'cancelled', 'interrupted'].includes(snapshot.status)) return { kind: 'retry' };
    return { kind: 'blocked', message: '原任务尚未确认失败，请稍后再检查；为避免重复扣费，本次不会重新提交' };
  } catch {
    return { kind: 'blocked', message: '暂时无法核实原任务结果，已阻止重复提交，请恢复连接后再试' };
  }
}

export interface ActivityEntry {
  id: string; name: string; label: string; kind: 'tool' | 'agent';
  status: 'running' | 'done' | 'error' | 'interrupted' | 'declined' | 'cancelled';
  target?: string; summary?: string; args?: string; action?: Record<string, unknown>;
  startedAt?: number; endedAt?: number;
  images?: Array<{ url: string; label?: string }>;
}
export function activityTarget(args?: string): string {
  try {
    const value = JSON.parse(args || '{}');
    for (const key of ['query', 'keyword', 'document_name', 'filename', 'path', 'url', 'asset_id', 'skill_id', 'name']) {
      if (typeof value[key] === 'string') return value[key].replace(/\s+/g, ' ').slice(0, 160);
    }
  } catch { /* Arguments may still be streaming. */ }
  return '';
}
export function activityEntries(items: AssistantItem[], isSending: boolean, legacy: ToolActivityEntry[] = []): ActivityEntry[] {
  const results = new Map(items.filter((item): item is ToolResultItem => item.kind === 'toolResult').map(item => [item.id.replace(/__result$/, ''), item]));
  const entries: ActivityEntry[] = items.flatMap((item): ActivityEntry[] => {
    if (item.kind === 'toolCall') {
      const result = results.get(item.id) || results.get(item.callId);
      const state = result?.status || item.status;
      return [{ id: item.id, name: item.name, label: item.displayName || item.name, kind: 'tool',
        status: settleActivityStatus(state, isSending),
        target: activityTarget(item.args), summary: result?.summary || item.summary, args: item.args, action: result?.action,
        startedAt: item.createdAt, endedAt: result?.createdAt, images: result?.visualImages }];
    }
    if (item.kind === 'subAgent') return [{ id:item.id, name:item.skillId, label:'子智能体', kind:'agent', target:item.prompt,
      status: item.status === 'completed' ? 'done' : item.status === 'failed' ? 'error' : isSending ? 'running' : 'interrupted',
      summary:item.result, startedAt:item.createdAt }];
    return [];
  });
  // Item events are authoritative; legacy is a fallback, never a second copy.
  if (entries.length) return entries;
  return legacy.map((item, index) => ({ id:`legacy-${index}`, name:item.name, label:item.displayName || item.name, kind:'tool' as const,
    status: settleActivityStatus(item.status, isSending),
    summary:item.detail, action:item.action, images:item.visualImages }));
}
export function settleActivityStatus(status: string, isSending: boolean): ActivityEntry['status'] {
  if (status === 'running' && !isSending) return 'interrupted';
  if (status === 'done' || status === 'error' || status === 'declined' || status === 'cancelled' || status === 'running' || status === 'interrupted') return status;
  return 'error';
}
export function activityStateLabel(status: ActivityEntry['status']): string {
  if (status === 'running') return '进行中';
  if (status === 'error') return '失败';
  if (status === 'interrupted') return '已中断';
  if (status === 'declined') return '已拒绝';
  if (status === 'cancelled') return '已取消';
  return '已完成';
}
export function executionFailed(entries: Array<{ status: string }>, taskStatus?: string): boolean {
  return entries.some(entry => entry.status === 'error') || taskStatus === 'failed';
}
export function executionSettledLabel(entries: Array<{ status: string }>, taskStatus?: string): string {
  const completed = entries.filter(entry => entry.status === 'done').length;
  const skipped = entries.filter(entry => entry.status === 'declined' || entry.status === 'cancelled').length;
  if (executionFailed(entries, taskStatus)) return `${completed ? `已完成 ${completed} 个操作，` : ''}有步骤失败`;
  if (entries.some(entry => entry.status === 'interrupted') || taskStatus === 'cancelled') return '执行已中断';
  if (skipped && !completed) return '已跳过';
  if (skipped) return `已完成 ${completed} 个操作，已跳过 ${skipped} 个`;
  if (entries.length) return `已完成 ${completed} 个操作`;
  return '已思考';
}
/** One line above a later answer, so a skipped or failed step cannot look like that answer succeeded. */
export function answerVerdicts(items: AssistantItem[]): string[] {
  if (!items.some(item => item.kind === 'agentMessage' && item.content.trim())) return [];
  const results = new Map(items.filter((item): item is ToolResultItem => item.kind === 'toolResult').map(item => [item.id.replace(/__result$/, ''), item]));
  const lines: string[] = [];
  for (const item of items) {
    if (item.kind !== 'toolCall') continue;
    const result = results.get(item.id) || results.get(item.callId);
    const state = result?.status || item.status;
    const name = item.displayName || item.name;
    if (state === 'declined' || state === 'cancelled') lines.push(`未执行${name}。下面是直接回答，不是该工具的结果。`);
    else if (state === 'error') lines.push(`${name}没有完成。下面的内容不能当作该步骤已成功。`);
  }
  return lines;
}
export function formatActivityDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60 ? `${seconds % 60}秒` : ''}`;
}
export function activityStage(message?: string): string {
  if (!message || /请求模型|等待首段|连接|准备回应|读取当前工作区|已整理当前上下文/.test(message)) return '思考中…';
  if (/压缩|较早对话整理/.test(message)) return '正在整理上下文…';
  return message;
}
/** Keep narrative and approvals in order; pair late results without moving prose. */
export function groupTurnItems(items: AssistantItem[]) {
  const groups: Array<{ kind:'activity'; id:string; items:AssistantItem[] } | { kind:'item'; id:string; item:AssistantItem }> = [];
  for (const item of items) {
    if (item.kind === 'toolResult' || ((item.kind === 'agentMessage' || item.kind === 'userMessage' || item.kind === 'agentReasoning') && !item.content.trim())) continue;
    if (['toolCall', 'subAgent', 'agentReasoning'].includes(item.kind)) {
      const previous = groups.at(-1);
      if (previous?.kind === 'activity') previous.items.push(item);
      else groups.push({ kind:'activity', id:item.id, items:[item] });
    } else groups.push({ kind:'item', id:item.id, item });
  }
  const results = items.filter(item => item.kind === 'toolResult');
  for (const group of groups) if (group.kind === 'activity') {
    const ids = new Set(group.items.filter(item => item.kind === 'toolCall').flatMap(item => [item.id, item.callId]));
    group.items.push(...results.filter(item => ids.has(item.id.replace(/__result$/, ''))));
  }
  return groups;
}
