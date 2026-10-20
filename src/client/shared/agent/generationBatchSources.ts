import type { AssistantMessage, GenerationTask, MediaAttachment } from '@client/store/appStoreTypes';
import type { AppState } from '@client/store/types';
import { extractGenerationPrompts, promptFingerprint, type GenerationPromptEntry } from '@shared/domain/assistant/generationPrompts';
import { getReplyReferenceMedia } from './batchReferences';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';

export interface GenerationPromptSource {
  sourceId: string;
  kind: 'agent' | 'assistant';
  sessionId: string;
  replyId: string;
  entries: GenerationPromptEntry[];
  media: MediaAttachment[];
  legacySessionId?: string;
}

type SourceState = Pick<AppState, 'sessions' | 'assistantSessions'>;

function replyText(items: AssistantMessage['items'], fallback = '') {
  const messages = items?.filter(item => item.kind === 'agentMessage').map(item => item.content.trim()).filter(Boolean);
  return messages?.length ? messages.join('\n\n') : fallback.trim();
}

function sourceId(kind: string, sessionId: string, replyId: string, text: string) {
  return `${kind}:${encodeURIComponent(sessionId)}:${encodeURIComponent(replyId)}:${promptFingerprint(text)}`;
}

export function agentPromptSource(tasks: GenerationTask[], task: GenerationTask): GenerationPromptSource {
  const text = replyText(task.agentTurn?.items, task.agentTurn?.reply);
  const ordered = [...tasks].filter(item => item.mediaType === 'agent' || item.id.startsWith('agent-task-')).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const index = ordered.findIndex(item => item.id === task.id);
  const referenceTask = [...ordered.slice(0, index + 1)].reverse().find(item => item.referenceImages?.length);
  const media: MediaAttachment[] = (referenceTask?.referenceImages || []).map(url => ({ type: url.startsWith('agent-file:') ? 'document' : isVideoMediaUrl(url) ? 'video' : 'image', url: url.startsWith('agent-file:') ? '' : url }));
  const sessionId = task.sessionId || '';
  return { sourceId: sourceId('agent', sessionId, task.id, text), kind: 'agent', sessionId, replyId: task.id, entries: extractGenerationPrompts(text), media };
}

export function assistantPromptSource(messages: AssistantMessage[], message: AssistantMessage, sessionId: string): GenerationPromptSource {
  const text = replyText(message.items, message.content);
  return {
    sourceId: sourceId('assistant', sessionId, message.id, text), kind: 'assistant', sessionId, replyId: message.id,
    entries: extractGenerationPrompts(text), media: getReplyReferenceMedia(messages, message.id), legacySessionId: message.imageBatchSessionId,
  };
}

export function generationPromptSources(state: SourceState, kind: GenerationPromptSource['kind'], sessionId: string, excludeReplyId?: string) {
  if (kind === 'assistant') {
    const session = state.assistantSessions.find(item => item.id === sessionId);
    return (session?.messages || []).filter(message => message.role === 'assistant' && !message.error && !message.streamingStatus && message.id !== excludeReplyId)
      .map(message => assistantPromptSource(session!.messages, message, sessionId)).filter(source => source.entries.length).slice(-8);
  }
  const session = state.sessions.find(item => item.id === sessionId);
  return (session?.tasks || []).filter(task => (task.mediaType === 'agent' || task.id.startsWith('agent-task-')) && task.status === 'SUCCESS' && task.id !== excludeReplyId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .map(task => agentPromptSource(session!.tasks, { ...task, sessionId })).filter(source => source.entries.length).slice(-8);
}

export function generationBatchContext(sources: GenerationPromptSource[]) {
  return sources.map(source => ({ sourceId: source.sourceId, entries: source.entries.slice(0, 30).map(entry => ({ id: entry.id, title: entry.title, mediaType: entry.mediaType })) }));
}
