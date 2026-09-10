import { apiFetch } from '@/lib/apiClient';
import { recordModelUsage, resolveModelVendor } from '@/lib/usageTracker';
import type { BatchProductItem } from './batchTypes';

export interface CopywritingContext {
  getItems: () => BatchProductItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  selectedVisionModel: string;
  showToast: (msg: string) => void;
  analyzeConcurrency?: number;
}

/**
 * 为单个商品生成种草文案
 */
export async function generateCopywritingForProduct(
  item: BatchProductItem,
  ctx: CopywritingContext
): Promise<void> {
  ctx.setItems(prev =>
    prev.map(p => (p.id === item.id ? { ...p, isCopywritingGenerating: true } : p))
  );

  try {
    // 收集批次内已有商品标题用于严格排重
    const currentItems = ctx.getItems();
    const existingTitles = currentItems
      .filter(p => p.id !== item.id && p.copywriting?.title)
      .map(p => p.copywriting!.title);

    // 优先提取该商品已成功的切片图或大图作为视觉参考
    const generatedImages = (item.tasks || [])
      .filter(t => t.status === 'SUCCESS' && t.resultUrl)
      .map(t => t.resultUrl!);
    const effectiveImages =
      generatedImages.length > 0
        ? generatedImages.slice(0, 2)
        : item.selectedProductImages.length > 0
          ? item.selectedProductImages.slice(0, 2)
          : [item.coverImage];

    const res = await apiFetch('/api/generate/copywriting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ctx.selectedVisionModel || undefined,
        productTitle: item.title,
        productCategory: item.category,
        productRole: item.productRole || 'held_object',
        imageUrls: effectiveImages,
        shotPrompts: (item.prompts || []).map(p => p.title + ': ' + p.scene),
        style: 'authentic',
        existingTitles,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success && data.data) {
      // 记录文案大模型调用与 Token
      try {
        const copyModel = data.model || ctx.selectedVisionModel || 'gpt-4o-mini';
        const copyUsage = data.usage || {};
        const pTokens = copyUsage.promptTokens || 120;
        const cTokens = copyUsage.completionTokens || 350;
        recordModelUsage({
          modelId: copyModel,
          modelName: copyModel,
          provider: resolveModelVendor(copyModel),
          type: 'chat',
          promptTokens: pTokens,
          completionTokens: cTokens,
          totalTokens: pTokens + cTokens,
          success: true,
        });
      } catch {}

      ctx.setItems(prev =>
        prev.map(p => {
          if (p.id !== item.id) return p;
          return {
            ...p,
            isCopywritingGenerating: false,
            copywriting: {
              title: data.data.title,
              content: data.data.content,
              tags: data.data.tags || [],
            },
          };
        })
      );
      ctx.showToast(`已为「${item.title.slice(0, 10)}」生成专属种草文案`);
    } else {
      ctx.setItems(prev =>
        prev.map(p => (p.id === item.id ? { ...p, isCopywritingGenerating: false } : p))
      );
    }
  } catch (err) {
    console.warn('[generateCopywritingForProduct] 文案生成异常:', err);
    ctx.setItems(prev =>
      prev.map(p => (p.id === item.id ? { ...p, isCopywritingGenerating: false } : p))
    );
  }
}

/**
 * 手动更新单个商品的文案
 */
export function updateItemCopywriting(
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  itemId: string,
  copywriting: { title: string; content: string; tags?: string[] }
): void {
  setItems(prev =>
    prev.map(p =>
      p.id === itemId
        ? {
            ...p,
            copywriting: {
              title: copywriting.title,
              content: copywriting.content,
              tags: copywriting.tags || p.copywriting?.tags || [],
            },
          }
        : p
    )
  );
}

/**
 * 批量并发生成文案
 */
export async function generateAllCopywriting(ctx: CopywritingContext): Promise<void> {
  const currentItems = ctx.getItems();
  const targetItems = currentItems.filter(i =>
    (i.tasks || []).some(t => t.status === 'SUCCESS' && t.resultUrl)
  );
  if (targetItems.length === 0) return;

  const pendingItems = targetItems.filter(i => !i.copywriting?.content);
  if (pendingItems.length === 0) return;

  ctx.showToast(`正在为 ${pendingItems.length} 款商品批量生成小红书种草文案...`);
  const concurrency = Math.min(ctx.analyzeConcurrency || 2, pendingItems.length);
  const queue = [...pendingItems];

  const workers = Array(Math.min(concurrency, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          await generateCopywritingForProduct(item, ctx);
        }
      }
    });

  await Promise.all(workers);
  ctx.showToast(`全套 ${pendingItems.length} 款商品种草文案全部生成完毕！`);
}
