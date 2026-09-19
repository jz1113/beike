import { describe, expect, it } from 'vitest';
import { buildImageRequest, buildVideoRequest, resolveImageAdapter, resolveVideoAdapter } from '../index';
import {
  APPROVED_MODELS,
  filterApprovedModels,
  isApprovedModel,
  listApprovedModels,
} from '../../modelCatalog';

describe('approved model catalog', () => {
  it('covers image, video and multimodal without duplicate ids', () => {
    const ids = APPROVED_MODELS.map((m) => m.id.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(listApprovedModels('image').length).toBeGreaterThanOrEqual(19);
    expect(listApprovedModels('video').length).toBeGreaterThanOrEqual(19);
    expect(listApprovedModels('multimodal').length).toBeGreaterThanOrEqual(16);
  });

  it('canonicalizes prefixed gateway ids', () => {
    expect(isApprovedModel('openai/gpt-image-2', 'image')).toBe(true);
    expect(filterApprovedModels([{ id: 'openai/gpt-image-2' }, { id: 'dall-e-3' }])).toEqual([
      { id: 'gpt-image-2' },
    ]);
    expect(filterApprovedModels([{ id: 'mjv8.2' }, { id: 'qwen-image-3' }])).toEqual([
      { id: 'midjourney' },
      { id: 'qwen-image-max' },
    ]);
  });
});

describe('approved adapter snapshots', () => {
  const base = 'https://gateway.example/v1';

  it('gpt-image-2.5-flare uses dalle generations', () => {
    const result = buildImageRequest({ model: 'gpt-image-2.5-flare', prompt: 'cat', size: '1024x1024', quality: 'high' });
    expect(result.family).toBe('openai-dalle');
    expect(result.payload).toMatchObject({ model: 'gpt-image-2.5-flare', prompt: expect.any(String), size: '1024x1024' });
    expect(result.endpoints(base).submit[0]).toContain('/v1/images/generations');
  });

  it('midjourney uses imagine channel', () => {
    const result = buildImageRequest({ model: 'midjourney', prompt: 'cat' });
    expect(resolveImageAdapter('midjourney').id).toBe('midjourney');
    expect(result.endpoints(base).submit[0]).toContain('/mj/submit/imagine');
  });

  it('kling omni and vidu q3 use documented routes', () => {
    const kling = buildVideoRequest({ model: 'kling-video-v3-omni', prompt: 'cat', images: ['https://example.com/a.jpg'] });
    expect(kling.endpoints(base).submit[0]).toBe('https://gateway.example/kling/v1/videos/omni-video');
    const vidu = buildVideoRequest({ model: 'viduq3', prompt: 'cat' });
    expect(resolveVideoAdapter('viduq3').id).toBe('vidu');
    expect(vidu.endpoints(base).submit[0]).toContain('/vidu/v2/text2video');
  });

  it('seedance and wan3 keep official payload families', () => {
    expect(buildVideoRequest({ model: 'doubao-seedance-2.5', prompt: 'cat' }).family).toBe('seedance');
    expect(buildVideoRequest({ model: 'wan3.0-video', prompt: 'cat' }).family).toBe('wan');
    expect(buildVideoRequest({ model: 'omni_flash-10s', prompt: 'cat' }).family).toBe('veo');
  });
});
