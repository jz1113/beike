import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { resolveUnifiedShardSize } from '@beike/domain/assetDeconstruct/prompts';
import { mergeUnifiedShardMetadata, resolveUnifiedShardConcurrency, runUnifiedDeconstruct } from './unified.ts';

test('default deconstruction shards fit a four-image prompt group', () => {
  const prior = process.env.ASSET_DECONSTRUCT_SHARD_SIZE;
  delete process.env.ASSET_DECONSTRUCT_SHARD_SIZE;
  try {
    assert.equal(resolveUnifiedShardSize(), 4);
    assert.equal(resolveUnifiedShardSize(3), 3);
    process.env.ASSET_DECONSTRUCT_SHARD_SIZE = '2';
    assert.equal(resolveUnifiedShardSize(), 2);
  } finally {
    if (prior === undefined) delete process.env.ASSET_DECONSTRUCT_SHARD_SIZE;
    else process.env.ASSET_DECONSTRUCT_SHARD_SIZE = prior;
  }
});

test('parallel shard count is bounded', () => {
  const prior = process.env.ASSET_DECONSTRUCT_SHARD_CONCURRENCY;
  delete process.env.ASSET_DECONSTRUCT_SHARD_CONCURRENCY;
  try {
    assert.equal(resolveUnifiedShardConcurrency(), 2);
    process.env.ASSET_DECONSTRUCT_SHARD_CONCURRENCY = '20';
    assert.equal(resolveUnifiedShardConcurrency(), 3);
  } finally {
    if (prior === undefined) delete process.env.ASSET_DECONSTRUCT_SHARD_CONCURRENCY;
    else process.env.ASSET_DECONSTRUCT_SHARD_CONCURRENCY = prior;
  }
});

test('shard metadata retains every group and shifts local image references', () => {
  const merged = mergeUnifiedShardMetadata([
    { offset: 0, parsedResult: {
      theme_category: 'digital_3c', content_summary: '前段',
      content_groups: [{ source_image_indices: [1, 2, 3, 4], title: '前组' }],
      actions: [{ source_image_index: 2, title: '前动作' }],
      scenes: [{ source_image_indices: [1, 4], title: '前场景' }],
    } },
    { offset: 4, parsedResult: {
      content_summary: '后段',
      content_groups: [{ source_image_indices: [1, 2], title: '后组' }],
      actions: [{ source_image_index: 1, title: '后动作' }],
      scenes: [{ source_image_indices: [1, 2], title: '后场景' }],
    } },
  ]);
  assert.deepEqual(merged.content_groups.map((group) => group.source_image_indices), [[1, 2, 3, 4], [5, 6]]);
  assert.deepEqual(merged.actions.map((action) => action.source_image_index), [2, 5]);
  assert.deepEqual(merged.scenes.map((scene) => scene.source_image_indices), [[1, 4], [5, 6]]);
  assert.equal(merged.content_summary, '前段；后段');
  assert.equal(merged.theme_category, 'digital_3c');
});

test('ten images run as bounded parallel shards and return ordered results', async () => {
  let active = 0;
  let peak = 0;
  const batchSizes = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const count = input.messages[0].content.filter((part) => part.type === 'image_url').length;
    batchSizes.push(count);
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 30));
    active--;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      theme_category: 'digital_3c',
      content_groups: [{ source_image_indices: Array.from({ length: count }, (_, i) => i + 1) }],
      per_image: Array.from({ length: count }, (_, i) => ({ image_index: i + 1, title: `图${i + 1}`, reverse_prompt_zh: '【主体】手机。【场景结构】桌面。【光影】侧光。' })),
    }) } }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const result = await runUnifiedDeconstruct({
      safeImgs: Array.from({ length: 10 }, (_, i) => `data:image/jpeg;base64,${i}`),
      modelsToTry: ['mock-vision'], targetBaseUrl: `http://127.0.0.1:${address.port}`,
      targetApiKey: 'test', userHint: '',
    });
    assert.ok(result);
    assert.equal(result.shardCount, 3);
    assert.deepEqual(batchSizes.slice().sort((a, b) => a - b), [2, 4, 4]);
    assert.equal(peak, 2);
    assert.deepEqual(result.perImageResults.map((item) => item.image_index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(result.parsedResult.content_groups.map((group) => group.source_image_indices), [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10]]);
  } finally {
    server.close();
  }
});
