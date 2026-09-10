import type { AssistantTaskState } from './taskPolicy';
/** Codex-style SSE event types for assistant turns. */

/** Codex-style SSE event types for assistant turns. */
import type { ApprovalDecision, AssistantTurn } from './types';

/** Legacy events (backward compatible) */
export type LegacySSEEvent =
  | { type: 'task'; task: AssistantTaskState }
  | { type: 'status'; phase: string; message: string }
  | { type: 'meta'; modelUsed?: string; modelSwitched?: boolean; requestedModel?: string; productWidget?: unknown }
  | { type: 'delta'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; name: string; displayName: string; status: string; detail?: string }
  | {
      type: 'tool_result';
      name: string;
      displayName: string;
      status: string;
      detail?: string;
      action?: Record<string, unknown>;
      visualImages?: Array<{ url: string; label?: string }>;
    }
  | {
      type: 'tool_visual_inspection';
      turnId?: string;
      toolName: string;
      displayName: string;
      images: Array<{ url: string; label?: string }>;
      message: string;
    }
  | { type: 'usage'; usage: Record<string, unknown> }
  | { type: 'done' }
  | { type: 'error'; error: string }
  | { type: 'ping' };

/** Codex-inspired turn events */
export type TurnSSEEvent =
  | { type: 'turn/started'; turnId: string; threadId: string; model?: string }
  | { type: 'turn/completed'; turnId: string; usage?: { inputTokens: number; outputTokens: number } }
  | { type: 'turn/interrupted'; turnId: string }
  | { type: 'turn/snapshot'; turnId: string; threadId: string; snapshot: AssistantTurn }
  | { type: 'item/started'; turnId: string; itemId: string; kind: string; meta?: Record<string, unknown> }
  | {
      type: 'item/completed';
      turnId: string;
      itemId: string;
      kind: string;
      status?: 'done' | 'error' | 'cancelled';
      meta?: Record<string, unknown>;
    }
  | { type: 'item/agentMessage/started'; turnId: string; itemId: string }
  | { type: 'item/agentMessage/delta'; turnId: string; itemId: string; delta: string }
  | { type: 'item/agentMessage/completed'; turnId: string; itemId: string; content: string }
  | { type: 'item/agentReasoning/started'; turnId: string; itemId: string }
  | { type: 'item/agentReasoning/delta'; turnId: string; itemId: string; delta: string }
  | { type: 'item/agentReasoning/completed'; turnId: string; itemId: string; content: string }
  | {
      type: 'item/toolCall/started';
      turnId: string;
      itemId: string;
      name: string;
      displayName: string;
      args: string;
    }
  | {
      type: 'item/toolCall/delta';
      turnId: string;
      itemId: string;
      /** Partial JSON arguments accumulated so far */
      argsDelta: string;
    }
  | {
      type: 'item/toolCall/completed';
      turnId: string;
      itemId: string;
      name: string;
      displayName: string;
      status: 'done' | 'error';
      summary: string;
      action?: Record<string, unknown>;
      visualImages?: Array<{ url: string; label?: string }>;
    }
  | {
      type: 'item/approval/request';
      turnId: string;
      approvalId: string;
      toolName: string;
      displayName: string;
      args: Record<string, unknown>;
    }
  | { type: 'item/approval/resolved'; turnId: string; approvalId: string; decision: ApprovalDecision };

/** Agent-level "snapshot" — full turn state at a moment in time.
 *  Optional; sent for clients that want to reconstruct the whole UI from one event
 *  rather than incremental deltas (e.g., session resume / reconnection). */
export interface TurnSnapshotPayload {
  turnId: string;
  threadId: string;
  status: 'running' | 'completed' | 'interrupted' | 'failed' | 'awaiting_approval';
  items: Array<{
    id: string;
    kind: string;
    status: 'running' | 'done' | 'error' | 'cancelled';
    startedAt: number;
    completedAt?: number;
    payload: Record<string, unknown>;
  }>;
  pendingApprovals: Array<{
    approvalId: string;
    toolName: string;
    displayName: string;
    args: Record<string, unknown>;
  }>;
  usage?: { inputTokens: number; outputTokens: number };
  modelUsed?: string;
}

export type AssistantSSEEvent = LegacySSEEvent | TurnSSEEvent;

export interface TurnApproveBody {
  turnId: string;
  approvalId: string;
  decision: ApprovalDecision;
}

export interface TurnInterruptBody {
  turnId: string;
}

export function isTurnEvent(evt: AssistantSSEEvent): evt is TurnSSEEvent {
  return typeof evt.type === 'string' && (evt.type.startsWith('turn/') || evt.type.startsWith('item/'));
}

/** True when event is a specific item-lifecycle signal (started / delta / completed). */
export function isItemLifecycleEvent(
  evt: AssistantSSEEvent,
): evt is Extract<TurnSSEEvent, { type: `item/${string}` }> {
  return typeof evt.type === 'string' && evt.type.startsWith('item/');
}
