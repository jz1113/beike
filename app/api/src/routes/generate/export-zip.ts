import { jsonResponse } from '../../core/http';
import { readResponseBodyLimited } from '../../core/readBodyLimited';
import { parseExportZipBody } from '../../core/validate';
import { formatUserError } from '@beike/domain/upstreamErrors';
import JSZip from 'jszip';

/** 打包下载默认使用最高并发（上限 16 路） */
const DEFAULT_DOWNLOAD_CONCURRENCY = 16;
const MAX_DOWNLOAD_CONCURRENCY = 16;

const TXT_FILE_OPTS: JSZip.JSZipFileOptions = { compression: 'DEFLATE' };
const MEDIA_FILE_OPTS: JSZip.JSZipFileOptions = { compression: 'STORE' };

function resolveDownloadConcurrency(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DOWNLOAD_CONCURRENCY;
  }
  return Math.max(1, Math.min(MAX_DOWNLOAD_CONCURRENCY, Math.floor(value)));
}

/** 严格过滤操作系统文件系统禁止命名的特殊符号 (\ / : * ? " < > | 以及换行符等) */
export function sanitizeFileSystemName(name: string, fallback = 'EXPORT'): string {
  if (!name) return fallback;
  let sanitized = (name || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\r\n\t\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');
  if (!sanitized) sanitized = fallback;
  return sanitized.slice(0, 70);
}

/** 按照【商品id-标题】生成合法的目录名与压缩包名 */
export function buildProductFolderName(skuId?: string, title?: string): string {
  const cleanId = sanitizeFileSystemName(skuId || 'PROD', 'PROD');
  const cleanTitle = sanitizeFileSystemName(title || '', '');
  if (cleanTitle) {
    if (cleanTitle.startsWith(cleanId)) {
      return cleanTitle;
    }
    return `${cleanId}-${cleanTitle}`;
  }
  return cleanId;
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
export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const parsed = parseExportZipBody(rawBody);
    if (!parsed.success) {
      console.error('[export-zip] 请求体验证失败:', parsed.error);
      return jsonResponse({ success: false, error: parsed.error }, 400);
    }
    const {
      batchTitle = '全渠道采集批量导出',
      downloadConcurrency: requestedConcurrency,
      products,
      skuId = 'COLLECTION_EXPORT',
      productTitle = '采集素材图集',
      description = '',
      video = null,
      videoUrl = null,
      images = []
    } = parsed.data;

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
        res = await fetch(currentUrl, {
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
          const matches = url.match(/^data:([A-Za-z\-+/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            return Buffer.from(matches[2], 'base64');
          }
          return null;
        }

        if (url.startsWith('/') && !url.startsWith('//')) {
          const { resolvePublicPath } = await import('@beike/server-kit/safeUrl');
          const localFilePath = resolvePublicPath(url);
          if (localFilePath) {
            const fs = await import('fs');
            return await fs.promises.readFile(localFilePath);
          }
          return null;
        }

        const { assertSafeRemoteUrl, MAX_PROXY_BYTES } = await import('@beike/server-kit/safeUrl');
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
      if (tasks.length === 0) return;

      await mapConcurrent(tasks, downloadConcurrency, async (task) => {
        const buf = await fetchMediaBuffer(task.url);
        if (buf) {
          task.folder.file(task.filename, buf, MEDIA_FILE_OPTS);
        } else {
          task.folder.file(task.errorFilename, task.errorMessage, TXT_FILE_OPTS);
        }
      });
    };

    const buildZipResponse = async (zipFileName: string) => {
      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'STORE',
      });

      const encodedFilename = encodeURIComponent(`${zipFileName}.zip`);
      return new Response(zipBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}.zip"; filename*=UTF-8''${encodedFilename}`,
          'Content-Length': zipBuffer.length.toString()
        }
      });
    };

    // -------------------------------------------------------------
    // 模式 A：多商品/多条目批量导出（全局下载池）
    // -------------------------------------------------------------
    if (products && Array.isArray(products) && products.length > 0) {
      const cleanBatchName = (batchTitle || '全渠道批量采集成果').replace(/[\\/:*?"<>|]/g, '_');
      const rootFolder = zip.folder(cleanBatchName) || zip;
      const pendingTasks: PendingDownloadTask[] = [];

      for (let pIdx = 0; pIdx < products.length; pIdx++) {
        const prod = products[pIdx];
        const pTitle = prod.copywritingTitle || prod.title || prod.productTitle || `商品_${pIdx + 1}`;
        const pId = prod.skuId || `ID_${pIdx + 1}`;
        const safeFolderName = buildProductFolderName(pId, pTitle);
        const prodFolder = rootFolder.folder(safeFolderName) || rootFolder;

        const effectiveVideo = prod.video || prod.videoUrl;

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
          if (!seenUrls.has(canonical)) {
            seenUrls.add(canonical);
            uniqueList.push(item);
          }
        }

        for (let iIdx = 0; iIdx < uniqueList.length; iIdx++) {
          const item = uniqueList[iIdx];
          const u = typeof item === 'string' ? item : item.url;
          const num = typeof item === 'object' && item.shotNo ? item.shotNo : iIdx + 1;
          let filename = typeof item === 'object' && item.filename ? item.filename : `shot_${String(num).padStart(2, '0')}.jpg`;
          if (!filename.includes('.')) filename += '.jpg';

          pendingTasks.push({
            folder: prodFolder,
            filename,
            url: u,
            errorFilename: `${filename}.error.txt`,
            errorMessage: `图片下载失败，原始URL: ${u}`,
          });
        }

        if (effectiveVideo) {
          pendingTasks.push({
            folder: prodFolder,
            filename: 'video_01.mp4',
            url: effectiveVideo,
            errorFilename: 'video_01.error.txt',
            errorMessage: `视频下载失败，原始URL: ${effectiveVideo}`,
          });
        }
      }

      await runPendingDownloads(pendingTasks);
      return buildZipResponse(cleanBatchName);
    }

    // -------------------------------------------------------------
    // 模式 B：单商品/单条目常规导出 (向后完全兼容，支持视频)
    // -------------------------------------------------------------
    const targetVideo = video || videoUrl;
    if ((!images || images.length === 0) && !targetVideo) {
      return jsonResponse({ success: false, error: '没有可打包的图片或视频素材' }, 400);
    }

    const effectiveTitle = parsed.data.copywritingTitle || productTitle || '买家秀交付包';
    const cleanFolderName = parsed.data.folderName
      ? sanitizeFileSystemName(parsed.data.folderName)
      : buildProductFolderName(skuId, effectiveTitle);

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
        return {
          url: item,
          filename: `shot_${String(idx + 1).padStart(2, '0')}.jpg`,
          shotNo: idx + 1
        };
      }
      return item;
    });

    const copywritingTxt = buildCopywritingTxtContent(
      parsed.data.copywritingTitle,
      parsed.data.copywritingContent,
      parsed.data.copywritingTags,
      description
    );
    if (copywritingTxt) {
      folder.file('小红书种草文案.txt', copywritingTxt, TXT_FILE_OPTS);
    }

    const pendingTasks: PendingDownloadTask[] = normalizedImages.map((item, idx) => {
      const num = item.shotNo || idx + 1;
      let filename = item.filename || `shot_${String(num).padStart(2, '0')}.jpg`;
      if (!filename.includes('.')) filename += '.jpg';

      return {
        folder,
        filename,
        url: item.url,
        errorFilename: `${filename}.error.txt`,
        errorMessage: `图片下载失败，原图URL: ${item.url}`,
      };
    });

    if (targetVideo) {
      pendingTasks.push({
        folder,
        filename: `${cleanFolderName}_原视频.mp4`,
        url: targetVideo,
        errorFilename: `${cleanFolderName}_原视频.error.txt`,
        errorMessage: `视频下载失败，原始URL: ${targetVideo}`,
      });
    }

    await runPendingDownloads(pendingTasks);
    return buildZipResponse(cleanFolderName);

  } catch (error: any) {
    console.error('Export ZIP error:', error);
    return jsonResponse({
      success: false,
      error: formatUserError(error, '导出 ZIP 压缩包失败')
    }, 500);
  }
}
