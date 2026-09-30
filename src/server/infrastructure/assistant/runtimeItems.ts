import type { AssistantItem, ItemKind } from '@shared/domain/assistant/types';

interface RuntimeItemState {
  id: string;
  kind: ItemKind;
  status: 'running' | 'done' | 'error' | 'cancelled';
  startedAt: number;
  payload: Record<string, unknown>;
}

/** Persist the same reply, tool result and approval data that the live stream displays. */
export function materializeRuntimeItems(it: RuntimeItemState): AssistantItem[] {
  const base = { id: it.id, createdAt: it.startedAt };
  const payload = it.payload;
  switch (it.kind) {
    case 'agentMessage': case 'agentReasoning': case 'userMessage':
      return [{ ...base, kind: it.kind, content: String(payload.content || '') }];
    case 'toolCall': {
      const name = String(payload.name || '');
      const displayName = String(payload.displayName || name);
      const status = it.status === 'done' ? 'done' : it.status === 'running' ? 'running' : 'error';
      const call: AssistantItem = { ...base, kind: 'toolCall', name, displayName, args: String(payload.args ?? '{}'), callId: String(payload.callId || it.id), status };
      if (it.status === 'running') return [call];
      return [call, { ...base, id: `${it.id}__result`, kind: 'toolResult', name, displayName,
        status: status === 'done' ? 'done' : 'error', summary: String(payload.summary || ''),
        action: payload.action as Record<string, unknown> | undefined,
        visualImages: payload.visualImages as Array<{ url: string; label?: string }> | undefined,
      }];
    }
    case 'toolResult':
      return [{ ...base, kind: 'toolResult', name: String(payload.name || ''), displayName: String(payload.displayName || payload.name || ''),
        status: it.status === 'done' ? 'done' : 'error', summary: String(payload.summary || ''),
        action: payload.action as Record<string, unknown> | undefined,
        visualImages: payload.visualImages as Array<{ url: string; label?: string }> | undefined,
      }];
    case 'approvalRequest':
      return [{ ...base, kind: 'approvalRequest', approvalId: String(payload.approvalId || ''), toolName: String(payload.toolName || ''),
        displayName: String(payload.displayName || payload.toolName || ''), args: (payload.args as Record<string, unknown>) || {},
        status: it.status === 'done' ? 'accepted' : it.status === 'cancelled' ? 'expired' : it.status === 'error' ? 'declined' : 'pending',
        decision: payload.decision as 'accept' | 'decline' | 'acceptForSession' | 'cancel' | undefined,
      }];
    case 'subAgent':
      return [{ ...base, kind: 'subAgent', skillId: String(payload.skillId || ''), prompt: String(payload.prompt || ''),
        status: it.status === 'done' ? 'completed' : it.status === 'running' ? 'running' : 'failed',
        result: typeof payload.result === 'string' ? payload.result : undefined,
        subTurnId: typeof payload.subTurnId === 'string' ? payload.subTurnId : undefined,
      }];
  }
}
