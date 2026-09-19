export async function gatewayFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
  timeouts = [8_000, 12_000, 20_000],
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeouts[i] ?? 20_000) });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('上游请求失败');
}
