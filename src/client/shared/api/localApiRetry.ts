const DEFAULT_RETRY_DELAYS_MS = [800, 1600, 2600] as const;

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
    const timer = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timer);
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

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    // A transport error may happen after the model accepted the POST.
    response = await request();
    if (!(await isLocalApiUnavailable(response))) return response;

    const delayMs = delays[attempt];
    if (delayMs === undefined) {
      return response;
    }
    await waitForRetry(delayMs, signal);
  }

  // The loop always returns or throws, but this satisfies TypeScript's control-flow analysis.
  throw new Error('本地后台服务未连接');
}
