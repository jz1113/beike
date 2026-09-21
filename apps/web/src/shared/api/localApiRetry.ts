const DEFAULT_RETRY_DELAYS_MS = [800, 1600, 2600] as const;

function isTransientNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|network request failed|load failed|econnreset|econnrefused|enotfound|etimedout|eai_again|socket hang up/i.test(message);
}

async function isLocalApiUnavailable(response: Response): Promise<boolean> {
  if (response.status !== 502) return false;
  const data = await response.clone().json().catch(() => null);
  return typeof data?.error === 'string' && /本地后台服务未连接/.test(data.error);
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, delayMs));
  if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
  const abortSignal = signal;

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(finish, delayMs);
    const abort = () => {
      window.clearTimeout(timer);
      finish(new DOMException('The operation was aborted', 'AbortError'));
    };
    function finish(error?: Error) {
      abortSignal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    }
    abortSignal.addEventListener('abort', abort, { once: true });
  });
}

/**
 * The Vite proxy returns a distinct 502 while the local API sidecar is restarting.
 * Retry only that temporary condition; all model and validation errors are returned unchanged.
 */
export async function retryWhenLocalApiUnavailable<T extends Response>(
  request: () => Promise<T>,
  options: { signal?: AbortSignal; delays?: readonly number[] } = {},
): Promise<T> {
  const { signal, delays = DEFAULT_RETRY_DELAYS_MS } = options;
  let response: T | undefined;
  let networkError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    try {
      response = await request();
      if (!(await isLocalApiUnavailable(response))) return response;
    } catch (error) {
      if (signal?.aborted || !isTransientNetworkError(error)) throw error;
      networkError = error;
    }

    const delayMs = delays[attempt];
    if (delayMs === undefined) {
      if (response) return response;
      throw networkError;
    }
    await waitForRetry(delayMs, signal);
  }

  // The loop always returns or throws, but this satisfies TypeScript's control-flow analysis.
  throw networkError || new Error('本地后台服务未连接');
}
