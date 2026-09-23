import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('only complete four-image groups become reusable prompt assets', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'beike-deconstruct-'));
  process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
  const { initializeDatabase, prisma, unscopedPrisma } = await import('@beike/server-kit/prisma');
  const { runWithWorkspace } = await import('@beike/server-kit/workspaceContext');
  const { persistFullPromptRecords } = await import('./saveFullPrompts.ts');
  await initializeDatabase();

  const input = {
    parsedResult: { content_groups: [
      { source_image_indices: [1, 2, 3, 4], title: '完整图组' },
      { source_image_indices: [5, 6], title: '残组' },
    ] },
    perImageResults: Array.from({ length: 6 }, (_, i) => ({ image_index: i + 1, reverse_prompt_zh: '测试图片反推提示词', has_human: false })),
    imageUrls: Array.from({ length: 6 }, (_, i) => `test-image-${i + 1}`),
    albumName: '反推入库测试',
    category: 'general',
    sampleImagesJson: '[]',
    thumbForUrl: async () => '',
    defaultCoverUrl: '',
  };
  try {
    const first = await runWithWorkspace('deconstruct-test', () => persistFullPromptRecords(input));
    const second = await runWithWorkspace('deconstruct-test', () => persistFullPromptRecords(input));
    assert.equal(first.fullPrompts.length, 1);
    assert.equal(first.fullPrompts[0].sourceImageIndices, '[1,2,3,4]');
    assert.equal(second.album.id, first.album.id);
    assert.equal(second.fullPrompts[0].id, first.fullPrompts[0].id);
    const incomplete = await runWithWorkspace('deconstruct-test', () => persistFullPromptRecords({
      ...input, albumName: '残组单独导入', parsedResult: {},
      perImageResults: input.perImageResults.slice(0, 2), imageUrls: input.imageUrls.slice(0, 2),
    }));
    assert.equal(incomplete.fullPrompts.length, 0);
  } finally {
    await prisma.$disconnect();
    await unscopedPrisma.$disconnect();
  }
});
