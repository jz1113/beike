import { describe, expect, it } from 'vitest';
import { buildWorkshopTableItems, parseWorkshopTable, workshopTableAdditionCount } from './workshopTableImport';
import { workshopSnapshotSchema } from '@shared/contracts/workshopWorkspace';

const header = ['任务类目', '二级类目', '三级类目', '商品名称', '商品ID', '需要数量'];
const row = (id = '10227905999823', count: unknown = 3) => ['手机通讯', '手机', '手机', '商品名称', id, count];

describe('workshop table import', () => {
  it('merges repeated SKU totals by maximum, keeping source rows and conflict information', () => {
    const result = parseWorkshopTable([header, row(undefined, 1), row(undefined, 3), row(undefined, 2)]);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ count: 3, countConflict: true, sourceRows: [2, 3, 4], category: '手机通讯 / 手机' });
  });

  it('creates five independent full-content jobs and does not overwrite prior output when increasing demand', () => {
    const source = parseWorkshopTable([header, row(undefined, 3)]).rows;
    const first = buildWorkshopTableItems(source, []);
    expect(first.newItems).toHaveLength(3);
    expect(new Set(first.items.map(item => item.id)).size).toBe(3);
    expect(new Set(first.items.map(item => item.contentPlan?.theme)).size).toBe(3);
    first.items[0].copywriting = { title: '保留标题', content: '已确认正文' };
    const next = buildWorkshopTableItems([{ ...source[0], count: 5 }], first.items);
    expect(next.newItems.map(item => item.contentPlan?.index)).toEqual([4, 5]);
    expect(next.items.every(item => item.contentPlan?.total === 5)).toBe(true);
    expect(next.items[0].copywriting?.content).toBe('已确认正文');
    expect(workshopTableAdditionCount([{ ...source[0], count: 5 }], next.items)).toBe(0);
    expect(buildWorkshopTableItems([{ ...source[0], count: 5 }], next.items.filter(item => item.contentPlan?.index !== 2)).newItems[0].contentPlan?.index).toBe(2);
  });

  it('rejects invalid quantities and identifiers with precise row errors, without guessing', () => {
    const result = parseWorkshopTable([header, row(undefined, ''), row(undefined, 0), row(undefined, 2.5), row(undefined, 21), row('not-an-sku', 1), row(undefined, '3条')]);
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(6);
    expect(result.errors[0]).toContain('第 2 行');
    const unsafe = parseWorkshopTable([['商品ID', '需要数量'], [12345678901234568, 1]]);
    expect(unsafe.errors[0]).toContain('精度');
  });

  it('keeps all valid rows of large workbooks and blocks over-capacity imports without truncating', () => {
    const result = parseWorkshopTable([header, ...Array.from({ length: 3050 }, (_, index) => row(String(10000000 + index), 1))]);
    expect(result.rows).toHaveLength(3050);
    expect(() => buildWorkshopTableItems(result.rows, [])).toThrow('20 款');
    expect(buildWorkshopTableItems(result.rows.slice(0, 20), []).newItems).toHaveLength(20);
    expect(() => buildWorkshopTableItems(result.rows.slice(0, 11).map(value => ({ ...value, count: 20 })), [])).toThrow('200 条');
  });

  it('deduplicates Tmall and Taobao product identities while preserving other platforms', () => {
    const result = parseWorkshopTable([['商品链接', '需要数量'], ['https://detail.tmall.com/item.htm?id=12345678', 2], ['https://item.taobao.com/item.htm?id=12345678', 5], ['12345678', 1]]);
    expect(result.rows.map(value => value.count)).toEqual([5, 1]);
  });

  it('retains content plans and provenance across the persisted workspace schema', () => {
    const items = buildWorkshopTableItems(parseWorkshopTable([header, row()]).rows, []).items;
    const snapshot = { version: 1, mode: 'original', currentStage: 1, batchInputText: '', items,
      settings: { selectedVisionModel: 'vision', selectedImageGenModel: 'image', selectedArchId: 'auto', selectedQuality: 'high', selectedAspect: '3:4', selectedShotCount: 4, useAssetLibrary: false,
        lockedPersonaId: 'auto', lockedSceneId: 'auto', lockedOutfitId: 'auto', lockedActionId: 'auto', generationStrategy: 'grid_first' } };
    const restored = workshopSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.items[2].contentPlan).toEqual(items[2].contentPlan);
    expect(restored.items[2].importSourceRows).toEqual([2]);
  });
});
