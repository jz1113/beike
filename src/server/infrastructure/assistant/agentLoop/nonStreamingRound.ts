import { chatCompletionBody } from '@shared/domain/models/deepseek';
import { outputBudgetOptions } from '@shared/domain/assistant/executionPolicy';
import { reasoningRequestOptions, reasoningSamplingOptions } from '@shared/domain/assistant/reasoning';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { isRetryableModelRequestError, modelRequestError } from './requestError';
import type { AgentLoopOptions } from './types';
import { getOpenAITools } from '../toolRegistry';
import { assertModelTextLimit } from './modelStream';

/** Non-streaming tool round fallback when streaming+tools is unsupported */
export async function runNonStreamingToolRound(
  opts: AgentLoopOptions,
  roundMessages: unknown[],
  tools: ReturnType<typeof getOpenAITools>,
): Promise<{ toolCalls: unknown[]; modelUsed: string; content?: string; reasoningContent?: string } | null> {
  const { modelsToTry, baseUrl, apiKey } = opts;

  let lastError: unknown;
  for (const tryModel of modelsToTry) {
    opts.signal?.throwIfAborted();
    try {
      opts.budget?.consumeModel();
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
          messages: roundMessages,
          tools,
          tool_choice: 'auto',
          ...reasoningSamplingOptions(tryModel, 0.3),
          stream: false,
        }),
        signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        if ([400, 422].includes(resp.status) && /tools?|function/i.test(errText) && /unsupported|not support/i.test(errText)) throw new Error('当前模型通道不支持工具调用，请更换支持工具的模型后继续。');
        throw modelRequestError(resp.status, errText, resp.headers.get('retry-after'));
      }

      const data = await resp.json();
      opts.budget?.recordUsage(data.usage);
      const finish = data?.choices?.[0]?.finish_reason;
      if (finish !== 'stop' && finish !== 'tool_calls') throw new Error(`模型未正常完成本轮（${finish || '无结束标记'}），不执行不完整工具调用。`);
      const choiceMsg = data?.choices?.[0]?.message;
      const content = choiceMsg?.content;
      const reasoning = choiceMsg?.reasoning_content;
      if (content !== undefined && content !== null && typeof content !== 'string') throw new Error('模型文本格式异常');
      if (reasoning !== undefined && reasoning !== null && typeof reasoning !== 'string') throw new Error('模型推理文本格式异常');
      if (typeof content === 'string') assertModelTextLimit('', content);
      if (typeof reasoning === 'string') assertModelTextLimit('', reasoning);
      const rawCalls = choiceMsg?.tool_calls;
      if (rawCalls !== undefined && rawCalls !== null && !Array.isArray(rawCalls)) throw new Error('模型工具调用格式异常');
      if (rawCalls?.length > 24) throw new Error('模型工具调用数量超出限制');
      const toolCalls = rawCalls?.map((call: any, index: number) => {
        if (!call || typeof call.function?.name !== 'string' || !call.function.name || call.function.name.length > 128 || typeof call.function.arguments !== 'string' || call.function.arguments.length > 100_000 || (call.id !== undefined && (typeof call.id !== 'string' || call.id.length > 256))) throw new Error('模型工具调用格式异常或过大');
        return { ...call, id: call.id || `call_${Date.now()}_${index}` };
      });
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        const content = typeof choiceMsg?.content === 'string' ? choiceMsg.content : undefined;
        if (!content?.trim()) throw new Error('模型已返回但内容为空，结果可能已计费，已停止自动补发');
        return { toolCalls: [], modelUsed: tryModel, content, reasoningContent: choiceMsg?.reasoning_content };
      }
      return { toolCalls, modelUsed: tryModel, reasoningContent: choiceMsg?.reasoning_content, content: typeof choiceMsg?.content === 'string' ? choiceMsg.content : undefined };
    } catch (error) {
      opts.signal?.throwIfAborted();
      if (!isRetryableModelRequestError(error)) throw error;
      lastError = error;
      continue;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('没有可用的工具调用模型');
}
