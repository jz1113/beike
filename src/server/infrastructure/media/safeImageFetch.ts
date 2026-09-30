import { MAX_PROXY_BYTES } from '../network/safeUrl';
import { fetchSafeRemoteBytes } from '../network/safeRemoteFetch';

/** Pin DNS and validate redirects before buffering a bounded remote image. */
export async function fetchSafeImageBuffer(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Buffer | null> {
  const { response, buffer } = await fetchSafeRemoteBytes(url, { headers, signal }, MAX_PROXY_BYTES, { requireAllowlist: true });
  return response.ok && buffer.length > 100 ? buffer : null;
}
