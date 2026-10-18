import { normalizeReasoningEffort, type ReasoningEffort } from './reasoning';

/** Explicit model-compatible preference; legacy auto becomes a fixed default. */
export function resolveTurnEffort(model: string, preference: ReasoningEffort | undefined): ReasoningEffort {
  return normalizeReasoningEffort(model, preference);
}

export const EXECUTION_LIMITS = Object.freeze({ maxModelRequests: 10, maxToolCalls: 24, maxRounds: 6, maxSubAgents: 2, maxRepeatedToolCalls: 3, deadlineMs: 10 * 60_000 });
export const SANDBOX_LIMITS = Object.freeze({ memoryBytes: 32 * 1024 * 1024, stackBytes: 512 * 1024, timeoutMs: 120_000, cpuTimeMs: 1500, maxToolCalls: 24, maxCodeChars: 32_000, maxOutputChars: 32_000 });
export function outputBudgetOptions(model: string, effort?: ReasoningEffort) {
  const value = normalizeReasoningEffort(model, effort);
  const tokens = value === 'low' ? 8192 : 16384;
  return (model.startsWith('gpt-') || model === 'kimi-k3') ? { max_completion_tokens: tokens } : { max_tokens: tokens };
}
