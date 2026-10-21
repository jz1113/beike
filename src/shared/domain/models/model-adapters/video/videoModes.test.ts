import { describe, expect, it } from 'vitest';
import { videoDurationOptions, videoInputError, videoModeIds } from '@shared/domain/media/videoCapabilities';
import { buildVideoRequest } from '@shared/domain/models/model-adapters';

const full = ['omni', 'first_frame', 'first_last_frame', 'text'];
const framed = ['first_frame', 'first_last_frame', 'text'];
const seedance = ['omni', 'first_frame', 'first_last_frame', 'text', 'edit', 'extend'];
const first = 'https://example.com/frame-a.png';
const last = 'https://example.com/frame-b.png';
const clip = 'https://example.com/clip.mp4';

describe('video generation modes follow official capabilities', () => {
  it.each([
    ['doubao-seedance-2.5', seedance],
    ['doubao-seedance-2-0-260128', seedance],
    ['doubao-seedance-2-0-fast-260128', seedance],
    ['doubao-seedance-2.0-mini', seedance],
    ['wan3.0-video', full],
    ['MiniMax-H3', full],
    ['kling-video-v3', framed],
    ['kling-video-v2-6', framed],
    ['kling-video-v2-5-turbo', framed],
    ['kling-video-v3-omni', full],
    ['viduq3', ['omni']],
    ['viduq3-mix', ['omni']],
    ['viduq3-turbo', full],
    ['viduq3-pro', full],
    ['viduq4-preview', full],
    ['vidu-q4-preview', full],
    ['viduq4', full],
    ['veo3.1', full],
    ['veo3.1-fast', full],
    ['omni_flash-10s', ['first_frame', 'text']],
    ['grok-imagine-video-1.5', [...full, 'edit', 'extend']],
    ['sora-2', ['first_frame', 'text']],
    ['sora-2-pro', ['first_frame', 'text']],
  ])('%s exposes %j', (model, modes) => {
    expect(videoModeIds(model)).toEqual(modes);
  });
});

