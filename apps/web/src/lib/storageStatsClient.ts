import { apiFetch } from '@/lib/apiClient';
import { getDerivedCacheStats } from '@/lib/idbMediaCache';
import { getTauriDiskUsage } from '@/lib/desktopDownload';

export interface LocalStorageStats {
  imageTaskCount: number;
  productCount: number;
  sceneCount: number;
  outfitCount: number;
  actionCount: number;
  personaCount: number;
  styleRecipeCount: number;
  assistantThreadCount: number;
  promptRecordCount: number;
  promptAssetsTotal: number;
  dbBytes: number;
  dbPath: string;
  dbReadable: boolean;
  storageDirBytes: number;
  storageFileCount: number;
  derivedDirBytes: number;
  derivedFileCount: number;
  idbCount: number;
  idbBytes: number;
  dataDir: string;
  statsAvailable: boolean;
  browserStorageBytes: number | null;
  browserStorageQuota: number | null;
  localStorageBytes: number;
  clearableBytes: number;
}

function pickStat(apiVal: number | undefined, tauriVal: number | undefined): number {
  if (apiVal != null) return apiVal;
  return tauriVal ?? 0;
}

export function getLocalStorageByteSize(): number {
  if (typeof window === 'undefined') return 0;
  let chars = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    chars += key.length + (localStorage.getItem(key)?.length ?? 0);
  }
  return chars * 2;
}

export async function fetchBrowserStorageEstimate(
  delayMs = 0,
): Promise<{ usage: number | null; quota: number | null }> {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: null, quota: null };
  }
  try {
    const est = await navigator.storage.estimate();
    return {
      usage: typeof est.usage === 'number' ? est.usage : null,
      quota: typeof est.quota === 'number' ? est.quota : null,
    };
  } catch {
    return { usage: null, quota: null };
  }
}

export async function fetchLocalStorageStats(options?: { estimateDelayMs?: number }): Promise<LocalStorageStats> {
  const [apiRes, tauriDisk, idbStats, browserEst] = await Promise.all([
    apiFetch('/api/system/local-storage/stats').then((r) => r.json()).catch(() => null),
    getTauriDiskUsage(),
    getDerivedCacheStats(),
    fetchBrowserStorageEstimate(options?.estimateDelayMs ?? 0),
  ]);

  const api = apiRes?.success ? apiRes : null;
  const dbBytes = pickStat(api?.dbBytes, tauriDisk?.db_bytes);
  const storageDirBytes = pickStat(api?.storageDirBytes, tauriDisk?.storage_bytes);
  const storageFileCount = pickStat(api?.storageFileCount, tauriDisk?.storage_file_count);
  const derivedDirBytes = pickStat(api?.derivedDirBytes, tauriDisk?.derived_bytes);
  const derivedFileCount = pickStat(api?.derivedFileCount, tauriDisk?.derived_file_count);
  const localStorageBytes = getLocalStorageByteSize();
  const clearableBytes = derivedDirBytes + idbStats.bytes;

  const statsAvailable = Boolean(
    api?.success
    || tauriDisk
    || idbStats.count > 0
    || idbStats.bytes > 0
    || browserEst.usage != null,
  );

  return {
    imageTaskCount: api?.imageTaskCount ?? 0,
    productCount: api?.productCount ?? 0,
    sceneCount: api?.sceneCount ?? 0,
    outfitCount: api?.outfitCount ?? 0,
    actionCount: api?.actionCount ?? 0,
    personaCount: api?.personaCount ?? 0,
    styleRecipeCount: api?.styleRecipeCount ?? 0,
    assistantThreadCount: api?.assistantThreadCount ?? 0,
    promptRecordCount: api?.promptRecordCount ?? 0,
    promptAssetsTotal: api?.promptAssetsTotal ?? 0,
    dbBytes,
    dbPath: api?.dbPath ?? '',
    dbReadable: Boolean(api?.dbReadable || (tauriDisk?.db_bytes ?? 0) > 0),
    storageDirBytes,
    storageFileCount,
    derivedDirBytes,
    derivedFileCount,
    idbCount: idbStats.count,
    idbBytes: idbStats.bytes,
    dataDir: api?.dataDir ?? '',
    statsAvailable,
    browserStorageBytes: browserEst.usage,
    browserStorageQuota: browserEst.quota,
    localStorageBytes,
    clearableBytes,
  };
}

export async function clearDerivedDiskCache(): Promise<{
  ok: boolean;
  message?: string;
  clearedBytes?: number;
  clearedFileCount?: number;
}> {
  const res = await apiFetch('/api/system/local-storage/clear-derived', { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  return {
    ok: Boolean(data.success),
    message: data.message || data.error,
    clearedBytes: typeof data.clearedBytes === 'number' ? data.clearedBytes : undefined,
    clearedFileCount: typeof data.clearedFileCount === 'number' ? data.clearedFileCount : undefined,
  };
}

export async function persistCacheDirToEnv(cacheDir: string): Promise<boolean> {
  const res = await apiFetch('/api/system/desktop-env', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cacheDir: cacheDir || '' }),
  });
  const data = await res.json().catch(() => ({}));
  return Boolean(data.success);
}
