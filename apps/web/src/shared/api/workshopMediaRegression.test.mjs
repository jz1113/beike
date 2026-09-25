import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Bundle the browser entry points with Vite's environment replaced, without making network calls.
async function loadBrowserModule(relativePath) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm',
    define: { 'import.meta.env': '{}' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

test('media URLs use the same-origin proxy without a signed session, including protocol-relative CDN URLs', async () => {
  const { proxyMediaUrl, hasMediaSession } = await loadBrowserModule('./apiClient.ts');
  assert.equal(hasMediaSession(), false);
  const url = new URL(proxyMediaUrl('//img10.360buyimg.com/example.jpg', { thumb: true, width: 420 }), 'https://example.test');
  assert.equal(url.pathname, '/api/system/proxy-image');
  assert.equal(url.searchParams.get('url'), 'https://img10.360buyimg.com/example.jpg');
  assert.equal(url.searchParams.get('thumb'), '1');
  assert.equal(proxyMediaUrl('/storage/test.png'), '/storage/test.png');
});

test('collection reports completion for successful, empty-image and failed responses, and retries failed items', async () => {
  const { parseBatchInputLines, runBatchCollect } = await loadBrowserModule('../../features/workshop/model/collection/batchCollect.ts');
  const { newItems } = parseBatchInputLines('100310741418\n10036043658\n1021932306223\n100310741418', new Set());
  assert.equal(newItems.length, 3);
  newItems[2].status = 'failed';
  const previousFetch = globalThis.fetch;
  const requests = [];
  const progress = [];
  const states = new Map();
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const product = body.url === '100310741418' ? { title: '商品', mainImages: ['https://img10.360buyimg.com/a.jpg'] } : {};
    return new Response(JSON.stringify(body.url === '1021932306223'
      ? { success: false, error: 'upstream unavailable' }
      : { success: true, product }), { status: 200 });
  };
  try {
    const result = await runBatchCollect(newItems, {
      concurrency: 1,
      onItemUpdate: (id, patch) => states.set(id, { ...states.get(id), ...patch }),
      onProgress: value => progress.push(value),
    });
    assert.deepEqual(result, { success: 1, failed: 2 });
    assert.deepEqual(progress.map(value => value.current), [1, 2, 3]);
    assert.equal(states.get(newItems[0].id).allTypedImages.length, 1);
    assert.equal(states.get(newItems[1].id).status, 'failed');
    assert.equal(requests[2].forceRefresh, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
