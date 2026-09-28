import { TaskPlan } from './agentLoop/taskPlan';
import { compactToolContext } from './agentLoop/contextBudget';
import { readAgentStream } from './agentLoop/readAgentStream';
import { chatCompletionBody } from '@shared/domain/models/deepseek';
import { ToolResultStore } from './toolResultStore';
import { AgentExecutionBudget } from './executionBudget';
import { EXECUTION_LIMITS, outputBudgetOptions } from '@shared/domain/assistant/executionPolicy';
import { reasoningRequestOptions, reasoningSamplingOptions, reasoningCapability } from '@shared/domain/assistant/reasoning';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { isRetryableModelRequestError, modelRequestError } from './agentLoop/requestError';
/**
 * 智能助手 Agent Loop 核心调度器
 * 
 * 模块结构说明：
 * - ./agentLoop/types: AgentLoop 参数、返回类型与工具任务模型
 * - ./agentLoop/promptInject: 工具说明与工作台地图向 System Prompt 的注入
 * - ./agentLoop/toolExecutor: 工具执行并发控制、单任务审批/执行与子代理调度
 * - ./agentLoop/finalReply: 最终回复流式生成的独立执行器
 */

import type { AgentLoopOptions, AgentLoopResult, ToolCallTask } from './agentLoop/types';
import { AgentRuntime } from './agentRuntime';
import { getOpenAITools, toolDisplayName, parseToolAction, summarizeToolResult } from './toolRegistry';
import { mcpBridge } from './mcpBridge';
import { appendVisualContext } from './agentLoop/visualContext';
import type { AssistantItem } from '@shared/domain/assistant/types';
import { injectToolAndWorkspaceContext } from './agentLoop/promptInject';
import {
  newId,
  isParallelSafe,
  productWidgetFromToolResult,
  runNonStreamingToolRound,
  runSingleTask,
  executeToolBatch,
} from './agentLoop/toolExecutor';

// 导出所有类型与工具
export * from './agentLoop/types';
export * from './agentLoop/finalReply';

