/** 桌面生产环境下 API 服务基址（如 http://127.0.0.1:3000） */
let apiBase = import.meta.env.VITE_API_BASE?.trim() || '';

export function getApiBase(): string {
  return apiBase;
}

export function setApiBase(base: string) {
  apiBase = base.replace(/\/+$/, '');
}

export function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  const base = getApiBase();
  if (!base) return input;

  if (typeof input === 'string') {
    if (input.startsWith('/api')) return `${base}${input}`;
    return input;
  }

  if (input instanceof URL && input.pathname.startsWith('/api')) {
    return new URL(`${base}${input.pathname}${input.search}`);
  }

  return input;
}

export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
