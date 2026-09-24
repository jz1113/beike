import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelRows, remapModelIds, validateResults } from './keywordReview.ts';

test('short ids and clipped expansions shrink a 200 row prompt', () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({
    id: `Sheet1:${index + 2}`,
    query: `关键词${index}`,
    expansion: '拓展'.repeat(200),
    entityExpansion: '实体'.repeat(200),
    contentType: '教程',
  }));
  const before = JSON.stringify(rows).length;
  const after = JSON.stringify(buildModelRows(rows)).length;
  assert.ok(after < before * 0.4, `payload ${after} should be under 40% of ${before}`);
  assert.equal(buildModelRows(rows)[0].id, '1');
  assert.equal([...buildModelRows(rows)[0].expansion].length, 120);
});

test('one illegal row does not discard the rest of the batch', () => {
  const rows = [
    { id: 'Sheet1:2', query: '游戏手机推荐' },
    { id: 'Sheet1:3', query: '哲学词' },
  ];
  const parsed = remapModelIds({
    results: [
      { id: '1', category: '3C 数码', producible: '制作', categoryReason: '', rejectReason: '' },
      { id: '2', category: '哲学', producible: '制作', categoryReason: '无法归类', rejectReason: '' },
    ],
  }, rows);
  const reviewed = validateResults(parsed, rows);
  assert.deepEqual(reviewed.failedIds, ['Sheet1:3']);
  assert.equal(reviewed.results[0].id, 'Sheet1:2');
  assert.equal(reviewed.results[0].category, '3C数码');
  assert.equal(reviewed.results[0].categoryReason, '3C数码相关内容');
});
