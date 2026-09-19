import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  assetProductCategory: { findMany: vi.fn() }, personaAsset: { findMany: vi.fn() },
  sceneAsset: { findMany: vi.fn() }, outfitAsset: { findMany: vi.fn() }, actionAsset: { findMany: vi.fn() },
}));
vi.mock('@beike/server-kit/prisma', () => ({ prisma: db }));
import { loadStoryboardAssets } from '../../../../services/analyze/storyboardAssets';

const categories = [{ id: 'phone', name: '手机通讯', parentId: null, position: 0 }];
const params = { productTitle: '荣耀300 手机', productIndex: 0, shotCount: 4 };
beforeEach(() => {
  vi.clearAllMocks();
  db.assetProductCategory.findMany.mockResolvedValue(categories);
  for (const model of [db.personaAsset, db.sceneAsset, db.outfitAsset, db.actionAsset]) model.findMany.mockResolvedValue([]);
});

describe('storyboard asset loading', () => {
  it('uses independent product membership and universal flag instead of legacy anatomy/style', async () => {
    const result = await loadStoryboardAssets(params);
    expect(db.actionAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      provenance: { not: 'reference_import' },
      OR: [{ productCategoryIds: { contains: '"phone"' } }, { isUniversal: true }],
    } }));
    expect(result.actionItems).toEqual([]);
    expect(result.trace.actionShortfall).toBe(4);
  });
  it('keeps loading beyond the first page, allowing unused late assets to participate', async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({ id: `a${index}`, title: '持机', shotType: 'half_body' }));
    db.actionAsset.findMany.mockResolvedValueOnce(first).mockResolvedValueOnce([{ id: 'late', title: '窗边持机', shotType: 'half_body' }]);
    const result = await loadStoryboardAssets({ ...params, shotCount: 1, previousActionIds: first.map(action => action.id) });
    expect(result.actionItems.map(action => action.id)).toEqual(['late']);
    expect(db.actionAsset.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 500 }));
  });
  it('locking a scene does not lock its first four linked poses', async () => {
    db.sceneAsset.findMany.mockResolvedValue([{ id: 'scene-1' }]);
    db.actionAsset.findMany.mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({ id: `a${index}`, title: '持机', shotType: 'half_body' })));
    const result = await loadStoryboardAssets({ ...params, lockedAssets: { sceneId: 'scene-1' }, previousActionIds: ['a0', 'a1', 'a2', 'a3'] });
    expect(new Set(result.actionItems.map(action => action.id))).toEqual(new Set(['a4', 'a5', 'a6', 'a7']));
    expect(db.actionAsset.findMany.mock.calls.every(([query]) => !('sceneId' in query.where))).toBe(true);
  });
  it('preserves the explicit batch allocation order and rejects unavailable actions', async () => {
    db.actionAsset.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    expect((await loadStoryboardAssets({ ...params, allocatedAssets: { actionIds: ['b', 'a'] } })).actionItems.map(action => action.id)).toEqual(['b', 'a']);
    await expect(loadStoryboardAssets({ ...params, allocatedAssets: { actionIds: ['missing'] } })).rejects.toThrow('所选动作');
  });
});
it('excludes packaging actions on the server and rejects a stale explicit allocation', async () => {
  db.actionAsset.findMany.mockResolvedValue([{ id: 'box', title: '开箱近景' }, { id: 'back', title: '裸机背面特写' }]);
  expect((await loadStoryboardAssets(params)).actionItems.map(action => action.id)).toEqual(['back']);
  await expect(loadStoryboardAssets({ ...params, allocatedAssets: { actionIds: ['box'] } })).rejects.toThrow('手机不使用包装');
});
it('applies product membership to explicit persona, scene and outfit locks', async () => {
  db.personaAsset.findMany.mockResolvedValue([{ id: 'p' }]);
  db.sceneAsset.findMany.mockResolvedValue([{ id: 's' }]);
  db.outfitAsset.findMany.mockResolvedValue([{ id: 'o' }]);
  await loadStoryboardAssets({ ...params, lockedAssets: { personaId: 'p', sceneId: 's', outfitId: 'o' } });
  for (const [model, id] of [[db.personaAsset, 'p'], [db.sceneAsset, 's'], [db.outfitAsset, 'o']] as const) {
    expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({id, OR:[{productCategoryIds:{contains:'"phone"'}},{isUniversal:true}]}) }));
  }
});
