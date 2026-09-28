import type { AssistantItem, ToolResultItem } from '@shared/domain/assistant/types';
import type { ToolActivityEntry } from './assistantTurnTypes';

export interface ActivityEntry {
  id: string; name: string; label: string; kind: 'tool' | 'agent';
  status: 'running' | 'done' | 'error' | 'interrupted';
  target?: string; summary?: string; args?: string; action?: Record<string, unknown>;
  startedAt?: number; endedAt?: number;
  images?: Array<{ url: string; label?: string }>;
}
export function activityTarget(args?: string): string {
  try {
    const value = JSON.parse(args || '{}');
    for (const key of ['query', 'keyword', 'document_name', 'filename', 'path', 'url', 'asset_id']) {
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
        status: state === 'running' && !isSending ? 'interrupted' : state,
        target: activityTarget(item.args), summary: result?.summary, args: item.args, action: result?.action,
        startedAt: item.createdAt, endedAt: result?.createdAt }];
    }
    if (item.kind === 'subAgent') return [{ id:item.id, name:item.skillId, label:'子智能体', kind:'agent', target:item.prompt,
      status: item.status === 'completed' ? 'done' : item.status === 'failed' ? 'error' : isSending ? 'running' : 'interrupted',
      summary:item.result, startedAt:item.createdAt }];
    return [];
  });
  // Item events are authoritative; legacy is a fallback, never a second copy.
  if (entries.length) return entries;
  return legacy.map((item, index) => ({ id:`legacy-${index}`, name:item.name, label:item.displayName || item.name, kind:'tool',
    status:item.status === 'running' && !isSending ? 'interrupted' : item.status,
    summary:item.detail, action:item.action, images:item.visualImages }));
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
