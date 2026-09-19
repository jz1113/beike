import { apiFetch } from '@/lib/apiClient';
import { recordModelUsage, resolveModelVendor } from '@/lib/usageTracker';
import { pickOrderedMultimodalFallbacks } from '@beike/domain/workflowModels';
import type { ImageSetQueueItem } from '@/features/assets/assetPromptConstants';
import { resolveQueueItemPartial } from '@/features/assets/assetDeconstructCsvExport';

const DECONSTRUCT_RETRY_DELAY_MS = 1500;

export function isRetryableDeconstructError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('sidecar') ||
    m.includes('error sending request') ||
    m.includes('通信异常') ||
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('aborted') ||
    m.includes('terminated') ||
    m.includes('network') ||
    m.includes('连接')
  );
}

export async function fetchDeconstructWithRetry(
  body: Record<string, unknown>,
  retries = 2
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await apiFetch('/api/catalog/assets/deconstruct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok || res.status < 500) return res;
      const data = await res.clone().json().catch(() => ({}));
      const errMsg = (data as { error?: string }).error || `HTTP ${res.status}`;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, DECONSTRUCT_RETRY_DELAY_MS));
        continue;
      }
      throw new Error(errMsg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = err instanceof Error ? err : new Error(msg);
      if (attempt < retries && isRetryableDeconstructError(msg)) {
        await new Promise((r) => setTimeout(r, DECONSTRUCT_RETRY_DELAY_MS));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error('反推请求失败');
}

import type { SubCategoryDef } from '@beike/domain/productCategory';

export interface ProcessDeconstructItemInput {
  item: ImageSetQueueItem;
  userHint: string;
  selectedVisionModel: string;
  modelIds: string[];
  targetCategory?: string;
  customSubCategories?: SubCategoryDef[];
  reviewBeforeSave?: boolean;
}

export type ProcessDeconstructItemResult =
  | { ok: true; partial: boolean; data: unknown; stats: unknown; reviewId?: string }
  | { ok: false; error: string };

/** 执行单条反推请求（队列与流水线共用） */
export async function processDeconstructQueueItem(
  input: ProcessDeconstructItemInput
): Promise<ProcessDeconstructItemResult> {
  const { item, userHint, selectedVisionModel, modelIds, targetCategory, customSubCategories, reviewBeforeSave } = input;

  try {
    const res = await fetchDeconstructWithRetry({
      imageUrls: item.images,
      userHint: userHint ? `${userHint}（套组名称：${item.name}）` : `套组名称：${item.name}`,
      albumName: item.name,
      targetCategory,
      customSubCategories,
      model: selectedVisionModel,
      fallbackModels: pickOrderedMultimodalFallbacks(selectedVisionModel, modelIds),
      autoSave: !reviewBeforeSave,
      reviewBeforeSave: Boolean(reviewBeforeSave),
    });

    if (res && res.ok) {
      const data = await res.json();
      if (data.success) {
        try {
          const usedModel = data?.modelUsed || selectedVisionModel || 'gemini-3.7-flash';
          const usageTokens = data?.usage || {};
          const promptTokens = usageTokens.promptTokens || usageTokens.prompt_tokens || (item.images.length * 258 + 400);
          const completionTokens = usageTokens.completionTokens || usageTokens.completion_tokens || 800;
          const totalTokens = usageTokens.totalTokens || usageTokens.total_tokens || (promptTokens + completionTokens);

          recordModelUsage({
            modelId: usedModel,
            modelName: usedModel,
            provider: resolveModelVendor(usedModel),
            type: 'vision',
            promptTokens,
            completionTokens,
            totalTokens,
            mediaCount: item.images.length,
            success: true,
          });
        } catch {
          /* usage tracking is best-effort */
        }

        const partial = resolveQueueItemPartial({
          status: 'done',
          partial: data.partial,
          deconstructStats: data.stats,
        });

        return { ok: true, partial, data: data.data, stats: data.stats, reviewId: data.reviewId };
      }
      return { ok: false, error: data.error || '解构失败' };
    }

    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error || `HTTP ${res.status}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '反推异常';
    return { ok: false, error: message };
  }
}
