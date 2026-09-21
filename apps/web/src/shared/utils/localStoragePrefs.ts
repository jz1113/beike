/** 浏览器端持久化偏好（localStorage） */

export const BROWSER_STORAGE_PREFS = {
  projectAutosave: 'project_autosave_enabled',
  idbCacheEnabled: 'idb_cache_enabled',
} as const;

function readBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  const raw = localStorage.getItem(key);
  if (raw === null) return defaultValue;
  return raw === 'true';
}

function writeBool(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, String(value));
}

export function isProjectAutosaveEnabled(): boolean {
  return readBool(BROWSER_STORAGE_PREFS.projectAutosave, true);
}

export function setProjectAutosaveEnabled(enabled: boolean) {
  writeBool(BROWSER_STORAGE_PREFS.projectAutosave, enabled);
}

export function isIdbCacheEnabled(): boolean {
  return readBool(BROWSER_STORAGE_PREFS.idbCacheEnabled, true);
}

export function setIdbCacheEnabled(enabled: boolean) {
  writeBool(BROWSER_STORAGE_PREFS.idbCacheEnabled, enabled);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 || i === 0 ? n.toFixed(i === 0 ? 0 : 2) : n.toFixed(2)} ${units[i]}`;
}
