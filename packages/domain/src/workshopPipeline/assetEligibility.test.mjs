import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholderIdentity, isWorkshopAssetEligible, workshopAssetBlockReason } from './assetEligibility.ts';

test('placeholder identities shown in production screenshots are excluded on both surfaces', () => {
  for (const title of ['无法确认', '不适用', '无人像穿搭', '无人物', '无穿搭', '信息不足']) {
    assert.equal(isPlaceholderIdentity({ id: 'a', title }, 'outfit'), true, title);
    assert.equal(isWorkshopAssetEligible({ id: 'a', title }, 'outfit'), false, title);
  }
});
test('unknown incidental anatomy does not hide a valid partial outfit or person', () => {
  assert.equal(isPlaceholderIdentity({ title: '局部深色袖口', bottom: '无法确认', description: '无人物面部，仅见袖口' }, 'outfit'), false);
  assert.equal(isPlaceholderIdentity({ name: '短发女性', description: '无法确认具体年龄' }, 'persona'), false);
  assert.equal(isPlaceholderIdentity({ title: '无人庭院' }, 'scene'), false);
});
test('published status and reference provenance are checked independently of identity', () => {
  const row = { id: 'p', name: '短发女性' };
  assert.equal(isWorkshopAssetEligible(row, 'persona'), true); // existing grandfather policy
  for (const status of ['draft', 'pending_review', 'disabled', 'needs_fix', 'archived']) {
    assert.equal(isWorkshopAssetEligible({ ...row, registry: { status } }, 'persona'), false);
  }
  assert.equal(isWorkshopAssetEligible({ ...row, provenance: 'reference_import', registry: { status: 'published' } }, 'persona'), false);
});
test('slim metadata preserves full-row placeholder decision and requires complete groups', () => {
  assert.equal(isPlaceholderIdentity({ id: 'a', title: '旧标签', contentEligible: false }, 'outfit'), true);
  assert.match(workshopAssetBlockReason({ id: 'g', title: '手机图组' }, 'full_prompt'), /四图/);
});
