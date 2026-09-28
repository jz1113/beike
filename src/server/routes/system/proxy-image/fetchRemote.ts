import { gatewayFetch } from '../../../gateways/http';
import { assertSafeRemoteUrl } from '@server/infrastructure/network/safeUrl';

const MAX_REDIRECTS = 5;

export async function fetchRemote(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 25000,
): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      await assertSafeRemoteUrl(current, { requireAllowlist: true });
    } catch {
      return null;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await gatewayFetch(current, { headers, signal: ctrl.signal, redirect: 'manual' });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location || hop === MAX_REDIRECTS) return null;
        current = new URL(location, current).toString();
        continue;
      }
      return res;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}
