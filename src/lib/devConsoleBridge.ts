import { getClientAccessToken } from '@/lib/apiToken';
import { resolveApiUrl } from '@/lib/desktopRuntime';

type LogLevel = 'log' | 'warn' | 'error';

interface PendingEntry {
  level: LogLevel;
  message: string;
}

const FLUSH_MS = 200;
const MAX_BATCH = 20;

const pending: PendingEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function serializeArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function flushLogs() {
  flushTimer = null;
  if (pending.length === 0) return;

  const entries = pending.splice(0, MAX_BATCH);
  const url = resolveApiUrl('/api/system/dev-log');
  const target = typeof url === 'string' ? url : '/api/system/dev-log';

  void fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-token': getClientAccessToken(),
    },
    body: JSON.stringify({ entries }),
    keepalive: true,
  }).catch(() => {
    /* dev-only bridge; ignore network errors */
  });

  if (pending.length > 0) {
    flushTimer = setTimeout(flushLogs, FLUSH_MS);
  }
}

function enqueue(level: LogLevel, args: unknown[]) {
  pending.push({ level, message: serializeArgs(args) });
  if (pending.length >= MAX_BATCH) {
    if (flushTimer) clearTimeout(flushTimer);
    flushLogs();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(flushLogs, FLUSH_MS);
  }
}

/** dev-only：将 WebView console 转发到 API 终端 */
export function installDevConsoleBridge() {
  if (installed || !import.meta.env.DEV) return;
  installed = true;

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    origLog(...args);
    enqueue('log', args);
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    enqueue('warn', args);
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    enqueue('error', args);
  };
}
