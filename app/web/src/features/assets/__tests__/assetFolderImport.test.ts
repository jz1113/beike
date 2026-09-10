import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_IMAGES_PER_SET, MIN_IMAGES_PER_SET } from '@beike/domain/assetDeconstruct/prompts';

vi.mock('@/lib/image-utils', () => ({
  compressImageToDataUrl: vi.fn(async (file: File) => `data:image/jpeg;base64,${file.name}`),
}));

import { buildQueueItemsFromFiles } from '../assetFolderImport';

function makeImageFile(name: string, folder = 'test-folder'): File {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'webkitRelativePath', {
    value: `${folder}/${name}`,
    writable: false,
  });
  return file;
}

describe('buildQueueItemsFromFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes all images when count is between MIN and MAX', async () => {
    const files = Array.from({ length: 5 }, (_, i) => makeImageFile(`img${i + 1}.jpg`));
    const { queueItems, skipped, truncatedCount } = await buildQueueItemsFromFiles(files);
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0].images).toHaveLength(5);
    expect(skipped).toHaveLength(0);
    expect(truncatedCount).toBe(0);
  });

  it('truncates to MAX_IMAGES_PER_SET when folder has more images', async () => {
    const files = Array.from({ length: 12 }, (_, i) => makeImageFile(`img${String(i + 1).padStart(2, '0')}.jpg`));
    const { queueItems, skipped, truncatedCount } = await buildQueueItemsFromFiles(files);
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0].images).toHaveLength(MAX_IMAGES_PER_SET);
    expect(skipped).toHaveLength(0);
    expect(truncatedCount).toBe(1);
  });

  it('skips folder when fewer than MIN_IMAGES_PER_SET images', async () => {
    const files = Array.from({ length: MIN_IMAGES_PER_SET - 1 }, (_, i) => makeImageFile(`img${i + 1}.jpg`));
    const { queueItems, skipped } = await buildQueueItemsFromFiles(files);
    expect(queueItems).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain(String(MIN_IMAGES_PER_SET));
  });
});
