import { jsonResponse } from '../../../../core/http';
import { prisma } from '../../../../repositories/db';
import {
  SEED_SCENE_TITLES,
  SEED_OUTFIT_TITLES,
  SEED_ACTION_TITLES,
  SEED_PERSONA_NAMES,
  SEED_PURGE_FILTER,
} from './constants';

// 清理官方预置种子资产（按标题白名单精确匹配，避免误删用户手动录入）
export async function purgeSeedAssets() {
  const [scenes, outfits, actions, personas] = await Promise.all([
    prisma.sceneAsset.deleteMany({
      where: {
        title: { in: SEED_SCENE_TITLES },
        ...SEED_PURGE_FILTER,
        coverUrl: null,
      },
    }),
    prisma.outfitAsset.deleteMany({
      where: {
        title: { in: SEED_OUTFIT_TITLES },
        ...SEED_PURGE_FILTER,
        coverUrl: null,
      },
    }),
    prisma.actionAsset.deleteMany({
      where: {
        title: { in: SEED_ACTION_TITLES },
        ...SEED_PURGE_FILTER,
        coverUrl: null,
      },
    }),
    prisma.personaAsset.deleteMany({
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
    const res = await prisma.sceneAsset.deleteMany({});
    deletedCount += res.count;
  }
  if (targetType === 'outfit' || targetType === 'all') {
    const res = await prisma.outfitAsset.deleteMany({});
    deletedCount += res.count;
  }
  if (targetType === 'action' || targetType === 'all') {
    const res = await prisma.actionAsset.deleteMany({});
    deletedCount += res.count;
  }
  if (targetType === 'persona' || targetType === 'all') {
    const res = await prisma.personaAsset.deleteMany({});
    deletedCount += res.count;
  }
  if (targetType === 'full_prompt' || targetType === 'all') {
    const res = await prisma.fullPromptAsset.deleteMany({});
    deletedCount += res.count;
  }
  return jsonResponse({
    success: true,
    message: `已彻底清空 ${deletedCount} 条资产`,
    deletedCount,
  });
}
