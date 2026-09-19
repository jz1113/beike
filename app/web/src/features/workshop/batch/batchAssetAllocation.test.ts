import { describe, expect, it } from 'vitest';
import { allocateBatchActions } from './batchAssetAllocation';

const categories = [
  { id: 'jewelry', name: '珠宝首饰', parentId: null, position: 0 },
  { id: 'phone', name: '手机通讯', parentId: null, position: 1 },
];
const products = ['荣耀300 手机', 'vivo iQOO Z11S', '小米红米Note15', '红米Note15 Pro'].map((title, index) => ({ id: `p${index}`, title }));
const phoneActions = Array.from({ length: 51 }, (_, index) => ({ id: `phone-${index}`, title: `持机${index}`,
  shotType: ['half_body', 'lifestyle', 'interaction'][index % 3], productCategoryIds: '["phone"]' }));

describe('batch action reservation', () => {
  it('reserves sixteen different applicable actions before four concurrent requests begin', () => {
    const jewelry = Array.from({ length: 711 }, (_, index) => ({ id: `jewel-${index}`, title: '耳饰特写',
      shotType: 'macro_detail', productCategoryIds: '["jewelry"]' }));
    const result = allocateBatchActions(products, [...jewelry, ...phoneActions], categories, 4);
    expect([...result.values()].map(actions => actions.length)).toEqual([4, 4, 4, 4]);
    const ids = [...result.values()].flat().map(action => action.id);
    expect(new Set(ids).size).toBe(16);
    expect(ids.every(id => id.startsWith('phone-'))).toBe(true);
  });
  it('honors the requested shot count and does not pad a sparse category with jewelry', () => {
    expect(allocateBatchActions(products, phoneActions, categories, 7).get('p0')).toHaveLength(7);
    const sparse = allocateBatchActions(products, phoneActions.slice(0, 2), categories, 4);
    expect([...sparse.values()].every(actions => actions.length === 2)).toBe(true);
  });
});
it('does not allocate legacy phone packaging shots', () => {
  const actions = [
    { id: 'box', title: '斜置包装俯视机位', productCategoryIds: '["phone"]' },
    { id: 'back', title: '裸机背面', productCategoryIds: '["phone"]' },
  ];
  const result = allocateBatchActions(products.slice(0, 1), actions, categories, 4);
  expect(result.get('p0')?.map(action => action.id)).toEqual(['back']);
});
