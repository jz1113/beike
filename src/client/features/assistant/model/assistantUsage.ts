import { recordModelUsage, resolveModelVendor } from '@client/shared/utils/usageTracker';

export function recordAssistantChatUsage(messages: Array<{ content: string }>, reply: string, modelId: string): void {
  if (modelId === 'direct-collection') return;
  const promptChars = messages.reduce((total, message) => total + (message.content?.length || 0), 0);
  const promptTokens = Math.max(50, Math.round(promptChars / 2.5));
  const completionTokens = Math.max(30, Math.round(reply.length / 2.5));
  recordModelUsage({
    modelId,
    modelName: modelId,
    provider: resolveModelVendor(modelId),
    type: 'chat',
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    success: true,
  });
}
