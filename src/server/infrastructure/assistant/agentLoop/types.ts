import type { TaskPlan } from './taskPlan';
import type { ToolResultStore } from '../toolResultStore';
import type { AgentExecutionBudget } from '../executionBudget';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import type { ApprovalDecision, McpServerConfig, AssistantItem } from '@shared/domain/assistant/types';
import type { AssistantSSEEvent } from '@shared/domain/assistant/events';
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
  runNestedLoop?: (options: AgentLoopOptions) => Promise<AgentLoopResult>;
  plan?: TaskPlan;
  budget?: AgentExecutionBudget;
  resultStore?: ToolResultStore;
  maxRounds?: number;
  messages: unknown[];
  modelsToTry: string[];
  reasoningEffort?: ReasoningEffort;
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
  stopReason?: string;
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
