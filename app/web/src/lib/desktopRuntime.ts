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
    if (input.startsWith('/api') || input.startsWith('/storage')) return `${base}${input}`;
    return input;
  }

  if (input instanceof URL && (input.pathname.startsWith('/api') || input.pathname.startsWith('/storage'))) {
    return new URL(`${base}${input.pathname}${input.search}`);
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      const urlObj = new URL(input.url);
      if (urlObj.pathname.startsWith('/api') || urlObj.pathname.startsWith('/storage')) {
        return new Request(new URL(`${base}${urlObj.pathname}${urlObj.search}`), input);
      }
    } catch {
      /* ignore invalid URL */
    }
  }

  return input;
}

export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export type DesktopPlatform = 'macos' | 'windows' | 'linux' | 'unknown';

export function getDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === 'undefined') return 'unknown';

  // 1. 优先使用现代 User-Agent Client Hints API (Chromium / WebView2 规范)
  const uaDataPlatform = (navigator as any).userAgentData?.platform?.toLowerCase();
  if (uaDataPlatform) {
    if (uaDataPlatform.includes('win')) return 'windows';
    if (uaDataPlatform.includes('mac')) return 'macos';
    if (uaDataPlatform.includes('linux')) return 'linux';
  }

  // 2. 传统 navigator.platform / navigator.userAgent 规范 (WebKit / macOS 规范)
  const platformStr = (navigator.platform || '').toLowerCase();
  const ua = (navigator.userAgent || '').toLowerCase();

  if (platformStr.includes('win') || ua.includes('windows')) return 'windows';
  if (
    (platformStr.includes('mac') || ua.includes('macintosh') || ua.includes('mac os x')) &&
    !ua.includes('iphone') &&
    !ua.includes('ipad')
  ) {
    return 'macos';
  }
  if (platformStr.includes('linux') || ua.includes('linux')) return 'linux';

  return 'unknown';
}

export function isMacOs(): boolean {
  return getDesktopPlatform() === 'macos';
}

export function isWindows(): boolean {
  return getDesktopPlatform() === 'windows';
}
