import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { openExternalUrl } from '@client/shared/media/downloadMedia';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { collectedVideos, type BatchTaskItem } from './collectorTypes';

function orderForExport<T extends { importOrder?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.importOrder ?? Number.MAX_SAFE_INTEGER) - (b.importOrder ?? Number.MAX_SAFE_INTEGER));
}

function toExportProduct(item: any, currentName: number) {
  return {
    currentName: String(currentName),
    skuId: item.skuId || item.id || `PROD_${currentName}`,
    title: item.title || `采集素材_${currentName}`,
    description: item.description || `来源: ${item.sourceUrl || item.url || ''}`,
    sourceUrl: item.sourceUrl || item.url || '',
    coverImage: item.coverImage || item.images?.[0] || '',
    images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
    videos: collectedVideos(item),
  };
}

/**
 * 下载标准批量采集表格导入模板
 */
export function downloadCsvTemplate(showToast: (msg: string) => void) {
  const csvHeader = '商品链接,商品名称,所属平台,备注说明\n';
  const csvRows = [
    'https://item.jd.com/100012043978.html,vivo iQOO Neo11 智能手机,京东,首发爆款测款',
    'https://detail.tmall.com/item.htm?id=689123456789,复古黑胶蓝牙音箱,天猫,高客单爆款',
    'https://www.xiaohongshu.com/discovery/item/66a123456789,夏季清爽背心穿搭买家秀,小红书,社媒爆款图文复刻',
    'https://detail.1688.com/offer/712345678901.html,轻奢纯白客制化机械键盘,1688,供应链原厂货源',
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' });
  void saveToDownloadDir('全渠道商品批量采集导入模板.csv', blob);
  showToast('📥 已下载「全渠道商品批量采集导入模板.csv」！可在 Excel 中直接编辑');
}

/**
 * 批量打包下载成功抓取的任务
 */
export async function downloadBatchSuccessTasks(
  tasks: BatchTaskItem[],
  showToast: (msg: string) => void,
  setExporting: (loading: boolean) => void,
) {
  const successTasks = orderForExport(tasks.filter(
    (t) => t.status === 'success' && ((t.images && t.images.length > 0) || collectedVideos(t).length > 0),
  ));
  if (successTasks.length === 0) {
    showToast('⚠️ 当前没有已采集成功的商品可供打包下载');
    return;
  }

  setExporting(true);
  const BATCH_CHUNK_SIZE = 50; // 每 50 个商品一个分卷压缩包，避免内存溢出与网络超时
  const totalChunks = Math.ceil(successTasks.length / BATCH_CHUNK_SIZE);
  showToast(`📦 开始打包 ${successTasks.length} 个采集商品（共 ${totalChunks} 个分卷包，16路并发处理）...`);

  try {
    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const start = chunkIdx * BATCH_CHUNK_SIZE;
      const end = Math.min(start + BATCH_CHUNK_SIZE, successTasks.length);
      const chunkTasks = successTasks.slice(start, end);

      showToast(`📦 正在打包第 ${chunkIdx + 1}/${totalChunks} 卷 (第 ${start + 1}~${end} 款)...`);

      const payloadProducts = chunkTasks.map((t, idx) => toExportProduct(t, start + idx + 1));

      const res = await apiFetch('/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchTitle:
            totalChunks === 1
              ? `全渠道批量采集_${new Date().toISOString().slice(0, 10)}`
              : `全渠道批量采集_第${chunkIdx + 1}卷(${start + 1}-${end}款)`,
          products: payloadProducts,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `第 ${chunkIdx + 1} 卷导出失败 HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const zipFilename =
        totalChunks === 1
          ? `全渠道批量采集成果包_${new Date().toISOString().slice(0, 10)}.zip`
          : `全渠道批量采集成果包_第${chunkIdx + 1}卷(第${start + 1}-${end}款).zip`;

      await saveToDownloadDir(zipFilename, blob);
    }

    showToast(`🎉 全部 ${successTasks.length} 款商品已成功分卷打包下载完成！`);
  } catch (err: unknown) {
    console.error('批量打包下载异常:', err);
    showToast(`❌ 批量打包下载失败: ${formatUserError(err)}`);
  } finally {
    setExporting(false);
  }
}

/**
 * 单视频快速下载 MP4
 */
export async function downloadSingleVideo(
  item: any,
  showToast: (msg: string) => void,
  setDownloading: (loading: boolean) => void,
) {
  const videoUrl = collectedVideos(item)[0];
  if (!videoUrl) {
    showToast('⚠️ 未检测到该条目的可下载视频链接');
    return;
  }

  setDownloading(true);
  showToast(`🎬 正在下载「${(item.title || '无水印原视频').slice(0, 15)}...」...`);

  try {
    const proxyUrl = proxyMediaUrl(videoUrl, { asVideo: true });
    let res = await apiFetch(proxyUrl);
    if (!res.ok) {
      res = await fetch(videoUrl);
    }
    if (!res.ok) throw new Error(`视频下载失败 HTTP ${res.status}`);

    const blob = await res.blob();
    const contentType = (res.headers.get('content-type') || blob.type || '').toLowerCase();
    const unusable = contentType.includes('image/svg') || blob.size < 1024;
    const downloadBlob = unusable
      ? await (async () => {
          const direct = await fetch(videoUrl);
          if (!direct.ok) throw new Error(`视频下载失败 HTTP ${direct.status}`);
          const directBlob = await direct.blob();
          if (directBlob.size < 1024) throw new Error('视频下载失败');
          return directBlob;
        })()
      : blob;
    await saveToDownloadDir(
      `${(item.title || '社媒视频').slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')}_无水印原视频.mp4`,
      downloadBlob,
    );
    showToast('🎉 无水印高清原视频 (MP4) 已成功下载！');
  } catch {
    await openExternalUrl(videoUrl);
    showToast(`已在新标签页为您打开视频播放/下载地址`);
  } finally {
    setDownloading(false);
  }
}

/**
 * 单商品快速打包下载 ZIP
 */
export async function downloadSingleZip(
  item: any,
  showToast: (msg: string) => void,
  setDownloading: (loading: boolean) => void,
) {
  if ((!item.images || item.images.length === 0) && collectedVideos(item).length === 0) {
    showToast('⚠️ 该条目没有可供下载的图片或视频');
    return;
  }

  setDownloading(true);
  showToast(`📦 正在打包「${item.title.slice(0, 15)}...」的高清图集与素材...`);

  try {
    const res = await apiFetch('/api/generate/export-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: [toExportProduct(item, 1)],
        batchTitle: item.title || '采集素材',
      }),
    });

    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);

    const blob = await res.blob();
    await saveToDownloadDir(
      `${item.title.slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')}_素材包.zip`,
      blob,
    );
    showToast('🎉 素材 ZIP 与 Excel 清单已成功下载！');
  } catch (err: unknown) {
    showToast(`❌ 打包下载失败: ${formatUserError(err)}`);
  } finally {
    setDownloading(false);
  }
}