const MAX_AGENT_ROUNDS = EXECUTION_LIMITS.maxRounds;

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  opts = { ...opts, budget: opts.budget || new AgentExecutionBudget(), runNestedLoop: runAgentLoop };
  const {
    messages,
    modelsToTry,
    baseUrl,
    apiKey,
    toolCtx,
    send,
    signal,
    enableAgentTools = true,
    allowedTools,
    turnId,
    threadId,
    sessionApprovals = new Set(),
    mcpServers = [],
    onItemEvent,
  } = opts;

  const itemSink = (item: unknown) => {
    if (onItemEvent) {
      try { onItemEvent(item as AssistantItem); } catch { /* swallow */ }
    }
  };

  // 创建 AgentRuntime —— 构造时会自动发射 turn/started 事件
  const runtime = opts.runtime ?? new AgentRuntime({
    turnId,
    threadId,
    send,
    signal,
    onItemEvent: itemSink,
  });

  const workingMessages = [...messages];
  let actualModel = modelsToTry[0] || '';
  let toolsWereUsed = false;
  let productWidget: unknown;

  const mcpTools = enableAgentTools ? await mcpBridge.listTools(mcpServers, signal) : [];
  const tools = enableAgentTools ? getOpenAITools(mcpTools, allowedTools) : [];
  opts = { ...opts, plan: new TaskPlan(), executableToolNames: tools.map((tool) => tool.function.name), readToolCache: new Map(), resultStore: new ToolResultStore() };
  const modelResult = (result: string) => opts.executableToolNames!.includes('read_tool_result') ? opts.resultStore!.forModel(result) : result;

  if (enableAgentTools && tools.length > 0) {
    injectToolAndWorkspaceContext(workingMessages, allowedTools, toolCtx);
  }

  let streamingSupported = true;

  for (let round = 0; round < Math.min(opts.maxRounds ?? MAX_AGENT_ROUNDS, MAX_AGENT_ROUNDS); round++) {
    if (signal?.aborted) {
      runtime.interrupt();
      break;
    }

    if (!enableAgentTools || tools.length === 0) break;

    if (!opts.budget!.canContinue()) break;

    if (opts.executableToolNames!.includes('read_tool_result') && compactToolContext(workingMessages, opts.resultStore!)) {
      send({ type: 'status', phase: 'planning', message: '已收起较早的工具输出，保留执行记录与完整结果索引…' });
    }
    // Try streaming agent round first
    if (streamingSupported) {
      let streamResp: Response | null = null;
      let requestError: unknown;

      for (const tryModel of modelsToTry) {
        signal?.throwIfAborted();
        try {
          send({ type: 'status', phase: 'connecting', message: round === 0 ? '正在请求模型，等待首段响应…' : `正在结合工具结果继续处理（第 ${round + 1} 轮）…` });
          if (!opts.budget!.canContinue()) break;
          opts.budget!.consumeModel();
          const resp = await fetch(`${normalizeGatewayBaseUrl(baseUrl)}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: chatCompletionBody({
              model: tryModel,
          ...reasoningRequestOptions(tryModel, opts.reasoningEffort),
              ...outputBudgetOptions(tryModel, opts.reasoningEffort),
              messages: workingMessages,
              tools,
              tool_choice: 'auto',
              ...reasoningSamplingOptions(tryModel, 0.5),
              stream: true,
            }),
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            if ([400, 422].includes(resp.status) && /tool|function|stream/i.test(errText) && /unsupported|not support|not allowed/i.test(errText)) {
              streamingSupported = false;
              break;
            }
            throw modelRequestError(resp.status, errText, resp.headers.get('retry-after'));
          }

          send({ type: 'status', phase: 'streaming', message: '已连接模型，正在接收回复…' });
          streamResp = resp;
          actualModel = tryModel;
          break;
        } catch (error) {
          signal?.throwIfAborted();
          if (!isRetryableModelRequestError(error)) throw error;
          requestError = error;
          continue;
        }
      }
      if (streamingSupported && !streamResp) {
        throw requestError instanceof Error ? requestError : new Error('模型请求失败，未获得有效响应');
      }
      if (streamResp && !streamResp.body) {
        throw new Error('模型已接受请求但未返回流式响应体；结果可能已计费，已停止自动补发');
      }

      if (streamResp?.body && streamingSupported) {
        const { agentMsgId, reasoningId, contentAccum, reasoningAccum, toolCallAccum, toolItemIds } =
          await readAgentStream(streamResp, runtime, actualModel, opts.budget);
        // 关闭 reasoning 与 agentMessage items
        runtime.completeItem(reasoningId, reasoningAccum ? 'done' : 'cancelled');
        runtime.completeItem(agentMsgId, contentAccum ? 'done' : 'cancelled');

        const toolCalls = Array.from(toolCallAccum.entries()).filter(([, t]) => t.name).map(([index, call]) => ({ ...call, index }));

        if (toolCalls.length === 0) {
          if (contentAccum) {
            workingMessages.push({ role: 'assistant', content: contentAccum, ...(reasoningCapability(actualModel).preserveReasoning && reasoningAccum ? { reasoning_content: reasoningAccum } : {}) });
          }
          const reminder = opts.plan!.completionReminder();
          if (reminder && opts.budget!.canContinue()) { workingMessages.push({ role: 'system', content: reminder }); continue; }
          return {
            stopReason: opts.plan!.incomplete,
            modelUsed: actualModel,
            productWidget,
            toolsWereUsed,
            finalMessages: workingMessages,
            textStreamed: Boolean(contentAccum),
            runtime,
          };
        }

        // 处理工具调用
        const assistantMsg = {
          role: 'assistant',
          content: contentAccum || null,
          ...(reasoningCapability(actualModel).preserveReasoning && reasoningAccum ? { reasoning_content: reasoningAccum } : {}),
          tool_calls: toolCalls.map((t) => ({
            id: t.id,
            type: 'function',
            function: { name: t.name, arguments: t.arguments },
            ...(t.extra_content ? { extra_content: t.extra_content } : {}),
          })),
        };
        workingMessages.push(assistantMsg);
        toolsWereUsed = true;

        const tasks: ToolCallTask[] = toolCalls.map((call, i) => {
          const fnName = call.name;
          const argsStr = call.arguments || '{}';
          const toolItemId = toolItemIds.get(call.index) || newId('tool');
          const itm = runtime.getItem(toolItemId);
          if (itm) {
            itm.payload.args = argsStr;
            itm.payload.displayName = toolDisplayName(fnName);
            itm.payload.callId = call.id;
            itm.payload.name = fnName;
          }

          let argsParsed: Record<string, unknown> = {};
          try {
            argsParsed = JSON.parse(argsStr);
          } catch {
            argsParsed = {};
          }

          return {
            index: i,
            call,
            toolItemId,
            argsParsed,
            parallel: isParallelSafe(fnName),
          };
        });

        const allResults = await executeToolBatch(tasks, {
          opts,
          runtime,
          sessionApprovals,
          send,
        });

        for (const r of allResults) {
          const { call, toolItemId, result, visualImages, declined } = r;
          const fnName = call.name;
          const displayName = toolDisplayName(fnName);

          if (declined) {
            workingMessages.push({ role: 'tool', tool_call_id: call.id, content: r.result });
            continue;
          }

          const widget = productWidgetFromToolResult(fnName, result);
          if (widget) productWidget = widget;

          const action = parseToolAction(result);
          const summary = summarizeToolResult(result);
          const isError = /"success"\s*:\s*false/.test(result);

          runtime.completeToolCall(toolItemId, {
            status: isError ? 'error' : 'done',
            summary,
            action,
            visualImages: visualImages.length > 0 ? visualImages : undefined,
          });
          if (visualImages.length > 0) {
            runtime.emitVisualInspection(fnName, displayName, visualImages);
          }

          workingMessages.push({ role: 'tool', tool_call_id: call.id, content: modelResult(result) });

          appendVisualContext(workingMessages, displayName, visualImages);
        }

        continue; // next agent round
      }
    }

    // Fallback: non-streaming tool round
    send({ type: 'status', phase: 'planning', message: '正在规划工具调用…' });
    if (!opts.budget!.canContinue()) break;
    const roundResult = await runNonStreamingToolRound(opts, workingMessages, tools);
    if (!roundResult) break;

    const { toolCalls, modelUsed } = roundResult;
    actualModel = modelUsed;

    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      if (roundResult.content) {
        const messageId = runtime.startItem('agentMessage');
        runtime.appendItemText(messageId, roundResult.content);
        runtime.completeItem(messageId, 'done');
        workingMessages.push({ role: 'assistant', content: roundResult.content, ...(roundResult.reasoningContent ? { reasoning_content: roundResult.reasoningContent } : {}) });
        const reminder = opts.plan!.completionReminder();
        if (reminder && opts.budget!.canContinue()) { workingMessages.push({ role: 'system', content: reminder }); continue; }
        return { stopReason: opts.plan!.incomplete, modelUsed: actualModel, productWidget, toolsWereUsed, finalMessages: workingMessages, textStreamed: true, runtime };
      }
      break;
    }

    if (roundResult.content) {
      const messageId = runtime.startItem('agentMessage');
      runtime.appendItemText(messageId, roundResult.content);
      runtime.completeItem(messageId, 'done');
    }
    const choiceMsg = { role: 'assistant', content: roundResult.content || null, ...(roundResult.reasoningContent ? { reasoning_content: roundResult.reasoningContent } : {}), tool_calls: toolCalls };
    workingMessages.push(choiceMsg);
    toolsWereUsed = true;

    for (const [idx, call] of (toolCalls as Array<{ id?: string; function?: { name?: string; arguments?: string } }>).entries()) {
      const fnName = call?.function?.name || '';
      const argsStr = call?.function?.arguments || '{}';
      const callId = call?.id || newId('call');
      const displayName = toolDisplayName(fnName);

      const toolItemId = runtime.startItem('toolCall', {
        name: fnName,
        displayName,
        callId,
        args: argsStr,
      });

      let argsParsed: Record<string, unknown> = {};
      try {
        argsParsed = JSON.parse(argsStr);
      } catch {
        argsParsed = {};
      }

      const task: ToolCallTask = {
        index: idx,
        call: { id: callId, name: fnName, arguments: argsStr },
        toolItemId,
        argsParsed,
        parallel: false,
      };

      const r = await runSingleTask(task, {
        opts,
        runtime,
        sessionApprovals,
        send,
      });

      if (r.declined) {
        workingMessages.push({ role: 'tool', tool_call_id: callId, content: modelResult(r.result) });
        continue;
      }

      const widget = productWidgetFromToolResult(fnName, r.result);
      if (widget) productWidget = widget;

      const action = parseToolAction(r.result);
      const summary = summarizeToolResult(r.result);
      const isError = /"success"\s*:\s*false/.test(r.result);

      runtime.completeToolCall(toolItemId, {
        status: isError ? 'error' : 'done',
        summary,
        action,
        visualImages: r.visualImages.length > 0 ? r.visualImages : undefined,
      });
      if (r.visualImages.length > 0) {
        runtime.emitVisualInspection(fnName, displayName, r.visualImages);
      }

      workingMessages.push({ role: 'tool', tool_call_id: callId, content: modelResult(r.result) });

      appendVisualContext(workingMessages, displayName, r.visualImages);
    }
  }

  const stopReason = !signal?.aborted && toolsWereUsed ? opts.budget!.stopReason || '已到本轮执行上限' : undefined;
  if (stopReason) {
    const reason = stopReason;
    send({ type: 'status', phase: 'generating', message: `${reason}，正在整理已有结果…` });
    workingMessages.push({ role: 'system', content: `${reason}。本轮不再调用工具。根据已有结果交付可确认内容，明确未完成部分；不要声称未执行的操作成功。` });
  }

  return {
    modelUsed: actualModel,
    stopReason,
    productWidget,
    toolsWereUsed,
    finalMessages: workingMessages,
    textStreamed: false,
    runtime,
  };
}
