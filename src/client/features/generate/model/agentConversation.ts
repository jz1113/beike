import type { GenerationTask, MediaAttachment } from '@client/store/appStoreTypes';
import { parseAgentAttachments, visibleAgentPrompt } from '@client/shared/media/agentArtifact';

export function agentMessageAttachments(task: GenerationTask): MediaAttachment[] {
  return parseAgentAttachments(task).map((item) => ({
    name: item.name,
    type: item.kind === 'image' ? 'image' : item.kind === 'video' ? 'video' : 'document',
    url: item.url.startsWith('agent-file:') ? '' : item.url,
    extractedText: item.textSnippet || undefined,
  }));
}

/** Keep complete turns and their media within the current conversation. */
export function priorAgentMessages(tasks: GenerationTask[], task: GenerationTask) {
  const prior = tasks.filter((item) =>
    item.id !== task.id
    && (item.mediaType === 'agent' || item.id.startsWith('agent-task-'))
    && item.sessionId === task.sessionId
    && (item.createdAt || 0) <= (task.createdAt || 0),
  ).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(-10);
  const messages: Array<{ role: 'user' | 'assistant'; content: string; attachments?: MediaAttachment[] }> = [];
  for (const item of prior) {
    const content = visibleAgentPrompt(item.prompt || '');
    // Local preview URLs cannot survive a page reload; only resend saved media.
    const attachments = agentMessageAttachments(item).filter((attachment) =>
      attachment.extractedText || /^\/storage\//.test(attachment.url) || /^https?:\/\//.test(attachment.url),
    );
    if (content || attachments.length) messages.push({ role: 'user', content, attachments });
    const reply = item.agentTurn?.reply?.trim() || item.agentTurn?.items
      ?.filter((entry) => entry.kind === 'agentMessage')
      .map((entry) => entry.content).join('\n\n').trim();
    if (reply) messages.push({ role: 'assistant', content: reply });
  }
  return messages;
}
