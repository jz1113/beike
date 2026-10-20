const listeners = new Set<() => void>();
const KEY = 'beike_generation_media_concurrency_v1';
const normalize = (value: number) => Number.isFinite(value) ? Math.min(6, Math.max(1, Math.trunc(value))) : 3;
let concurrency = 3;
try { const saved = localStorage.getItem(KEY); if (saved !== null) concurrency = normalize(Number(saved)); } catch { /* Storage is optional for this preference. */ }

export function getGenerationMediaConcurrency(): number { return concurrency; }
export function setGenerationMediaConcurrency(value: number): number {
  const next = normalize(value);
  if (next !== concurrency) {
    concurrency = next;
    try { localStorage.setItem(KEY, String(next)); } catch { /* Keep the runtime setting. */ }
    for (const listener of listeners) listener();
  }
  return next;
}
export function subscribeGenerationMediaConcurrency(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
