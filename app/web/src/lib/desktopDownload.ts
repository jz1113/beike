function triggerBrowserDownload(filename: string, data: Blob | Uint8Array) {
  const blobPart: BlobPart =
    data instanceof Blob
      ? data
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const blob = data instanceof Blob ? data : new Blob([blobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

export async function resolveDownloadDir(): Promise<string> {
  return '';
}

export async function pickDownloadDir(): Promise<string | null> {
  return null;
}

export async function pickCacheDir(): Promise<string | null> {
  return null;
}

export async function openFolderInExplorer(dir: string): Promise<void> {
  void dir;
}

export async function saveToDownloadDir(
  filename: string,
  data: Blob | Uint8Array,
): Promise<'desktop' | 'browser'> {
  triggerBrowserDownload(sanitizeFilename(filename), data);
  return 'browser';
}

export async function getAppDataDir(): Promise<string> {
  return '';
}

export async function getSystemMemoryBytes(): Promise<number> {
  return 0;
}

export interface DiskUsageStats {
  db_bytes: number;
  storage_bytes: number;
  storage_file_count: number;
  derived_bytes: number;
  derived_file_count: number;
}

export interface AppMemoryUsage {
  rss_bytes: number;
  total_system_bytes: number;
}

export async function getAppMemoryUsage(): Promise<AppMemoryUsage | null> {
  return null;
}

export async function getTauriDiskUsage(): Promise<DiskUsageStats | null> {
  return null;
}

export function dispatchMemoryCleanup() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('azhuo:memory-cleanup'));
  const gc = (window as unknown as { gc?: () => void }).gc;
  if (typeof gc === 'function') gc();
}
