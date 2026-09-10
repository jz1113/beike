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
  const message = serializeArgs(args);
  // 过滤 Tauri 正常 fallback 提示及 Vite 握手等非业务噪声
  if (
    message.includes('IPC custom protocol failed') ||
    message.includes('postMessage interface instead') ||
    message.includes('[vite] connected') ||
    message.includes('[vite] connecting') ||
    message.includes('Download the React DevTools')
  ) {
    return;
  }
  // 抑制短时间内连续重复的相同日志
  if (pending.length > 0 && pending[pending.length - 1].message === message) {
    return;
  }

  pending.push({ level, message });
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
