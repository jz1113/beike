import type {
  TurnStreamState,
  PendingApproval,
  ToolActivityEntry,
} from '@/features/assistant/utils/assistantTurnTypes';
import type {
  AssistantItem,
  ToolCallItem,
  ToolResultItem,
  ApprovalRequestItem,
  AgentMessageItem,
  AgentReasoningItem,
  UserMessageItem,
  SubAgentItem,
} from '@beike/domain/assistant/types';

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

/** Apply an item-lifecycle event to the in-memory item list and return the resulting AssistantItem[] */
export function applyItemEvent(
  items: AssistantItem[],
  evt: { type: string; [k: string]: any },
): AssistantItem[] {
  const next = [...items];
  const findById = (id: string) => next.findIndex((x) => x.id === id);
  const baseTime = Date.now();

  switch (evt.type) {
    case 'item/started': {
      const { itemId, kind, meta } = evt;
      if (findById(itemId) >= 0) return items;
      const item = makeEmptyItem(kind, itemId, baseTime, meta);
      next.push(item);
      return next;
    }
    case 'item/completed': {
      const { itemId, status } = evt;
      const idx = findById(itemId);
      if (idx < 0) return items;
      const existing = next[idx];
      if (existing.kind === 'toolCall') {
        next[idx] = { ...existing, status: (status === 'done' ? 'done' : status === 'cancelled' ? 'running' : 'error') as ToolCallItem['status'] };
      }
      return next;
    }
    case 'item/agentMessage/delta': {
      const { itemId, delta } = evt;
      const idx = findById(itemId);
      if (idx < 0) return items;
      const existing = next[idx];
      if (existing.kind === 'agentMessage') {
        next[idx] = { ...existing, content: (existing as AgentMessageItem).content + delta };
      }
      return next;
    }
    case 'item/agentReasoning/delta': {
      const { itemId, delta } = evt;
      const idx = findById(itemId);
      if (idx < 0) return items;
      const existing = next[idx];
      if (existing.kind === 'agentReasoning') {
        next[idx] = { ...existing, content: (existing as AgentReasoningItem).content + delta };
      }
      return next;
    }
    case 'item/agentMessage/completed': {
      const { itemId, content } = evt;
      const idx = findById(itemId);
      if (idx < 0) return items;
      const existing = next[idx];
      if (existing.kind === 'agentMessage') {
        next[idx] = { ...existing, content } as AgentMessageItem;
      }
      return next;
    }
    case 'item/agentReasoning/completed': {
      const { itemId, content } = evt;
      const idx = findById(itemId);
      if (idx < 0) return items;
      const existing = next[idx];
      if (existing.kind === 'agentReasoning') {
        next[idx] = { ...existing, content } as AgentReasoningItem;
      }
      return next;
    }
    case 'item/toolCall/started': {
      const { itemId, name, displayName, args } = evt;
      const idx = findById(itemId);
      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          kind: 'toolCall',
          name,
          displayName: displayName || name,
          args: args || '{}',
          callId: itemId,
          status: 'running',
        } as ToolCallItem;
      }
      return next;
    }
    case 'item/toolCall/delta': {
      const { itemId, argsDelta } = evt;
      const idx = findById(itemId);
      if (idx < 0) return items;
      const existing = next[idx];
      if (existing.kind === 'toolCall') {
        next[idx] = { ...existing, args: (existing as ToolCallItem).args + argsDelta } as ToolCallItem;
      }
      return next;
    }
    case 'item/toolCall/completed': {
      const { itemId, name, displayName, status, summary, action } = evt;
      const idx = findById(itemId);
      if (idx < 0) return items;
      // Find or create a toolResult pair item
      const resultId = `${itemId}__result`;
      const toolResultItem: ToolResultItem = {
        id: resultId,
        kind: 'toolResult',
        createdAt: Date.now(),
        name,
        displayName: displayName || name,
        status: status === 'done' ? 'done' : 'error',
        summary: summary || '',
        ...(action ? { action } : {}),
      };
      // Replace toolCall item with final status
      next[idx] = {
        ...next[idx],
        kind: 'toolCall',
        status: status === 'done' ? 'done' : 'error',
      } as ToolCallItem;
      // Add (or replace) toolResult after it
      const existingResultIdx = next.findIndex((x) => x.id === resultId);
      if (existingResultIdx >= 0) {
        next[existingResultIdx] = toolResultItem;
      } else {
        next.push(toolResultItem);
      }
      return next;
    }
    case 'item/approval/request': {
      const { approvalId, toolName, displayName, args } = evt;
      const id = `appr_${approvalId}`;
      if (findById(id) >= 0) return items;
      const item: ApprovalRequestItem = {
        id,
        kind: 'approvalRequest',
        createdAt: Date.now(),
        approvalId,
        toolName,
        displayName: displayName || toolName,
        args: args || {},
        status: 'pending',
      };
      next.push(item);
      return next;
    }
    case 'item/approval/resolved': {
      const { approvalId, decision } = evt;
      const id = `appr_${approvalId}`;
      const idx = findById(id);
      if (idx < 0) return items;
      const existing = next[idx];
      if (existing.kind === 'approvalRequest') {
        next[idx] = {
          ...existing,
          status:
            decision === 'accept'
              ? 'accepted'
              : decision === 'decline'
                ? 'declined'
                : decision === 'cancel'
                  ? 'expired'
                  : 'accepted',
          decision,
        } as ApprovalRequestItem;
      }
      return next;
    }
    default:
      return items;
  }
}

