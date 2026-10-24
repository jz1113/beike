import type { ModalityModelRoute } from '@shared/domain/models/modalityStorage';
import type { TextProtocol } from '@shared/domain/models/textProtocol';
import { normalizeReasoningEffort, type ReasoningEffort } from '@shared/domain/assistant/reasoning';

const STORAGE_KEY = 'beike_cover_reasoning_by_model';
const EFFORTS = new Set<ReasoningEffort>(['auto', 'low', 'medium', 'high', 'xhigh', 'max']);

export function readCoverReasoningMap(): Record<string, ReasoningEffort> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    const value = JSON.parse(raw || '{}') as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([modelId, effort]) => (
      typeof modelId === 'string' && typeof effort === 'string' && EFFORTS.has(effort as ReasoningEffort)
        ? [[modelId, effort as ReasoningEffort] as const]
        : []
    )));
  } catch {
    return {};
  }
}

export function coverReasoningEffort(modelId: string, protocol: TextProtocol | undefined, stored: Record<string, ReasoningEffort>): ReasoningEffort {
  if (!modelId) return 'auto';
  return normalizeReasoningEffort(modelId, stored[modelId], protocol);
}

export function rememberCoverReasoning(
  stored: Record<string, ReasoningEffort>,
  modelId: string,
  value: ReasoningEffort,
  protocol?: TextProtocol,
): Record<string, ReasoningEffort> {
  const next = { ...stored, [modelId]: normalizeReasoningEffort(modelId, value, protocol) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Storage is optional. */
  }
  return next;
}

export function coverDeconstructBody(route: ModalityModelRoute, imageUrl: string, title: string, effort?: ReasoningEffort) {
  const reasoningEffort = normalizeReasoningEffort(route.modelId, effort, route.textProtocol);
  return {
    imageUrls: [imageUrl],
    model: route.modelId,
    textProtocol: route.textProtocol,
    title,
    customBaseUrl: route.baseUrl,
    customApiKey: route.apiKey,
    ...(reasoningEffort === 'auto' ? {} : { reasoningEffort }),
  };
}
