import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReviewPacer } from './reviewPacer.ts';

test('ramps parallelism after successful batches and cuts it on rate limiting', async () => {
  const pacer = new ReviewPacer();
  assert.equal(pacer.concurrency, 4);
  for (let index = 0; index < 8; index += 1) {
    assert.equal(await pacer.acquire(() => false), true);
    pacer.succeeded();
  }
  assert.equal(pacer.concurrency, 5);
  assert.equal(await pacer.acquire(() => false), true);
  pacer.rateLimited(0);
  assert.equal(pacer.concurrency, 2);
});

test('stopped runs do not acquire another request slot', async () => {
  const pacer = new ReviewPacer();
  assert.equal(await pacer.acquire(() => true), false);
});
