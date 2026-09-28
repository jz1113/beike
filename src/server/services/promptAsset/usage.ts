import type { UsageEventType } from '@shared/domain/prompts/promptAsset';
import { insertUsageEvent } from '../../repositories/promptAsset';
import { refreshAssetQuality } from './scoring';

export async function recordUsageEvent(input: {
  assetId: string;
  batchId: string;
  productId?: string | null;
  taskId?: string | null;
  eventType: UsageEventType;
  metadata?: Record<string, unknown>;
}) {
  if (!input.assetId || !input.batchId) return;
  await insertUsageEvent(input);
  if (['generation_succeeded', 'generation_failed', 'output_accepted', 'retry_requested', 'output_rejected', 'output_exported'].includes(input.eventType)) {
    await refreshAssetQuality(input.assetId).catch(() => undefined);
  }
}

export async function recordAssetUsageEvents(input: {
  batchId: string;
  productId?: string | null;
  sceneId?: string | null;
  outfitId?: string | null;
  personaId?: string | null;
  actionIds?: Array<string | null | undefined>;
  eventType: UsageEventType;
}) {
  const ids = [input.sceneId, input.outfitId, input.personaId, ...(input.actionIds || [])].filter(
    (id): id is string => Boolean(id),
  );
  await Promise.allSettled(ids.map((assetId) => recordUsageEvent({
    assetId,
    batchId: input.batchId,
    productId: input.productId,
    eventType: input.eventType,
  })));
}
