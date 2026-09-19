import { describe, expect, it } from 'vitest';
import { buildVideoRequest } from '../../index';
import { getVideoDurationBounds } from '../../../video';

const base = 'https://gateway.example/v1';
describe('documented video gateway protocols', () => {
  it.each(['wan3.0-video'])('%s exposes and submits 30 seconds', model => {
    expect(getVideoDurationBounds(model).max).toBe(30);
    expect(buildVideoRequest({ model, prompt: 'cat', duration: 30 }).payload.parameters).toMatchObject({ duration: 30 });
  });
  it('Grok preserves 15 seconds and uses object image with official endpoint', () => {
    const result = buildVideoRequest({ model: 'grok-imagine-video-1.5', prompt: 'cat', duration: 15, images: ['https://example.com/a.jpg'] });
    expect(result.payload).toMatchObject({ duration: 15, image: { url: 'https://example.com/a.jpg' } });
    expect(result.payload).not.toHaveProperty('images');
    expect(result.endpoints(base)).toEqual({ submit: ['https://gateway.example/xai/v1/videos/generations'], query: ['https://gateway.example/xai/v1/videos/{taskId}'] });
  });
  it('H3 uses seconds and documented gateway model spelling', () => {
    const result = buildVideoRequest({ model: 'MiniMax-H3', prompt: 'cat', duration: 15 });
    expect(result.payload).toMatchObject({ model: 'MiniMax-H3', prompt: 'cat', seconds: 15, size: '1280x720' });
    expect(result.endpoints(base).submit[0]).toBe('https://gateway.example/v1/videos');
  });
  it('Veo does not send unsupported duration or resolution fields', () => {
    const result = buildVideoRequest({ model: 'veo3.1', prompt: 'cat', duration: 15, resolution: '1080P' });
    expect(getVideoDurationBounds('veo3.1').max).toBe(8);
    expect(result.payload).toMatchObject({ enable_upsample: true });
    expect(result.payload).not.toHaveProperty('duration');
  });
  it('Wan2 text uses size rather than Wan3 media schema', () => {
    const result = buildVideoRequest({ model: 'wan2.6-t2v', prompt: 'cat', duration: 15, resolution: '720P' });
    expect(result.payload.parameters).toMatchObject({ size: '1280*720', duration: 15 });
    expect(result.payload.input).toEqual({ prompt: 'cat' });
  });
  it('T2V-01 is MiniMax, not Kling', () => {
    const result = buildVideoRequest({ model: 'T2V-01', prompt: 'cat', duration: 6 });
    expect(result.family).toBe('minimax');
    expect(result.endpoints(base).submit[0]).toBe('https://gateway.example/minimax/v1/video_generation');
  });
  it('does not change a gateway-specific Grok alias into another model', () => {
    const result = buildVideoRequest({ model: 'grok-1.5-video-15s', prompt: 'cat', duration: 15 });
    expect(result.payload.model).toBe('grok-1.5-video-15s');
    expect(result.payload.duration).toBe(15);
  });
  it('Sora Pro sends the documented string duration', () => {
    expect(buildVideoRequest({ model: 'sora-2-pro', prompt: 'cat', duration: 25 }).payload.duration).toBe('25');
  });
  it.each([
    ['kling-v1-6', '/kling/v1/videos/text2video', '/kling/v1/videos/text2video/{taskId}'],
    ['luma-dream-machine-v2', '/luma/generations', '/luma/generations/{taskId}'],
    ['vidu-v2', '/vidu/v2/text2video', '/vidu/v2/tasks/{taskId}/creations'],
  ])('%s uses its documented provider routes', (model, submit, query) => {
    const result = buildVideoRequest({ model, prompt: 'cat' });
    expect(result.endpoints(base).submit[0]).toBe(`https://gateway.example${submit}`);
    expect(result.endpoints(base).query[0]).toBe(`https://gateway.example${query}`);
  });
  it('Runway requires a first frame and uses promptImage', () => {
    expect(() => buildVideoRequest({ model: 'runway-gen3-alpha-turbo', prompt: 'cat' })).toThrow('首帧');
    const result = buildVideoRequest({ model: 'runway-gen3-alpha-turbo', prompt: 'cat', images: ['https://example.com/a.jpg'], duration: 10 });
    expect(result.payload).toMatchObject({ model: 'gen3a_turbo', promptImage: 'https://example.com/a.jpg', duration: 10 });
  });
  it('rejects unsupported Hailuo 1080P / 10-second combination', () => {
    expect(() => buildVideoRequest({ model: 'MiniMax-Hailuo-2.3', prompt: 'cat', resolution: '1080P', duration: 10 })).toThrow('6 秒');
  });

  it('H3 supports multi-image reference without throwing', () => {
    const result = buildVideoRequest({
      model: 'MiniMax-H3',
      prompt: 'cat running',
      duration: 10,
      images: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
    });
    expect(result.payload.mode).toBe('multimodal-to-video');
    expect(result.payload.imageUrls).toEqual(['https://example.com/1.jpg', 'https://example.com/2.jpg']);
  });

  it('kling-video-v3 and omni route to dedicated kling endpoints with multi-image support', () => {
    const r1 = buildVideoRequest({ model: 'kling-video-v3', prompt: 'cat' });
    expect(r1.endpoints(base).submit[0]).toBe('https://gateway.example/kling/v1/videos/text2video');

    const r2 = buildVideoRequest({
      model: 'kling-video-v3-omni',
      prompt: 'cat',
      images: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
    });
    expect(r2.payload.model_name).toBe('kling-video-v3-omni');
    expect(r2.endpoints(base).submit[0]).toBe('https://gateway.example/kling/v1/videos/omni-video');
    expect(r2.payload.image_list).toHaveLength(3);
  });

  it('veo3.1-fast builds request', () => {
    const result = buildVideoRequest({ model: 'veo3.1-fast', prompt: 'cinematic drone view' });
    expect(result.modelId).toBe('veo3.1-fast');
    expect(result.family).toBe('veo');
    expect(result.endpoints(base).submit[0]).toBe('https://gateway.example/v2/videos/generations');
  });

  it('grok-video-3 uses unified video endpoints and sets aspect_ratio', () => {
    const result = buildVideoRequest({ model: 'grok-video-3', prompt: 'a space rocket launching', aspectRatio: '9:16' });
    expect(result.modelId).toBe('grok-video-3');
    expect(result.payload.aspect_ratio).toBe('9:16');
    expect(result.endpoints(base).submit[0]).toBe('https://gateway.example/v2/videos/generations');
  });

  it('wan automatically adapts t2v to i2v or r2v when images are provided', () => {
    const rSingle = buildVideoRequest({
      model: 'wan2.6-t2v',
      prompt: 'scenic mountains',
      images: ['https://example.com/mountain.jpg'],
    });
    expect(rSingle.payload.model).toBe('wan2.6-i2v');
    expect(rSingle.payload.first_frame).toBe('https://example.com/mountain.jpg');

    const rDouble = buildVideoRequest({
      model: 'wan2.6-t2v',
      prompt: 'sunset transition',
      images: ['https://example.com/day.jpg', 'https://example.com/night.jpg'],
      refMode: 'first_last_frame',
    });
    expect(rDouble.payload.model).toBe('wan2.6-r2v');
    expect(rDouble.payload.last_frame).toBe('https://example.com/night.jpg');
  });

  it('kling correctly routes multi-image vs first-last-frame', () => {
    const rMulti = buildVideoRequest({
      model: 'kling-video-v3',
      prompt: 'character dancing',
      images: ['https://example.com/ref1.jpg', 'https://example.com/ref2.jpg'],
    });
    expect(rMulti.endpoints(base).submit[0]).toBe('https://gateway.example/kling/v1/videos/multi-image2video');

    const rTail = buildVideoRequest({
      model: 'kling-video-v3',
      prompt: 'morphing scene',
      firstFrame: 'https://example.com/start.jpg',
      lastFrame: 'https://example.com/end.jpg',
    });
    expect(rTail.endpoints(base).submit[0]).toBe('https://gateway.example/kling/v1/videos/image2video');
    expect(rTail.payload.image).toBe('https://example.com/start.jpg');
    expect(rTail.payload.image_tail).toBe('https://example.com/end.jpg');
  });

  it('preserves 15s generation duration for models officially supporting 15s', () => {
    const rSeedanceMini = buildVideoRequest({
      model: 'doubao-seedance-2.0-mini',
      prompt: 'delicious burger scene, 15 seconds',
      duration: 15,
    });
    expect(rSeedanceMini.payload.duration).toBe(15);

    const rSeedance25 = buildVideoRequest({
      model: 'doubao-seedance-2.5',
      prompt: 'cinematic drone view, 15 seconds',
      duration: 15,
    });
    expect(rSeedance25.payload.duration).toBe(15);

    const rWan = buildVideoRequest({
      model: 'wan2.6-t2v',
      prompt: 'traditional landscape, 15 seconds',
      duration: 15,
    });
    expect(rWan.payload.duration).toBe(15);

    const rH3 = buildVideoRequest({
      model: 'MiniMax-H3',
      prompt: 'city night, 15 seconds',
      duration: 15,
    });
    expect(rH3.payload.seconds).toBe(15);
  });
});
