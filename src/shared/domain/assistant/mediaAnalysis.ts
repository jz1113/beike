import { explicitBatchGenerationRequest } from './generationAuthorization';

interface MediaMessage {
  role: string;
  content: string;
  attachments?: unknown[];
}

/** Uploaded video and follow-up questions use vision without loading a skill. */
export function shouldAnalyzeVideoDirectly(messages: MediaMessage[], skillId?: string): boolean {
  if (skillId) return false;
  const latestUser = messages.filter((message) => message.role === 'user').at(-1);
  if (!latestUser || explicitBatchGenerationRequest(latestUser.content)) return false;
  return messages.some((message) => message.role === 'user' && message.attachments?.some((attachment) =>
    typeof attachment === 'object' && attachment !== null && 'type' in attachment && attachment.type === 'video',
  ));
}
