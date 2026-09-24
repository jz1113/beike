import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
