import { CLEAN_CHAT_SYSTEM_PROMPT } from '@shared/domain/prompts/skills/ecommerce-visual-director';
import { formatToolError } from './toolSafety';
import { streamFinalReply } from './agentLoop/finalReply';
import { PLANNING_TOOLS } from '@shared/domain/assistant/taskPolicy';
import type { AgentExecutionBudget } from './executionBudget';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import { getOpenAITools } from './toolRegistry';
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
} from '@shared/domain/assistant';
import type { ApprovalWaiter, AgentLoopOptions, AgentLoopResult } from './agentLoop/types';
import { type ToolExecContext } from './toolRegistry';
import '@shared/domain/core/asyncPool';

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
  output?: string;
  outputTruncated?: boolean;
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

const SUBAGENT_SYSTEM_HINT =
  `【子代理】你是一个专注于单次任务的子代理。独立上下文、独立工具子集，结果汇总回父代理。只进行资料读取、计算与分析；需要修改工作区或调用外部写入时交给父代理。不要主动与用户对话。`;

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

function buildSubAgentSystemPrompt(): string {
  return [
    SUBAGENT_SYSTEM_HINT,
    CLEAN_CHAT_SYSTEM_PROMPT,
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
  runLoop: (options: AgentLoopOptions) => Promise<AgentLoopResult>;
  parentTurnId: string;
  threadId: string;
  spec: SubAgentSpec;
  skillRegistry?: Array<{ id: string; prompt?: string; tools?: string[] }>;
  modelsToTry: string[];
  reasoningEffort?: ReasoningEffort;
  budget?: AgentExecutionBudget;
  approvalTurnId?: string;
  send?: (evt: AssistantSSEEvent) => void;
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
    { role: 'system', content: [buildSubAgentSystemPrompt(), opts.skillRegistry?.find(skill => skill.id === spec.skillId)?.prompt].filter(Boolean).join('\n\n') },
    { role: 'user', content: spec.prompt },
  ];

  const send = () => {
    // 子代理的 SSE 事件直接丢弃（父 runtime 用父 send）
    // 子代理结果通过 return value 传回
  };

  const runtime = new AgentRuntime({ turnId: subTurnId, threadId, send, signal, onItemEvent });
  try {
    const loopResult = await opts.runLoop({
      runtime,
      messages: subMessages,
      modelsToTry: opts.modelsToTry,
      reasoningEffort: opts.reasoningEffort,
      budget: opts.budget,
      maxRounds: 2,
      baseUrl,
      apiKey,
      toolCtx,
      send,
      signal,
      enableAgentTools: true,
      allowedTools: (allowedTools ?? getOpenAITools().map(tool => tool.function.name)).filter(name => PLANNING_TOOLS.includes(name) && (!opts.skillRegistry?.find(skill => skill.id === spec.skillId)?.tools || opts.skillRegistry.find(skill => skill.id === spec.skillId)!.tools!.includes(name))),
      turnId: subTurnId,
      threadId,
      approvalWaiter: approvalWaiter ? { waitForApproval: (_turnId, approvalId, name, display, args, _send, abortSignal) =>
        approvalWaiter.waitForApproval(opts.approvalTurnId || parentTurnId, approvalId, name, display, args, opts.send || send, abortSignal) } : undefined,
      sessionApprovals: sessionApprovals || new Set(),
      mcpServers,
      onItemEvent,
    });

    signal?.throwIfAborted();
    if (!loopResult.textStreamed) {
      await streamFinalReply({ messages: loopResult.finalMessages, budget: opts.budget, modelsToTry: opts.modelsToTry,
        reasoningEffort: opts.reasoningEffort, baseUrl, apiKey, send, signal, turnId: subTurnId, threadId, runtime });
    }
    const items = loopResult.runtime.listItems();
    const agentItems = items.filter((it) => it.kind === 'agentMessage') as Array<{ content: string }>;
    const lastMsg = agentItems[agentItems.length - 1];
    signal?.throwIfAborted();
    const fullOutput = lastMsg?.content?.trim() || '';
    if (!fullOutput) throw new Error('子任务达到执行上限，尚未产出最终结果');
    loopResult.runtime.complete(false);
    return {
      success: true, skillId: spec.skillId, subTurnId,
      summary: fullOutput.slice(0, 300) + (fullOutput.length > 300 ? '…（正文见 output）' : ''),
      output: fullOutput.slice(0, 32_000), outputTruncated: fullOutput.length > 32_000,
      items: items.slice(-MAX_SUBAGENT_ITEMS),
    };
  } catch (err: unknown) {
    const error = formatToolError(err, '子代理执行失败');
    if (signal?.aborted) runtime.interrupt(); else runtime.fail(error, false);
    const items = runtime.listItems();
    const partial = items.filter(item => item.kind === 'agentMessage').at(-1);
    const output = partial && 'content' in partial ? partial.content : '';
    return {
      success: false, skillId: spec.skillId, subTurnId,
      summary: signal?.aborted ? '子代理已停止，已有输出已保留' : '子代理执行失败，已有输出已保留',
      output: output.slice(0, 32_000), outputTruncated: output.length > 32_000,
      items: items.slice(-MAX_SUBAGENT_ITEMS), error,
    };
  }
}

export const SUB_AGENT_LIMITS = {
  MAX_SUBAGENT_PER_PARENT,
  MAX_SUBAGENT_ITEMS,
} as const;
