import type { AssistantMessage, AssistantSession, MediaAttachment } from '@client/store/appStoreTypes';
import { normalizeAssistantItems, normalizeAssistantTask } from '@shared/domain/assistant/normalizeAssistantItems';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const optionalText = (value: unknown) => typeof value === 'string' ? value : undefined;

function normalizeAttachment(value: unknown): MediaAttachment | undefined {
  if (!isRecord(value) || (value.type !== 'image' && value.type !== 'video' && value.type !== 'document')) return undefined;
  const url = optionalText(value.url);
  if (value.type !== 'document' && url === undefined) return undefined;
  return {
    type: value.type,
    url: url || '',
    id: optionalText(value.id),
    mentionName: typeof value.mentionName === 'string' && /^图片\d+$/.test(value.mentionName) ? value.mentionName : undefined,
    thumbnailUrl: optionalText(value.thumbnailUrl),
    name: optionalText(value.name),
    mime: optionalText(value.mime),
    extractedText: optionalText(value.extractedText),
    size: typeof value.size === 'number' && Number.isFinite(value.size) && value.size >= 0 ? value.size : undefined,
  };
}

function normalizeUsedSkill(value: unknown): AssistantMessage['usedSkill'] {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.skillId !== 'string' || typeof value.systemPrompt !== 'string') return undefined;
  return {
    name: value.name, skillId: value.skillId, systemPrompt: value.systemPrompt,
    allowedTools: Array.isArray(value.allowedTools) ? value.allowedTools.filter((tool): tool is string => typeof tool === 'string') : undefined,
  };
}

/** Local caches can be partial, outdated or corrupted; restore only usable records. */
export function normalizeAssistantSessions(value: unknown): AssistantSession[] {
  if (!Array.isArray(value)) return [];
  const sessions = new Map<string, AssistantSession>();
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.trim()) continue;
    const messages: AssistantMessage[] = [];
    const messageIds = new Set<string>();
    for (const message of Array.isArray(raw.messages) ? raw.messages : []) {
      if (!isRecord(message) || typeof message.id !== 'string' || !message.id
        || (message.role !== 'user' && message.role !== 'assistant') || messageIds.has(message.id)) continue;
      messageIds.add(message.id);
      messages.push({
        ...message,
        task: normalizeAssistantTask(message.task),
        usedSkill: normalizeUsedSkill(message.usedSkill),
        id: message.id,
        role: message.role,
        content: typeof message.content === 'string' ? message.content : '',
        timestamp: typeof message.timestamp === 'number' && Number.isFinite(message.timestamp) ? message.timestamp : 0,
        thinking: typeof message.thinking === 'string' ? message.thinking : undefined,
        streamingStatus: typeof message.streamingStatus === 'string' ? message.streamingStatus : undefined,
        modelUsed: typeof message.modelUsed === 'string' ? message.modelUsed : undefined,
        error: message.error === true,
        interruptionReason: optionalText(message.interruptionReason),
        attachments: Array.isArray(message.attachments)
          ? message.attachments.map(normalizeAttachment).filter((a): a is MediaAttachment => Boolean(a))
          : undefined,
        items: Array.isArray(message.items) ? normalizeAssistantItems(message.items) : undefined,
        toolActivity: Array.isArray(message.toolActivity) ? message.toolActivity.filter(isRecord).map((activity) => ({
          name: typeof activity.name === 'string' ? activity.name : '',
          displayName: typeof activity.displayName === 'string' ? activity.displayName : '',
          status: activity.status === 'running' || activity.status === 'done' || activity.status === 'declined' || activity.status === 'cancelled' ? activity.status : 'error',
          detail: typeof activity.detail === 'string' ? activity.detail : undefined,
          action: isRecord(activity.action) ? activity.action : undefined,
          visualImages: Array.isArray(activity.visualImages) ? activity.visualImages.filter(isRecord)
            .filter((image) => typeof image.url === 'string')
            .map((image) => ({ url: String(image.url), label: typeof image.label === 'string' ? image.label : undefined })) : undefined,
        })) : undefined,
      });
    }
    sessions.set(raw.id, {
      id: raw.id,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : '新对话',
      createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
      updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
      messages,
      allowedTools: Array.isArray(raw.allowedTools)
        ? raw.allowedTools.filter((tool): tool is string => typeof tool === 'string') : undefined,
    });
  }
  return Array.from(sessions.values());
}
