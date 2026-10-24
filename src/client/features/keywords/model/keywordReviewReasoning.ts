import { normalizeReasoningEffort, type ReasoningEffort } from '@shared/domain/assistant/reasoning';
import type { TextProtocol } from '@shared/domain/models/textProtocol';

export const KEYWORD_REVIEW_REASONING_STORAGE_KEY = 'keyword_review_reasoning_effort';

const LEVELS = new Set<ReasoningEffort>(['auto', 'low', 'medium', 'high', 'xhigh', 'max']);

export function readStoredKeywordReviewReasoning(): ReasoningEffort {
  try {
    const raw = localStorage.getItem(KEYWORD_REVIEW_REASONING_STORAGE_KEY);
    if (raw && LEVELS.has(raw as ReasoningEffort)) return raw as ReasoningEffort;
  } catch { /* storage unavailable */ }
  return 'auto';
}

export function saveKeywordReviewReasoning(value: ReasoningEffort): void {
  try { localStorage.setItem(KEYWORD_REVIEW_REASONING_STORAGE_KEY, value); } catch { /* storage unavailable */ }
}

/** The stored choice, narrowed to the levels this model can actually send. */
export function keywordReviewReasoning(model: string, protocol?: TextProtocol): ReasoningEffort {
  return normalizeReasoningEffort(model, readStoredKeywordReviewReasoning(), protocol);
}
