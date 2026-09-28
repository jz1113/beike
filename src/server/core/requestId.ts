import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, Next } from 'hono';

const REQUEST_ID_HEADER = 'x-request-id';
const requestIdStore = new AsyncLocalStorage<{ requestId: string }>();

export function createRequestId(existing?: string | null): string {
  const value = existing?.trim();
  return value || crypto.randomUUID();
}

export function getRequestId(req?: Request): string {
  const fromHeader = req?.headers.get(REQUEST_ID_HEADER)?.trim();
  if (fromHeader) return fromHeader;
  return requestIdStore.getStore()?.requestId || '';
}

export async function requestIdMiddleware(c: Context, next: Next) {
  const requestId = createRequestId(c.req.header(REQUEST_ID_HEADER));
  c.header(REQUEST_ID_HEADER, requestId);
  await requestIdStore.run({ requestId }, () => next());
}
