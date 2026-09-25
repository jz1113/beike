import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('legacy generated media is readable only by the workspace that owns its task', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'beike-legacy-media-'));
  const storage = path.join(dir, 'storage');
  process.env.AZHUO_CACHE_DIR = storage;
  process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;

  const { initializeDatabase, prisma, unscopedPrisma } = await import('@beike/server-kit/prisma');
  const { runWithWorkspace } = await import('@beike/server-kit/workspaceContext');
  const { GET } = await import('./local-media.ts');
  const rel = `generated/images/local/${'a'.repeat(64)}.png`;
  const url = `/storage/${rel}`;
  const file = path.join(storage, rel);

  try {
    await initializeDatabase();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from('legacy-image'));

    const request = new Request(`https://example.test${url}`);
    const browserOnly = await runWithWorkspace('ws-a', () => GET(request));
    assert.equal(browserOnly.status, 200);
    assert.equal(await browserOnly.text(), 'legacy-image');

    await runWithWorkspace('ws-a', () => prisma.imageTask.create({
      data: { prompt: 'test', status: 'SUCCESS', resultUrl: url },
    }));
    const owned = await runWithWorkspace('ws-a', () => GET(request));
    assert.equal(owned.status, 200);
    assert.equal(await owned.text(), 'legacy-image');
    assert.equal((await runWithWorkspace('ws-b', () => GET(request))).status, 403);
  } finally {
    await prisma.$disconnect();
    await unscopedPrisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('workspace media streams full files and byte ranges without bypassing access checks', async () => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'beike-stream-media-')));
  process.env.AZHUO_CACHE_DIR = dir;
  const { runWithWorkspace } = await import('@beike/server-kit/workspaceContext');
  const { GET } = await import('./local-media.ts');
  const request = (rel = 'ws-a/video.mp4', headers = {}, method = 'GET') =>
    runWithWorkspace('ws-a', () => GET(new Request(`https://example.test/storage/${rel}`, { headers, method })));
  mkdirSync(path.join(dir, 'ws-a/assistant-attachments'), { recursive: true });
  writeFileSync(path.join(dir, 'ws-a/video.mp4'), '0123456789');
  writeFileSync(path.join(dir, 'ws-a/empty.mp4'), '');
  const expired = `ws-a/assistant-attachments/${Date.now() - 1000}-abcdef.jpg`;
  writeFileSync(path.join(dir, expired), 'expired');
  try {
    const full = await request();
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'video/mp4');
    assert.equal(full.headers.get('content-length'), '10');
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.equal(full.headers.get('cache-control'), 'private, no-store');
    assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await full.text(), '0123456789');
    for (const [range, text, contentRange] of [
      ['bytes=2-5', '2345', 'bytes 2-5/10'],
      ['bytes=7-', '789', 'bytes 7-9/10'],
      ['bytes=-3', '789', 'bytes 7-9/10'],
      ['bytes=8-99', '89', 'bytes 8-9/10'],
      ['bytes=-99', '0123456789', 'bytes 0-9/10'],
      ['bytes=0-0', '0', 'bytes 0-0/10'],
    ]) {
      const result = await request(undefined, { Range: range });
      assert.equal(result.status, 206, range);
      assert.equal(result.headers.get('content-range'), contentRange);
      assert.equal(result.headers.get('content-length'), String(text.length));
      assert.equal(await result.text(), text);
    }
    for (const range of ['bytes=10-', 'bytes=4-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'bytes=wat', 'items=0-1', 'bytes=99999999999999999-']) {
      const result = await request(undefined, { Range: range });
      assert.equal(result.status, 416, range);
      assert.equal(result.headers.get('content-range'), 'bytes */10');
      assert.equal(await result.text(), '');
    }
    const head = await request(undefined, { Range: 'bytes=1-3' }, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
    const conditional = await request(undefined, { Range: 'bytes=1-3', 'If-Range': '"old"' });
    assert.equal(conditional.status, 200);
    assert.equal(await conditional.text(), '0123456789');
    assert.equal((await request('ws-b/video.mp4', { Range: 'bytes=0-1' })).status, 403);
    assert.equal((await request('ws-a/%252e%252e/video.mp4')).status, 403);
    assert.equal((await request('ws-a/missing.mp4')).status, 404);
    assert.equal((await request('ws-a/assistant-attachments')).status, 404);
    assert.equal((await request(expired)).status, 410);
    assert.equal((await request(expired)).status, 404);
    const empty = await request('ws-a/empty.mp4');
    assert.equal(empty.status, 200);
    assert.equal(empty.headers.get('content-length'), '0');
    assert.equal(await empty.text(), '');
    assert.equal((await request('ws-a/empty.mp4', { Range: 'bytes=0-' })).status, 416);
    const cancelled = await request();
    await cancelled.body.cancel();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
