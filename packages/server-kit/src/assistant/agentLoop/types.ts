import type { ApprovalDecision, McpServerConfig, AssistantItem } from '@beike/domain/assistant/types';
import type { AssistantSSEEvent } from '@beike/domain/assistant/events';
import type { ToolExecContext } from '../toolRegistry';
import type { AgentRuntime } from '../agentRuntime';

export interface ApprovalWaiter {
  waitForApproval(
    turnId: string,
    approvalId: string,
    toolName: string,
    displayName: string,
    args: Record<string, unknown>,
    send: (evt: AssistantSSEEvent) => void,
    signal?: AbortSignal,
  ): Promise<ApprovalDecision>;
}

export interface AgentLoopOptions {
  runtime?: AgentRuntime;
  messages: unknown[];
  modelsToTry: string[];
  baseUrl: string;
  apiKey: string;
  toolCtx: ToolExecContext;
  send: (evt: AssistantSSEEvent) => void;
  signal?: AbortSignal;
  enableAgentTools?: boolean;
  allowedTools?: string[];
  turnId: string;
  threadId: string;
  approvalWaiter?: ApprovalWaiter;
  sessionApprovals?: Set<string>;
  mcpServers?: McpServerConfig[];
  executableToolNames?: string[];
  readToolCache?: Map<string, Promise<string>>;
  onItemEvent?: (item: AssistantItem) => void;
}

export interface AgentLoopResult {
  modelUsed: string;
  productWidget?: unknown;
  toolsWereUsed: boolean;
  finalMessages: unknown[];
  textStreamed: boolean;
  runtime: AgentRuntime;
}

export interface ToolCallTask {
  index: number;
  call: { id: string; name: string; arguments: string };
  toolItemId: string;
  argsParsed: Record<string, unknown>;
  parallel: boolean;
}

export interface ToolTaskResult {
  index: number;
  call: ToolCallTask['call'];
  toolItemId: string;
  result: string;
  visualImages: Array<{ url: string; label?: string }>;
  declined: boolean;
}
