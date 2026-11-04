import { useEffect, useState } from 'react';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '../apiClient';
import { getGatewayClientHeaders } from '../gatewayClient';
import { STORAGE_CONFIG_CHANGED_EVENT } from '../persistCredentials';

export type SeedancePrecheckStatus = 'verifying' | 'passed' | 'rejected' | 'skipped';

export interface SeedancePrecheckItemInput {
  url: string;
  mediaType?: 'image' | 'video' | 'depth-image' | 'depth-video';
}

export interface SeedancePrecheckEntry {
  url: string;
  mediaType: 'image' | 'video';
  status: SeedancePrecheckStatus;
  assetUri?: string;
  error?: string;
  durationSec?: number;
  width?: number;
  height?: number;
}

interface PrecheckContext {
  fingerprint: string;
  cache: Map<string, SeedancePrecheckEntry>;
  inflight: Map<string, Promise<SeedancePrecheckEntry>>;
}

const contexts = new Map<string, PrecheckContext>();
const listeners = new Set<() => void>();

function currentContext(model: string, storage = readClientStorageConfig(), gateway = getGatewayClientHeaders(model)): PrecheckContext {
  const fingerprint = JSON.stringify([storage, gateway]);
  let context = contexts.get(model);
  if (!context || context.fingerprint !== fingerprint) {
    context = { fingerprint, cache: new Map(), inflight: new Map() };
    contexts.set(model, context);
  }
  return context;
}

function notify() {
  listeners.forEach((fn) => fn());
}

function normalizeKind(mediaType?: string, url?: string): 'image' | 'video' {
  const lower = (mediaType || '').toLowerCase();
  if (lower === 'video' || lower === 'depth-video') return 'video';
  if (lower === 'image' || lower === 'depth-image') return 'image';
  const clean = (url || '').split('?')[0].split('#')[0].toLowerCase();
  return /\.(mp4|mov|webm|m4v)$/.test(clean) ? 'video' : 'image';
}

export function getSeedancePrecheckEntry(url?: string | null, model = 'doubao-seedance-2.5'): SeedancePrecheckEntry | undefined {
  const key = (url || '').trim();
  return key ? currentContext(model).cache.get(key) : undefined;
}

export async function runSeedancePrecheck(
  items: readonly SeedancePrecheckItemInput[],
  model = 'doubao-seedance-2.5',
  signal?: AbortSignal,
): Promise<SeedancePrecheckEntry[]> {
  const valid = items
    .map((item) => ({ url: item.url.trim(), mediaType: normalizeKind(item.mediaType, item.url) }))
    .filter((item) => Boolean(item.url) && !item.url.startsWith('blob:'));
  if (valid.length === 0) return [];

  const storageConfig = readClientStorageConfig();
  const gatewayHeaders = getGatewayClientHeaders(model);
  // Keep in-flight responses attached to the configuration that started them.
  const { cache: precheckCache, inflight: precheckInflight } = currentContext(model, storageConfig, gatewayHeaders);

  const pending: Array<{ url: string; mediaType: 'image' | 'video' }> = [];
  const queued = new Set<string>();
  for (const item of valid) {
    const existing = precheckCache.get(item.url);
    if (existing && (existing.status === 'passed' || existing.status === 'rejected')) {
      continue;
    }
    if (!precheckInflight.has(item.url) && !queued.has(item.url)) {
      queued.add(item.url);
      pending.push(item);
      precheckCache.set(item.url, { url: item.url, mediaType: item.mediaType, status: 'verifying' });
    }
  }

  if (pending.length > 0) {
    notify();
    const requestPromise = (async () => {
      try {
        const res = await apiFetch('/api/generate/seedance/precheck', {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            ...gatewayHeaders,
            ...storageConfigHeaders(),
          },
          body: JSON.stringify({
            model,
            items: pending,
            customBaseUrl: gatewayHeaders['x-custom-base-url'],
            storageConfig,
          }),
        });
        const data = await res.json().catch(() => null) as {
          success?: boolean;
          results?: SeedancePrecheckEntry[];
          error?: string;
        } | null;
        const map = new Map<string, SeedancePrecheckEntry>();
        if (res.ok && data?.success && Array.isArray(data.results)) {
          for (const row of data.results) {
            if (row?.url) map.set(row.url, row);
          }
        }
        for (const item of pending) {
          const resolved = map.get(item.url) || {
            url: item.url,
            mediaType: item.mediaType,
            status: 'skipped' as const,
            error: data?.error,
          };
          precheckCache.set(item.url, resolved);
        }
      } catch {
        for (const item of pending) {
          precheckCache.set(item.url, { url: item.url, mediaType: item.mediaType, status: 'skipped' });
        }
      } finally {
        for (const item of pending) precheckInflight.delete(item.url);
        notify();
      }
    })();

    for (const item of pending) {
      precheckInflight.set(
        item.url,
        requestPromise.then(() => precheckCache.get(item.url) || { url: item.url, mediaType: item.mediaType, status: 'skipped' }),
      );
    }
    await requestPromise;
  } else {
    const waits = valid.map((item) => precheckInflight.get(item.url)).filter(Boolean);
    if (waits.length > 0) await Promise.all(waits);
  }

  return valid.map((item) => precheckCache.get(item.url) || { url: item.url, mediaType: item.mediaType, status: 'skipped' });
}

export function useSeedancePrecheck(
  items: readonly SeedancePrecheckItemInput[],
  enabled = true,
  model = 'doubao-seedance-2.5',
): ReadonlyMap<string, SeedancePrecheckEntry> {
  const [, setTick] = useState(0);
  const [configRevision, setConfigRevision] = useState(0);
  const context = currentContext(model);
  const serialized = items
    .map((item) => `${item.url.trim()}|${normalizeKind(item.mediaType, item.url)}`)
    .filter((entry) => !entry.startsWith('|'))
    .join('\n');

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    const configurationChanged = () => setConfigRevision((n) => n + 1);
    listeners.add(listener);
    window.addEventListener(STORAGE_CONFIG_CHANGED_EVENT, configurationChanged);
    window.addEventListener('storage', configurationChanged);
    return () => {
      listeners.delete(listener);
      window.removeEventListener(STORAGE_CONFIG_CHANGED_EVENT, configurationChanged);
      window.removeEventListener('storage', configurationChanged);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !serialized) return;
    const parsed = serialized.split('\n').map((row) => {
      const [url, mediaType] = row.split('|');
      return { url, mediaType: (mediaType as 'image' | 'video') || 'image' };
    });
    void runSeedancePrecheck(parsed, model);
  }, [enabled, model, serialized, context, configRevision]);

  const map = new Map<string, SeedancePrecheckEntry>();
  for (const item of items) {
    const key = item.url.trim();
    const found = key ? context.cache.get(key) : undefined;
    if (key && found) map.set(key, found);
  }
  return map;
}

export function clearSeedancePrecheckCacheForTests() {
  contexts.clear();
}
