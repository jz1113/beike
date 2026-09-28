import {
  aggregateQualityScore,
  emptyUsageCounts,
  shouldAutoDemote,
  type UsageCounts,
} from '@shared/domain/prompts/promptAsset';
import { listUsageEvents, updateRegistryStatus } from '../../repositories/promptAsset';

const EVENT_TO_COUNT: Record<string, keyof UsageCounts> = {
  recommended: 'recommended',
  locked: 'locked',
  analysis_used: 'analysisUsed',
  generation_submitted: 'submitted',
  generation_succeeded: 'succeeded',
  generation_failed: 'failed',
  output_accepted: 'accepted',
  retry_requested: 'retried',
  output_rejected: 'rejected',
  output_exported: 'exported',
};

export function countsFromEvents(events: Array<{ eventType: string }>): UsageCounts {
  const counts = emptyUsageCounts();
  for (const event of events) {
    const key = EVENT_TO_COUNT[event.eventType];
    if (key) counts[key] += 1;
  }
  return counts;
}

export async function refreshAssetQuality(assetId: string) {
  const events = await listUsageEvents(assetId);
  const counts = countsFromEvents(events);
  const registry = await findRegistryBySource(assetId);
  if (!registry) return null;
  const aggregated = aggregateQualityScore({ counts });
  const nextStatus = shouldAutoDemote(counts, aggregated.score) && registry.status === 'published'
    ? 'needs_fix'
    : registry.status;
  await updateRegistryStatus(registry.id, {
    status: nextStatus,
    qualityScore: aggregated.score,
    confidence: aggregated.confidence,
  });
  return { ...aggregated, counts, status: nextStatus };
}

async function findRegistryBySource(sourceAssetId: string) {
  const { getRegistry } = await import('../../repositories/promptAsset');
  for (const type of ['scene', 'outfit', 'action', 'persona', 'full_prompt'] as const) {
    const row = await getRegistry(type, sourceAssetId);
    if (row) return row;
  }
  return null;
}
