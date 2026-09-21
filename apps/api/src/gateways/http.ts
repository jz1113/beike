export const DEFAULT_GATEWAY_TIMEOUT_MS = 20_000;

export async function gatewayFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(DEFAULT_GATEWAY_TIMEOUT_MS),
  });
}
