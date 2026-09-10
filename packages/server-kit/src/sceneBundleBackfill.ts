import type { PrismaClient } from '@prisma/client';

/** 按 sourceImageIndex 回填 ActionAsset.sceneId */
export async function backfillActionSceneLinks(
  prisma: Pick<PrismaClient, 'sceneAsset' | 'actionAsset'>,
): Promise<number> {
  const scenes = await prisma.sceneAsset.findMany({
    where: { sourceImageIndex: { not: null } },
    select: { id: true, sourceImageIndex: true },
  });

  const sceneByIndex = new Map<number, string>();
  for (const s of scenes) {
    if (s.sourceImageIndex !== null && !sceneByIndex.has(s.sourceImageIndex)) {
      sceneByIndex.set(s.sourceImageIndex, s.id);
    }
  }

  const unlinked = await prisma.actionAsset.findMany({
    where: { sceneId: null, sourceImageIndex: { not: null } },
    select: { id: true, sceneId: true, sourceImageIndex: true },
  });

  let updated = 0;
  for (const action of unlinked) {
    if (action.sourceImageIndex === null) continue;
    const sceneId = sceneByIndex.get(action.sourceImageIndex);
    if (!sceneId) continue;
    await prisma.actionAsset.update({
      where: { id: action.id },
      data: { sceneId },
    });
    updated++;
  }

  return updated;
}
