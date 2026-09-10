/**
 * Sub-Agent runtime helpers
 *
 * 让父 AgentLoop 可以在工具调用阶段通过 spawn_subagent 工具派生子代理。
 * 子代理保留独立 AgentRuntime、独立 threadId（共享外层）、独立 SSE 通道。
 *
 * 主要导出:
 *   - isSpawnSubagentToolCall(tc)
 *   - runSubAgent(spec, deps)          // 与 agentLoop.ts 调用约定一致
 *   - checkSubAgentQuota(existing)    // 数量限制检查
 */

import { AgentRuntime } from './agentRuntime';
import type {
  AssistantItem,
  AssistantSSEEvent,
  McpServerConfig,
} from './types';
import type { ApprovalWaiter } from './agentLoop';
import { type ToolExecContext } from './toolRegistry';
import '../asyncPool';
import { runAgentLoop } from './agentLoop';

const MAX_SUBAGENT_PER_PARENT = 5;
const MAX_SUBAGENT_ITEMS = 50;

export interface SubAgentSpec {
  skillId: string;
  prompt: string;
  parentTurnId: string;
  parentToolCallId?: string;
}

export interface SubAgentResult {
  skillId: string;
  subTurnId: string;
  success: boolean;
  summary: string;
  items: AssistantItem[];
  error?: string;
}

export interface SubAgentDeps {
  baseUrl: string;
  apiKey: string;
  toolCtx: ToolExecContext;
  send: (evt: AssistantSSEEvent) => void;
  signal?: AbortSignal;
  allowedTools?: string[];
  mcpServers?: McpServerConfig[];
  approvalWaiter?: ApprovalWaiter;
  sessionApprovals?: Set<string>;
  onItemEvent?: (item: AssistantItem) => void;
}

const SUBAGENT_SYSTEM_HINT = (skillId: string) =>
  `【子代理 · ${skillId}】你是一个专注于单次任务的子代理。独立上下文、独立工具子集，结果汇总回父代理。不要主动与用户对话。`;

/** 数量限制检查（与 agentLoop.ts 中的调用约定一致） */
export function checkSubAgentQuota(existing: AssistantItem[]): { ok: boolean; limit: number } {
  const count = existing.filter((it) => it.kind === 'subAgent').length;
  if (count >= MAX_SUBAGENT_PER_PARENT) {
    return { ok: false, limit: MAX_SUBAGENT_PER_PARENT };
  }
  return { ok: true, limit: MAX_SUBAGENT_PER_PARENT };
}

function isSpawnSubagentToolCall_(call: { name?: string }): boolean {
  return call?.name === 'spawn_subagent';
}

export { isSpawnSubagentToolCall_ as isSpawnSubagentToolCall };

function buildSubAgentSystemPrompt(spec: SubAgentSpec): string {
  return [
    SUBAGENT_SYSTEM_HINT(spec.skillId),
    `【任务】${spec.prompt}`,
    `【回答格式】先用一段精炼总结，再调用必要的工具；最终通过 final_reply 段返回聚合结果。`,
  ].join('\n\n');
}

/**
 * runSubAgent — 与 agentLoop.ts 调用约定一致。
 *
 * 用法：agentLoop.ts 捕获 spawn_subagent 工具调用后，传入 spec + deps。
 * 返回 { success, subTurnId, summary, items, error }。
 */
export async function runSubAgent(opts: {
  parentRuntime?: AgentRuntime;
  parentTurnId: string;
  threadId: string;
  spec: SubAgentSpec;
  skillRegistry?: unknown[];
  baseUrl: string;
  apiKey: string;
  toolCtx: ToolExecContext;
  mcpServers?: McpServerConfig[];
  signal?: AbortSignal;
  allowedTools?: string[];
  approvalWaiter?: ApprovalWaiter;
  sessionApprovals?: Set<string>;
  onItemEvent?: (item: AssistantItem) => void;
}): Promise<SubAgentResult> {
  const { parentTurnId, threadId, spec, baseUrl, apiKey, toolCtx, mcpServers, signal, allowedTools, approvalWaiter, sessionApprovals, onItemEvent } = opts;
  const subTurnId = `sub_${parentTurnId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const subMessages = [
    { role: 'system', content: buildSubAgentSystemPrompt(spec) },
    { role: 'user', content: spec.prompt },
  ];

  const send = (_evt: AssistantSSEEvent) => {
    // 子代理的 SSE 事件直接丢弃（父 runtime 用父 send）
    // 子代理结果通过 return value 传回
  };

  try {
    const loopResult = await runAgentLoop({
      messages: subMessages,
      modelsToTry: ['gemini-3.7-flash'],
      baseUrl,
      apiKey,
      toolCtx,
      send,
      signal,
      enableAgentTools: true,
      allowedTools,
      turnId: subTurnId,
      threadId,
      approvalWaiter,
      sessionApprovals: sessionApprovals || new Set(),
      mcpServers,
      onItemEvent,
    });

    const items = loopResult.runtime.listItems();
    const agentItems = items.filter((it) => it.kind === 'agentMessage') as Array<{ content: string }>;
    const lastMsg = agentItems[agentItems.length - 1];
    const summary = lastMsg?.content?.slice(0, 300) || '子代理已完成';

    return {
      success: true,
      skillId: spec.skillId,
      subTurnId,
      summary,
      items: items.slice(0, MAX_SUBAGENT_ITEMS),
    };
  } catch (err: unknown) {
    return {
      success: false,
      skillId: spec.skillId,
      subTurnId,
      summary: '子代理执行失败',
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const SUB_AGENT_LIMITS = {
  MAX_SUBAGENT_PER_PARENT,
  MAX_SUBAGENT_ITEMS,
} as const;
