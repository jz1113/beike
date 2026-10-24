import { GENERATION_BATCH_LIMIT } from '@shared/domain/assistant/generationPrompts';

const listeners = new Set<() => void>();
const normalize = (value: number) => Number.isFinite(value)
  ? Math.min(GENERATION_BATCH_LIMIT, Math.max(1, Math.trunc(value)))
  : GENERATION_BATCH_LIMIT;
let concurrency = GENERATION_BATCH_LIMIT;

export function getGenerationMediaConcurrency(): number { return concurrency; }
export function setGenerationMediaConcurrency(value: number): number {
  const next = normalize(value);
  if (next !== concurrency) {
    concurrency = next;
    for (const listener of listeners) listener();
  }
  return next;
}
export function subscribeGenerationMediaConcurrency(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
