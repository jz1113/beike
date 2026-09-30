import { db } from './access';

const assetOrder = [
  { isFavorite: 'desc' as const },
  { usageCount: 'desc' as const },
  { createdAt: 'desc' as const },
];

export const storyboardAssetsRepository = {
  listProductCategories: () => db.assetProductCategory.findMany({
    select: { id: true, name: true, parentId: true, position: true, isArchived: true, keywords: true, anatomy: true, aliases: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  }),
  findPersona: (where: any) => db.personaAsset.findFirst({ where }),
  listPersonas: (where: any) => db.personaAsset.findMany({ where, orderBy: assetOrder, take: 12 }),
  findScene: (where: any) => db.sceneAsset.findFirst({ where }),
  listScenes: (where: any) => db.sceneAsset.findMany({ where, orderBy: assetOrder, take: 100 }),
  findOutfit: (where: any) => db.outfitAsset.findFirst({ where }),
  listOutfits: (where: any) => db.outfitAsset.findMany({ where, orderBy: assetOrder, take: 50 }),
  findGroup: (where: any) => db.fullPromptAsset.findFirst({ where }),
  listCompleteGroups: (where: any) => db.fullPromptAsset.findMany({ where, orderBy: assetOrder }),
};
