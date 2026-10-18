import { recordChatTokens } from '@client/shared/utils/modelUsage';

export function recordAssistantChatUsage(modelId: string, usage: unknown): void {
  if (!modelId || modelId === 'direct-collection') return;
  recordChatTokens({ modelId, modelName: modelId, type: 'chat', usage });
}
