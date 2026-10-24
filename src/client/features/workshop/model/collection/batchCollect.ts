import { normalizeCollectedProductImages } from '@shared/domain/collection/productImages';
import { apiFetch } from '../../../../shared/api/apiClient';
import type { BatchProductItem, TypedProductImage } from '../batchTypes';

export interface ParseBatchInputResult {
  newItems: BatchProductItem[];
  error?: 'EMPTY_INPUT' | 'NO_NEW_ITEMS';
}

/**
 * 解析多行链接/SKU文本为 BatchProductItem 列表（纯函数）
 */
export function countBatchInputLines(text: string): number {
  return text.split(/[\n,;]+/).map((line) => line.trim()).filter(Boolean).length;
}

export function parseBatchInputLines(
  text: string,
  existingItemIds: Set<string>
): ParseBatchInputResult {
  const lines = text
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { newItems: [], error: 'EMPTY_INPUT' };
  }

  const newItems: BatchProductItem[] = [];
  const seenIds = new Set(existingItemIds);

  lines.forEach((line, idx) => {
    let platform: 'jd' | 'taobao' | '1688' = 'jd';
    if (/taobao\.com|tmall\.com/i.test(line)) platform = 'taobao';
    if (/1688\.com/i.test(line)) platform = '1688';

    const numMatch =
      line.match(/(?:item\.jd\.com\/|id=|itemId=|item_id=|\/)(\d+)/i) ||
      line.match(/\b\d{7,16}\b/) ||
      line.match(/\d+/);
    const itemId = numMatch ? (numMatch[1] || numMatch[0]) : line;
    const dedupeKey = `${platform}:${itemId}`;
    if (seenIds.has(dedupeKey)) return;
    if (seenIds.size >= 20) return;
    seenIds.add(dedupeKey);
    newItems.push({
      id: `batch_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      itemId,
      platform,
      url: /^https?:\/\//i.test(line) ? line : undefined,
      title: `待采编商品 (${itemId})`,
      price: 0,
      category: '待采编',
      brand: '',
      coverImage: '',
      mainImages: [],
      skuImages: [],
      detailImages: [],
      props: {},
      status: 'pending',
      selected: true,
      allTypedImages: [],
      selectedProductImages: [],
      prompts: [],
      tasks: [],
    });
  });

  if (newItems.length === 0) {
    return { newItems: [], error: 'NO_NEW_ITEMS' };
  }

  return { newItems };
}

export interface BuildTypedListResult {
  typedList: TypedProductImage[];
  cleanCover: string;
  mainImgs: string[];
  skuImgs: string[];
  detailImgs: string[];
}

/**
 * 将接口返回的商品图片列表整合为带类型的图片分类池（纯函数）
 */
export function buildTypedList(prod: Record<string, unknown>, images?: unknown): BuildTypedListResult {
  const normalized = normalizeCollectedProductImages({ product: prod, images });
  const usable = (url: string) => !/\.gif(?:$|[?#])/i.test(url);
  const mainImgs = normalized.mainImgs.filter(usable);
  const skuImgs = normalized.skuImgs.filter(usable);
  const descImgs = normalized.descImgs.filter(usable);
  const coverImg = usable(normalized.coverImg) ? normalized.coverImg : mainImgs[0] || '';
  const typedList: TypedProductImage[] = [
    ...mainImgs.map(url => ({ url, type: 'main' as const })),
    ...skuImgs.map(url => ({ url, type: 'sku' as const })),
    ...descImgs.map(url => ({ url, type: 'detail' as const })),
  ];
  return { typedList, cleanCover: coverImg, mainImgs, skuImgs, detailImgs: descImgs };
}

export interface CollectProgress {
  total: number;
  current: number;
  success: number;
  failed: number;
}

export interface RunBatchCollectDeps {
  onItemUpdate: (id: string, patch: Partial<BatchProductItem>) => void;
  onProgress: (progress: CollectProgress) => void;
  concurrency?: number;
  forceRefresh?: boolean;
}

/**
 * 运行批量商品采集任务（3 worker 并发队列）
 */
export async function runBatchCollect(
  pendingItems: BatchProductItem[],
  deps: RunBatchCollectDeps
): Promise<{ success: number; failed: number }> {
  const concurrency = deps.concurrency || 3;
  let index = 0;
  let successCount = 0;
  let failedCount = 0;

  const worker = async () => {
    while (index < pendingItems.length) {
      const item = pendingItems[index++];
      deps.onItemUpdate(item.id, { status: 'collecting' });

      try {
        const res = await apiFetch('/api/catalog/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: item.url || item.itemId,
            platform: 'auto',
            forceRefresh: deps.forceRefresh ?? item.status === 'failed',
          }),
        });

        const data = await res.json().catch(() => ({ error: '网络响应解析失败' }));

        if (res.ok && data.success && data.product) {
          const prod = data.product;
          const { typedList, cleanCover, mainImgs, skuImgs, detailImgs } = buildTypedList(prod, data.images);
          if (typedList.length === 0) {
            deps.onItemUpdate(item.id, { status: 'failed', errorMsg: '采集成功但没有可用图片', selected: false });
            failedCount++;
            deps.onProgress({ total: pendingItems.length, current: successCount + failedCount, success: successCount, failed: failedCount });
            continue;
          }

          const defaultMain = mainImgs.filter(u => !/\.gif(?:$|[?#])/i.test(u)).slice(0, 1);
          const initialSelected = defaultMain.length > 0 ? defaultMain : (cleanCover && !/\.gif(?:$|[?#])/i.test(cleanCover) ? [cleanCover] : []);
          deps.onItemUpdate(item.id, {
            title: prod.title || item.title,
            price: prod.price || 0,
            category: prod.category || '数码正品',
            brand: prod.brand || '',
            coverImage: cleanCover,
            mainImages: mainImgs,
            skuImages: skuImgs,
            detailImages: detailImgs,
            props: prod.props || {},
            fromCache: data.fromCache === true,
            apiUsed: typeof data.apiUsed === 'string' ? data.apiUsed : undefined,
            status: 'success',
            selected: true,
            allTypedImages: typedList,
            selectedProductImages: initialSelected,
            errorMsg: undefined,
          });
          successCount++;
        } else {
          const errorMsg =
            data.missingConfig === 'wanbang'
              ? '未配置万邦采集凭证（请在「设置 -> 服务接口配置」中填入 API Key 与 Secret）'
              : (data.error || '万邦 Pro 接口未返回有效数据');
          deps.onItemUpdate(item.id, {
            status: 'failed',
            errorMsg,
            selected: false,
          });
          failedCount++;
        }
      } catch (err: any) {
        const isLoadFailed =
          err?.message?.includes('Load failed') || err?.message?.includes('Failed to fetch');
        const errorMsg = isLoadFailed
          ? 'API 服务通信异常，请确认设置中的接口凭证配置'
          : (err.message || '网络连接超时');
        deps.onItemUpdate(item.id, {
          status: 'failed',
          errorMsg,
          selected: false,
        });
        failedCount++;
      }

      deps.onProgress({
        total: pendingItems.length,
        current: successCount + failedCount,
        success: successCount,
        failed: failedCount,
      });
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { success: successCount, failed: failedCount };
}