export function makeEmptyItem(
  kind: string,
  id: string,
  ts: number,
  meta?: Record<string, unknown>,
): AssistantItem {
  const base = { id, createdAt: ts };
  switch (kind) {
    case 'agentMessage':
      return { ...base, kind: 'agentMessage', content: '' } as AgentMessageItem;
    case 'agentReasoning':
      return { ...base, kind: 'agentReasoning', content: '' } as AgentReasoningItem;
    case 'userMessage':
      return { ...base, kind: 'userMessage', content: '' } as UserMessageItem;
    case 'toolResult':
      return { ...base, kind: 'toolResult', name: '', displayName: '', status: 'done', summary: '' } as ToolResultItem;
    case 'toolCall':
      return {
        ...base,
        kind: 'toolCall',
        name: '',
        displayName: '',
        args: '{}',
        callId: id,
        status: 'running',
      } as ToolCallItem;
    case 'subAgent':
      return {
        ...base,
        kind: 'subAgent',
        skillId: String(meta?.skillId || ''),
        prompt: String(meta?.prompt || ''),
        status: 'spawning',
      } as SubAgentItem;
    default:
      return { ...base, kind: 'userMessage', content: '' } as UserMessageItem;
  }
}

/**
 * 从 item[] 派生 legacy TurnStreamState 字段。
 * 这层 adapter 让旧的 UI（AssistantMessageList + TurnTimeline + ApprovalCard）继续可用，
 * 同时新 UI（AssistantTurnList）直接消费 items[]。
 */
export function deriveLegacyState(items: AssistantItem[]): Pick<TurnStreamState, 'content' | 'thinking' | 'toolActivity' | 'pendingApprovals'> {
  let content = '';
  let thinking = '';
  const toolActivity: ToolActivityEntry[] = [];
  const pendingApprovals: PendingApproval[] = [];

  // 多 agentMessage：保留最后一段（与 ChatGPT 流式惯例一致）
  for (const item of items) {
    if (item.kind === 'agentMessage') {
      content = (item as AgentMessageItem).content || '';
    } else if (item.kind === 'agentReasoning') {
      thinking = (item as AgentReasoningItem).content || '';
    } else if (item.kind === 'toolCall') {
      const tc = item as ToolCallItem;
      toolActivity.push({
        name: tc.name,
        displayName: tc.displayName || tc.name,
        status: (tc.status === 'done' ? 'done' : tc.status === 'error' ? 'error' : 'running'),
        detail: tc.args ? tc.args.slice(0, 120) : undefined,
      });
    } else if (item.kind === 'toolResult') {
      const tr = item as ToolResultItem;
      const idx = toolActivity.findIndex((t) => t.name === tr.name && t.status === 'running');
      const entry: ToolActivityEntry = {
        name: tr.name,
        displayName: tr.displayName || tr.name,
        status: tr.status === 'done' ? 'done' : 'error',
        detail: tr.summary,
        action: tr.action,
      };
      if (idx >= 0) toolActivity[idx] = entry;
      else toolActivity.push(entry);
    } else if (item.kind === 'approvalRequest') {
      const ap = item as ApprovalRequestItem;
      if (ap.status === 'pending') {
        pendingApprovals.push({
          turnId: '', // 由 hook 注入
          approvalId: ap.approvalId,
          toolName: ap.toolName,
          displayName: ap.displayName,
          args: ap.args,
        });
      }
    }
  }

  return { content, thinking, toolActivity, pendingApprovals };
}
