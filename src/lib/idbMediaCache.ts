import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { isIdbCacheEnabled } from '@/lib/localStoragePrefs';

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

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AzhuoMediaCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('derived')) {
          const store = db.createObjectStore('derived');
          store.createIndex('by-lastAccessAt', 'lastAccessAt');
        }
      },
    });
  }
  return dbPromise;
}

async function enforceLimits() {
  const db = await getDb();
  let entries = await db.getAll('derived');
  let totalBytes = entries.reduce((sum, r) => sum + (r?.size || 0), 0);
  if (entries.length <= MAX_ENTRIES && totalBytes <= MAX_BYTES) return;

  entries = entries.sort((a, b) => (a.lastAccessAt || 0) - (b.lastAccessAt || 0));
  while (entries.length > MAX_ENTRIES || totalBytes > MAX_BYTES) {
    const rec = entries.shift();
    if (!rec) break;
    await db.delete('derived', hashUrl(rec.sourceUrl));
    totalBytes -= rec.size || 0;
  }
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
    await db.put('derived', record, hashUrl(url));
    await enforceLimits();
  } catch {
    /* quota or private mode */
  }
}

export async function getDerived(url: string): Promise<Blob | null> {
  if (typeof window === 'undefined' || !url) return null;
  try {
    const db = await getDb();
    const key = hashUrl(url);
    const rec = await db.get('derived', key);
    if (!rec) return null;
    rec.lastAccessAt = Date.now();
    await db.put('derived', rec, key);
    return rec.blob;
  } catch {
    return null;
  }
}

export async function getDerivedCacheStats(): Promise<{ count: number; bytes: number }> {
  if (typeof window === 'undefined') return { count: 0, bytes: 0 };
  try {
    const db = await getDb();
    const all = await db.getAll('derived');
    return {
      count: all.length,
      bytes: all.reduce((sum, r) => sum + (r?.size || 0), 0),
    };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function clearDerivedCache(): Promise<{ count: number; bytes: number }> {
  if (typeof window === 'undefined') return { count: 0, bytes: 0 };
  const before = await getDerivedCacheStats();
  if (before.count === 0 && before.bytes === 0) return before;

  try {
    if (dbPromise) {
      const db = await dbPromise;
      db.close();
      dbPromise = null;
    }
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  } catch {
    try {
      const db = await getDb();
      await db.clear('derived');
    } catch {
      /* ignore */
    }
  }
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
