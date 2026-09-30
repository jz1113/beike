import { chatCompletionBody } from '@shared/domain/models/deepseek';
import type { AgentExecutionBudget } from '../executionBudget';
import { outputBudgetOptions } from '@shared/domain/assistant/executionPolicy';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import { reasoningRequestOptions, reasoningSamplingOptions } from '@shared/domain/assistant/reasoning';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { isRetryableModelRequestError, modelRequestError } from './requestError';
import type { AssistantSSEEvent } from '@shared/domain/assistant/events';
import { AgentRuntime } from '../agentRuntime';
import { readModelStream, assertModelTextLimit } from './modelStream';

/** Stream final assistant reply when agent loop produced tool context but no text yet */
export async function streamFinalReply(opts: {
  messages: unknown[];
  budget?: AgentExecutionBudget;
  modelsToTry: string[];
  reasoningEffort?: ReasoningEffort;
  baseUrl: string;
  apiKey: string;
  send: (evt: AssistantSSEEvent) => void;
  signal?: AbortSignal;
  turnId: string;
  threadId?: string;
  runtime?: AgentRuntime;
}): Promise<string> {
  const { messages, modelsToTry, baseUrl, apiKey, send, signal, turnId, threadId } = opts;

  send({ type: 'status', phase: 'generating', message: '正在生成回复…' });
  const runtime = opts.runtime ?? new AgentRuntime({ turnId, threadId: threadId ?? turnId, send, signal });
  let lastError: unknown;

  for (const tryModel of modelsToTry) {
    let emittedContent = false;
    let agentMsgId: string | undefined;
    let reasoningId: string | undefined;
    signal?.throwIfAborted();
    try {
      opts.budget?.consumeModel(true);
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
          messages,
          ...reasoningSamplingOptions(tryModel, 0.7),
          stream: true,
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw modelRequestError(resp.status, errorText, resp.headers.get('retry-after'));
      }
      if (!resp.body) throw new Error('上游返回成功状态但没有响应体，请检查网关的流式响应支持');

      agentMsgId = runtime.startItem('agentMessage');
      reasoningId = runtime.startItem('agentReasoning');

      let contentAccum = '';
      let reasoningAccum = '';
      const modelUsed = tryModel;
      let finishReason: string | null = null;
      let reportedUsage: unknown;
      await readModelStream(resp.body, signal, (chunk) => {
        finishReason = chunk.choices?.[0]?.finish_reason || finishReason;
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.reasoning_content) {
          assertModelTextLimit(reasoningAccum, delta.reasoning_content);
          reasoningAccum += delta.reasoning_content;
          runtime.appendItemText(reasoningId!, delta.reasoning_content);
        }
        if (delta?.content) {
          assertModelTextLimit(contentAccum, delta.content);
          contentAccum += delta.content;
          emittedContent ||= Boolean(delta.content.trim());
          runtime.appendItemText(agentMsgId!, delta.content);
        }
        if (chunk.usage) {
          reportedUsage = chunk.usage;
          if (!opts.budget) send({ type: 'usage', usage: chunk.usage });
        }
      });

      opts.budget?.recordUsage(reportedUsage);
      console.info('[AssistantStream] ended', { turnId, model: modelUsed, finishReason, contentChars: contentAccum.length });
      if (!finishReason) throw new Error('模型连接提前关闭，回复尚未完成，请重试。');
      if (finishReason === 'length') throw new Error('模型达到输出长度限制，请发送“接着上一段继续”。');
      if (finishReason !== 'stop') throw new Error(`模型未正常完成回复（${finishReason}），已保留现有内容。`);
      if (!contentAccum.trim()) { lastError = new Error('模型返回空回复，本轮尚未完成。'); runtime.completeItem(reasoningId!, 'error'); runtime.completeItem(agentMsgId!, 'error'); continue; }
      runtime.completeItem(reasoningId!, reasoningAccum ? 'done' : 'cancelled');
      runtime.completeItem(agentMsgId!, contentAccum ? 'done' : 'cancelled');
      return modelUsed;
    } catch (error) {
      if (agentMsgId) runtime.completeItem(agentMsgId, signal?.aborted ? 'cancelled' : 'error');
      if (reasoningId) runtime.completeItem(reasoningId, signal?.aborted ? 'cancelled' : 'error');
      signal?.throwIfAborted();
      if (emittedContent || !isRetryableModelRequestError(error)) throw error;
      lastError = error;
      continue;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('未能获取到模型流式响应');
}
