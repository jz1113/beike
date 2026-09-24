import type { AssistantTaskState } from './taskPolicy';
/** Codex-inspired Thread / Turn / Item model for the AI assistant. */

export type TurnStatus =
  | 'running'
  | 'completed'
  | 'interrupted'
  | 'awaiting_approval'
  | 'failed';

export type ItemKind =
  | 'userMessage'
  | 'agentReasoning'
  | 'agentMessage'
  | 'toolCall'
  | 'toolResult'
  | 'approvalRequest'
  | 'subAgent';

export type ToolScope = 'server' | 'client';
export type ToolApprovalPolicy = 'none' | 'per_turn' | 'per_session';

export type ApprovalDecision = 'accept' | 'decline' | 'acceptForSession' | 'cancel';

export interface AssistantThread {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantItemBase {
  id: string;
  kind: ItemKind;
  createdAt: number;
}

export interface UserMessageItem extends AssistantItemBase {
  kind: 'userMessage';
  content: string;
}

export interface AgentReasoningItem extends AssistantItemBase {
  kind: 'agentReasoning';
  content: string;
  collapsed?: boolean;
}

export interface AgentMessageItem extends AssistantItemBase {
  kind: 'agentMessage';
  content: string;
}

export interface ToolCallItem extends AssistantItemBase {
  kind: 'toolCall';
  name: string;
  displayName: string;
  args: string;
  status: 'running' | 'done' | 'error';
  callId: string;
}

export interface ToolResultItem extends AssistantItemBase {
  kind: 'toolResult';
  name: string;
  displayName: string;
  status: 'done' | 'error';
  summary: string;
  /** Structured payload for client-side actions */
  action?: Record<string, unknown>;
}

export interface ApprovalRequestItem extends AssistantItemBase {
  kind: 'approvalRequest';
  approvalId: string;
  toolName: string;
  displayName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  decision?: ApprovalDecision;
}

export interface SubAgentItem extends AssistantItemBase {
  kind: 'subAgent';
  skillId: string;
  prompt: string;
  status: 'spawning' | 'running' | 'completed' | 'failed';
  result?: string;
  subTurnId?: string;
}

export type AssistantItem =
  | UserMessageItem
  | AgentReasoningItem
  | AgentMessageItem
  | ToolCallItem
  | ToolResultItem
  | ApprovalRequestItem
  | SubAgentItem;

export interface AssistantTurn {
  task?: AssistantTaskState;
  id: string;
  threadId: string;
  status: TurnStatus;
  items: AssistantItem[];
  usage?: { inputTokens: number; outputTokens: number };
  modelUsed?: string;
}

export interface ClientContext {
  currentView?: string;
  workshopStep?: number;
  productTitle?: string;
  productItemId?: string;
  selectedArchId?: string;
  workshopMode?: string;
  assetLibraryTab?: string;
  assetLibraryKeyword?: string;
  /** 发送时采样的当前工作区概要；只用于对话上下文。 */
  workspaceSnapshot?: {
    workspaceType?: 'canvas' | 'workshop' | 'generate' | 'assets' | 'home' | 'other';
    title?: string;
    summary?: string;
    nodeCount?: number;
    nodeTypes?: Record<string, number>;
    nodes?: Array<{ type: string; title?: string; role?: string; status?: string }>;
    production?: { aspect?: string; shotCount?: number };
  };
}

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  enabled?: boolean;
}

export interface TurnStartOptions {
  threadId?: string;
  turnId?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: Array<{
      type: 'image' | 'video' | 'document';
      url?: string;
      name?: string;
      extractedText?: string;
    }>;
  }>;
  model?: string;
  historyLimit?: number;
  systemPrompt?: string;
  skillId?: string;
  allowedTools?: string[];
  enableAgentTools?: boolean;
  fallbackModels?: string[];
  language?: string;
  clientContext?: ClientContext;
  mcpServers?: McpServerConfig[];
  /** Session-scoped auto-approved tools */
  sessionApprovals?: string[];
}
