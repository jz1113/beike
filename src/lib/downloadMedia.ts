import { apiFetch, proxyMediaUrl } from '@/lib/apiClient';
import { saveToDownloadDir } from '@/lib/desktopDownload';
import { isTauriDesktop } from '@/lib/desktopRuntime';
import { fetchWithDerivedCache } from '@/lib/idbMediaCache';

/** 桌面端用系统浏览器/默认应用打开外链，Web 端用 window.open / 程序化 <a> 兜底 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  if (isTauriDesktop()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch (err) {
      console.warn('[openExternalUrl] Tauri opener failed, trying fallback:', err);
    }
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
}

async function fetchMediaBlob(url: string): Promise<Blob> {
  if (!url) throw new Error('缺少下载地址');
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) {
    return fetchWithDerivedCache(url);
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await apiFetch(proxyMediaUrl(url));
    if (!res.ok) throw new Error(`下载失败 (${res.status})`);
    return res.blob();
  }
  return fetchWithDerivedCache(url);
}

/** 下载远程/本地媒体：桌面优先写入下载目录，否则浏览器下载 */
export async function downloadMedia(
  url: string,
  filename: string,
): Promise<'desktop' | 'browser'> {
  const blob = await fetchMediaBlob(url);
  return saveToDownloadDir(filename, blob);
}

/** 下载失败时尝试在外部打开原链接 */
export async function downloadMediaOrOpen(
  url: string,
  filename: string,
): Promise<void> {
  try {
    const mode = await downloadMedia(url, filename);
    if (mode === 'browser') await openExternalUrl(url);
  } catch {
    await openExternalUrl(url);
  }
}
