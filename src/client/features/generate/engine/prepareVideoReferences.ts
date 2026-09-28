import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { resolveRefMediaFile } from '@client/shared/media/refMediaRegistry';

function localVideo(url: string) {
  if (!/^https?:\/\//i.test(url)) return true;
  const parsed = new URL(url);
  return parsed.origin === window.location.origin || /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(parsed.hostname);
}

/** A local canvas URL is readable by the browser, but not by a video provider. */
export async function prepareVideoReferences(urls: string[], signal?: AbortSignal): Promise<string[]> {
  const result: string[] = [];
  for (const url of urls) {
    if (!localVideo(url)) { result.push(url); continue; }
    let file = resolveRefMediaFile(url);
    if (!file && (/^blob:|^data:video\//.test(url) || url.startsWith('/storage/') || /^https?:\/\//.test(url))) {
      const response = url.startsWith('/storage/') ? await apiFetch(url, { signal }) : await fetch(url, { signal });
      if (!response.ok) throw new Error('参考视频读取失败，请重新添加素材');
      const blob = await response.blob();
      file = new File([blob], 'reference.mp4', { type: blob.type || 'video/mp4' });
    }
    if (!file) throw new Error('参考视频已失效，请重新添加素材');
    const form = new FormData();
    form.append('file', file);
    form.append('storageConfig', JSON.stringify(readClientStorageConfig()));
    const response = await apiFetch('/api/generate/upload-ref', {
      method: 'POST', body: form, headers: storageConfigHeaders(), signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success || typeof data.url !== 'string' || localVideo(data.url)) {
      throw new Error(data?.error || '参考视频需要公网可访问链接，请检查对象存储配置');
    }
    result.push(data.url);
  }
  return result;
}
