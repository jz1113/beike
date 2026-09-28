import LRUCache from 'lru-cache';
import { gatewayFetch } from '../../gateways/http';

export function createTaskEndpointCache(): LRUCache<string, string> {
  return new LRUCache<string, string>({ max: 500 });
}

export function matchedEndpointBase(url: string, taskId: string): string {
  return url.replace(`/${taskId}`, '').replace(`?task_id=${taskId}`, '').replace(taskId, '').replace(/\/$/, '');
}

export function rememberMatchedEndpoint(
  cache: LRUCache<string, string>,
  cacheKey: string,
  baseKey: string,
  url: string,
  taskId: string,
): string {
  const matchedBase = matchedEndpointBase(url, taskId);
  cache.set(cacheKey, matchedBase);
  cache.set(baseKey, matchedBase);
  return matchedBase;
}

export async function fetchProbeJson(
  url: string,
  apiKey: string,
  timeoutMs: number,
): Promise<{ response: Response; data: unknown } | null> {
  try {
    const response = await gatewayFetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => null);
    if (!data) return null;
    return { response, data };
  } catch {
    return null;
  }
}

export async function probeUpstreamTask(options: {
  urls: string[];
  apiKey: string;
  timeoutMs: number | ((url: string) => number);
  isValid: (data: unknown, response: Response) => boolean;
}): Promise<{ url: string; data: unknown; response: Response } | null> {
  for (const url of options.urls) {
    const timeoutMs = typeof options.timeoutMs === 'function' ? options.timeoutMs(url) : options.timeoutMs;
    const result = await fetchProbeJson(url, options.apiKey, timeoutMs);
    if (!result) continue;
    if (options.isValid(result.data, result.response)) {
      return { url, data: result.data, response: result.response };
    }
  }
  return null;
}
