import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
import LRUCache from 'lru-cache';
import { resolveGatewayCreds } from '@beike/domain/gatewayCreds';
import { getDefaultBaseUrl, getDefaultApiKey } from '../gatewayCredentials';

export function resolveCredentials(req: Request, body?: any) {
  const { baseUrl, apiKey } = resolveGatewayCreds(req, body, {
    baseUrl: getDefaultBaseUrl(),
    apiKey: getDefaultApiKey(),
  });
  return { baseUrl: normalizeGatewayBaseUrl(baseUrl), apiKey };
}

export const videoTaskEndpointCache = new LRUCache<string, string>({ max: 500 });
