import { isPlaceholderIdentity, workshopAssetBlockReason } from '@beike/domain/workshopPipeline';
import { OFFICIAL_WORKSPACE_ID, requireWorkspaceId } from '@beike/server-kit/workspaceContext';
import { db } from '../../repositories/access';
import {
  getRegistry,
  listPublishedSourceIds,
  listRegistryByType,
  upsertRegistry,
} from '../../repositories/promptAsset';
import {
  initialRegistryStatus,
  type PromptAssetType,
} from '@beike/domain/promptAsset';

const ASSET_TABLES: Record<PromptAssetType, string> = {
  scene: 'SceneAsset',
  outfit: 'OutfitAsset',
  action: 'ActionAsset',
  persona: 'PersonaAsset',
  full_prompt: 'FullPromptAsset',
};

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
  const types = assetType ? [assetType] : (Object.keys(ASSET_TABLES) as PromptAssetType[]);
  for (const type of types) {
    const rows = await db.$queryRawUnsafe<Array<{ id: string; provenance: string | null }>>(
      `SELECT "id", "provenance" FROM "${ASSET_TABLES[type]}" WHERE "workspaceId" IN (?, ?)`,
      requireWorkspaceId(),
      OFFICIAL_WORKSPACE_ID,
    ).catch(() => []);
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
    return { ...row, contentEligible: !isPlaceholderIdentity(row, assetType),
      productionBlockReason: workshopAssetBlockReason(row, assetType) };
  });
}
