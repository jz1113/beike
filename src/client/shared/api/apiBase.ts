/** 开发或反代场景下的 API 基址；同源部署时为空。 */
const apiBase = import.meta.env.VITE_API_BASE?.trim() || '';

export function getApiBase(): string {
  return apiBase;
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
