import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('successful vision result creates and reuses a prompt album', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'beike-deconstruct-'));
  process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
  const { initializeDatabase, prisma, unscopedPrisma } = await import('@beike/server-kit/prisma');
  const { runWithWorkspace } = await import('@beike/server-kit/workspaceContext');
  const { persistFullPromptRecords } = await import('./saveFullPrompts.ts');
  await initializeDatabase();

  const input = {
    parsedResult: {},
    perImageResults: [{ image_index: 1, reverse_prompt_zh: '测试图片反推提示词', has_human: false }],
    imageUrls: ['test-image-1'],
    albumName: '反推入库测试',
    category: 'general',
    sampleImagesJson: '["test-image-1"]',
    thumbForUrl: async () => '',
    defaultCoverUrl: '',
  };
  try {
    const first = await runWithWorkspace('deconstruct-test', () => persistFullPromptRecords(input));
    const second = await runWithWorkspace('deconstruct-test', () => persistFullPromptRecords(input));
    assert.equal(first.fullPrompts.length, 1);
    assert.equal(second.album.id, first.album.id);
    assert.equal(second.fullPrompts[0].id, first.fullPrompts[0].id);
  } finally {
    await prisma.$disconnect();
    await unscopedPrisma.$disconnect();
  }
});
