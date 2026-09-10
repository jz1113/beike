import type { AssistantTaskState } from '@beike/domain/assistant/taskPolicy';
import type { ProductWidgetData } from '@/types/app-store';

export type ApprovalDecision = 'accept' | 'decline' | 'acceptForSession' | 'cancel';

export interface PendingApproval {
  turnId: string;
  approvalId: string;
  toolName: string;
  displayName: string;
  args: Record<string, unknown>;
}

export interface ToolActivityEntry {
  name: string;
  displayName: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
  action?: Record<string, unknown>;
  visualImages?: Array<{ url: string; label?: string }>;
}

export interface TurnStreamState {
  task?: AssistantTaskState;
  content: string;
  thinking: string;
  modelUsed: string;
  productWidget?: ProductWidgetData;
  toolActivity: ToolActivityEntry[];
  pendingApprovals: PendingApproval[];
  streamingStatus?: string;
  sessionApprovals: string[];
}

export const ASSISTANT_SHOW_THINKING_KEY = 'assistant_show_thinking';

export function getShowThinkingPreference(): boolean {
  try {
    const v = localStorage.getItem(ASSISTANT_SHOW_THINKING_KEY);
    return v !== 'false';
  } catch {
    return true;
  }
}

export function setShowThinkingPreference(show: boolean) {
  try {
    localStorage.setItem(ASSISTANT_SHOW_THINKING_KEY, show ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}
