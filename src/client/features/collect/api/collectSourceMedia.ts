import { apiFetch } from '@client/shared/api/apiClient';
import { getExternalScraperCredentials, type PreferredScraper } from '@client/shared/utils/externalScraperCredentials';
import { parseSocialLinkWithRateLimit } from '@client/shared/utils/xhsLinkBatch';
import type { RateLimiter } from '@client/shared/utils/rateLimiter';
import type { BatchTaskItem } from '../model/collectorTypes';
import { normalizeCollectedImages } from '../model/normalizeCollectedImages';
import { sanitizeCollectedItem } from '../model/collectorUrls';

export interface CollectedSourceItem {
  id: string;
  type: 'social' | 'ecommerce';
  platform: BatchTaskItem['platform'];
  title: string;
  coverImage: string;
  images: string[];
  video: string | null;
  videos?: string[];
  livePhotos?: string[];
  description?: string;
  importOrder?: number;
  mainImages?: string[];
  skuImages?: string[];
  descImages?: string[];
  author?: string;
  price?: number;
  sourceUrl: string;
  time: string;
  apiUsed?: string;
}

/** 显式指定的解析接口与链接类型不一致时，在发起付费请求前拦住。 */
export function preferredScraperMismatch(platform: string, preferred: PreferredScraper): string | null {
  if (preferred === 'wanbang' && platform === 'social') {
    return '万邦只解析电商商品链接。社媒内容请切换为自动调度、APIA 或奇云。';
  }
  if ((preferred === 'apia' || preferred === 'qiyun') && platform !== 'social') {
    return 'APIA 与奇云只解析社媒内容。商品链接请切换为自动调度或万邦。';
  }
  return null;
}

/** A shared, cancellable request path for both collector entry points. */
export async function collectSourceMedia(
  url: string,
  platform: BatchTaskItem['platform'],
  forceRefresh: boolean,
  rateLimiter: RateLimiter,
  signal: AbortSignal,
  options?: { shouldStop?: () => boolean; onSubmitted?: () => void; preferredScraper?: PreferredScraper },
): Promise<CollectedSourceItem> {
  signal.throwIfAborted();
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort(signal.reason);
  signal.addEventListener('abort', abortRequest, { once: true });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const onSubmitted = () => {
    options?.onSubmitted?.();
    timeout = setTimeout(() => requestController.abort(new DOMException('采集请求超时，请检查结果后再手动重试', 'TimeoutError')), platform === 'social' ? 65_000 : 30_000);
  };
  const checkDispatch = () => {
    requestController.signal.throwIfAborted();
    if (options?.shouldStop?.()) throw new DOMException('已停止派发采集请求', 'AbortError');
  };
  const requestSignal = requestController.signal;

  try {
    const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    let item: CollectedSourceItem;
    if (platform === 'social') {
      const credentials = await getExternalScraperCredentials();
      const preferredScraper = options?.preferredScraper ?? credentials.preferredScraper ?? 'auto';
      const mismatch = preferredScraperMismatch(platform, preferredScraper);
      if (mismatch) throw new Error(mismatch);
      const { scraperId, scraperSecret, qiyunAppId, qiyunAppKey } = credentials;
      requestSignal.throwIfAborted();
      const parsed = await parseSocialLinkWithRateLimit(url, scraperId, scraperSecret, rateLimiter, {
        signal: requestSignal, qiyunAppId, qiyunAppKey, preferredScraper, shouldStop: options?.shouldStop, onSubmitted,
      });
      requestSignal.throwIfAborted();
      if (!parsed.success) throw new Error(parsed.error || '未能提取到社媒素材');
      const result = parsed.data;
      const images = Array.isArray(result.images) ? result.images : [];
      item = sanitizeCollectedItem({
        id: `social_${Date.now()}_${crypto.randomUUID()}`,
        type: 'social',
        platform: 'social',
        title: result.title || '社媒图集素材',
        description: result.description || '',
        author: result.author || '社媒作者',
        coverImage: result.cover || images[0] || '',
        images,
        video: result.video || null,
        videos: result.videos || [],
        livePhotos: result.livePhotos || [],
        importOrder: Date.now(),
        sourceUrl: url,
        time,
        apiUsed: parsed.apiUsed,
      });
    } else {
      const preferredScraper = options?.preferredScraper ?? (await getExternalScraperCredentials()).preferredScraper ?? 'auto';
      const mismatch = preferredScraperMismatch(platform, preferredScraper);
      if (mismatch) throw new Error(mismatch);
      checkDispatch();
      onSubmitted();
      const response = await apiFetch('/api/catalog/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: requestSignal,
        body: JSON.stringify({ url, platform, forceRefresh }),
      });
      requestSignal.throwIfAborted();
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !data.product) {
        throw new Error(data?.error || `采集失败（HTTP ${response.status}）`);
      }
      const product = data.product;
      const { mainImgs, skuImgs, descImgs, allImgs, coverImg } = normalizeCollectedImages(data);
      item = sanitizeCollectedItem({
        id: `ecom_${product.platform || platform}_${product.skuId || product.itemId || product.id || url}`,
        type: 'ecommerce',
        platform: product.platform || platform,
        title: product.title || '电商商品素材',
        price: product.price ?? 0,
        category: product.category || '',
        skuId: product.skuId || product.itemId || url,
        coverImage: coverImg,
        images: allImgs,
        mainImages: mainImgs,
        skuImages: skuImgs,
        descImages: descImgs,
        video: product.video || product.videoUrl || null,
        videos: product.videos || [],
        livePhotos: product.livePhotos || [],
        importOrder: Date.now(),
        props: product.props || data.images?.props || {},
        sourceUrl: url,
        time,
      });
    }
    requestSignal.throwIfAborted();
    if (item.images.length === 0 && !item.video) {
      throw new Error('接口未返回可用图片或视频，请检查链接或重试');
    }
    return item;
  } catch (error) {
    if (requestSignal.aborted) throw requestSignal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abortRequest);
  }
}
