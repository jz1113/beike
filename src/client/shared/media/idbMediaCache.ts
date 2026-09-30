import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { isIdbCacheEnabled } from '@client/shared/utils/localStoragePrefs';

const DB_NAME = 'azhuo-media-cache';
const DB_VERSION = 1;
const MAX_BYTES = 500 * 1024 * 1024;
const MAX_ENTRIES = 2000;

interface DerivedRecord {
  blob: Blob;
  mime: string;
  size: number;
  createdAt: number;
  lastAccessAt: number;
  sourceUrl: string;
}

interface AzhuoMediaCacheDB extends DBSchema {
  derived: {
    key: string;
    value: DerivedRecord;
    indexes: { 'by-lastAccessAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<AzhuoMediaCacheDB>> | null = null;

function hashUrl(url: string): string {
  let h = 2166136261;
  for (let i = 0; i < url.length; i += 1) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `d_${(h >>> 0).toString(16)}`;
}

function cacheKey(url: string): string {
  // A 32-bit hash can alias unrelated covers or media URLs. IndexedDB accepts
  // full string keys; the legacy hash is used only for guarded compatibility.
  return `media:${url}`;
}

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AzhuoMediaCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('derived')) {
          const store = db.createObjectStore('derived');
          store.createIndex('by-lastAccessAt', 'lastAccessAt');
        }
      },
    }).catch((reason: unknown) => {
      dbPromise = null;
      throw reason;
    });
  }
  return dbPromise;
}

async function enforceLimits() {
  const db = await getDb();
  const tx = db.transaction('derived', 'readonly');
  const store = tx.objectStore('derived');
  const index = store.index('by-lastAccessAt');

  let totalBytes = 0;
  let count = 0;
  const entries: { key: string; size: number; lastAccessAt: number }[] = [];

  let cursor = await index.openCursor();
  while (cursor) {
    const rec = cursor.value;
    count += 1;
    totalBytes += rec?.size || 0;
    entries.push({
      key: cursor.primaryKey as string,
      size: rec?.size || 0,
      lastAccessAt: rec?.lastAccessAt || 0,
    });
    cursor = await cursor.continue();
  }
  await tx.done;

  if (count <= MAX_ENTRIES && totalBytes <= MAX_BYTES) return;

  entries.sort((a, b) => a.lastAccessAt - b.lastAccessAt);
  const writeTx = db.transaction('derived', 'readwrite');
  for (const entry of entries) {
    if (count <= MAX_ENTRIES && totalBytes <= MAX_BYTES) break;
    await writeTx.store.delete(entry.key);
    count -= 1;
    totalBytes -= entry.size;
  }
  await writeTx.done;
}

export async function putDerived(url: string, blob: Blob, mime?: string): Promise<void> {
  if (!isIdbCacheEnabled() || typeof window === 'undefined' || !url) return;
  try {
    const db = await getDb();
    const now = Date.now();
    const record: DerivedRecord = {
      blob,
      mime: mime || blob.type || 'application/octet-stream',
      size: blob.size,
      createdAt: now,
      lastAccessAt: now,
      sourceUrl: url,
    };
    await db.put('derived', record, cacheKey(url));
    await enforceLimits();
  } catch {
    /* quota or private mode */
  }
}

export async function getDerived(url: string): Promise<Blob | null> {
  if (typeof window === 'undefined' || !url) return null;
  try {
    const db = await getDb();
    const key = cacheKey(url);
    let rec = await db.get('derived', key);
    const legacyKey = hashUrl(url);
    const isLegacy = !rec;
    if (!rec) rec = await db.get('derived', legacyKey);
    if (!rec || rec.sourceUrl !== url) return null;
    try {
      rec.lastAccessAt = Date.now();
      await db.put('derived', rec, key);
      if (isLegacy) {
        // Remove the old entry only after the full key is durable, and compare
        // its source inside the write transaction so a collision is never
        // allowed to remove another media record.
        const tx = db.transaction('derived', 'readwrite');
        const legacy = await tx.store.get(legacyKey);
        if (legacy?.sourceUrl === url) await tx.store.delete(legacyKey);
        await tx.done;
      }
    } catch {
      /* ignore timestamp update failure on desearialized Blobs in Safari/WebKit */
    }
    return rec.blob;
  } catch {
    return null;
  }
}

export async function deleteDerived(url: string): Promise<void> {
  if (typeof window === 'undefined' || !url) return;
  try {
    const db = await getDb();
    const tx = db.transaction('derived', 'readwrite');
    await tx.store.delete(cacheKey(url));
    const legacyKey = hashUrl(url);
    const legacy = await tx.store.get(legacyKey);
    if (legacy?.sourceUrl === url) await tx.store.delete(legacyKey);
    await tx.done;
  } catch {
    /* storage may be unavailable or already cleared */
  }
}

export async function getDerivedCacheStats(throwOnError = false): Promise<{ count: number; bytes: number; available?: boolean }> {
  if (typeof window === 'undefined') return { count: 0, bytes: 0, available: false };
  try {
    const db = await getDb();
    const all = await db.getAll('derived');
    return {
      count: all.length,
      bytes: all.reduce((sum, r) => sum + (r?.size || 0), 0),
      available: true,
    };
  } catch (error) {
    if (throwOnError) throw error;
    return { count: 0, bytes: 0, available: false };
  }
}

export async function clearDerivedCache(): Promise<{ count: number; bytes: number }> {
  if (typeof window === 'undefined') return { count: 0, bytes: 0 };
  const before = await getDerivedCacheStats(true);
  if (before.count === 0 && before.bytes === 0) return before;

  const db = await getDb();
  await db.clear('derived');
  return before;
}

/** fetch 并写入 IDB 缓存，返回 blob */
export async function fetchWithDerivedCache(url: string, init?: RequestInit): Promise<Blob> {
  const cached = await getDerived(url);
  if (cached) return cached;
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const blob = await res.blob();
  void putDerived(url, blob, blob.type || res.headers.get('content-type') || undefined);
  return blob;
}

export async function getDerivedObjectUrl(url: string): Promise<string | null> {
  const blob = await getDerived(url);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
