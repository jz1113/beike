import { useGenerationEngine } from './useGenerationEngine';

/** Task subscriptions must not invalidate the application shell on every progress update. */
export function GenerationEngineHost() {
  useGenerationEngine();
  return null;
}
