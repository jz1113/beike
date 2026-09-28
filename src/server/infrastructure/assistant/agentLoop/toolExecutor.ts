import { runCodeSandbox } from '../codeSandbox';
export { runNonStreamingToolRound } from './nonStreamingRound';
import { toolCallKey } from '../executionBudget';
import type { AgentLoopOptions, ToolCallTask, ToolTaskResult } from './types';
import type { AssistantSSEEvent } from '@shared/domain/assistant/events';
import type { AgentRuntime } from '../agentRuntime';
import {
  executeAssistantTool,
  getToolDefinition,
  parseToolAction,
  summarizeToolResult,
  toolDisplayName,
  type ToolExecContext,
} from '../toolRegistry';
import { mcpBridge } from '../mcpBridge';
import type { McpServerConfig } from '@shared/domain/assistant/types';
import '../../media/videoDeconstructService';
import { mapWithConcurrency } from '@shared/domain/core/asyncPool';
import { BUILTIN_ASSISTANT_SKILLS, type AssistantSkill } from '@shared/domain/assistant/skills';

export function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function productWidgetFromToolResult(fnName: string, result: string): unknown | undefined {
  if (fnName === 'execute_code') {
    try { return JSON.parse(result).productWidget; } catch { return undefined; }
  }
  if (fnName !== 'parse_product_or_social_url') return undefined;
  try {
    const j = JSON.parse(result);
    if (!j?.success) return undefined;
    if (j.kind === 'ecommerce') {
      const imgs = Array.isArray(j.sampleImages) ? j.sampleImages : [];
      return {
        itemId: j.skuId,
        platform: j.platform,
        title: j.title,
        price: j.price,
        category: j.category,
        picUrl: j.cover || imgs[0] || '',
        mainImages: imgs,
        detailImages: [],
        skuImages: [],
        allImages: imgs,
        props: j.props || {},
        apiUsed: 'tool:parse_product_or_social_url',
      };
    }
    if (j.kind === 'social') {
      const imgs = Array.isArray(j.images) ? j.images : [];
      return {
        itemId: undefined,
        platform: j.platform || 'social',
        title: j.title,
        price: '',
        category: '社媒图集',
        picUrl: j.cover || imgs[0] || '',
        mainImages: imgs,
        detailImages: [],
        skuImages: [],
        allImages: imgs,
        props: {
          作者: j.author || '',
          图集数量: String(j.imageCount || imgs.length),
          ...(j.video ? { 原视频: '已提取' } : {}),
        },
        apiUsed: 'tool:parse_product_or_social_url',
        video: j.video || null,
      };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function executeToolCall(
  fnName: string,
  argsStr: string,
  ctx: ToolExecContext,
  mcpServers: McpServerConfig[],
): Promise<string> {
  if (fnName.startsWith('mcp_')) {
    let args: Record<string, unknown> = {};
    try {
      args = argsStr ? JSON.parse(argsStr) : {};
    } catch {
      args = {};
    }
    return mcpBridge.callTool(mcpServers, fnName, args, ctx.signal);
  }
  if (fnName === 'spawn_subagent') {
    return JSON.stringify({
      success: false,
      error: 'spawn_subagent 应由 Agent Loop 内部处理；调用方需走 subAgent 路径',
      _handled_by_runtime: true,
    });
  }
  return executeAssistantTool(fnName, argsStr, ctx);
}

export function needsApproval(toolName: string, sessionApprovals: Set<string>): boolean {
  const def = getToolDefinition(toolName);
  if (!def) return true; // External tools have no trusted effect metadata: require explicit approval.
  if (def.approval === 'none') return false;
  if (def.approval === 'per_session' && sessionApprovals.has(toolName)) return false;
  if (def.approval === 'per_turn') return true;
  return true;
}

const SEQUENTIAL_ONLY_TOOLS = new Set<string>([
  'update_plan',
  'execute_code',
  'workspace_navigate',
  'workspace_load_workshop_product',
  'trigger_generate',
  'set_workshop_arch',
  'spawn_subagent',
  'deconstruct_image',
  'inspect_video_media',
  'extract_video_storyboard',
  'extract_video_detailed_frames',
]);

export function isParallelSafe(toolName: string): boolean {
  if (toolName.startsWith('mcp_')) return false;
  if (SEQUENTIAL_ONLY_TOOLS.has(toolName)) return false;
  return true;
}

export const TOOL_PARALLEL_CONCURRENCY = 3;

export async function runSingleTask(
  task: ToolCallTask,
  ctx: {
    opts: AgentLoopOptions;
    runtime: AgentRuntime;
    sessionApprovals: Set<string>;
    send: (evt: AssistantSSEEvent) => void;
  },
): Promise<ToolTaskResult> {
  const { call, toolItemId, argsParsed } = task;
  const { opts, runtime, sessionApprovals, send } = ctx;
  const fnName = call.name;
  const displayName = toolDisplayName(fnName);

  if (opts.signal?.aborted || (opts.executableToolNames && !opts.executableToolNames.includes(fnName))) {
    return { index: task.index, call, toolItemId, result: JSON.stringify({ success: false, error: '工具未授权或任务已停止' }), visualImages: [], declined: false };
  }

  // Validate the actual wire arguments, including sandbox and MCP calls, before any side effect.
  try {
    const args = JSON.parse(call.arguments || '{}');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('invalid');
  } catch {
    return { index: task.index, call, toolItemId, result: JSON.stringify({ success: false, error: '工具参数必须为有效 JSON 对象' }), visualImages: [], declined: false };
  }
  const budgetError = opts.budget?.consumeTool(fnName, argsParsed);
  if (budgetError) return { index: task.index, call, toolItemId, result: JSON.stringify({ success: false, error: budgetError }), visualImages: [], declined: false };

  if (fnName === 'update_plan') return { index: task.index, call, toolItemId, result: opts.plan!.update(argsParsed), visualImages: [], declined: false };

  if (fnName === 'read_tool_result') {
    const result = opts.resultStore?.read(String(argsParsed.result_id || ''), Number(argsParsed.offset ?? 0), Number(argsParsed.length ?? 4000)) || JSON.stringify({ success: false, error: '本轮无已存储的结果' });
    return { index: task.index, call, toolItemId, result, visualImages: [], declined: false };
  }

  if (fnName === 'execute_code') {
    const controller = new AbortController();
    const signal = opts.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal;
    let queue = Promise.resolve();
    let productWidget: unknown;
    const visualImages: Array<{ url: string; label?: string }> = [];
    try {
      const result = await runCodeSandbox({
        code: String(argsParsed.code || ''),
        input: { documents: opts.toolCtx.documents, workspace: opts.toolCtx.clientContext || {} },
        signal,
        toolNames: (opts.executableToolNames || []).filter((name) => name !== 'execute_code' && name !== 'spawn_subagent'),
        callTool: async (name, args, sandboxSignal) => {
          // A single queue preserves mutation order and avoids concurrent approval dialogs.
          const operation = queue.then(async () => {
            sandboxSignal.throwIfAborted();
            const nestedId = runtime.startItem('toolCall', { name, displayName: toolDisplayName(name), args: JSON.stringify(args), callId: newId('codecall') });
            const nested = await runSingleTask({ index: 0, call: { id: nestedId, name, arguments: JSON.stringify(args) }, toolItemId: nestedId, argsParsed: args, parallel: false }, { ...ctx, opts: { ...opts, signal: sandboxSignal } });
            sandboxSignal.throwIfAborted();
            runtime.completeToolCall(nestedId, { status: /"success"\s*:\s*false/.test(nested.result) ? 'error' : 'done', summary: summarizeToolResult(nested.result), action: parseToolAction(nested.result), visualImages: nested.visualImages });
            const widget = productWidgetFromToolResult(name, nested.result);
            if (widget) productWidget = widget;
            visualImages.push(...nested.visualImages.slice(0, Math.max(0, 20 - visualImages.length)));
            return JSON.parse(nested.result);
          });
          queue = operation.then(() => undefined, () => undefined);
          return operation;
        },
      });
      return { index: task.index, call, toolItemId, result: JSON.stringify({ success: true, sandbox: 'quickjs-wasm', ...result, productWidget }), visualImages, declined: false };
    } catch (error) {
      return { index: task.index, call, toolItemId, result: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), visualImages: [], declined: false };
    } finally {
      controller.abort();
    }
  }

  if (needsApproval(fnName, sessionApprovals) && !opts.approvalWaiter) {
    runtime.completeToolCall(toolItemId, { status: 'error', summary: '此操作需要审批，但当前运行环境未提供审批通道' });
    return { index: task.index, call, toolItemId, result: JSON.stringify({ success: false, error: '此操作需要审批，但当前运行环境未提供审批通道' }), visualImages: [], declined: true };
  }
  if (needsApproval(fnName, sessionApprovals) && opts.approvalWaiter) {
    const approvalId = runtime.requestApproval(fnName, displayName, argsParsed);
    const decision = await opts.approvalWaiter.waitForApproval(
      opts.turnId,
      approvalId,
      fnName,
      displayName,
      argsParsed,
      send,
      opts.signal,
    );
    runtime.resolveApproval(approvalId, decision);

    if (decision === 'decline' || decision === 'cancel') {
      const declineResult = JSON.stringify({ success: false, error: '用户拒绝了此操作' });
      runtime.completeToolCall(toolItemId, { status: 'error', summary: '用户已拒绝' });
      return { index: task.index, call, toolItemId, result: declineResult, visualImages: [], declined: true };
    }
    if (decision === 'acceptForSession' && getToolDefinition(fnName)?.approval === 'per_session') {
      sessionApprovals.add(fnName);
      runtime.setSessionApproval(fnName);
    }
  }

  opts.signal?.throwIfAborted();

  // 子代理 spawn：由 Agent Loop 内部处理，结果汇总到 toolResult
  if (fnName === 'spawn_subagent') {
    const subItemId = runtime.startItem('subAgent', {
      skillId: String(argsParsed.skill_id || argsParsed.skillId || ''),
      prompt: String(argsParsed.prompt || ''),
      status: 'running',
    });
    try {
      const { runSubAgent, checkSubAgentQuota } = await import('../subAgent');
      const existingSubs = runtime.listItems().filter((it) => it.kind === 'subAgent' && it.id !== subItemId);
      const quota = checkSubAgentQuota(existingSubs);
      if (!quota.ok) {
        throw new Error(`已达子代理数量上限 (${quota.limit})`);
      }
      if (!opts.runNestedLoop) throw new Error('缺少嵌套代理调度器');
      const subResult = await runSubAgent({
        runLoop: opts.runNestedLoop,
        parentRuntime: runtime,
        parentTurnId: opts.turnId,
        threadId: opts.threadId,
        spec: {
          skillId: String(argsParsed.skill_id || argsParsed.skillId || ''),
          prompt: String(argsParsed.prompt || ''),
          parentTurnId: opts.turnId,
          parentToolCallId: call.id,
        },
        skillRegistry: BUILTIN_ASSISTANT_SKILLS as AssistantSkill[],
        allowedTools: (opts.executableToolNames || []).filter(name => name !== 'spawn_subagent'),
        modelsToTry: opts.modelsToTry,
        reasoningEffort: opts.reasoningEffort,
        budget: opts.budget,
        approvalWaiter: opts.approvalWaiter,
        approvalTurnId: opts.turnId,
        send,
        sessionApprovals,

        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey,
        toolCtx: opts.toolCtx,
        mcpServers: opts.mcpServers,
        signal: opts.signal,
      });
      runtime.completeItem(subItemId, subResult.success ? 'done' : 'error');
      const summary = subResult.summary;
      const subResultText = JSON.stringify({
        success: subResult.success,
        subTurnId: subResult.subTurnId,
        summary,
        items: subResult.items.length,
        ...(subResult.error ? { error: subResult.error } : {}),
      });
      const visualImages: Array<{ url: string; label?: string }> = [];
      runtime.completeToolCall(toolItemId, {
        status: subResult.success ? 'done' : 'error',
        summary,
        action: { subAgentResult: subResultText },
      });
      return { index: task.index, call, toolItemId, result: subResultText, visualImages, declined: false };
    } catch (subErr: unknown) {
      const errMsg = subErr instanceof Error ? subErr.message : String(subErr);
      runtime.completeItem(subItemId, 'error');
      const failResult = JSON.stringify({ success: false, error: errMsg });
      runtime.completeToolCall(toolItemId, {
        status: 'error',
        summary: `子代理失败：${errMsg}`,
      });
      return { index: task.index, call, toolItemId, result: failResult, visualImages: [], declined: false };
    }
  }

  const cacheable = ['read_attached_document', 'list_user_products', 'query_asset_library', 'get_prompt_asset_detail', 'get_workshop_state', 'get_view_capabilities'].includes(fnName);
  const cacheKey = toolCallKey(fnName, argsParsed);
  if (!cacheable && getToolDefinition(fnName)?.scope === 'client') opts.readToolCache?.clear();
  let execution = cacheable ? opts.readToolCache?.get(cacheKey) : undefined;
  if (!execution) {
    execution = executeToolCall(fnName, call.arguments || '{}', { ...opts.toolCtx, signal: opts.signal }, opts.mcpServers || []);
    if (cacheable) opts.readToolCache?.set(cacheKey, execution);
  }
  let result: string;
  try { result = await execution; }
  catch (error) {
    opts.readToolCache?.delete(cacheKey);
    result = JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
  if (opts.signal?.aborted) return { index: task.index, call, toolItemId, result: JSON.stringify({ success: false, error: '任务已停止，未应用后续操作' }), visualImages: [], declined: false };
  if (/"success"\s*:\s*false/.test(result)) opts.readToolCache?.delete(cacheKey);

  // 安全：_visualImages 数量与大小限制（防御恶意 MCP 工具返回大量图像导致内存耗尽 / token 暴涨）
  const MAX_VISUAL_IMAGES = 20;
  const MAX_VISUAL_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
  const visualImages: Array<{ url: string; label?: string }> = [];
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed._visualImages) && parsed._visualImages.length > 0) {
      const raw = parsed._visualImages.slice(0, MAX_VISUAL_IMAGES);
      for (const img of raw) {
        if (typeof img.url !== 'string' || !/^(?:https?:\/\/|\/storage\/|data:image\/(?:png|jpe?g|webp);base64,)/i.test(img.url)) continue;
        if (img.url.startsWith('data:')) {
          const b64 = img.url.split(',')[1] || '';
          const bytes = Math.ceil((b64.length * 3) / 4);
          if (bytes > MAX_VISUAL_IMAGE_BYTES) continue;
        }
        visualImages.push({ url: img.url, label: typeof img.label === 'string' ? img.label : undefined });
      }
    }
  } catch {
    /* ignore */
  }

  return { index: task.index, call, toolItemId, result, visualImages, declined: false };
}

export async function executeToolBatch(
  tasks: ToolCallTask[],
  ctx: {
    opts: AgentLoopOptions;
    runtime: AgentRuntime;
    sessionApprovals: Set<string>;
    send: (evt: AssistantSSEEvent) => void;
  },
): Promise<ToolTaskResult[]> {
  // Flush consecutive reads before every mutation. Never move a read across a write barrier.
  const results: ToolTaskResult[] = [];
  let reads: ToolCallTask[] = [];
  const flush = async () => {
    results.push(...await mapWithConcurrency(reads, TOOL_PARALLEL_CONCURRENCY, task => runSingleTask(task, ctx)));
    reads = [];
  };
  for (const task of tasks) {
    if (task.parallel) reads.push(task);
    else { await flush(); results.push(await runSingleTask(task, ctx)); }
  }
  await flush();
  return results.sort((a, b) => a.index - b.index);
}
