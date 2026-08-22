/** 桌面本地存储偏好（localStorage） */

export const DESKTOP_PREFS = {
  downloadDir: 'desktop_download_dir',
  downloadDirHandle: 'desktop_download_dir_handle',
  cacheDir: 'desktop_cache_dir',
  cacheEnabled: 'desktop_cache_enabled',
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

function readStr(key: string): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(key) || '';
}

function writeStr(key: string, value: string) {
  if (typeof window === 'undefined') return;
  if (!value.trim()) localStorage.removeItem(key);
  else localStorage.setItem(key, value.trim());
}

export function getDownloadDir(): string {
  return readStr(DESKTOP_PREFS.downloadDir);
}

export function setDownloadDir(dir: string) {
  writeStr(DESKTOP_PREFS.downloadDir, dir);
}

export function getDownloadDirHandle(): string {
  return readStr(DESKTOP_PREFS.downloadDirHandle);
}

export function setDownloadDirHandle(handle: string) {
  writeStr(DESKTOP_PREFS.downloadDirHandle, handle);
}

export function getCacheDir(): string {
  return readStr(DESKTOP_PREFS.cacheDir);
}

export function setCacheDir(dir: string) {
  writeStr(DESKTOP_PREFS.cacheDir, dir);
}

export function isCacheDirEnabled(): boolean {
  return readBool(DESKTOP_PREFS.cacheEnabled, false);
}

export function setCacheDirEnabled(enabled: boolean) {
  writeBool(DESKTOP_PREFS.cacheEnabled, enabled);
}

export function isProjectAutosaveEnabled(): boolean {
  return readBool(DESKTOP_PREFS.projectAutosave, true);
}

export function setProjectAutosaveEnabled(enabled: boolean) {
  writeBool(DESKTOP_PREFS.projectAutosave, enabled);
}

export function isIdbCacheEnabled(): boolean {
  return readBool(DESKTOP_PREFS.idbCacheEnabled, true);
}

export function setIdbCacheEnabled(enabled: boolean) {
  writeBool(DESKTOP_PREFS.idbCacheEnabled, enabled);
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
