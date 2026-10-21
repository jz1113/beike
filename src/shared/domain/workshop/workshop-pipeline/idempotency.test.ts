import { expect, it } from 'vitest';
import { buildImageTaskKey } from './idempotency';

it('distinguishes source samples and the order of product identity references', () => {
  const input = { batchId: 'batch', productId: 'sku', storyboardRevision: 1, shotNo: 1,
    prompt: '桌面俯拍', selectedImageUrls: ['front', 'back'], model: 'image', aspectRatio: '3:4', quality: 'high', compositionReferenceUrls: ['sampleA'] };
  const original = buildImageTaskKey(input);
  expect(buildImageTaskKey({ ...input, compositionReferenceUrls: ['sampleB'] })).not.toBe(original);
  expect(buildImageTaskKey({ ...input, selectedImageUrls: ['back', 'front'] })).not.toBe(original);
  expect(buildImageTaskKey({ ...input })).toBe(original);
});
