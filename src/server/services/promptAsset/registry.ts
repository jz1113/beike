import { isPlaceholderIdentity, workshopAssetBlockReason } from '@shared/domain/workshop/workshopPipeline';
import { visualAssetIssue } from '@shared/domain/assets/assetDeconstruct/visualEvidence';
import {
  getRegistry,
  listPublishedSourceIds,
  listRegistryByType,
  upsertRegistry,
  listAssetsForRegistryBackfill,
} from '../../repositories/promptAsset';
import {
  initialRegistryStatus,
  type PromptAssetType,
} from '@shared/domain/prompts/promptAsset';

export async function ensureRegistryForAsset(assetType: PromptAssetType, sourceAssetId: string, provenance?: string) {
  const existing = await getRegistry(assetType, sourceAssetId);
  if (existing) return existing;
  return upsertRegistry({
    assetType,
    sourceAssetId,
    status: initialRegistryStatus(provenance, true),
    provenance: provenance || 'manual',
  });
}

export async function backfillRegistry(assetType?: PromptAssetType) {
  const types: PromptAssetType[] = assetType ? [assetType] : ['scene', 'outfit', 'action', 'persona', 'full_prompt'];
  for (const type of types) {
    const rows = await listAssetsForRegistryBackfill(type);
    for (const row of rows) {
      await ensureRegistryForAsset(type, row.id, row.provenance || 'manual');
    }
  }
}

export async function publishedIdsOrNone(assetType: PromptAssetType): Promise<string[]> {
  await backfillRegistry(assetType);
  const ids = await listPublishedSourceIds(assetType);
  return ids.length > 0 ? ids : ['__none__'];
}

export async function attachRegistryMeta<T extends { id: string; provenance?: string | null }>(
  assetType: PromptAssetType,
  items: T[],
): Promise<Array<T & { registry?: Awaited<ReturnType<typeof listRegistryByType>>[number]; contentEligible: boolean; productionBlockReason: string | null }>> {
  if (items.length === 0) return [];
  const rows = await listRegistryByType(assetType, items.map((item) => item.id));
  const map = new Map(rows.map((row) => [row.sourceAssetId, row]));
  return items.map((item) => {
    const row = { ...item, registry: map.get(item.id) };
    const issue = visualAssetIssue(row as Record<string, unknown>, assetType);
    return { ...row, contentEligible: !isPlaceholderIdentity(row, assetType) && !issue,
      productionBlockReason: issue || workshopAssetBlockReason(row, assetType) };
  });
}
