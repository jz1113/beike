import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { openExternalUrl } from '@client/shared/media/downloadMedia';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { collectedVideos, type BatchTaskItem } from '../model/collectorTypes';
import { collectorExportSignal, readExportBlob, requestCollectorZip, MAX_VIDEO_DOWNLOAD_BYTES } from './collectorExportResponse';
import { splitCollectorExportProducts } from '../model/collectorExportChunks';

type Toast = (message: string) => void;
type Loading = (loading: boolean) => void;
interface DownloadItem {
  skuId?: string; id?: string; title?: string; description?: string; sourceUrl?: string;
  url?: string; author?: string; time?: string; video?: string | null; videoUrl?: string | null;
  videos?: string[]; importOrder?: number; coverImage?: string;
  images?: Array<string | { url: string; filename?: string; shotNo?: number }>;
}
interface DownloadProduct { skuId: string; title: string; description: string; images: NonNullable<DownloadItem['images']>; videos: string[]; currentName: string; sourceUrl: string; coverImage: string }

/** 下载标准批量采集表格导入模板 */
export async function downloadCsvTemplate(showToast: Toast) {
  const csv = '商品链接,商品名称,所属平台,备注说明\n' + [
    'https://item.jd.com/100012043978.html,vivo iQOO Neo11 智能手机,京东,首发爆款测款',
    'https://detail.tmall.com/item.htm?id=689123456789,复古黑胶蓝牙音箱,天猫,高客单爆款',
    'https://www.xiaohongshu.com/discovery/item/66a123456789,夏季清爽背心穿搭买家秀,小红书,社媒爆款图文复刻',
    'https://detail.1688.com/offer/712345678901.html,轻奢纯白客制化机械键盘,1688,供应链原厂货源',
  ].join('\n');
  try {
    await saveToDownloadDir('全渠道商品批量采集导入模板.csv', new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    showToast('📥 已下载「全渠道商品批量采集导入模板.csv」！可在 Excel 中直接编辑');
  } catch (error) { showToast(`❌ 模板下载失败: ${formatUserError(error)}`); }
}

function exportDescription(item: DownloadItem) {
  return [item.description, `来源链接: ${item.sourceUrl || item.url || ''}`, item.author ? `作者: ${item.author}` : '', item.time ? `采集时间: ${item.time}` : ''].filter(Boolean).join('\n');
}

function exportProduct(item: DownloadItem, index: number): DownloadProduct {
  return {
    skuId: item.skuId || item.id || `PROD_${index + 1}`,
    title: item.title || '采集素材', description: exportDescription(item),
    images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
    videos: collectedVideos(item), currentName: String(index + 1),
    sourceUrl: item.sourceUrl || item.url || '', coverImage: item.coverImage || '',
  };
}

function safeDownloadName(title: string) {
  const safe = title.slice(0, 50).replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/^[. ]+|[. ]+$/g, '') || '采集素材';
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? `_${safe}` : safe;
}

async function downloadProductVolumes(products: DownloadProduct[], filename: string, showToast: Toast, setLoading: Loading, requestedSignal?: AbortSignal, single = false) {
  if (!products.length) { showToast('⚠️ 当前没有可供打包下载的采集素材'); return; }
  const volumes = splitCollectorExportProducts(products);
  const signal = requestedSignal || new AbortController().signal;
  let failedMedia = 0, saved = 0;
  setLoading(true);
  try {
    signal.throwIfAborted();
    showToast(`📦 开始打包 ${products.length} 条采集结果（共 ${volumes.length} 个分卷包）...`);
    for (let index = 0; index < volumes.length; index++) {
      signal.throwIfAborted();
      showToast(`📦 正在打包第 ${index + 1}/${volumes.length} 卷...`);
      const batchTitle = volumes.length === 1 ? filename : `${filename}_第${index + 1}卷`;
      const product = volumes[index][0];
      const payload = single && volumes.length === 1
        ? { skuId: product.skuId, productTitle: product.title, description: product.description, images: product.images, videos: product.videos, currentName: product.currentName, sourceUrl: product.sourceUrl, coverImage: product.coverImage }
        : { batchTitle, products: volumes[index] };
      const volumeSignal = collectorExportSignal(signal);
      const { blob, failed } = await requestCollectorZip(payload, volumeSignal);
      signal.throwIfAborted();
      await saveToDownloadDir(`${batchTitle}.zip`, blob);
      saved++;
      failedMedia += failed;
    }
    showToast(failedMedia ? `⚠️ 分卷包已下载，${failedMedia} 项素材下载失败，请查看包内「导出结果.txt」` : `🎉 ${products.length} 条采集结果已打包下载！`);
  } catch (error) {
    const partial = saved ? `（已保存 ${saved}/${volumes.length} 卷）` : '';
    showToast(requestedSignal?.aborted ? `已取消导出${partial}` : `❌ 打包下载失败${partial}: ${formatUserError(error)}`);
  } finally { setLoading(false); }
}

