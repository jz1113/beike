import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';

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
  images: (string | ExportImageItem)[];
}

/**
 * POST /api/export-zip
 * 接收图片列表或批量商品/素材列表并打包下载 ZIP
 * 支持单商品打包 & 多商品批量分层目录打包
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      batchTitle = '全渠道采集批量导出',
      products,
      // 兼容单商品传参
      skuId = 'COLLECTION_EXPORT', 
      productTitle = '采集素材图集', 
      description = '',
      images = [] 
    } = body as {
      batchTitle?: string;
      products?: ProductExportUnit[];
      skuId?: string;
      productTitle?: string;
      description?: string;
      images?: (string | ExportImageItem)[];
    };

    const zip = new JSZip();

    // 辅助下载函数
    const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
      try {
        if (url.startsWith('data:image/')) {
          const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            return Buffer.from(matches[2], 'base64');
          }
        } else {
          const imgRes = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(15000)
          });

          if (!imgRes.ok) return null;
          const arrayBuffer = await imgRes.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      } catch (err: any) {
        console.error(`下载图片失败 [${url.slice(0, 60)}]:`, err.message);
      }
      return null;
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

      for (let pIdx = 0; pIdx < products.length; pIdx++) {
        const prod = products[pIdx];
        const pTitle = prod.title || prod.productTitle || `商品_${pIdx + 1}`;
        const pId = prod.skuId || `ID_${pIdx + 1}`;
        const safeFolderName = `${String(pIdx + 1).padStart(2, '0')}_${pTitle.slice(0, 25)}_${pId.slice(0, 10)}`.replace(/[\\/:*?"<>|]/g, '_');
        const prodFolder = rootFolder.folder(safeFolderName) || rootFolder;

        batchManifest.push(`[${String(pIdx + 1).padStart(2, '0')}] 目录: ${safeFolderName}`);
        batchManifest.push(`     标题: ${pTitle}`);
        batchManifest.push(`     图片: ${prod.images?.length || 0} 张`);

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
        if (prod.description) {
          prodManifestLines.push(`\n------------------【商品描述/文案】------------------\n`);
          prodManifestLines.push(prod.description);
        }
        prodManifestLines.push(`\n------------------【图片明细】------------------\n`);

        const pDownloads = uniqueList.map(async (item, iIdx) => {
          const u = typeof item === 'string' ? item : item.url;
          const num = typeof item === 'object' && item.shotNo ? item.shotNo : iIdx + 1;
          let filename = typeof item === 'object' && item.filename ? item.filename : `image_${String(num).padStart(2, '0')}.jpg`;
          if (!filename.includes('.')) filename += '.jpg';

          prodManifestLines.push(`【${num}】 ${filename} -> ${u}`);

          const buf = await fetchImageBuffer(u);
          if (buf) {
            prodFolder.file(filename, buf);
            totalSuccessImages++;
          } else {
            prodFolder.file(`${filename}.error.txt`, `图片下载失败，原始URL: ${u}`);
          }
        });

        await Promise.all(pDownloads);
        prodFolder.file('商品参数与清单.txt', prodManifestLines.join('\n'));
      }

      batchManifest.push(`\n已成功打包图片总数: ${totalSuccessImages} 张`);
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
    // 模式 B：单商品/单条目常规导出 (向后完全兼容)
    // -------------------------------------------------------------
    if (!images || images.length === 0) {
      return NextResponse.json({ success: false, error: '没有可打包的图片' }, { status: 400 });
    }

    const cleanFolderName = (productTitle || skuId || '素材图集').slice(0, 30).replace(/[\\/:*?"<>|]/g, '_');
    const folder = zip.folder(cleanFolderName) || zip;

    // 严格指纹去重（消除同源重复下载）
    const seenUrls = new Set<string>();
    const uniqueImagesList: (string | ExportImageItem)[] = [];
    for (const item of images) {
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
    if (description) {
      manifestLines.push(`\n------------------【文案/描述内容】------------------\n`);
      manifestLines.push(description);
    }
    manifestLines.push(`\n------------------【图片明细与原始链接】------------------\n`);

    const downloadPromises = normalizedImages.map(async (item, idx) => {
      const num = item.shotNo || idx + 1;
      let filename = item.filename || `image_${String(num).padStart(2, '0')}.jpg`;
      if (!filename.includes('.')) filename += '.jpg';

      manifestLines.push(`【序号 ${num}】: ${filename}`);
      if (item.prompt) manifestLines.push(`提示词  : ${item.prompt}`);
      manifestLines.push(`原始链接: ${item.url}`);
      manifestLines.push(`-------------------------------------------------------`);

      const buf = await fetchImageBuffer(item.url);
      if (buf) {
        folder.file(filename, buf);
      } else {
        folder.file(`${filename}.error.txt`, `图片下载失败，原图URL: ${item.url}`);
      }
    });

    await Promise.all(downloadPromises);
    folder.file(`素材与文案清单.txt`, manifestLines.join('\n'));

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const encodedFilename = encodeURIComponent(`${cleanFolderName}_高清图集.zip`);
    return new Response(zipBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(cleanFolderName)}.zip"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': zipBuffer.length.toString()
      }
    });

  } catch (error: any) {
    console.error('Export ZIP error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '导出 ZIP 压缩包失败'
    }, { status: 500 });
  }
}
