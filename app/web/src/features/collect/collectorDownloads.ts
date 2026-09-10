import { apiFetch, proxyMediaUrl } from '@/lib/apiClient';
import { saveToDownloadDir } from '@/lib/desktopDownload';
import { openExternalUrl } from '@/lib/downloadMedia';
import { formatUserError } from '@beike/domain/upstreamErrors';
import type { BatchTaskItem } from './collectorShared';

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
  const successTasks = tasks.filter(
    (t) => t.status === 'success' && ((t.images && t.images.length > 0) || t.video),
  );
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

      const payloadProducts = chunkTasks.map((t, idx) => ({
        skuId: `PROD_${start + idx + 1}`,
        title: t.title || `商品_${start + idx + 1}`,
        description: `来源链接: ${t.url}\n抓取时间: ${t.time || ''}`,
        images: Array.isArray(t.images) ? t.images.filter(Boolean) : [],
        video: t.video || undefined,
      }));

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
  } catch (err: any) {
    console.error('批量打包下载异常:', err);
    showToast(`❌ 批量打包下载失败: ${formatUserError(err)}`);
  } finally {
    setExporting(false);
  }
}

/**
 * 汇总库中一键打包选中的商品
 */
export async function downloadBatchSelectedHistory(
  items: any[],
  selectedIds: string[],
  showToast: (msg: string) => void,
  setDownloading: (loading: boolean) => void,
) {
  const selectedList = items.filter((it) => selectedIds.includes(it.id));
  if (selectedList.length === 0) {
    showToast('⚠️ 请先在汇总库中勾选需要打包下载的商品');
    return;
  }

  setDownloading(true);
  const BATCH_CHUNK_SIZE = 50;
  const totalChunks = Math.ceil(selectedList.length / BATCH_CHUNK_SIZE);
  showToast(`📦 开始打包选中的 ${selectedList.length} 个商品（共 ${totalChunks} 个分卷包）...`);

  try {
    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const start = chunkIdx * BATCH_CHUNK_SIZE;
      const end = Math.min(start + BATCH_CHUNK_SIZE, selectedList.length);
      const chunkList = selectedList.slice(start, end);

      showToast(`📦 正在打包第 ${chunkIdx + 1}/${totalChunks} 卷 (第 ${start + 1}~${end} 款)...`);

      const payloadProducts = chunkList.map((it, idx) => ({
        skuId: it.skuId || `PROD_${start + idx + 1}`,
        title: it.title || '采集图集',
        description: it.description || `来源: ${it.sourceUrl || ''}\n作者: ${it.author || ''}`,
        images: it.images || [],
      }));

      const res = await apiFetch('/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchTitle:
            totalChunks === 1
              ? `贝壳云图采集汇总_${selectedList.length}款`
              : `贝壳云图采集汇总_第${chunkIdx + 1}卷(${start + 1}-${end}款)`,
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
          ? `贝壳云图采集汇总_批量导出_${selectedList.length}款.zip`
          : `贝壳云图采集汇总_第${chunkIdx + 1}卷(${start + 1}-${end}款).zip`;

      await saveToDownloadDir(zipFilename, blob);
    }

    showToast(`🎉 全部 ${selectedList.length} 款商品已成功全量打包下载！`);
  } catch (err: any) {
    showToast(`❌ 批量打包下载失败: ${formatUserError(err)}`);
  } finally {
    setDownloading(false);
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
  const videoUrl = item.video || item.videoUrl;
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
    await saveToDownloadDir(
      `${(item.title || '社媒视频').slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')}_无水印原视频.mp4`,
      blob,
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
  if ((!item.images || item.images.length === 0) && !item.video) {
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
        skuId: item.skuId || item.id,
        productTitle: item.title,
        description: item.description || `来源: ${item.sourceUrl || ''}`,
        video: item.video || null,
        images: item.images || [],
      }),
    });

    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);

    const blob = await res.blob();
    await saveToDownloadDir(
      `${item.title.slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')}_高清图集.zip`,
      blob,
    );
    showToast('🎉 高清图集 ZIP 已成功下载！');
  } catch (err: any) {
    showToast(`❌ 打包下载失败: ${formatUserError(err)}`);
  } finally {
    setDownloading(false);
  }
}
