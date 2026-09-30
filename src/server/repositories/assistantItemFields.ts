import type { AssistantItem } from '@shared/domain/assistant/types';
/** 提取 AssistantItem 的可存储字段 */
export function extractItemFields(item: AssistantItem): {
  kind: string;
  status: string;
  content: string;
  reasoning: string;
  toolName: string | null;
  displayName: string | null;
  argsJson: string;
  summary: string | null;
  actionJson: string | null;
  visualImagesJson: string | null;
  metaJson: string;
} {
  const base = {
    kind: item.kind,
    status: 'done',
    content: '',
    reasoning: '',
    toolName: null as string | null,
    displayName: null as string | null,
    argsJson: '{}',
    summary: null as string | null,
    actionJson: null as string | null,
    visualImagesJson: null as string | null,
    metaJson: '{}',
  };

  switch (item.kind) {
    case 'agentMessage':
      return { ...base, kind: 'agentMessage', content: (item as { content: string }).content || '' };
    case 'agentReasoning':
      return { ...base, kind: 'agentReasoning', reasoning: (item as { content: string }).content || '' };
    case 'toolCall': {
      const tc = item as { name: string; displayName?: string; args?: string; callId?: string };
      return {
        ...base,
        kind: 'toolCall',
        toolName: tc.name,
        displayName: tc.displayName || tc.name,
        argsJson: tc.args || '{}',
        metaJson: JSON.stringify({ callId: tc.callId }),
        status: (item as { status: string }).status === 'done' ? 'done' : (item as { status: string }).status === 'error' ? 'error' : 'running',
      };
    }
    case 'toolResult': {
      const tr = item as { name: string; displayName?: string; summary?: string; action?: Record<string, unknown>; visualImages?: Array<{ url: string; label?: string }> };
      return {
        ...base,
        kind: 'toolResult',
        toolName: tr.name,
        displayName: tr.displayName || tr.name,
        summary: tr.summary || '',
        actionJson: tr.action ? JSON.stringify(tr.action) : null,
        visualImagesJson: tr.visualImages?.length ? JSON.stringify(tr.visualImages) : null,
        status: (item as { status: string }).status === 'done' ? 'done' : 'error',
      };
    }
    case 'approvalRequest': {
      const ar = item as Extract<AssistantItem, { kind: 'approvalRequest' }>;
      const approvalStatus =
        ar.status === 'accepted' ? 'done'
        : ar.status === 'declined' ? 'error'
        : ar.status === 'expired' ? 'cancelled'
        : 'running';
      return {
        ...base,
        kind: 'approvalRequest',
        toolName: ar.toolName,
        displayName: ar.displayName || ar.toolName,
        argsJson: JSON.stringify(ar.args || {}),
        metaJson: JSON.stringify({ approvalId: ar.approvalId, decision: ar.decision }),
        status: approvalStatus,
      };
    }
    case 'subAgent': {
      const sub = item as Extract<AssistantItem, { kind: 'subAgent' }>;
      return { ...base, kind: 'subAgent', content: sub.result || '',
        status: sub.status === 'completed' ? 'done' : sub.status === 'failed' ? 'error' : 'running',
        metaJson: JSON.stringify({ skillId: sub.skillId, prompt: sub.prompt, status: sub.status, result: sub.result, subTurnId: sub.subTurnId }) };
    }
    default:
      return { ...base, kind: 'userMessage', content: (item as { content: string }).content || '' };
  }
}

