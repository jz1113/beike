import { db } from './access';

/** Usage metrics must never make prompt assembly fail. */
export async function incrementAssetUsageCounts(input: { sceneId?: string; outfitId?: string; personaId?: string; actionIds: string[] }) {
  const operations: Promise<unknown>[] = [];
  if (input.sceneId) operations.push(db.sceneAsset.update({ where: { id: input.sceneId }, data: { usageCount: { increment: 1 } } }));
  if (input.outfitId) operations.push(db.outfitAsset.update({ where: { id: input.outfitId }, data: { usageCount: { increment: 1 } } }));
  if (input.personaId) operations.push(db.personaAsset.update({ where: { id: input.personaId }, data: { usageCount: { increment: 1 } } }));
  for (const id of input.actionIds) operations.push(db.actionAsset.update({ where: { id }, data: { usageCount: { increment: 1 } } }));
  await Promise.allSettled(operations);
}
