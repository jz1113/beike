import { gatewayFetch } from '../../gateways/http';
import { readResponseBodyLimited } from '../../core/readBodyLimited';
import type { ExportZipBody } from '@shared/contracts/exportZip';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import JSZip from 'jszip';
import {
  TXT_FILE_OPTS,
  MEDIA_FILE_OPTS,
  sanitizeFileSystemName,
  mediaExtension,
  addExportManifest,
  type ExportManifestRow,
} from './exportZipFiles';

export { sanitizeFileSystemName, buildProductFolderName } from './exportZipFiles';

/** 打包下载默认使用最高并发（上限 16 路） */
const DEFAULT_DOWNLOAD_CONCURRENCY = 16;
const MAX_DOWNLOAD_CONCURRENCY = 16;

function resolveDownloadConcurrency(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DOWNLOAD_CONCURRENCY;
  }
  return Math.max(1, Math.min(MAX_DOWNLOAD_CONCURRENCY, Math.floor(value)));
}

/** 规范化拼接小红书种草文案文本文件内容 */
export function buildCopywritingTxtContent(
  title?: string,
  content?: string,
  tags?: string[],
  fallbackDesc?: string
): string {
  if (title || content) {
    const lines: string[] = [];
    if (title) {
      lines.push(`【小红书种草标题】：\n${title.trim()}\n`);
    }
    if (content) {
      lines.push(`【小红书买家秀正文】：\n${content.trim()}\n`);
    }
    if (tags && tags.length > 0) {
      lines.push(`【话题标签】：\n${tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}\n`);
    }
    return lines.join('\n');
  }
  return (fallbackDesc || '').trim();
}

interface ExportImageItem {
  filename?: string;
  url: string;
  shotNo?: number;
  title?: string;
  prompt?: string;
}

interface PendingDownloadTask {
  folder: JSZip;
  filename: string;
  url: string;
  errorFilename: string;
  errorMessage: string;
}

/**
 * POST /api/generate/export-zip
 * 接收图片列表或批量商品/素材列表并打包下载 ZIP
 * 支持单商品打包 & 多商品批量分层目录打包 & 原视频连带打包
 */
type ExportZipResult =
  | { kind: 'zip'; zipBuffer: Buffer; zipFileName: string; counts?: { completed: number; total: number } }
  | { kind: 'error'; body: { success: false; error: string }; status: number };

