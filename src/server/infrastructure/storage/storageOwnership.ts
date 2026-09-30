import type { StorageConfig } from './storageConfiguration';
import { extractKnownStorageKey } from './storageUrl';

/** Strict managed-object identity; signed query parameters do not change ownership. */
export function getKnownManagedStorageKey(rawUrl: string, config?: StorageConfig | null): string | null {
  const rawKey = extractKnownStorageKey(rawUrl, config);
  if (!rawKey) return null;
  let key: string;
  try { key = decodeURIComponent(rawKey); } catch { return null; }
  if (!key.startsWith('azhuo/') || /[\\%]/.test(key) || Array.from(key).some(char => char.charCodeAt(0) < 32) || key.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return key;
}

