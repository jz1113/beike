import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
import { isRetryableModelRequestError, modelRequestError } from './requestError';
import type { AssistantSSEEvent } from '@beike/domain/assistant/events';
import { AgentRuntime } from '../agentRuntime';

/** Stream final assistant reply when agent loop produced tool context but no text yet */
export async function streamFinalReply(opts: {
  messages: unknown[];
  modelsToTry: string[];
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
    signal?.throwIfAborted();
    try {
      const resp = await fetch(`${normalizeGatewayBaseUrl(baseUrl)}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: tryModel,
          messages,
          temperature: 0.7,
          stream: true,
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw modelRequestError(resp.status, errorText, resp.headers.get('retry-after'));
      }
      if (!resp.body) throw new Error('上游返回成功状态但没有响应体，请检查网关的流式响应支持');

      const agentMsgId = runtime.startItem('agentMessage');
      const reasoningId = runtime.startItem('agentReasoning');

      const decoder = new TextDecoder();
      const reader = resp.body.getReader();
      let buffer = '';
      let contentAccum = '';
      let reasoningAccum = '';
      const modelUsed = tryModel;

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
            finishReason = chunk.choices?.[0]?.finish_reason || finishReason;
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.reasoning_content) {
              reasoningAccum += delta.reasoning_content;
              runtime.appendItemText(reasoningId, delta.reasoning_content);
            }
            if (delta?.content) {
              emittedContent = true;
              contentAccum += delta.content;
              runtime.appendItemText(agentMsgId, delta.content);
            }
            if (chunk.usage) {
              send({ type: 'usage', usage: chunk.usage });
            }
          } catch {
            /* ignore */
          }
        }
      }

      console.info('[AssistantStream] ended', { turnId, model: modelUsed, finishReason, contentChars: contentAccum.length });
      if (!finishReason) throw new Error('模型连接提前关闭，回复尚未完成，请重试。');
      if (finishReason === 'length') throw new Error('模型达到输出长度限制，请发送“接着上一段继续”。');
      if (finishReason === 'content_filter') throw new Error('模型终止了本次输出，请调整提问后重试。');
      runtime.completeItem(reasoningId, reasoningAccum ? 'done' : 'cancelled');
      runtime.completeItem(agentMsgId, contentAccum ? 'done' : 'cancelled');
      return modelUsed;
    } catch (error) {
      signal?.throwIfAborted();
      if (emittedContent || !isRetryableModelRequestError(error)) throw error;
      lastError = error;
      continue;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('未能获取到模型流式响应');
}
