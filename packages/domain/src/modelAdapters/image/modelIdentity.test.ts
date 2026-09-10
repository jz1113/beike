import { describe, expect, it } from 'vitest';
import { buildImageRequest, buildVideoRequest } from '../../modelAdapters';
import { formatDisplayModel } from '../../drawing';
import { normalizeOpenAiImageRequest, sanitizeGptImageModelId } from './normalizeOpenAiImageModel';

describe('selected image model identity', () => {
  it.each(['gpt-image-2.5-flare', 'gpt-image-1', 'gpt-image-1.5', 'gpt-image-2.5-flare-4k', 'grok-imagine-image', 'grok-4.2-image', 'nano-banana-2-2k', 'seedream-v5-pro'])('preserves %s through adapter payload', model => {
    const request = buildImageRequest({ model, prompt: '测试图片', size: '3:4', quality: 'high', plainMode: true });
    expect(request.modelId).toBe(model);
    expect(request.payload.model).toBe(model);
    expect(formatDisplayModel(model)).not.toBe('GPT Image 2');
  });
  it('only rewrites explicit legacy aliases', () => {
    expect(sanitizeGptImageModelId('GPT Image 2 (4K超清)')).toBe('gpt-image-2-4k');
    expect(sanitizeGptImageModelId('gpt-image-2-4k-2k')).toBe('gpt-image-2-4k');
    expect(sanitizeGptImageModelId(' GPT Image 2.5 Flare ')).toBe('GPT Image 2.5 Flare');
  });
  it('keeps selected version for edits and uses documented polling path', () => {
    const request = buildImageRequest({ model: 'gpt-image-2.5-flare', prompt: '编辑', size: '3:4', quality: 'high', primaryImage: 'https://example.com/a.jpg', plainMode: true });
    expect(request.payload.model).toBe('gpt-image-2.5-flare');
    expect(request.endpoints('https://gateway.test').submit[0]).toBe('https://gateway.test/v1/images/edits?async=true');
    expect(request.endpoints('https://gateway.test').query[0]).toBe('https://gateway.test/v1/images/tasks/{taskId}');
  });
  it('GPT Image 2 4K portrait meets documented pixel-area and edge limits', () => {
    const request = normalizeOpenAiImageRequest('gpt-image-2', '2880x3840', 'high');
    const [w, h] = request.size.split('x').map(Number);
    expect(request.modelId).toBe('gpt-image-2');
    expect(w * h).toBeLessThanOrEqual(8_294_400);
    expect(Math.max(w,h)).toBeLessThanOrEqual(3840);
    expect(w % 16).toBe(0); expect(h % 16).toBe(0);
  });
});

it.each(['veo3-fast', 'veo3.1-pro', 'veo2-fast-components', 'sora-2-pro', 'wan2.5-i2v-preview', 'grok-imagine-video-1.5', 'doubao-seedance-1-0-lite-t2v-250428'])('preserves video variant %s', model => {
  const request = buildVideoRequest({ model, prompt: 'test' });
  expect(request.modelId).toBe(model);
  expect(request.payload.model).toBe(model);
  expect(formatDisplayModel(model, true)).toBe(model);
});
it('Nano Banana Pro uses documented image array and image_size, preserving model tier', () => {
  const request = buildImageRequest({ model: 'nano-banana-2-2k', prompt: 'test', size: '3:4', quality: 'high', images: ['https://example.com/1.jpg', 'https://example.com/2.jpg'] });
  expect(request.payload).toMatchObject({ model: 'nano-banana-2-2k', image_size: '2K', aspect_ratio: '3:4', image: ['https://example.com/1.jpg', 'https://example.com/2.jpg'] });
  expect(request.payload).not.toHaveProperty('quality');
});

describe.each(['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'])('%s gateway pixel validation', model => {
  it.each(['3:4', '2880x3840', '3840x2880', '3072x3072', '512x512'])('validates final adapter payload for %s without replacing the model', size => {
    const normalized = normalizeOpenAiImageRequest(model, size, 'high');
    // Same two-stage path as the API route: normalizer, then adapter.
    const request = buildImageRequest({ model, prompt: 'test', size: normalized.size, quality: 'high', plainMode: true });
    const [w, h] = String(request.payload.size).split('x').map(Number);
    expect(request.payload.model).toBe(model);
    expect(w * h).toBeGreaterThanOrEqual(655_360);
    expect(w * h).toBeLessThanOrEqual(8_294_400);
    expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
    expect(w % 16).toBe(0); expect(h % 16).toBe(0);
    if (size === '3:4' || size === '2880x3840') expect(w / h).toBeCloseTo(3 / 4, 2);
  });
});
