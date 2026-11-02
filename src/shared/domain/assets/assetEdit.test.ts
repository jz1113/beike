import { describe, expect, it } from 'vitest';
import { pickAssetEditFields, validateAssetEdit } from './assetEdit';

describe('action category editing', () => {
  it.each(['["digital_3c"]', '[]'])('keeps the selected categories %s in the save payload', (productCategoryIds) => {
    const data = { title: '深度动作', productCategoryIds };
    expect(pickAssetEditFields('action', { id: 'action-1', ...data })).toEqual(data);
    expect(validateAssetEdit('action', data)).toBeNull();
  });

  it.each([null, [], 42, {}].map((productCategoryIds) => ({ productCategoryIds })))('rejects invalid category field types: $productCategoryIds', ({ productCategoryIds }) => {
    expect(validateAssetEdit('action', { productCategoryIds })).toBe('字段类型不正确: productCategoryIds');
  });
});
