import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from './access';
import { OFFICIAL_WORKSPACE_ID, requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';

export type StyleRecipeChanges = Prisma.StyleRecipeUpdateInput;
const hiddenEvent = 'recipe_hidden';
function localId(kind: string, id: string) {
  return `${kind}_${createHash('sha256').update(JSON.stringify([requireWorkspaceId(), id])).digest('hex')}`;
}
function hideOfficial(tx: Prisma.TransactionClient, id: string) {
  return tx.promptAssetUsageEvent.upsert({
    where: { id: localId('recipe_hidden', id) },
    create: { id: localId('recipe_hidden', id), assetId: id, batchId: 'recipe-library', eventType: hiddenEvent },
    update: {},
  });
}

/** Workspace tombstones survive refresh and official catalogue sync. */
export async function hiddenStyleRecipeIds() {
  return (await db.promptAssetUsageEvent.findMany({ where: { eventType: hiddenEvent }, select: { assetId: true } })).map(row => row.assetId);
}

export async function listHiddenOfficialStyleRecipes() {
  const hiddenIds = await hiddenStyleRecipeIds();
  if (hiddenIds.length === 0) return [];
  return db.styleRecipe.findMany({
    where: { id: { in: hiddenIds }, workspaceId: OFFICIAL_WORKSPACE_ID },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function restoreOfficialStyleRecipe(id: string): Promise<'restored' | 'already_visible' | 'not_found' | 'not_official'> {
  const recipe = await db.styleRecipe.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!recipe) return 'not_found';
  if (recipe.workspaceId !== OFFICIAL_WORKSPACE_ID) return 'not_official';

  const result = await db.promptAssetUsageEvent.deleteMany({
    where: { id: localId('recipe_hidden', id), assetId: id, eventType: hiddenEvent },
  });
  return result.count > 0 ? 'restored' : 'already_visible';
}

export async function listStyleRecipes(category: string | null, page: number, pageSize: number) {
  const where: Prisma.StyleRecipeWhereInput = { id: { notIn: await hiddenStyleRecipeIds() } };
  if (category && category !== 'all') where.category = category;
  const [total, recipes] = await Promise.all([
    db.styleRecipe.count({ where }),
    db.styleRecipe.findMany({
      where,
      orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, workspaceId: true, name: true, category: true, tag: true,
        desc: true, coverUrl: true, sampleImages: true, isFavorite: true,
        createdAt: true, updatedAt: true, promptSnippet: true,
      },
    }),
  ]);
  return { total, recipes };
}

export async function createStyleRecipe(data: {
  name: string;
  category: string;
  tag: string;
  desc: string;
  promptSnippet: string;
  coverUrl: string;
  sampleImages: string;
  sourceUrl: string;
}) {
  return db.styleRecipe.create({ data });
}

/** Replace the visible official entry with a private override; never mutate shared originals. */
export async function saveStyleRecipe(id: string, changes: StyleRecipeChanges) {
  const existing = await db.styleRecipe.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.workspaceId !== OFFICIAL_WORKSPACE_ID) {
    return { recipe: await db.styleRecipe.update({ where: { id }, data: changes }), copied: false };
  }
  const content = {
    name: existing.name, category: existing.category, tag: existing.tag,
    desc: existing.desc, promptSnippet: existing.promptSnippet,
    coverUrl: existing.coverUrl, sampleImages: existing.sampleImages,
    sourceUrl: existing.sourceUrl, isFavorite: existing.isFavorite,
  };
  return db.$transaction(async tx => {
    // Restoring an official recipe does not delete an earlier private copy.
    // A later edit must create another copy without colliding with its ID.
    const overrideId = `${localId('recipe_override', id)}_${randomUUID()}`;
    if (await tx.promptAssetUsageEvent.findUnique({ where: { id: localId('recipe_hidden', id) } })) {
      // A stale editor must not recreate a deleted entry or overwrite a newer override.
      return null;
    }
    const copy = await tx.styleRecipe.create({ data: { ...content, id: overrideId } });
    const recipe = await tx.styleRecipe.update({ where: { id: copy.id }, data: changes });
    await hideOfficial(tx, id);
    return { recipe, copied: true };
  });
}

export async function deleteStyleRecipe(id: string) {
  const existing = await db.styleRecipe.findUnique({ where: { id } });
  if (!existing) return; // Already gone, or belongs to another workspace.
  await db.$transaction(async tx => {
    if (existing.workspaceId === OFFICIAL_WORKSPACE_ID) {
      await hideOfficial(tx, id);
    } else {
      await tx.styleRecipe.deleteMany({ where: { id } });
    }
  });
}
