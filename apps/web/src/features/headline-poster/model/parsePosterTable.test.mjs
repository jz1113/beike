import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTable } from './parsePosterTable.ts';

test('parseTable maps headered rows and default portrait format', () => {
  const rows = parseTable([
    ['封面链接', '原标题', '文字方向', '商品名称'],
    ['https://example.com/a.jpg', '洗衣效果很到位', '文字竖', '小米洗衣机 V10'],
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceImageUrl, 'https://example.com/a.jpg');
  assert.equal(rows[0].originalTitle, '洗衣效果很到位');
  assert.equal(rows[0].productName, '小米洗衣机 V10');
  assert.equal(rows[0].coverTitle, '洗衣效果很到位');
  assert.equal(rows[0].format.importValue, '文字竖');
  assert.equal(rows[0].status, 'idle');
});

test('parseTable marks unrecognised format as failed', () => {
  const rows = parseTable([
    ['https://example.com/b.jpg', '轻盈贴合出行', '未知版式'],
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'failed');
  assert.match(String(rows[0].error), /无法识别/);
});
