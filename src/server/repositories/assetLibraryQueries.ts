import { db } from './access';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';

const order = [
  { isFavorite: 'desc' as const },
  { usageCount: 'desc' as const },
  { createdAt: 'desc' as const },
];
const groupOrder = [...order, { id: 'desc' as const }];
const actions = { actions: { orderBy: [{ shotOrder: 'asc' as const }, { createdAt: 'asc' as const }], take: 4 } };

export const assetLibraryQueries = {
  sceneDetail: (id: string) => db.sceneAsset.findUnique({ where: { id }, include: { actions: { orderBy: [{ shotOrder: 'asc' }, { createdAt: 'asc' }] } } }),
  outfitDetail: (id: string) => db.outfitAsset.findUnique({ where: { id } }),
  actionDetail: (id: string) => db.actionAsset.findUnique({ where: { id } }),
  personaDetail: (id: string) => db.personaAsset.findUnique({ where: { id } }),
  groupDetail: (id: string) => db.fullPromptAsset.findUnique({ where: { id } }),
  exportAll: () => db.$transaction(async tx => {
    const [scenes, outfits, actions, personas, fullPrompts, productCategories, albums, fullPromptImageReplacements] = await Promise.all([
      tx.sceneAsset.findMany({ orderBy: { id: 'asc' } }),
      tx.outfitAsset.findMany({ orderBy: { id: 'asc' } }),
      tx.actionAsset.findMany({ orderBy: { id: 'asc' } }),
      tx.personaAsset.findMany({ orderBy: { id: 'asc' } }),
      tx.fullPromptAsset.findMany({ orderBy: { id: 'asc' } }),
      tx.assetProductCategory.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, name: true, parentId: true, position: true, isArchived: true, aliases: true, keywords: true, anatomy: true },
      }),
      tx.promptAlbum.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, name: true, sourceKey: true, productCategoryId: true },
      }),
      tx.$queryRawUnsafe<Array<{ motherAssetId: string; sourceSnapshotJson: string; generatedImagesJson: string; createdAt: string }>>(
        'SELECT "motherAssetId", "sourceSnapshotJson", "generatedImagesJson", "createdAt" FROM "FullPromptImageReplacement" WHERE "workspaceId" = ? ORDER BY "motherAssetId"',
        requireWorkspaceId(),
      ),
    ]);
    const exportedIds = new Map([
      ['scene', new Set(scenes.map(row => row.id))],
      ['outfit', new Set(outfits.map(row => row.id))],
      ['action', new Set(actions.map(row => row.id))],
      ['persona', new Set(personas.map(row => row.id))],
      ['full_prompt', new Set(fullPrompts.map(row => row.id))],
    ]);
    const registries = await tx.promptAssetRegistry.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true, assetType: true, sourceAssetId: true, status: true,
        version: true, provenance: true, sourceRef: true,
        qualityScore: true, confidence: true, publishedAt: true, disabledReason: true,
      },
    });
    const promptAssetRegistries = registries.filter(row => exportedIds.get(row.assetType)?.has(row.sourceAssetId));
    const exportedMotherIds = exportedIds.get('full_prompt');
    return { scenes, outfits, actions, personas, fullPrompts, productCategories, albums,
      promptAssetRegistries,
      fullPromptImageReplacements: fullPromptImageReplacements.filter(row => exportedMotherIds?.has(row.motherAssetId)) };
  }, { timeout: 60_000 }),
  listAll: (page: number) => Promise.all([
    db.sceneAsset.findMany({ orderBy: order, take: 1000, skip: (page - 1) * 1000, include: actions }),
    db.outfitAsset.findMany({ orderBy: order, take: 1000, skip: (page - 1) * 1000 }),
    db.actionAsset.findMany({ orderBy: order, take: 1000, skip: (page - 1) * 1000 }),
    db.personaAsset.findMany({ orderBy: order, take: 1000, skip: (page - 1) * 1000 }),
    db.fullPromptAsset.findMany({ where: { OR: [{ groupIndex: { not: null } }, { provenance: { not: 'legacy_single' } }] }, orderBy: groupOrder, take: 1000, skip: (page - 1) * 1000 }),
  ]),
  scenes: async (where: any, page: number, pageSize: number) => {
    const [total, items] = await Promise.all([
      db.sceneAsset.count({ where }),
      db.sceneAsset.findMany({ where, orderBy: order, skip: (page - 1) * pageSize, take: pageSize, include: actions }),
    ]);
    return { total, items };
  },
  outfits: async (where: any, page: number, pageSize: number) => {
    const [total, items] = await Promise.all([
      db.outfitAsset.count({ where }),
      db.outfitAsset.findMany({ where, orderBy: order, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, items };
  },
  actions: async (where: any, page: number, pageSize: number) => {
    const [total, items] = await Promise.all([
      db.actionAsset.count({ where }),
      db.actionAsset.findMany({ where, orderBy: order, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, items };
  },
  personas: async (where: any, page: number, pageSize: number) => {
    const [total, items] = await Promise.all([
      db.personaAsset.count({ where }),
      db.personaAsset.findMany({ where, orderBy: order, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, items };
  },
  groups: async (where: any, page: number, pageSize: number) => {
    const [total, items] = await Promise.all([
      db.fullPromptAsset.count({ where }),
      db.fullPromptAsset.findMany({ where, orderBy: groupOrder, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, items };
  },
};