describe('video payloads keep frame roles exclusive', () => {
  const base = { prompt: '海边行走', duration: 5, aspectRatio: '16:9', resolution: '720P' };

  it('keeps a single Seedance reference image out of the first-frame role', () => {
    const { payload } = buildVideoRequest({ ...base, model: 'doubao-seedance-2.0-mini', refMode: 'omni', images: [first] });
    const content = payload.content as Array<{ role?: string }>;
    expect(content.map(item => item.role).filter(Boolean)).toEqual(['reference_image']);
  });

  it('marks Seedance 2.0 edit and extend with the official task type', () => {
    const edited = buildVideoRequest({ ...base, model: 'doubao-seedance-2-0-260128', refMode: 'edit', videos: [clip], duration: -1 });
    expect(edited.payload.omni_reference_task_type).toBe('edit');
    const extended = buildVideoRequest({ ...base, model: 'doubao-seedance-2.0-mini', refMode: 'extend', videos: [clip] });
    expect(extended.payload.omni_reference_task_type).toBe('extend');
  });

  it('sends Wan first and last frames without reference media', () => {
    const { payload } = buildVideoRequest({ ...base, model: 'wan3.0-video', refMode: 'first_last_frame', images: [first, last] });
    const media = (payload.input as { media: Array<{ type: string }> }).media;
    expect(media.map(item => item.type)).toEqual(['first_frame', 'last_frame']);
    expect(() => buildVideoRequest({ ...base, model: 'wan3.0-video', refMode: 'first_last_frame', images: [first, last], videos: [clip] })).toThrow(/首尾帧/);
  });

  it('routes Kling frame modes and Omni references to different endpoints', () => {
    const framedRequest = buildVideoRequest({ ...base, model: 'kling-video-v3', refMode: 'first_last_frame', images: [first, last], duration: 5 });
    expect(framedRequest.endpoints('https://gateway.example').submit[0]).toContain('/image2video');
    expect(framedRequest.payload.image_tail).toBe(last);
    const omni = buildVideoRequest({ ...base, model: 'kling-video-v3-omni', refMode: 'omni', images: [first, last] });
    expect(omni.endpoints('https://gateway.example').submit[0]).toContain('/omni-video');
    expect(omni.payload.image).toBeUndefined();
    expect(omni.payload.image_list).toEqual([{ image_url: first }, { image_url: last }]);
    const omniFrames = buildVideoRequest({ ...base, model: 'kling-video-v3-omni', refMode: 'first_last_frame', images: [first, last] });
    expect(omniFrames.payload.image_list).toEqual([
      { image_url: first, type: 'first_frame' },
      { image_url: last, type: 'end_frame' },
    ]);
  });

  it('maps Vidu modes onto their official paths', () => {
    const paths = {
      text: 'text2video',
      first_frame: 'img2video',
      first_last_frame: 'start-end2video',
      omni: 'reference2video',
    } as const;
    for (const [refMode, path] of Object.entries(paths)) {
      const images = refMode === 'text' ? [] : refMode === 'first_frame' ? [first] : [first, last];
      const request = buildVideoRequest({ ...base, model: 'viduq3-pro', refMode, images, duration: 5 });
      expect(request.endpoints('https://gateway.example').submit[0]).toContain(`/${path}`);
      expect(request.payload.image).toBeUndefined();
      expect(request.payload.resolution).toBe('720p');
      if (refMode === 'first_frame') {
        expect(request.payload.images).toEqual([first]);
        expect(request.payload.aspect_ratio).toBeUndefined();
      }
      if (refMode === 'omni') {
        expect(request.payload.images).toEqual([first, last]);
        expect(request.payload.aspect_ratio).toBe('16:9');
      }
    }
  });

  it('does not turn MiniMax reference images or first-last frames into the other mode', () => {
    const reference = buildVideoRequest({ ...base, model: 'MiniMax-H3', refMode: 'omni', images: [first], videos: [clip], resolution: '1080P' });
    expect(reference.payload.mode).toBe('reference-to-video');
    expect(reference.payload.imageUrls).toEqual([first]);
    expect(reference.payload.image).toBeUndefined();
    expect(reference.payload.resolution).toBe('2k');
    const frames = buildVideoRequest({ ...base, model: 'MiniMax-H3', refMode: 'first_last_frame', images: [first, last] });
    expect(frames.payload.mode).toBe('first-last-frame');
    expect(frames.payload.imageUrls).toEqual([first, last]);
  });

  it('separates Veo reference images from pinned frames and locks those durations', () => {
    const reference = buildVideoRequest({ ...base, model: 'veo3.1', refMode: 'omni', images: [first, last], duration: 8 });
    expect(reference.payload.reference_images).toEqual([first, last]);
    expect(reference.payload.image).toBeUndefined();
    expect(reference.payload.first_frame_image).toBeUndefined();
    const frames = buildVideoRequest({ ...base, model: 'veo3.1-fast', refMode: 'first_last_frame', images: [first, last], duration: 8 });
    expect(frames.payload.first_frame_image).toBe(first);
    expect(frames.payload.last_frame_image).toBe(last);
    expect(frames.payload.reference_images).toBeUndefined();
    expect(videoDurationOptions('veo3.1', '720P', 'first_last_frame')).toEqual([8]);
    expect(videoDurationOptions('veo3.1', '720P', 'omni')).toEqual([8]);
    expect(videoInputError({ model: 'veo3.1', refMode: 'omni', images: [first, last, first, last], duration: 8, resolution: '720P', aspectRatio: '16:9' })).toMatch(/3 张/);
  });

  it('keeps Grok reference images and last frame on the official payload', () => {
    const reference = buildVideoRequest({ ...base, model: 'grok-imagine-video-1.5', refMode: 'omni', images: [first, last] });
    expect(reference.payload.reference_images).toEqual([{ url: first }, { url: last }]);
    expect(reference.payload.image).toBeUndefined();
    expect(reference.endpoints('https://gateway.example').submit[0]).toContain('/xai/v1/videos/generations');
    const frames = buildVideoRequest({ ...base, model: 'grok-imagine-video-1.5', refMode: 'first_last_frame', images: [first, last] });
    expect(frames.payload.image).toEqual({ url: first });
    expect(frames.payload.last_frame).toEqual({ url: last });
    expect(frames.payload.reference_images).toBeUndefined();
    const edited = buildVideoRequest({ ...base, model: 'grok-imagine-video-1.5', refMode: 'edit', videos: [clip], duration: 5 });
    expect(edited.payload).toEqual({ model: 'grok-imagine-video-1.5', prompt: '海边行走', video: { url: clip } });
    expect(edited.endpoints('https://gateway.example').submit[0]).toContain('/xai/v1/videos/edits');
    const extended = buildVideoRequest({ ...base, model: 'grok-imagine-video-1.5', refMode: 'extend', videos: [clip], duration: 6 });
    expect(extended.payload.video).toEqual({ url: clip });
    expect(extended.payload.duration).toBe(6);
    expect(extended.endpoints('https://gateway.example').submit[0]).toContain('/xai/v1/videos/extensions');
  });

  it('rejects combinations the selected model does not implement', () => {
    expect(videoInputError({ model: 'sora-2', refMode: 'omni', images: [first, last], duration: 10, resolution: '720P', aspectRatio: '16:9' })).toMatch(/尚未接入/);
    expect(videoInputError({ model: 'omni_flash-10s', refMode: 'first_last_frame', images: [first, last], duration: 10, resolution: '720P', aspectRatio: '16:9' })).toMatch(/尚未接入/);
    expect(videoInputError({ model: 'grok-imagine-video-1.5', refMode: 'omni', images: Array.from({ length: 15 }, () => first), duration: 5, resolution: '720P', aspectRatio: '16:9' })).toMatch(/14 张/);
    expect(videoInputError({ model: 'MiniMax-H3', refMode: 'omni', images: [first], videos: [clip, clip, clip, clip], duration: 5, resolution: '720P', aspectRatio: '16:9' })).toMatch(/3 个参考视频/);
  });
});
