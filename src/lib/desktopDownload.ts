import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { isTauriDesktop } from '@/lib/desktopRuntime';
import {
  getDownloadDir,
  getDownloadDirHandle,
  setDownloadDir,
  setDownloadDirHandle,
} from '@/lib/localStoragePrefs';

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
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

async function ensureDownloadHandle(dir: string): Promise<string | null> {
  const saved = getDownloadDirHandle();
  if (saved) return saved;
  try {
    const handle = await invoke<string>('register_download_directory', { path: dir });
    setDownloadDirHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

export async function resolveDownloadDir(): Promise<string> {
  if (!isTauriDesktop()) return '';
  const saved = getDownloadDir();
  if (saved) {
    await ensureDownloadHandle(saved);
    return saved;
  }
  try {
    const def = await invoke<string>('get_default_download_dir');
    if (def) {
      setDownloadDir(def);
      await ensureDownloadHandle(def);
      return def;
    }
  } catch {
    /* ignore */
  }
  return '';
}

export async function pickDownloadDir(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择下载目录',
  });
  if (!selected || Array.isArray(selected)) return null;
  setDownloadDir(selected);
  try {
    const handle = await invoke<string>('register_download_directory', { path: selected });
    setDownloadDirHandle(handle);
  } catch {
    setDownloadDirHandle('');
  }
  return selected;
}

export async function pickCacheDir(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择资源缓存目录',
  });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
}

export async function openFolderInExplorer(dir: string): Promise<void> {
  if (!dir || !isTauriDesktop()) return;
  try {
    await revealItemInDir(dir);
  } catch {
    /* ignore */
  }
}

export async function saveToDownloadDir(
  filename: string,
  data: Blob | Uint8Array,
): Promise<'desktop' | 'browser'> {
  const safeName = sanitizeFilename(filename);
  if (isTauriDesktop()) {
    const dir = await resolveDownloadDir();
    const handle = getDownloadDirHandle();
    if (dir && handle) {
      const bytes =
        data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
      try {
        await invoke<string>('save_download_file', {
          directoryHandle: handle,
          filename: safeName,
          data: Array.from(bytes),
          overwrite: false,
        });
        return 'desktop';
      } catch {
        /* fall through to browser download */
      }
    }
  }
  triggerBrowserDownload(safeName, data);
  return 'browser';
}

export async function getAppDataDir(): Promise<string> {
  if (!isTauriDesktop()) return '';
  try {
    return await invoke<string>('get_app_data_dir');
  } catch {
    return '';
  }
}

export async function getSystemMemoryBytes(): Promise<number> {
  if (!isTauriDesktop()) return 0;
  try {
    return await invoke<number>('get_system_memory');
  } catch {
    return 0;
  }
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
  if (!isTauriDesktop()) return null;
  try {
    return await invoke<AppMemoryUsage>('get_app_memory_usage');
  } catch {
    return null;
  }
}

export async function getTauriDiskUsage(): Promise<DiskUsageStats | null> {
  if (!isTauriDesktop()) return null;
  try {
    return await invoke<DiskUsageStats>('get_disk_usage');
  } catch {
    return null;
  }
}

export function dispatchMemoryCleanup() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('azhuo:memory-cleanup'));
  const gc = (window as unknown as { gc?: () => void }).gc;
  if (typeof gc === 'function') gc();
}