/** 按媒体大小上限分卷，单条目超多图片也能保留完整图集。 */
export async function downloadBatchSuccessTasks(tasks: BatchTaskItem[], showToast: Toast, setExporting: Loading, signal?: AbortSignal) {
  const success = [...tasks].sort((a, b) => (a.importOrder ?? Number.MAX_SAFE_INTEGER) - (b.importOrder ?? Number.MAX_SAFE_INTEGER)).filter(task => task.status === 'success' && (task.images?.length || collectedVideos(task).length));
  await downloadProductVolumes(success.map(exportProduct), `全渠道批量采集成果包_${new Date().toLocaleDateString('sv-SE')}`, showToast, setExporting, signal);
}

function videoExtension(prefix: Uint8Array, size: number) {
  const ascii = (start: number, end: number) => String.fromCharCode(...prefix.subarray(start, end));
  if (prefix.length >= 24 && ascii(4, 8) === 'ftyp') {
    const boxSize = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength).getUint32(0);
    const brands = [ascii(8, 12)];
    for (let offset = 16; offset + 4 <= Math.min(boxSize, prefix.length); offset += 4) brands.push(ascii(offset, offset + 4));
    if (boxSize >= 16 && boxSize + 8 <= size && brands.some(brand => /^(?:isom|iso\d|mp4[12]|avc1|qt {2}|M4V |3g[pe])/.test(brand))) return brands.includes('qt  ') ? 'mov' : 'mp4';
  }
  if (prefix.length >= 12 && prefix[0] === 0x1a && prefix[1] === 0x45 && prefix[2] === 0xdf && prefix[3] === 0xa3) {
    if (ascii(0, prefix.length).includes('webm')) return 'webm';
    if (ascii(0, prefix.length).includes('matroska')) return 'mkv';
  }
  if (ascii(0, 4) === 'OggS' && ascii(0, prefix.length).includes('theora')) return 'ogv';
  throw new Error('接口返回的内容不是有效视频');
}

export async function downloadSingleVideo(item: DownloadItem, showToast: Toast, setDownloading: Loading, requestedSignal?: AbortSignal) {
  const videoUrl = collectedVideos(item)[0];
  if (!videoUrl) { showToast('⚠️ 未检测到该条目的可下载视频链接'); return; }
  const signal = collectorExportSignal(requestedSignal);
  setDownloading(true);
  showToast(`🎬 正在下载「${(item.title || '原视频').slice(0, 15)}...」...`);
  try {
    signal.throwIfAborted();
    const readVideo = async (response: Response) => {
      const blob = await readExportBlob(response, MAX_VIDEO_DOWNLOAD_BYTES, signal);
      const extension = videoExtension(new Uint8Array(await blob.slice(0, 4096).arrayBuffer()), blob.size);
      return { blob, extension };
    };
    let result;
    try { result = await readVideo(await apiFetch(proxyMediaUrl(videoUrl, { asVideo: true }), { signal })); }
    catch { signal.throwIfAborted(); result = await readVideo(await fetch(videoUrl, { signal })); }
    signal.throwIfAborted();
    await saveToDownloadDir(`${safeDownloadName(item.title || '社媒视频')}_原视频.${result.extension}`, result.blob);
    showToast('🎉 原视频已成功下载！');
  } catch (error) {
    if (signal.aborted) { showToast(requestedSignal?.aborted ? '视频下载已取消' : '视频下载超时，请重试'); return; }
    try {
      await openExternalUrl(videoUrl);
      showToast('视频自动下载失败，已打开原始地址，可在浏览器中重试');
    } catch { showToast(`❌ 视频下载失败: ${formatUserError(error)}`); }
  } finally { setDownloading(false); }
}

export async function downloadSingleZip(item: DownloadItem, showToast: Toast, setDownloading: Loading, signal?: AbortSignal) {
  const product = exportProduct(item, 0);
  if (!product.images.length && !product.videos.length) { showToast('⚠️ 该条目没有可供下载的图片或视频'); return; }
  await downloadProductVolumes([product], `${safeDownloadName(product.title)}_高清图集`, showToast, setDownloading, signal, true);
}
