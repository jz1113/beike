import { expect, it } from 'vitest';
import { prisma } from '@beike/server-kit/prisma';
import { executeLibraryGet } from '../libraryQueries';
import { executeLibraryPost } from '../libraryMutations';
it('exports more than 1000 records and restores scene references to newly created IDs', async () => {
  const prefix = `backup-test-${Date.now()}`;
  await prisma.fullPromptAsset.createMany({ data: Array.from({ length: 1001 }, (_, i) => ({ title: `${prefix}-${i}`, reversePromptZh: '完整正文' })) });
  const response = await executeLibraryGet(new Request('http://localhost/library?type=all&export=1'));
  const data = await response.json();
  expect(data.complete).toBe(true);
  expect(data.fullPrompts.filter((row: { title: string }) => row.title.startsWith(prefix))).toHaveLength(1001);
  expect(data.counts.fullPrompts).toBe(data.fullPrompts.length);
  const restored = await executeLibraryPost(new Request('http://localhost/library', { method: 'POST', body: JSON.stringify({ action: 'bulk-import', items: [
    { assetType: 'action', data: { title: prefix, action: '动作', shotType: 'half_body', sceneId: 'old-scene' } },
    { assetType: 'scene', sourceId: 'old-scene', data: { title: prefix, description: '场景', lighting: '采光' } },
  ] }) }));
  expect(restored.ok).toBe(true);
  const scene = await prisma.sceneAsset.findFirstOrThrow({ where: { title: prefix } });
  const action = await prisma.actionAsset.findFirstOrThrow({ where: { title: prefix } });
  expect(action.sceneId).toBe(scene.id);
}, 30_000);
