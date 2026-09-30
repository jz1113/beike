import type { AgentRuntime } from '../agentRuntime';
import type { AgentExecutionBudget } from '../executionBudget';
import { newId } from './toolExecutor';
import { toolDisplayName } from '../toolRegistry';
import { readModelStream, assertModelTextLimit } from './modelStream';

/** Preserve reasoning and indexed tool fragments without accepting truncated tool calls. */
export async function readAgentStream(streamResp: Response, runtime: AgentRuntime, model: string, budget?: AgentExecutionBudget, signal?: AbortSignal) {
  const agentMsgId = runtime.startItem('agentMessage');
  const reasoningId = runtime.startItem('agentReasoning');

  let contentAccum = '';
  let reasoningAccum = '';
  const toolCallAccum = new Map<number, { id: string; name: string; arguments: string; extra_content?: unknown }>();
  const toolItemIds = new Map<number, string>(); // index -> runtime tool item id

  let finishReason: string | null = null;
  let reportedUsage: unknown;
  try {
    await readModelStream(streamResp.body!, signal, (chunk) => {
      if (chunk.usage) reportedUsage = chunk.usage;
      const delta = chunk.choices?.[0]?.delta;
      finishReason = chunk.choices?.[0]?.finish_reason || finishReason;
      if (delta?.reasoning_content) {
        assertModelTextLimit(reasoningAccum, delta.reasoning_content);
        reasoningAccum += delta.reasoning_content;
        runtime.appendItemText(reasoningId, delta.reasoning_content);
      }
      if (delta?.content) {
        assertModelTextLimit(contentAccum, delta.content);
        contentAccum += delta.content;
        runtime.appendItemText(agentMsgId, delta.content);
      }
      if (delta?.tool_calls !== undefined && delta.tool_calls !== null && !Array.isArray(delta.tool_calls)) throw new Error('模型返回的工具调用格式异常');
      for (const tc of delta?.tool_calls || []) {
        if (!tc || typeof tc !== 'object' || !Number.isInteger(tc.index ?? 0) || (tc.index ?? 0) < 0 || (tc.index ?? 0) >= 24) throw new Error('模型工具调用数量或索引超出限制');
        const idx = tc.index ?? 0;
        if (tc.id !== undefined && (typeof tc.id !== 'string' || tc.id.length > 256)) throw new Error('模型工具调用标识异常');
        const fn = tc.function;
        if (fn !== undefined && (!fn || typeof fn !== 'object' || Array.isArray(fn))) throw new Error('模型工具定义格式异常');
        if (fn?.name !== undefined && typeof fn.name !== 'string') throw new Error('模型工具名称格式异常');
        if (fn?.arguments !== undefined && typeof fn.arguments !== 'string') throw new Error('模型工具参数格式异常');
        let entry = toolCallAccum.get(idx);
        let itemId = toolItemIds.get(idx);
        if (!entry) {
          entry = { id: tc.id || newId('call'), name: '', arguments: '' };
          toolCallAccum.set(idx, entry);
          itemId = runtime.startItem('toolCall', { name: '', displayName: '', callId: entry.id, args: '' });
          toolItemIds.set(idx, itemId);
        }
        if (tc.id) entry.id = tc.id;
        if (tc.extra_content) entry.extra_content = tc.extra_content;
        if (fn?.name) {
          // Some gateways repeat the full name; others send it in fragments.
          entry.name = fn.name === entry.name ? entry.name : entry.name + fn.name;
          if (entry.name.length > 128) throw new Error('模型工具名称过长');
          const item = itemId && runtime.getItem(itemId);
          if (item) { item.payload.name = entry.name; item.payload.displayName = toolDisplayName(entry.name); item.payload.callId = entry.id; }
        }
        if (fn?.arguments) {
          if (entry.arguments.length + fn.arguments.length > 100_000) throw new Error('模型工具参数过大');
          entry.arguments += fn.arguments;
          if (itemId) runtime.appendToolCallArgs(itemId, fn.arguments);
        }
      }
    });
  } catch (error) {
    runtime.completeItem(agentMsgId, signal?.aborted ? 'cancelled' : 'error');
    runtime.completeItem(reasoningId, signal?.aborted ? 'cancelled' : 'error');
    for (const itemId of toolItemIds.values()) runtime.completeItem(itemId, signal?.aborted ? 'cancelled' : 'error');
    throw error;
  }
  if ([...toolCallAccum.values()].some(call => !call.name)) throw new Error('模型工具调用缺少完整名称，不执行不完整操作');

  budget?.recordUsage(reportedUsage);
  console.info('[AssistantStream] ended', { model, finishReason, contentChars: contentAccum.length });
  if (!finishReason) throw new Error('模型连接提前关闭，回复尚未完成，已生成内容已保留，请重试。');
  if (finishReason === 'length') throw new Error('模型达到输出长度限制，回复尚未完成，请发送“接着上一段继续”。');
  if (finishReason !== 'stop' && finishReason !== 'tool_calls') throw new Error(`模型未正常完成本轮（${finishReason}），已保留现有内容。`);
  if (!contentAccum.trim() && !toolCallAccum.size) throw new Error('模型返回空内容，本轮尚未完成。');
  return { agentMsgId, reasoningId, contentAccum, reasoningAccum, toolCallAccum, toolItemIds };
}
