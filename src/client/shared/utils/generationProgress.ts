/** Textual stages and counters must not masquerade as a percentage. */
export function getGenerationProgress(raw: unknown): number | undefined {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+(?:\.\d+)?\s*%?\s*$/.test(raw) ? Number(raw.replace('%', '').trim()) : NaN;
  return Number.isFinite(value) ? Math.min(99, Math.max(0, Math.round(value))) : undefined;
}
