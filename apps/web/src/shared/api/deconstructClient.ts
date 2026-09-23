import { apiFetch } from '@/shared/api/apiClient';
import { recordModelUsage, resolveModelVendor } from '@/shared/utils/usageTracker';
import type { ImageSetQueueItem } from '@/features/assets/utils/assetPromptConstants';
import { resolveQueueItemPartial } from '@/features/assets/utils/assetDeconstructCsvExport';

/**
 * A vision POST is billable and its outcome can be unknown when its response is
 * delayed. Do not automatically replay it for either HTTP failures or network
 * errors: the user can inspect the original task and explicitly retry instead.
 */
export async function fetchDeconstructWithRetry(
  body: Record<string, unknown>,
  _retries = 0
): Promise<Response> {
  return apiFetch('/api/catalog/assets/deconstruct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  onProgress?: (progress: { stage: string; message: string; startedAt: number; updatedAt: number }) => void;
}

export type ProcessDeconstructItemResult =
  | { ok: true; partial: boolean; data: unknown; stats: unknown; reviewId?: string }
  | { ok: false; error: string };

/** 执行单条反推请求（队列与流水线共用） */
export async function processDeconstructQueueItem(
  input: ProcessDeconstructItemInput
): Promise<ProcessDeconstructItemResult> {
  const { item, userHint, selectedVisionModel, modelIds, targetCategory, customSubCategories, reviewBeforeSave, onProgress } = input;

  let polling = false;
  const pollProgress = async () => {
    if (!onProgress || polling) return;
    polling = true;
    try {
      const response = await apiFetch(`/api/catalog/assets/deconstruct/progress?clientTaskId=${encodeURIComponent(item.id)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.progress) onProgress(data.progress);
      }
    } catch {
      /* The main POST still owns the task outcome. */
    } finally {
      polling = false;
    }
  };
  const progressTimer = onProgress ? window.setInterval(() => { void pollProgress(); }, 1500) : null;

  try {
    const res = await fetchDeconstructWithRetry({
      imageUrls: item.images,
      userHint: userHint ? `${userHint}（套组名称：${item.name}）` : `套组名称：${item.name}`,
      albumName: item.name,
      targetCategory,
      customSubCategories,
      model: selectedVisionModel,
      // The server only switches this ordered chain for a definitive “model
      // unavailable” reply; rate limits wait on the current model instead.
      fallbackModels: modelIds,
      clientTaskId: item.id,
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
  } finally {
    if (progressTimer !== null) window.clearInterval(progressTimer);
  }
}
