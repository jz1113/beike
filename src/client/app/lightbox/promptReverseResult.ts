/** Reject incomplete responses instead of saving a truncated prompt as a successful result. */
export function readPromptReverseResult(value: unknown): string {
  if (!value || typeof value !== 'object') throw new Error('模型返回无效，请重试');
  const data = value as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }>; error?: unknown };
  const choice = data.choices?.[0];
  if (!choice || (choice.finish_reason && choice.finish_reason !== 'stop' && choice.finish_reason !== 'end_turn')) throw new Error('模型未完整返回提示词，请调整模型或输出长度后重试');
  const content = choice.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map(part =>
    part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '').join('\n') : '';
  if (!text.trim()) throw new Error('模型未返回可读提示词，请检查图像理解能力后重试');
  return text.trim();
}
