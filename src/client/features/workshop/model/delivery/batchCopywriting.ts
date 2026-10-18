import { apiFetch } from '@client/shared/api/apiClient';
import { getEnabledMultimodalModelsFromSettings, isOpenAIModelRouteId, requestModelId } from '@shared/domain/models/workflowModels';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import type { BatchProductItem } from '../batchTypes';
import { isDeliverableWorkshopResult } from '../generation/workshopReadiness';

export interface CopywritingContext {
  getItems: () => BatchProductItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  selectedVisionModel: string;
  showToast: (msg: string) => void;
  analyzeConcurrency?: number;
  isAborted?: () => boolean;
  force?: boolean;
}

const inFlight = new Map<string, Promise<boolean>>();
let batchRun: Promise<void> | null = null;

function patchItem(ctx: CopywritingContext, itemId: string, patch: Partial<BatchProductItem>) {
  ctx.setItems(prev => prev.map(item => (item.id === itemId ? { ...item, ...patch } : item)));
}

function isCompleteCopy(data: { title?: string; content?: string } | null | undefined): data is { title: string; content: string } {
  return Boolean(data?.title?.trim() && data?.content?.trim());
}

function copySource(item: BatchProductItem): string {
  return JSON.stringify({ title: item.title, images: item.tasks.filter(isDeliverableWorkshopResult).map(task => task.resultUrl), prompts: item.prompts });
}

async function requestCopywriting(item: BatchProductItem, ctx: CopywritingContext): Promise<boolean> {
  if (!(item.tasks || []).some(isDeliverableWorkshopResult)) {
    patchItem(ctx, item.id, { isCopywritingGenerating: false, copywritingError: '没有可用于文案的有效成图，请先生成或采用图片' });
    return false;
  }
  const startedSource = copySource(item);
  const startedCopy = JSON.stringify(item.copywriting || null);
  patchItem(ctx, item.id, { isCopywritingGenerating: true, copywritingError: undefined });
  const existingTitles = ctx.getItems()
    .filter(product => product.id !== item.id && product.copywriting?.title)
    .map(product => product.copywriting!.title);
  const generatedImages = (item.tasks || [])
    .filter(isDeliverableWorkshopResult)
    .map(task => task.resultUrl!);
  const effectiveImages = generatedImages.length > 0
    ? generatedImages.slice(0, 2)
    : item.selectedProductImages.length > 0
      ? item.selectedProductImages.slice(0, 2)
      : [item.coverImage];

  try {
    const copyModel = isOpenAIModelRouteId(ctx.selectedVisionModel)
      ? getEnabledMultimodalModelsFromSettings().find(model => model.channel !== 'openai')?.id || 'gpt-5.4-mini'
      : requestModelId(ctx.selectedVisionModel);
    const res = await apiFetch('/api/generate/copywriting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: copyModel || undefined,
        productTitle: item.title,
        productCategory: item.category,
        productRole: item.productRole || 'held_object',
        imageUrls: effectiveImages,
        shotPrompts: (item.prompts || []).map(prompt => `${prompt.title}: ${prompt.scene}`),
        style: 'authentic',
        existingTitles,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success || data.fromFallback || !isCompleteCopy(data.data)) {
      const error = data.fromFallback
        ? '模型未返回有效文案，禁止使用本地模板冒充成功'
        : data.error || (!data.data || !isCompleteCopy(data.data) ? '需要完整标题和正文' : '文案生成失败');
      patchItem(ctx, item.id, { isCopywritingGenerating: false, copywritingError: error });
      return false;
    }

    recordChatTokens({
      modelId: data.model || ctx.selectedVisionModel || 'gpt-5.4-mini',
      type: 'chat',
      usage: data.usage,
    });
    // A requested rewrite may replace the starting copy, but never edits made
    // while the request was in flight. Compare inside the state update itself.
    ctx.setItems(previous => previous.map(current => {
      if (current.id !== item.id) return current;
      if (copySource(current) !== startedSource) {
        return { ...current, isCopywritingGenerating: false, copywritingError: '成图或分镜已变化，本次文案未应用，请重新生成' };
      }
      if (JSON.stringify(current.copywriting || null) !== startedCopy) {
        return { ...current, isCopywritingGenerating: false };
      }
      return { ...current, isCopywritingGenerating: false, copywritingError: undefined,
        copywriting: { title: data.data.title, content: data.data.content, tags: data.data.tags || [] } };
    }));
    return true;
  } catch (err) {
    patchItem(ctx, item.id, {
      isCopywritingGenerating: false,
      copywritingError: err instanceof Error ? err.message : '文案生成异常',
    });
    return false;
  }
}

export async function generateCopywritingForProduct(
  item: BatchProductItem,
  ctx: CopywritingContext
): Promise<boolean> {
  const existing = inFlight.get(item.id);
  if (existing) return existing;
  const pending = requestCopywriting(item, ctx).finally(() => { inFlight.delete(item.id); });
  inFlight.set(item.id, pending);
  return pending;
}

export function updateItemCopywriting(
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  itemId: string,
  copywriting: { title: string; content: string; tags?: string[] }
): void {
  setItems(prev =>
    prev.map(item =>
      item.id === itemId
        ? { ...item, copywriting: { title: copywriting.title, content: copywriting.content, tags: copywriting.tags || item.copywriting?.tags || [] } }
        : item
    )
  );
}

async function runCopywritingBatch(ctx: CopywritingContext): Promise<void> {
  const pendingItems = ctx.getItems().filter(item =>
    item.selected && (item.tasks || []).some(isDeliverableWorkshopResult) && (ctx.force || !isCompleteCopy(item.copywriting))
  );
  if (pendingItems.length === 0) {
    ctx.showToast(ctx.force ? '没有可重写文案的商品' : '所选商品暂无需要补全文案的有效成图');
    return;
  }
  ctx.showToast(`正在为 ${pendingItems.length} 款商品批量生成小红书种草文案...`);
  const concurrency = Math.min(Math.max(1, Math.floor(ctx.analyzeConcurrency || 2)), pendingItems.length);
  const queue = [...pendingItems];
  let success = 0;
  let failed = 0;
  let skipped = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      if (ctx.isAborted?.()) break;
      const item = queue.shift();
      if (!item) break;
      const latest = ctx.getItems().find(product => product.id === item.id);
      if (!latest?.selected || !(latest.tasks || []).some(isDeliverableWorkshopResult)
        || (!ctx.force && isCompleteCopy(latest.copywriting))) { skipped += 1; continue; }
      if (await generateCopywritingForProduct(latest, ctx)) success += 1;
      else failed += 1;
    }
  }));
  const suffix = (failed > 0 ? `，失败 ${failed} 款，可重试` : '') + (queue.length + skipped ? `，未执行 ${queue.length + skipped} 款` : '');
  ctx.showToast(`文案生成结束：成功 ${success} 款${suffix}`);
}

export async function generateAllCopywriting(ctx: CopywritingContext): Promise<void> {
  if (batchRun) return batchRun;
  batchRun = runCopywritingBatch(ctx).finally(() => { batchRun = null; });
  return batchRun;
}
