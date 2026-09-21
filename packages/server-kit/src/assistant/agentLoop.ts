import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
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
import { localUrlToDataUrl } from '../videoDeconstructService';
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

const MAX_AGENT_ROUNDS = 8;

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
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
      try { onItemEvent(item as any); } catch { /* swallow */ }
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

  const mcpTools = enableAgentTools ? await mcpBridge.listTools(mcpServers) : [];
  const tools = enableAgentTools ? getOpenAITools(mcpTools, allowedTools) : [];
  opts = { ...opts, executableToolNames: tools.map((tool) => tool.function.name), readToolCache: new Map() };

  if (enableAgentTools && tools.length > 0) {
    injectToolAndWorkspaceContext(workingMessages, allowedTools, toolCtx);
  }

  let streamingSupported = true;

  for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
    if (signal?.aborted) {
      runtime.interrupt();
      break;
    }

    if (!enableAgentTools || tools.length === 0) break;

    // Try streaming agent round first
    if (streamingSupported) {
      let streamResp: Response | null = null;
      let requestError: unknown;

      for (const tryModel of modelsToTry) {
        signal?.throwIfAborted();
        try {
          send({ type: 'status', phase: 'connecting', message: round === 0 ? '正在请求模型，等待首段响应…' : `正在结合工具结果继续处理（第 ${round + 1} 轮）…` });
          const resp = await fetch(`${normalizeGatewayBaseUrl(baseUrl)}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: tryModel,
              messages: workingMessages,
              tools,
              tool_choice: 'auto',
              temperature: 0.5,
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

      if (streamResp?.body && streamingSupported) {
        const agentMsgId = runtime.startItem('agentMessage');
        const reasoningId = runtime.startItem('agentReasoning');

        let contentAccum = '';
        let reasoningAccum = '';
        const toolCallAccum = new Map<number, { id: string; name: string; arguments: string }>();
        const toolItemIds = new Map<number, string>(); // index -> runtime tool item id

        const decoder = new TextDecoder();
        const reader = streamResp.body.getReader();
        let buffer = '';
        let finishReason: string | null = null;


        while (true) {
          const { done, value } = await reader.read();
          if (done && !buffer) break;

          buffer += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trimStart();
            if (payload === '[DONE]') continue;

            try {
              const chunk = JSON.parse(payload);
              const delta = chunk.choices?.[0]?.delta;
              finishReason = chunk.choices?.[0]?.finish_reason || finishReason;

              if (delta?.reasoning_content) {
                reasoningAccum += delta.reasoning_content;
                runtime.appendItemText(reasoningId, delta.reasoning_content);
              }

              if (delta?.content) {
                contentAccum += delta.content;
                runtime.appendItemText(agentMsgId, delta.content);
              }

              if (Array.isArray(delta?.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  let entry = toolCallAccum.get(idx);
                  let itemId = toolItemIds.get(idx);
                  if (!entry) {
                    entry = {
                      id: tc.id || newId('call'),
                      name: tc.function?.name || '',
                      arguments: '',
                    };
                    toolCallAccum.set(idx, entry);
                    itemId = runtime.startItem('toolCall', {
                      name: entry.name,
                      displayName: toolDisplayName(entry.name),
                      callId: entry.id,
                      args: '',
                    });
                    toolItemIds.set(idx, itemId);
                  }
                  if (tc.id) entry.id = tc.id;
                  if (itemId && tc.function?.name) {
                    entry.name = tc.function.name;
                    const itm = runtime.getItem(itemId);
                    if (itm) itm.payload.displayName = toolDisplayName(entry.name);
                  }
                  if (itemId && tc.function?.arguments) {
                    entry.arguments += tc.function.arguments;
                    runtime.appendToolCallArgs(itemId, tc.function.arguments);
                  }
                }
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }

        console.info('[AssistantStream] ended', { turnId, model: actualModel, finishReason, contentChars: contentAccum.length });
        if (!finishReason) throw new Error('模型连接提前关闭，回复尚未完成，已生成内容已保留，请重试。');
        if (finishReason === 'length') throw new Error('模型达到输出长度限制，回复尚未完成，请发送“接着上一段继续”。');
        if (finishReason === 'content_filter') throw new Error('模型终止了本次输出，请调整提问后重试。');
        // 关闭 reasoning 与 agentMessage items
        runtime.completeItem(reasoningId, reasoningAccum ? 'done' : 'cancelled');
        runtime.completeItem(agentMsgId, contentAccum ? 'done' : 'cancelled');

        const toolCalls = Array.from(toolCallAccum.values()).filter((t) => t.name);

        if (toolCalls.length === 0) {
          if (contentAccum) {
            workingMessages.push({ role: 'assistant', content: contentAccum });
          }
          return {
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
          tool_calls: toolCalls.map((t) => ({
            id: t.id,
            type: 'function',
            function: { name: t.name, arguments: t.arguments },
          })),
        };
        workingMessages.push(assistantMsg);
        toolsWereUsed = true;

        const tasks: ToolCallTask[] = toolCalls.map((call, i) => {
          const fnName = call.name;
          const argsStr = call.arguments || '{}';
          const toolItemId = toolItemIds.get(i) || newId('tool');
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

          workingMessages.push({ role: 'tool', tool_call_id: call.id, content: result });

          if (visualImages.length > 0) {
            const imageBlocks = visualImages.map((img) => ({
              type: 'image_url',
              image_url: { url: localUrlToDataUrl(img.url) },
            }));
            workingMessages.push({
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `【视觉工具图像呈递 · 已由工具「${displayName}」提取】\n已提取并回传以下 ${visualImages.length} 张画面：\n${visualImages.map((img) => `• ${img.label || '画面'}: ${img.url}`).join('\n')}\n请结合此视觉画面，仔细研判人物、服饰、妆造、构图、机位、道具和字幕文字细节：`,
                },
                ...imageBlocks,
              ],
            });
          }
        }

        continue; // next agent round
      }
    }

    // Fallback: non-streaming tool round
    send({ type: 'status', phase: 'planning', message: '正在规划工具调用…' });
    const roundResult = await runNonStreamingToolRound(opts, workingMessages, tools);
    if (!roundResult) break;

    const { toolCalls, modelUsed } = roundResult;
    actualModel = modelUsed;

    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      if (roundResult.content) {
        const messageId = runtime.startItem('agentMessage');
        runtime.appendItemText(messageId, roundResult.content);
        runtime.completeItem(messageId, 'done');
        workingMessages.push({ role: 'assistant', content: roundResult.content });
        return { modelUsed: actualModel, productWidget, toolsWereUsed, finalMessages: workingMessages, textStreamed: true, runtime };
      }
      break;
    }

    if (roundResult.content) {
      const messageId = runtime.startItem('agentMessage');
      runtime.appendItemText(messageId, roundResult.content);
      runtime.completeItem(messageId, 'done');
    }
    const choiceMsg = { role: 'assistant', content: roundResult.content || null, tool_calls: toolCalls };
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
        workingMessages.push({ role: 'tool', tool_call_id: callId, content: r.result });
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

      workingMessages.push({ role: 'tool', tool_call_id: callId, content: r.result });

      if (r.visualImages.length > 0) {
        const imageBlocks = r.visualImages.map((img) => ({
          type: 'image_url',
          image_url: { url: localUrlToDataUrl(img.url) },
        }));
        workingMessages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `【视觉工具图像呈递 · 已由工具「${displayName}」提取】\n已提取并回传以下 ${r.visualImages.length} 张画面：\n${r.visualImages.map((img) => `• ${img.label || '画面'}: ${img.url}`).join('\n')}\n请结合此视觉画面，仔细研判人物、服饰、妆造、构图、机位、道具和字幕文字细节：`,
            },
            ...imageBlocks,
          ],
        });
      }
    }
  }

  return {
    modelUsed: actualModel,
    productWidget,
    toolsWereUsed,
    finalMessages: workingMessages,
    textStreamed: false,
    runtime,
  };
}
