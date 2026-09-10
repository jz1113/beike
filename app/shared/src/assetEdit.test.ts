import { expect, it } from 'vitest';
import { pickAssetEditFields, validateAssetEdit } from './assetEdit';
it('keeps editable scalar data and rejects arbitrary Prisma input', () => {
  expect(pickAssetEditFields('outfit', { id: '1', code: 'O1', title: '新标题', top: '上衣' })).toEqual({ title: '新标题', top: '上衣' });
  expect(validateAssetEdit('outfit', { code: 'O1' })).toBeTruthy();
  expect(validateAssetEdit('outfit', { isFavorite: 'yes' })).toBeTruthy();
  expect(validateAssetEdit('outfit', { usageCount: { increment: 1 } })).toBeTruthy();
  expect(validateAssetEdit('outfit', { title: '新标题', isFavorite: true })).toBeNull();
});
