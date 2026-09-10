import { expect, it } from 'vitest';
import { buildImageRequest } from '../../modelAdapters';
import { isKnownImageOnlyModel } from '../../workflowModels';
it.each(['qwen-image-edit', 'qwen-image-edit-2509'])('%s requires image input and uses only the edits endpoint', model => {
  expect(isKnownImageOnlyModel(model)).toBe(true);
  expect(() => buildImageRequest({ model, prompt: 'edit' })).toThrow('参考图');
  const request = buildImageRequest({ model, prompt: 'edit', images: ['https://example.com/1.jpg'], quality: 'high', size: '4K' });
  expect(request.useEdits).toBe(true);
  expect(request.payload).toEqual({ model, prompt: 'edit', image: ['https://example.com/1.jpg'] });
  expect(request.endpoints('https://gateway.test/v1/').submit).toEqual(['https://gateway.test/v1/images/edits']);
});
it('rejects multiple refs on base model and preserves them on 2509', () => {
  const input = { model: 'qwen-image-edit', prompt: 'edit', images: ['https://example.com/1.jpg', 'https://example.com/2.jpg'] };
  expect(() => buildImageRequest(input)).toThrow('仅支持一张');
  expect(buildImageRequest({ ...input, model: 'qwen-image-edit-2509' }).payload.image).toEqual(input.images);
});
it('Seedream V5 Pro sends only documented fields and an image array', () => {
  const request = buildImageRequest({ model: 'seedream-v5-pro', prompt: 'test', size: '3:4', quality: 'high', images: ['https://example.com/1.jpg'] });
  expect(request.payload).toEqual({ model: 'seedream-v5-pro', prompt: 'test', size: '1536x2048', response_format: 'url', image: ['https://example.com/1.jpg'] });
});
it('Seedream V5 Pro rejects unsupported explicit 4K instead of claiming a different resolution', () => {
  expect(() => buildImageRequest({ model: 'seedream-v5-pro', prompt: 'test', size: '2880x3840' })).toThrow('2K');
});
