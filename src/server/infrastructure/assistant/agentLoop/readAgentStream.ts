import type { AgentRuntime } from '../agentRuntime';
import type { AgentExecutionBudget } from '../executionBudget';
import { newId } from './toolExecutor';
import { toolDisplayName } from '../toolRegistry';

/** Preserve reasoning and indexed tool fragments without accepting truncated tool calls. */
export async function readAgentStream(streamResp: Response, runtime: AgentRuntime, model: string, budget?: AgentExecutionBudget) {
  const agentMsgId = runtime.startItem('agentMessage');
  const reasoningId = runtime.startItem('agentReasoning');

  let contentAccum = '';
  let reasoningAccum = '';
  const toolCallAccum = new Map<number, { id: string; name: string; arguments: string; extra_content?: unknown }>();
  const toolItemIds = new Map<number, string>(); // index -> runtime tool item id

  const decoder = new TextDecoder();
  const reader = streamResp.body!.getReader();
  let buffer = '';
  let finishReason: string | null = null;
  let reportedUsage: unknown;


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
        if (chunk.usage) reportedUsage = chunk.usage;
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
            if (tc.extra_content) entry.extra_content = tc.extra_content;
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

  budget?.recordUsage(reportedUsage);
  console.info('[AssistantStream] ended', { model, finishReason, contentChars: contentAccum.length });
  if (!finishReason) throw new Error('模型连接提前关闭，回复尚未完成，已生成内容已保留，请重试。');
  if (finishReason === 'length') throw new Error('模型达到输出长度限制，回复尚未完成，请发送“接着上一段继续”。');
  if (finishReason !== 'stop' && finishReason !== 'tool_calls') throw new Error(`模型未正常完成本轮（${finishReason}），已保留现有内容。`);
  if (!contentAccum.trim() && !toolCallAccum.size) throw new Error('模型返回空内容，本轮尚未完成。');
  return { agentMsgId, reasoningId, contentAccum, reasoningAccum, toolCallAccum, toolItemIds };
}
