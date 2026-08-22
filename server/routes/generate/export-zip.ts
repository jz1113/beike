import { jsonResponse } from '../../adapters/http';
import { readResponseBodyLimited } from '../../lib/readBodyLimited';
import { parseExportZipBody } from '../../lib/validate';
import JSZip from 'jszip';

const MAX_ZIP_TOTAL_BYTES = 500 * 1024 * 1024;
const MAX_ZIP_CONCURRENT = 3;

interface ExportImageItem {
  filename?: string;
  url: string;
  shotNo?: number;
  title?: string;
  prompt?: string;
}

interface ProductExportUnit {
  skuId?: string;
  productTitle?: string;
  title?: string;
  description?: string;
  video?: string | null;
  videoUrl?: string | null;
  images: (string | ExportImageItem)[];
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
      return jsonResponse({ success: false, error: parsed.error }, 400);
    }
    const {
      batchTitle = '全渠道采集批量导出',
      products,
      skuId = 'COLLECTION_EXPORT', 
      productTitle = '采集素材图集', 
      description = '',
      video = null,
      videoUrl = null,
      images = [] 
    } = parsed.data;

    const zip = new JSZip();

    // 成图 CDN（如 aiproxy）单张常 5–10MB+；旧逻辑 25s 超时 + 并发 6 会在读 body 时全部失败
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
      } else if (/kuaishou\.com|yximgs\.com|kwai\.net/i.test(targetUrl)) {
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
      assertSafeRemoteUrl: (u: string, o: { requireAllowlist?: boolean }) => Promise<URL>
    ): Promise<Response | null> => {
      let currentUrl = url;
      let res: Response | null = null;
      for (let hop = 0; hop < 5; hop++) {
        // 超时必须覆盖 headers + body；短超时会在大图读流时被 AbortSignal 误杀
        res = await fetch(currentUrl, {
          headers,
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
          redirect: 'manual',
        });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) return null;
          const nextUrl = new URL(loc, currentUrl).toString();
          await assertSafeRemoteUrl(nextUrl, { requireAllowlist: true });
          currentUrl = nextUrl;
          continue;
        }
        break;
      }
      return res;
    };

    // 智能防盗链与本地资源辅助读取函数 (支持本地相对路径、Base64、网络图片与 MP4 视频)
    const fetchMediaBuffer = async (url: string): Promise<Buffer | null> => {
      try {
        if (!url || typeof url !== 'string') return null;
        if (url.startsWith('data:')) {
          const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            return Buffer.from(matches[2], 'base64');
          }
          return null;
        }

        // 若是本地相对路径 (如 /inspirations/insp_1.jpg 或 /brand/...)
        if (url.startsWith('/') && !url.startsWith('//')) {
          const { resolvePublicPath } = await import('@/lib/safeUrl');
          const localFilePath = resolvePublicPath(url);
          if (localFilePath) {
            const fs = await import('fs');
            return await fs.promises.readFile(localFilePath);
          }
          return null;
        }

        const { assertSafeRemoteUrl, MAX_PROXY_BYTES } = await import('@/lib/safeUrl');
        try {
          await assertSafeRemoteUrl(url, { requireAllowlist: true });
        } catch (e: any) {
          console.error(`导出URL未通过安全校验 [${url.slice(0, 80)}]:`, e?.message || e);
          return null;
        }

        let lastErr: string | null = null;
        for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
          try {
            // aiproxy / comfly 优先无 Referer；其它 CDN 优先带 Referer
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

    // 并发控制执行器 (限制最大并发度，防止大图集压垮网络或被 CDN 封锁)
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

    // -------------------------------------------------------------
    // 模式 A：多商品/多条目批量导出
    // -------------------------------------------------------------
    if (products && Array.isArray(products) && products.length > 0) {
      const cleanBatchName = (batchTitle || '全渠道批量采集成果').replace(/[\\/:*?"<>|]/g, '_');
      const rootFolder = zip.folder(cleanBatchName) || zip;
      const batchManifest: string[] = [];
      batchManifest.push(`=======================================================`);
      batchManifest.push(`           🌸 贝壳云图 · 全渠道批量采集总清单`);
      batchManifest.push(`=======================================================`);
      batchManifest.push(`导出批次    : ${batchTitle}`);
      batchManifest.push(`导出时间    : ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      batchManifest.push(`商品总数    : ${products.length} 个`);
      batchManifest.push(`\n------------------【商品目录明细】------------------\n`);

      let totalSuccessImages = 0;
      let totalSuccessVideos = 0;

      for (let pIdx = 0; pIdx < products.length; pIdx++) {
        const prod = products[pIdx];
        const pTitle = prod.title || prod.productTitle || `商品_${pIdx + 1}`;
        const pId = prod.skuId || `ID_${pIdx + 1}`;
        const safeFolderName = `${String(pIdx + 1).padStart(2, '0')}_${pTitle.slice(0, 25)}_${pId.slice(0, 10)}`.replace(/[\\/:*?"<>|]/g, '_');
        const prodFolder = rootFolder.folder(safeFolderName) || rootFolder;

        const effectiveVideo = prod.video || prod.videoUrl;

        batchManifest.push(`[${String(pIdx + 1).padStart(2, '0')}] 目录: ${safeFolderName}`);
        batchManifest.push(`     标题: ${pTitle}`);
        batchManifest.push(`     图片: ${prod.images?.length || 0} 张${effectiveVideo ? ' | 包含视频' : ''}`);

        // 去重
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

        const prodManifestLines: string[] = [];
        prodManifestLines.push(`=======================================================`);
        prodManifestLines.push(`商品标题    : ${pTitle}`);
        prodManifestLines.push(`来源/SKU-ID : ${pId}`);
        prodManifestLines.push(`图片总数    : ${uniqueList.length} 张`);
        if (effectiveVideo) {
          prodManifestLines.push(`视频地址    : ${effectiveVideo}`);
        }
        if (prod.description) {
          prodManifestLines.push(`\n------------------【商品描述/文案】------------------\n`);
          prodManifestLines.push(prod.description);
        }
        prodManifestLines.push(`\n------------------【素材明细】------------------\n`);

        await mapConcurrent(uniqueList, 2, async (item, iIdx) => {
          const u = typeof item === 'string' ? item : item.url;
          const num = typeof item === 'object' && item.shotNo ? item.shotNo : iIdx + 1;
          let filename = typeof item === 'object' && item.filename ? item.filename : `image_${String(num).padStart(2, '0')}.jpg`;
          if (!filename.includes('.')) filename += '.jpg';

          prodManifestLines.push(`【图片 ${num}】 ${filename} -> ${u}`);

          const buf = await fetchMediaBuffer(u);
          if (buf) {
            prodFolder.file(filename, buf);
            totalSuccessImages++;
          } else {
            prodFolder.file(`${filename}.error.txt`, `图片下载失败，原始URL: ${u}`);
          }
        });

        // 连带下载视频 (若存在)
        if (effectiveVideo) {
          prodManifestLines.push(`【视频文件】 video_01.mp4 -> ${effectiveVideo}`);
          const vBuf = await fetchMediaBuffer(effectiveVideo);
          if (vBuf) {
            prodFolder.file('video_01.mp4', vBuf);
            totalSuccessVideos++;
          } else {
            prodFolder.file('video_error.txt', `视频下载失败，原始URL: ${effectiveVideo}`);
          }
        }

        prodFolder.file('商品参数与清单.txt', prodManifestLines.join('\n'));
      }

      batchManifest.push(`\n已成功打包图片总数: ${totalSuccessImages} 张，视频总数: ${totalSuccessVideos} 个`);
      rootFolder.file('全渠道批量采集总清单.txt', batchManifest.join('\n'));

      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 5 }
      });

      const encodedFilename = encodeURIComponent(`${cleanBatchName}.zip`);
      return new Response(zipBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(cleanBatchName)}.zip"; filename*=UTF-8''${encodedFilename}`,
          'Content-Length': zipBuffer.length.toString()
        }
      });
    }

    // -------------------------------------------------------------
    // 模式 B：单商品/单条目常规导出 (向后完全兼容，支持视频)
    // -------------------------------------------------------------
    const targetVideo = video || videoUrl;
    if ((!images || images.length === 0) && !targetVideo) {
      return jsonResponse({ success: false, error: '没有可打包的图片或视频素材' }, 400);
    }

    const cleanFolderName = (productTitle || skuId || '素材图集').slice(0, 30).replace(/[\\/:*?"<>|]/g, '_');
    const folder = zip.folder(cleanFolderName) || zip;

    // 严格指纹去重（消除同源重复下载）
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
          filename: `image_${String(idx + 1).padStart(2, '0')}.jpg`,
          shotNo: idx + 1
        };
      }
      return item;
    });

    const manifestLines: string[] = [];
    manifestLines.push(`=======================================================`);
    manifestLines.push(`              全渠道素材采集交付清单`);
    manifestLines.push(`=======================================================`);
    manifestLines.push(`素材标题    : ${productTitle}`);
    manifestLines.push(`来源/SKU-ID : ${skuId}`);
    manifestLines.push(`导出时间    : ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    manifestLines.push(`图片总数    : ${normalizedImages.length} 张`);
    if (targetVideo) {
      manifestLines.push(`原视频状态  : 已连带打包高清 MP4 文件 (${targetVideo})`);
    }
    if (description) {
      manifestLines.push(`\n------------------【文案/描述内容】------------------\n`);
      manifestLines.push(description);
    }
    manifestLines.push(`\n------------------【素材明细与原始链接】------------------\n`);

    await mapConcurrent(normalizedImages, 2, async (item, idx) => {
      const num = item.shotNo || idx + 1;
      let filename = item.filename || `image_${String(num).padStart(2, '0')}.jpg`;
      if (!filename.includes('.')) filename += '.jpg';

      manifestLines.push(`【序号 ${num}】: ${filename}`);
      if (item.prompt) manifestLines.push(`提示词  : ${item.prompt}`);
      manifestLines.push(`原始链接: ${item.url}`);
      manifestLines.push(`-------------------------------------------------------`);

      const buf = await fetchMediaBuffer(item.url);
      if (buf) {
        folder.file(filename, buf);
      } else {
        folder.file(`${filename}.error.txt`, `图片下载失败，原图URL: ${item.url}`);
      }
    });

    // 连带下载并打包视频
    if (targetVideo) {
      manifestLines.push(`【无水印原视频】: ${cleanFolderName}_原视频.mp4`);
      manifestLines.push(`视频源链接: ${targetVideo}`);
      manifestLines.push(`-------------------------------------------------------`);

      const vBuf = await fetchMediaBuffer(targetVideo);
      if (vBuf) {
        folder.file(`${cleanFolderName}_原视频.mp4`, vBuf);
      } else {
        folder.file(`视频下载失败说明.txt`, `视频下载失败，原始URL: ${targetVideo}`);
      }
    }

    folder.file(`素材与文案清单.txt`, manifestLines.join('\n'));

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const encodedFilename = encodeURIComponent(`${cleanFolderName}_高清素材包.zip`);
    return new Response(zipBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(cleanFolderName)}.zip"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': zipBuffer.length.toString()
      }
    });

  } catch (error: any) {
    console.error('Export ZIP error:', error);
    return jsonResponse({
      success: false,
      error: error.message || '导出 ZIP 压缩包失败'
    }, 500);
  }
}
