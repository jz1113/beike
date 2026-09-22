import { jsonResponse } from '../../../../core/http';
import { db } from '../../../../repositories/access';
import {
  SEED_SCENE_TITLES,
  SEED_OUTFIT_TITLES,
  SEED_ACTION_TITLES,
  SEED_PERSONA_NAMES,
  SEED_PURGE_FILTER,
} from './constants';
import {
  resumeOfficialCatalogSeedAfterFailedReset,
  suppressOfficialCatalogSeedAfterReset,
} from '@beike/server-kit/officialCatalogSeed';

// 清理官方预置种子资产（按标题白名单精确匹配，避免误删用户手动录入）
export async function purgeSeedAssets() {
  const [scenes, outfits, actions, personas] = await Promise.all([
    db.sceneAsset.deleteMany({
      where: {
        title: { in: SEED_SCENE_TITLES },
        ...SEED_PURGE_FILTER,
        coverUrl: null,
      },
    }),
    db.outfitAsset.deleteMany({
      where: {
        title: { in: SEED_OUTFIT_TITLES },
        ...SEED_PURGE_FILTER,
        coverUrl: null,
      },
    }),
    db.actionAsset.deleteMany({
      where: {
        title: { in: SEED_ACTION_TITLES },
        ...SEED_PURGE_FILTER,
        coverUrl: null,
      },
    }),
    db.personaAsset.deleteMany({
      where: {
        name: { in: SEED_PERSONA_NAMES },
        ...SEED_PURGE_FILTER,
        avatarUrl: null,
      },
    }),
  ]);

  const cleanedCount = scenes.count + outfits.count + actions.count + personas.count;
  return jsonResponse({
    success: true,
    message: `已清理 ${cleanedCount} 条官方预置种子资产`,
    cleanedCount,
    details: {
      scenes: scenes.count,
      outfits: outfits.count,
      actions: actions.count,
      personas: personas.count,
    },
  });
}

// 🌟 一键清空指定类型资产
export async function clearAllAssets(targetType: string) {
  let deletedCount = 0;
  if (targetType === 'scene' || targetType === 'all') {
    const res = await db.sceneAsset.deleteMany({});
    deletedCount += res.count;
  }
  if (targetType === 'outfit' || targetType === 'all') {
    const res = await db.outfitAsset.deleteMany({});
    deletedCount += res.count;
  }
  if (targetType === 'action' || targetType === 'all') {
    const res = await db.actionAsset.deleteMany({});
    deletedCount += res.count;
  }
  if (targetType === 'persona' || targetType === 'all') {
    const res = await db.personaAsset.deleteMany({});
    deletedCount += res.count;
  }
  if (targetType === 'full_prompt' || targetType === 'all') {
    const res = await db.fullPromptAsset.deleteMany({});
    deletedCount += res.count;
  }
  return jsonResponse({
    success: true,
    message: `已彻底清空 ${deletedCount} 条资产`,
    deletedCount,
  });
}

/**
 * Deletes every application record held in the local SQLite database.
 *
 * This is intentionally separate from `clearAllAssets`: clearing a library
 * tab should not erase generation history or conversations.  The caller is
 * responsible for presenting the explicit database-reset confirmation.
 */
export async function clearLocalDatabase() {
  // Set the marker before the transaction, so a completed wipe can never be
  // undone by the startup seed.  If the transaction fails, remove it again.
  const resetMarkerCreated = suppressOfficialCatalogSeedAfterReset();
  try {
    const deletedCount = await db.$transaction(async (tx) => {
      const results = await Promise.all([
        tx.assistantTurnItem.deleteMany(),
        tx.assistantTurn.deleteMany(),
        tx.assistantThread.deleteMany(),
        tx.imageTask.deleteMany(),
        tx.promptRecord.deleteMany(),
        tx.product.deleteMany(),
        tx.styleRecipe.deleteMany(),
        tx.actionAsset.deleteMany(),
        tx.sceneAsset.deleteMany(),
        tx.outfitAsset.deleteMany(),
        tx.personaAsset.deleteMany(),
        tx.fullPromptAsset.deleteMany(),
        tx.promptImportSource.deleteMany(),
        tx.deconstructReview.deleteMany(),
        tx.workshopBatchState.deleteMany(),
        tx.workshopBatch.deleteMany(),
        tx.workshopWorkspace.deleteMany(),
        tx.promptAlbum.deleteMany(),
      ]);

      // AssetProductCategory has a self-referencing RESTRICT relation. Delete
      // leaves first so this also works for arbitrarily nested category trees.
      let categoriesDeleted = 0;
      while (true) {
        const leaves = await tx.assetProductCategory.findMany({
          where: { children: { none: {} } },
          select: { id: true },
        });
        if (leaves.length === 0) break;
        const result = await tx.assetProductCategory.deleteMany({
          where: { id: { in: leaves.map((category) => category.id) } },
        });
        categoriesDeleted += result.count;
      }

      return results.reduce((sum, result) => sum + result.count, 0) + categoriesDeleted;
    });

    return jsonResponse({
      success: true,
      message: `已彻底清空数据库中的 ${deletedCount} 条记录`,
      deletedCount,
    });
  } catch (error) {
    if (resetMarkerCreated) resumeOfficialCatalogSeedAfterFailedReset();
    throw error;
  }
}
