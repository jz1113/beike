import type { AssistantSSEEvent } from '@shared/domain/assistant/events';

/** Translate runtime tool payloads into the legacy event contract. */
export function legacyToolCallEvent(
  payload: Record<string, unknown>,
  status: 'running' | 'done' | 'error',
): Extract<AssistantSSEEvent, { type: 'tool_call' }> {
  return {
    type: 'tool_call',
    name: String(payload.name || ''),
    displayName: String(payload.displayName || payload.name || ''),
    status,
    detail: String(payload.args || '').slice(0, 120),
  };
}

export function legacyToolResultEvent(
  payload: Record<string, unknown>,
  status: 'done' | 'error' | 'cancelled',
  summary: string,
  action?: Record<string, unknown>,
  visualImages?: Array<{ url: string; label?: string }>,
): Extract<AssistantSSEEvent, { type: 'tool_result' }> {
  return {
    type: 'tool_result',
    name: String(payload.name || ''),
    displayName: String(payload.displayName || payload.name || ''),
    status: status === 'done' ? 'done' : 'error',
    detail: summary,
    ...(action ? { action } : {}),
    ...(visualImages && visualImages.length > 0 ? { visualImages } : {}),
  };
}
