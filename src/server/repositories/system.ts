import { prisma, unscopedPrisma } from './db';

export async function listImageTaskWorkspaceIdsByResultUrl(resultUrl: string): Promise<string[]> {
  const tasks = await unscopedPrisma.imageTask.findMany({
    where: { resultUrl },
    select: { workspaceId: true },
  });
  return tasks.map((task) => task.workspaceId);
}

export async function countLocalRecords() {
  const [
    imageTaskCount,
    productCount,
    sceneCount,
    outfitCount,
    actionCount,
    personaCount,
    styleRecipeCount,
    assistantThreadCount,
    promptRecordCount,
  ] = await Promise.all([
    prisma.imageTask.count().catch(() => 0),
    prisma.product.count().catch(() => 0),
    prisma.sceneAsset.count().catch(() => 0),
    prisma.outfitAsset.count().catch(() => 0),
    prisma.actionAsset.count().catch(() => 0),
    prisma.personaAsset.count().catch(() => 0),
    prisma.styleRecipe.count().catch(() => 0),
    prisma.assistantThread.count().catch(() => 0),
    prisma.promptRecord.count().catch(() => 0),
  ]);
  return {
    imageTaskCount,
    productCount,
    sceneCount,
    outfitCount,
    actionCount,
    personaCount,
    styleRecipeCount,
    assistantThreadCount,
    promptRecordCount,
    promptAssetsTotal: sceneCount + outfitCount + actionCount + personaCount,
  };
}
