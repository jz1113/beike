import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { gatewayFetch } from '../../gateways/http';
import { assertSafeRemoteUrl } from '@server/infrastructure/network/safeUrl';
import { resolveStoredMediaPath, isWorkspaceStorageRel } from '@server/infrastructure/storage/storagePaths';
import { getManagedStorageKey } from '@server/infrastructure/storage/storage';
import { getObjectStreamFromStorage } from '@server/infrastructure/storage/storageRead';
import { guessMediaDownloadMime } from '@shared/domain/media/mediaDownload';
import { EXPORT_ZIP_LIMITS } from '@shared/domain/media/exportZipLimits';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { listImageTaskWorkspaceIdsByResultUrl } from '@server/repositories/system';

export interface ExportMediaSource {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
  inline?: boolean;
}

async function awaitWithAbort<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  const pending = run();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason || new Error('导出已取消或超时'));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  // The losing DNS promise remains observed, so a late rejection cannot escape.
  try { return await Promise.race([pending, aborted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}

function buildExportHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    Accept: '*/*',
  };
  const host = new URL(url).hostname.toLowerCase();
  const rules: Array<[string[], string]> = [
    [['xhscdn.com', 'xiaohongshu.com'], 'https://www.xiaohongshu.com/'],
    [['douyinpic.com', 'byteimg.com', 'pstatp.com', 'snssdk.com', 'bytecdn.cn'], 'https://www.douyin.com/'],
    [['kuaishou.com', 'yximgs.com', 'kwaicdn.com', 'kwimgs.com'], 'https://www.kuaishou.com/'],
    [['360buyimg.com', 'jd.com'], 'https://item.jd.com/'],
    [['alicdn.com', 'taobaocdn.com', 'taobao.com', 'tmall.com'], 'https://item.taobao.com/'],
    [['aiproxy.vip', 'comfly.org'], 'https://api.aiproxy.vip/'],
  ];
  for (const [hosts, referer] of rules) {
    if (hosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) { headers.Referer = referer; break; }
  }
  return headers;
}

async function resolveLocalExportPath(url: string): Promise<string | null> {
  let relative: string;
  try { relative = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\//, ''); } catch { return null; }
  if (relative.includes('\\') || relative.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  if (relative.startsWith('storage/')) {
    const storedRelative = relative.slice('storage/'.length);
    const workspaceId = requireWorkspaceId();
    if (!isWorkspaceStorageRel(storedRelative, workspaceId)) {
      const legacy = /^generated\/(images|videos)\/local\/[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|avif|mp4|webm|mov)$/i.test(storedRelative);
      if (!legacy) return null;
      const owners = await listImageTaskWorkspaceIdsByResultUrl(`/storage/${storedRelative}`);
      if (owners.length && !owners.includes(workspaceId)) return null;
    }
    return resolveStoredMediaPath(storedRelative);
  }
  for (const root of ['src/client/public', process.env.WEB_DIST_DIR || 'tools/build/ui']) {
    try {
      const realRoot = await fs.realpath(path.resolve(root));
      const target = await fs.realpath(path.resolve(realRoot, relative));
      if (target.startsWith(realRoot + path.sep)) return target;
    } catch { /* Try the next public media root. */ }
  }
  return null;
}

async function fetchRemoteMedia(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Response | null> {
  let currentUrl = url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal.throwIfAborted();
    const response = await gatewayFetch(currentUrl, {
      headers, signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]), redirect: 'manual',
    }).catch(() => null);
    if (!response) return null;
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => {});
    if (!location || redirects === 3) return null;
    currentUrl = new URL(location, currentUrl).toString();
    await awaitWithAbort(() => assertSafeRemoteUrl(currentUrl, { requireAllowlist: true }), signal);
  }
  return null;
}

/** Media bodies are consumed once, with byte limits enforced by the disk staging writer. */
export async function openExportMedia(rawUrl: string, signal: AbortSignal): Promise<ExportMediaSource> {
  const url = rawUrl.trim().replace(/^\/\//, 'https://').split('#')[0];
  signal.throwIfAborted();
  if (url.startsWith('data:')) {
    const match = /^data:([^,;]+)(?:;charset=[^,;]+)?;base64,([a-z0-9+/=\r\n]+)$/i.exec(url);
    if (!match) throw new Error('媒体数据格式无效');
    const base64 = match[2].replace(/\s/g, '');
    if (base64.length > Math.ceil(EXPORT_ZIP_LIMITS.inlineBytes / 3) * 4) throw new Error('内嵌媒体数据超过 25 MB，请先保存为媒体链接后导出');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')) throw new Error('媒体数据不完整');
    return { body: Readable.toWeb(Readable.from([buffer]), { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>, contentType: match[1], contentLength: buffer.byteLength, inline: true };
  }
  if (url.startsWith('/') && !url.startsWith('//')) {
    const localPath = await resolveLocalExportPath(url);
    if (!localPath) throw new Error('本地媒体文件不存在或不在允许的媒体目录');
    const stat = await fs.stat(localPath);
    if (!stat.isFile()) throw new Error('本地媒体路径不是文件');
    return { body: Readable.toWeb(createReadStream(localPath, { signal, highWaterMark: 64 * 1024 }), { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>, contentType: guessMediaDownloadMime(url), contentLength: stat.size };
  }
  if (url.startsWith('blob:')) throw new Error('浏览器临时媒体需要先保存到媒体库再打包');
  const storageKey = getManagedStorageKey(url);
  if (storageKey) {
    const stored = await getObjectStreamFromStorage(storageKey, signal);
    if (stored) return stored;
  }
  await awaitWithAbort(() => assertSafeRemoteUrl(url, { requireAllowlist: true }), signal);
  let error = '无法下载媒体文件';
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = buildExportHeaders(url);
    const withoutReferer = { ...headers };
    delete withoutReferer.Referer;
    const plans = /aiproxy\.vip|comfly\.org/i.test(url) ? [withoutReferer, headers] : [headers, withoutReferer];
    for (const plan of plans) {
      const response = await fetchRemoteMedia(url, plan, signal);
      if (!response?.ok) {
        error = `下载失败（HTTP ${response?.status || '网络异常'}）`;
        await response?.body?.cancel().catch(() => {});
        if (response && response.status < 500 && ![401, 403, 408, 425, 429].includes(response.status)) throw new Error(error);
        continue;
      }
      if (response.status === 206 || response.headers.has('content-range')) {
        await response.body?.cancel().catch(() => {});
        throw new Error('下载地址仅返回部分文件，无法打包完整媒体');
      }
      if (!response.body) throw new Error('媒体响应没有文件内容');
      const rawLength = response.headers.get('content-length');
      const contentLength = !response.headers.has('content-encoding') && rawLength && /^\d+$/.test(rawLength) ? Number(rawLength) : undefined;
      return { body: response.body, contentType: response.headers.get('content-type') || guessMediaDownloadMime(url), contentLength };
    }
  }
  throw new Error(error);
}
