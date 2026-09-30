import type { AssistantMessage } from '@client/store';

/** Match the text actually displayed by the item renderer, including multiple reply segments. */
export function getAssistantMessageText(message: AssistantMessage): string {
  if (message.role === 'assistant') {
    const replies = message.items?.flatMap(item => item.kind === 'agentMessage' && item.content.trim() ? [item.content] : []);
    if (replies?.length) return replies.join('\n\n');
  }
  return message.content || '';
}

export function canRetryAssistantMessage(message: AssistantMessage): boolean {
  return Boolean(message.error || message.task?.status === 'failed' || message.task?.status === 'cancelled'
    || message.content.startsWith('⚠️ 请求失败')
    // Old cached conversations have only this terminal marker; prose mentioning the status is not a failure.
    || /⏹\s*\*?用户已停止生成\*?\s*$/.test(message.content));
}
