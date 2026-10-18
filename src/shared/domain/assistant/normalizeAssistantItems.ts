import type { AssistantItem } from './types';
import type { AssistantTaskState } from './taskPolicy';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const status = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? value as T : fallback;

export const MAX_ASSISTANT_TASK_REFERENCES = 1000;

/** Sparse reference numbers are used as array indexes by the UI; bound both dimensions. */
export function normalizeAssistantTaskReferences(value: unknown): AssistantTaskState['references'] {
  if (!Array.isArray(value)) return [];
  const references = new Map<number, AssistantTaskState['references'][number]>();
  for (const reference of value.slice(0, MAX_ASSISTANT_TASK_REFERENCES)) {
    if (!isRecord(reference) || typeof reference.number !== 'number' || !Number.isSafeInteger(reference.number)
      || reference.number < 1 || reference.number > MAX_ASSISTANT_TASK_REFERENCES || typeof reference.url !== 'string') continue;
    if (!references.has(reference.number)) {
      references.set(reference.number, { number: reference.number, label: text(reference.label), url: reference.url });
    }
  }
  return [...references.values()];
}

export function normalizeAssistantTask(value: unknown): AssistantTaskState | undefined {
  if (!isRecord(value) || !['plan', 'act'].includes(text(value.mode))) return undefined;
  const references = normalizeAssistantTaskReferences(value.references);
  return {
    mode: value.mode as 'plan' | 'act', goal: text(value.goal), stage: text(value.stage), references,
    deliverable: status(value.deliverable, ['storyboard', 'selection', 'reply'], 'reply'),
    referenceScope: status(value.referenceScope, ['sample', 'all', 'explicit', 'none'], 'none'),
    totalReferences: typeof value.totalReferences === 'number' && Number.isFinite(value.totalReferences)
      ? Math.max(0, Math.min(MAX_ASSISTANT_TASK_REFERENCES, Math.trunc(value.totalReferences))) : references.length,
    status: status(value.status, ['running', 'completed', 'failed', 'cancelled'], 'failed'),
  };
}

/** Validate persisted and recovered items before rendering or deriving legacy messages. */
export function normalizeAssistantItems(value: unknown): AssistantItem[] {
  if (!Array.isArray(value)) return [];
  const items: AssistantItem[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id || ids.has(raw.id)) continue;
    const base = {
      id: raw.id,
      createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    };
    const name = text(raw.name);
    const displayName = text(raw.displayName, name);
    let item: AssistantItem;
    switch (raw.kind) {
      case 'userMessage':
      case 'agentMessage':
        item = { ...base, kind: raw.kind, content: text(raw.content) };
        break;
      case 'agentReasoning':
        item = { ...base, kind: raw.kind, content: text(raw.content), collapsed: raw.collapsed === true };
        break;
      case 'toolCall':
        item = {
          ...base, kind: raw.kind, name, displayName,
          args: text(raw.args), callId: text(raw.callId, raw.id),
          status: status(raw.status, ['running', 'done', 'error', 'declined', 'cancelled'], 'error'),
          summary: text(raw.summary) || undefined,
        };
        break;
      case 'toolResult':
        item = {
          ...base, kind: raw.kind, name, displayName, summary: text(raw.summary),
          status: status(raw.status, ['done', 'error', 'declined', 'cancelled'], 'error'),
          action: isRecord(raw.action) ? raw.action : undefined,
          visualImages: Array.isArray(raw.visualImages) ? raw.visualImages
            .filter((image) => isRecord(image) && typeof image.url === 'string' && image.url)
            .map((image) => ({ url: image.url as string, label: typeof image.label === 'string' ? image.label : undefined })) : undefined,
        };
        break;
      case 'approvalRequest':
        if (typeof raw.approvalId !== 'string' || !raw.approvalId) continue;
        item = {
          ...base, kind: raw.kind, approvalId: raw.approvalId,
          toolName: text(raw.toolName), displayName: text(raw.displayName, text(raw.toolName)),
          args: isRecord(raw.args) ? raw.args : {},
          status: status(raw.status, ['pending', 'accepted', 'declined', 'expired'], 'expired'),
          decision: ['accept', 'decline', 'acceptForSession', 'cancel'].includes(text(raw.decision))
            ? raw.decision as 'accept' | 'decline' | 'acceptForSession' | 'cancel' : undefined,
        };
        break;
      case 'subAgent':
        item = {
          ...base, kind: raw.kind, skillId: text(raw.skillId), prompt: text(raw.prompt),
          status: status(raw.status, ['spawning', 'running', 'completed', 'failed'], 'failed'),
          result: typeof raw.result === 'string' ? raw.result : undefined,
          subTurnId: typeof raw.subTurnId === 'string' ? raw.subTurnId : undefined,
        };
        break;
      default:
        continue;
    }
    ids.add(raw.id);
    items.push(item);
  }
  return items;
}
