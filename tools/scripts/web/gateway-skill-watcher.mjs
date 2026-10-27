/** Keep the development API's embedded rules aligned with the browser's compiled skill. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function watchGatewaySkill({ workspaceRoot, rebuild, restart, onError, interval = 500 }) {
  const file = join(workspaceRoot, 'src/backend/internal/generate/sales/skill_package.generated.json');
  const read = () => readFileSync(file, 'utf8');
  let observed = read();
  let applied = observed;
  let running = false;
  let closed = false;

  async function refresh() {
    if (running || closed) return;
    running = true;
    try {
      while (!closed && observed !== applied) {
        const target = observed;
        try {
          // Build while the previous API is still available. A failed check/build keeps it alive.
          await rebuild();
          if (closed) return;
          observed = read();
          if (observed !== target) continue;
          await restart();
          applied = target;
        } catch (error) {
          onError(error);
          if (observed === target) return;
        }
      }
    } finally {
      running = false;
    }
  }

  const changed = () => {
    if (closed) return;
    try {
      const next = read();
      if (next === observed) return;
      observed = next;
      void refresh();
    } catch (error) { onError(error); }
  };
  // Compare contents from the initial read: stat-based polling can miss a replacement
  // before its first async stat, or a rewrite with unchanged size and timestamp.
  const timer = setInterval(changed, interval);
  timer.unref();
  return () => {
    closed = true;
    clearInterval(timer);
  };
}
