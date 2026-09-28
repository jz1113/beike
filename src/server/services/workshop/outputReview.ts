import { outputReviewRequestSchema } from '@shared/contracts/workshopPipeline';
import { AppError } from '../../core/errors';
import { insertOutputReview } from '../../repositories/promptAsset';
import { workshopBatchRepository } from '../../repositories/workshop';
import { recordUsageEvent } from '../promptAsset/usage';

const EVENT_BY_DECISION = {
  accepted: 'output_accepted',
  retry_requested: 'retry_requested',
  rejected: 'output_rejected',
} as const;

export async function reviewWorkshopOutput(taskId: string, raw: unknown) {
  const body = outputReviewRequestSchema.parse(raw);
  const active = await workshopBatchRepository.getActive().catch(() => null);
  if (!active) throw new AppError('当前没有活跃批次', 404, 'not_found');
  const product = active.snapshot.items.find((item) => (item.tasks || []).some((task) => task.id === taskId || (task as { taskId?: string }).taskId === taskId));
  if (!product) throw new AppError('任务不属于当前批次', 404, 'not_found');
  const task = (product.tasks || []).find((item) => item.id === taskId || (item as { taskId?: string }).taskId === taskId);
  await insertOutputReview({
    batchId: active.id,
    productId: product.id,
    taskId,
    decision: body.decision,
    productFidelityScore: body.scores?.productFidelity,
    compositionScore: body.scores?.composition,
    aestheticScore: body.scores?.aesthetic,
    consistencyScore: body.scores?.consistency,
    reasonCodes: body.reasonCodes,
    note: body.note,
  });
  const assetIds = [
    (task as { appliedActionId?: string } | undefined)?.appliedActionId,
    (product as { selectedSceneAssetId?: string }).selectedSceneAssetId,
    (product as { selectedOutfitAssetId?: string }).selectedOutfitAssetId,
    (product as { selectedPersonaAssetId?: string }).selectedPersonaAssetId,
  ].filter((id): id is string => Boolean(id));
  await Promise.allSettled(assetIds.map((assetId) => recordUsageEvent({
    assetId,
    batchId: active.id,
    productId: product.id,
    taskId,
    eventType: EVENT_BY_DECISION[body.decision],
  })));
  return { taskId, decision: body.decision };
}
