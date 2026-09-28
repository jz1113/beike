import type { ToolResultStore } from '../toolResultStore';

/** Compact only older tool outputs; never cut reasoning, user constraints or call/result pairs. */
export function compactToolContext(messages: unknown[], store: ToolResultStore): number {
  const outputs = messages.map((value, index) => ({ message: value as { role?: string; content?: unknown }, index }))
    .filter(({ message }) => message.role === 'tool' && typeof message.content === 'string');
  let total = outputs.reduce((sum, { message }) => sum + (message.content as string).length, 0);
  if (total <= 48_000) return 0;
  let count = 0;
  for (const { message, index } of outputs.slice(0, -4)) {
    if (total <= 32_000) break;
    const raw = message.content as string;
    if (raw.length < 2500) continue;
    // Existing references are already compact and must not be nested.
    try { if (JSON.parse(raw)?.storedResult) continue; } catch { /* Text output. */ }
    const compacted = store.forModel(raw, 2000);
    if (compacted.length >= raw.length || !JSON.parse(compacted).storedResult) continue;
    messages[index] = { ...message, content: compacted };
    total -= raw.length - compacted.length;
    count++;
  }
  return count;
}
