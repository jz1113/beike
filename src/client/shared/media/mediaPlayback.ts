async function readAccessFailure(response: Response): Promise<string> {
  if (!response.body?.getReader) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (bytes < 4096) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, 4096 - bytes);
      bytes += chunk.length;
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  } catch { return ''; }
  finally { await reader.cancel().catch(() => {}); }
}

function isMediaProxy(src: string): boolean {
  try {
    const path = new URL(src, 'http://media.local').pathname;
    return path === '/api/system/proxy-image' || path === '/api/system/proxy-video';
  } catch { return false; }
}

/** Diagnose a failed media request without downloading the whole video or audio again. */
export async function describeMediaPlaybackError(src: string, code?: number, signal?: AbortSignal): Promise<string> {
  const fallback = code === 3 || code === 4
    ? '当前媒体格式无法播放，请更换为 MP4 视频或 MP3、WAV 音频后重试。'
    : '媒体加载失败，请检查网络后重试。';
  if (!src || /^(blob:|data:)/.test(src)) return fallback;
  try {
    const response = await fetch(src, { headers: { Range: 'bytes=0-0' }, signal });
    if (response.status === 401 || response.status === 403) {
      const detail = await readAccessFailure(response);
      const proxy = isMediaProxy(src);
      if (proxy && response.status === 403 && detail.includes('地址被安全策略拦截')) {
        return '媒体来源被后台安全策略拦截，请检查媒体来源配置或更新后台后重新加载。';
      }
      if (proxy && detail.includes('媒体访问被拒绝')) {
        return '素材来源拒绝了媒体访问，请检查来源链接或授权后重试。';
      }
      if (response.status === 401) return '媒体服务未授权，请刷新页面后重试。';
      return '媒体访问被拒绝（HTTP 403），请检查后台访问规则及素材来源授权。';
    }
    await response.body?.cancel();
    if (response.status === 404 || response.status === 410) return '媒体文件不存在或链接已失效，请重新导入素材。';
    if (response.status >= 500) return '媒体服务暂时不可用，请确认后台服务已启动后重试。';
    if (!response.ok) return `媒体加载失败（${response.status}），请稍后重试。`;
    if (/^(application\/json|text\/|image\/svg\+xml)/i.test(response.headers.get('content-type') || '')) {
      return '媒体地址未返回可播放的文件，请检查素材链接或后台服务后重试。';
    }
    return fallback;
  } catch {
    return '无法连接媒体服务，请检查网络和后台服务后重试。';
  }
}
