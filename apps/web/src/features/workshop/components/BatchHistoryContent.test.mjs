import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('./BatchHistoryContent.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
  define: { 'import.meta.env': '{}' },
});
const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, compiledModule, compiledModule.exports);
const { BatchHistoryProduct, BatchHistoryStats, BatchHistoryRecord, formatBatchHistoryDate } = compiledModule.exports;

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const item = { id: 'one', itemId: 'SKU-123', title: '', selectedProductImages: [], tasks: [], copywriting: null };

test('history thumbnail has a fixed-size outer container even without an image', () => {
  const html = render(BatchHistoryProduct, { item, index: 0 });
  assert.match(html, /data-history-thumbnail="true" class="h-20 w-20 shrink-0 overflow-hidden/);
  assert.match(html, /暂无商品图片/);
  assert.match(html, /商品 SKU-123/);
  assert.match(html, /尚未生成/);
});

test('results and copy statistics ignore superseded, temporary and malformed values', () => {
  const product = { ...item, tasks: [
    { status: 'SUCCESS', resultUrl: '/storage/a.png' },
    { status: 'SUCCESS', resultUrl: 'blob:temp' },
    { status: 'SUCCESS', resultUrl: '/storage/old.png', resultStatus: 'superseded' },
    { status: 'FAILURE' }, { status: 'FAILURE', resultStatus: 'superseded' },
  ], copywriting: { title: 123, content: 'not valid' } };
  const html = render(BatchHistoryProduct, { item: product, index: 0 });
  assert.match(html, /成图 1\/3 张/);
  assert.match(html, /1 个分镜失败/);
  assert.match(html, /文案待完善/);
  const stats = render(BatchHistoryStats, { batch: { snapshot: { items: [product, { ...item, id: 'two', copywriting: { title: '标题', content: '正文' } }] } } });
  assert.match(stats, /商品<\/dt><dd[^>]*>2<\/dd>/);
  for (const label of ['已成图', '文案完成', '失败分镜']) assert.match(stats, new RegExp(`${label}</dt><dd[^>]*>1</dd>`));
});

test('history list identifies batches without presenting task count as generated images', () => {
  const html = render(BatchHistoryRecord, { batch: { id: 'batch-123', name: '未命名新批次', status: 'archived', updatedAt: '2026-09-25T08:32:00Z', itemCount: 13, taskCount: 52 }, disabled: true, onView() {} });
  for (const text of ['已归档', '编号 batch-123', '13 款商品', '52 个分镜任务', 'disabled']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /已成图/);
  assert.equal(formatBatchHistoryDate('invalid'), '时间未知');
});
