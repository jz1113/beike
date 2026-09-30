import { listRegistryByType } from '../../repositories/promptAsset';
import { publishedIdsOrNone } from './registry';

export async function publishedWhere(assetType: 'scene' | 'outfit' | 'action' | 'persona' | 'full_prompt') {
  const ids = await publishedIdsOrNone(assetType);
  return { id: { in: ids } };
}

export async function sortByQuality<T extends { id: string }>(assetType: 'scene' | 'outfit' | 'action' | 'persona', items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  const rows = await listRegistryByType(assetType, items.map((item) => item.id));
  const score = new Map(rows.map((row) => [row.sourceAssetId, row.qualityScore ?? -1]));
  return [...items].sort((a, b) => (score.get(b.id) ?? -1) - (score.get(a.id) ?? -1));
}