export async function generateExportZip(body: ExportZipBody): Promise<ExportZipResult> {
  try {
    const {
      batchTitle = '全渠道采集批量导出',
      offlineMatrix = false,
      downloadConcurrency: requestedConcurrency,
      products,
      productTitle = '采集素材图集',
      description = '',
      video = null,
      videoUrl = null,
      images = []
    } = body;

    const downloadConcurrency = resolveDownloadConcurrency(requestedConcurrency);
    const zip = new JSZip();

    const DOWNLOAD_TIMEOUT_MS = 120_000;
    const DOWNLOAD_RETRIES = 3;

    const buildUpstreamHeaders = (targetUrl: string, withReferer: boolean): Record<string, string> => {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      };
      if (!withReferer) return headers;

      if (/xhscdn\.com|xiaohongshu\.com/i.test(targetUrl)) {
        headers.Referer = 'https://www.xiaohongshu.com/';
      } else if (/douyinpic\.com|byteimg\.com|douyin\.com|pstatp\.com|snssdk\.com|bytecdn\.cn|tos-cn-/i.test(targetUrl)) {
        headers.Referer = 'https://www.douyin.com/';
      } else if (/kuaishou\.com|yximgs\.com|kwaicdn\.com|kwimgs\.com|kwai\.net/i.test(targetUrl)) {
        headers.Referer = 'https://www.kuaishou.com/';
      } else if (/360buyimg\.com|jd\.com/i.test(targetUrl)) {
        headers.Referer = 'https://item.jd.com/';
      } else if (/alicdn\.com|taobaocdn\.com|taobao\.com|tmall\.com/i.test(targetUrl)) {
        headers.Referer = 'https://item.taobao.com/';
      } else if (/aiproxy\.vip|comfly\.org/i.test(targetUrl)) {
        headers.Referer = 'https://api.aiproxy.vip/';
      }
      return headers;
    };

    const fetchOnce = async (
      url: string,
      headers: Record<string, string>,
      assertSafeRemoteUrl: (u: string, opt?: { requireAllowlist?: boolean }) => Promise<any>
    ): Promise<Response | null> => {
      let currentUrl = url;
      let res: Response | null = null;
      for (let redirectCount = 0; redirectCount < 3; redirectCount++) {
        res = await gatewayFetch(currentUrl, {
          headers,
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
          redirect: 'manual',
        }).catch(() => null);

        if (!res) return null;
        if ([301, 302, 307, 308].includes(res.status)) {
          const location = res.headers.get('location');
          if (!location) return null;
          const nextUrl = new URL(location, currentUrl).toString();
          await assertSafeRemoteUrl(nextUrl, { requireAllowlist: true });
          currentUrl = nextUrl;
          continue;
        }
        break;
      }
      return res;
    };

    const fetchMediaBuffer = async (url: string): Promise<Buffer | null> => {
      try {
        if (!url || typeof url !== 'string') return null;
        if (url.startsWith('data:')) {
          const matches = url.match(/^data:([A-Za-z0-9!#$&^_.+\-/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            return Buffer.from(matches[2], 'base64');
          }
          return null;
        }

        if (url.startsWith('/') && !url.startsWith('//')) {
          const { resolvePublicPath } = await import('@server/infrastructure/network/safeUrl');
          const localFilePath = resolvePublicPath(url);
          if (localFilePath) {
            const fs = await import('fs');
            return await fs.promises.readFile(localFilePath);
          }
          return null;
        }

        const { assertSafeRemoteUrl, MAX_PROXY_BYTES } = await import('@server/infrastructure/network/safeUrl');
        try {
          await assertSafeRemoteUrl(url, { requireAllowlist: true });
        } catch (e: any) {
          console.error(`导出URL未通过安全校验 [${url.slice(0, 80)}]:`, e?.message || e);
          return null;
        }

        let lastErr: string | null = null;
        for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
          try {
            const preferBare = /aiproxy\.vip|comfly\.org/i.test(url);
            const headerPlans = preferBare
              ? [buildUpstreamHeaders(url, false), buildUpstreamHeaders(url, true)]
              : [buildUpstreamHeaders(url, true), buildUpstreamHeaders(url, false)];

            let res: Response | null = null;
            for (const headers of headerPlans) {
              res = await fetchOnce(url, headers, assertSafeRemoteUrl);
              if (res?.ok) break;
            }

            if (!res || !res.ok) {
              lastErr = `HTTP ${res?.status || 'null'}`;
              console.warn(`导出下载失败 attempt=${attempt} [${url.slice(0, 80)}] ${lastErr}`);
              continue;
            }

            const cl = res.headers.get('content-length');
            if (cl) {
              const len = Number.parseInt(cl, 10);
              if (Number.isFinite(len) && len > MAX_PROXY_BYTES) {
                lastErr = 'too large (content-length)';
                return null;
              }
            }

            const bodyResult = await readResponseBodyLimited(res, MAX_PROXY_BYTES);
            if (!bodyResult.ok) {
              lastErr = bodyResult.reason;
              continue;
            }
            return bodyResult.buffer;
          } catch (err: any) {
            lastErr = err?.message || String(err);
            console.warn(`导出下载异常 attempt=${attempt} [${url.slice(0, 80)}]:`, lastErr);
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
        console.error(`导出最终失败 [${url.slice(0, 80)}]:`, lastErr);
      } catch (err: any) {
        console.error(`下载媒体失败 [${url.slice(0, 60)}]:`, err.message);
      }
      return null;
    };

    const mapConcurrent = async <T, R>(
      items: T[],
      limit: number,
      fn: (item: T, index: number) => Promise<R>
    ): Promise<R[]> => {
      const results: R[] = new Array(items.length);
      let nextIndex = 0;

      const worker = async () => {
        while (nextIndex < items.length) {
          const current = nextIndex++;
          results[current] = await fn(items[current], current);
        }
      };

      const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
      await Promise.all(workers);
      return results;
    };

    const runPendingDownloads = async (tasks: PendingDownloadTask[]) => {
      if (tasks.length === 0) return 0;
      let completed = 0;

      await mapConcurrent(tasks, downloadConcurrency, async (task) => {
        const buf = await fetchMediaBuffer(task.url);
        if (buf) {
          task.folder.file(task.filename, buf, MEDIA_FILE_OPTS);
          completed++;
        } else {
          task.folder.file(task.errorFilename, task.errorMessage, TXT_FILE_OPTS);
        }
      });
      return completed;
    };

    const buildZipResult = async (zipFileName: string, counts?: { completed: number; total: number }): Promise<ExportZipResult> => {
      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'STORE',
      });
      return { kind: 'zip', zipBuffer, zipFileName, counts };
    };

    // -------------------------------------------------------------
    // 模式 A：多商品/多条目批量导出（全局下载池）
    // -------------------------------------------------------------
    if (products && Array.isArray(products) && products.length > 0) {
      const cleanBatchName = (batchTitle || '全渠道批量采集成果').replace(/[\\/:*?"<>|]/g, '_');
      const rootFolder = zip.folder(cleanBatchName) || zip;
      const pendingTasks: PendingDownloadTask[] = [];
      const manifestRows: ExportManifestRow[] = [];

      for (let pIdx = 0; pIdx < products.length; pIdx++) {
        const prod = products[pIdx];
        const pTitle = prod.copywritingTitle || prod.title || prod.productTitle || `商品_${pIdx + 1}`;
        const currentName = sanitizeFileSystemName(String(prod.currentName || pIdx + 1), String(pIdx + 1));
        const safeFolderName = currentName;
        const prodFolder = rootFolder.folder(safeFolderName) || rootFolder;
        const effectiveVideos = Array.from(new Set([
          ...(Array.isArray(prod.videos) ? prod.videos : []),
          prod.video,
          prod.videoUrl,
        ].filter((url): url is string => typeof url === 'string' && Boolean(url))));

        const firstImage = prod.images?.[0];
        const firstImageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url || '';
        manifestRows.push({
          '当前命名': currentName,
          '原标题': pTitle,
          '链接': prod.sourceUrl || '',
          '封面图链接': prod.coverImage || firstImageUrl,
        });

        const prodCopyTxt = buildCopywritingTxtContent(
          prod.copywritingTitle || prod.title,
          prod.copywritingContent,
          prod.copywritingTags,
          prod.description
        );
        if (prodCopyTxt) {
          prodFolder.file('小红书种草文案.txt', prodCopyTxt, TXT_FILE_OPTS);
        }

        const seenUrls = new Set<string>();
        const uniqueList: (string | ExportImageItem)[] = [];
        for (const item of prod.images || []) {
          const u = typeof item === 'string' ? item.trim() : item?.url?.trim();
          if (!u) continue;
          const canonical = u.split('?')[0].toLowerCase();
          if (offlineMatrix || !seenUrls.has(canonical)) {
            seenUrls.add(canonical);
            uniqueList.push(item);
          }
        }

        for (let iIdx = 0; iIdx < uniqueList.length; iIdx++) {
          const item = uniqueList[iIdx];
          const u = typeof item === 'string' ? item : item.url;
          const num = iIdx + 1;
          let filename = typeof item === 'object' && item.filename ? item.filename : `${num}.${mediaExtension(u, 'image')}`;
          if (!filename.includes('.')) filename += '.jpg';

          pendingTasks.push({
            folder: prodFolder,
            filename,
            url: u,
            errorFilename: `${filename}.error.txt`,
            errorMessage: `图片下载失败，原始URL: ${u}`,
          });
        }

        for (let vIdx = 0; vIdx < effectiveVideos.length; vIdx++) {
          const videoUrl = effectiveVideos[vIdx];
          pendingTasks.push({
            folder: prodFolder,
            filename: `${uniqueList.length + vIdx + 1}.${mediaExtension(videoUrl, 'video')}`,
            url: videoUrl,
            errorFilename: `${uniqueList.length + vIdx + 1}.error.txt`,
            errorMessage: `视频/动态下载失败，原始URL: ${videoUrl}`,
          });
        }
      }

      addExportManifest(rootFolder, manifestRows);
      const completed = await runPendingDownloads(pendingTasks);
      if (offlineMatrix && completed === 0) {
        return { kind: 'error', body: { success: false, error: '生成文件均无法读取，请刷新任务后重试' }, status: 404 };
      }
      return buildZipResult(cleanBatchName, { completed, total: pendingTasks.length });
    }

    // -------------------------------------------------------------
    // 模式 B：单商品/单条目常规导出 (向后完全兼容，支持视频)
    // -------------------------------------------------------------
    const targetVideos = Array.from(new Set([video, videoUrl].filter((url): url is string => typeof url === 'string' && Boolean(url))));
    if ((!images || images.length === 0) && targetVideos.length === 0) {
      return { kind: 'error', body: { success: false, error: '没有可打包的图片或视频素材' }, status: 400 };
    }

    const effectiveTitle = body.copywritingTitle || productTitle || '买家秀交付包';
    const cleanFolderName = body.folderName
      ? sanitizeFileSystemName(body.folderName)
      : '1';

    const folder = zip.folder(cleanFolderName) || zip;

    const seenUrls = new Set<string>();
    const uniqueImagesList: (string | ExportImageItem)[] = [];
    for (const item of images || []) {
      const u = typeof item === 'string' ? item.trim() : item?.url?.trim();
      if (!u) continue;
      let canonicalKey = u;
      try {
        const p = new URL(u.startsWith('//') ? 'https:' + u : u);
        canonicalKey = `${p.hostname}${p.pathname}`.toLowerCase();
      } catch {
        canonicalKey = u.split('?')[0].toLowerCase();
      }
      if (!seenUrls.has(canonicalKey)) {
        seenUrls.add(canonicalKey);
        uniqueImagesList.push(item);
      }
    }

    const normalizedImages: ExportImageItem[] = uniqueImagesList.map((item, idx) => {
      if (typeof item === 'string') {
        return { url: item, filename: `${idx + 1}.${mediaExtension(item, 'image')}`, shotNo: idx + 1 };
      }
      return item;
    });

    const copywritingTxt = buildCopywritingTxtContent(
      body.copywritingTitle,
      body.copywritingContent,
      body.copywritingTags,
      description
    );
    if (copywritingTxt) {
      folder.file('小红书种草文案.txt', copywritingTxt, TXT_FILE_OPTS);
    }

    const pendingTasks: PendingDownloadTask[] = normalizedImages.map((item, idx) => {
      const num = item.shotNo || idx + 1;
      let filename = item.filename || `${num}.${mediaExtension(item.url, 'image')}`;
      if (!filename.includes('.')) filename += '.jpg';

      return {
        folder,
        filename,
        url: item.url,
        errorFilename: `${filename}.error.txt`,
        errorMessage: `图片下载失败，原图URL: ${item.url}`,
      };
    });

    for (let vIdx = 0; vIdx < targetVideos.length; vIdx++) {
      const targetVideo = targetVideos[vIdx];
      pendingTasks.push({
        folder,
        filename: `${normalizedImages.length + vIdx + 1}.${mediaExtension(targetVideo, 'video')}`,
        url: targetVideo,
        errorFilename: `${normalizedImages.length + vIdx + 1}.error.txt`,
        errorMessage: `视频/动态下载失败，原始URL: ${targetVideo}`,
      });
    }

    addExportManifest(folder, [{
      '当前命名': '1',
      '原标题': effectiveTitle,
      '链接': '',
      '封面图链接': typeof images[0] === 'string' ? images[0] : images[0]?.url || '',
    }]);

    await runPendingDownloads(pendingTasks);
    return buildZipResult(cleanFolderName);

  } catch (error: unknown) {
    console.error('Export ZIP error:', error);
    return { kind: 'error', body: { success: false, error: formatUserError(error, '导出 ZIP 压缩包失败') }, status: 500 };
  }
}
