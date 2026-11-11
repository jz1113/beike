import { describe, expect, it } from 'vitest';
import { listApprovedModels } from '@shared/domain/models/modelCatalog';
import { defaultVideoResolution, getVideoModelById, resolveVideoResolution } from './video';
import { isMetasoH3 } from './videoChannels';
import {
  videoDurationOptions,
  videoInputError,
  videoModeIds,
  videoRatioLocked,
  videoResolutionLabel,
  videoResolutionOptions,
} from '@shared/domain/media/videoCapabilities';

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
    ['kling-video-v3-omni', [...full, 'edit', 'extend']],
    ['viduq3', ['omni']],
    ['viduq3-mix', ['omni']],
    ['viduq3-turbo', full],
    ['viduq3-pro', framed],
    ['viduq4-preview', ['omni', 'first_frame']],
    ['vidu-q4-preview', ['omni', 'first_frame']],
    ['viduq4', ['omni', 'first_frame']],
    ['veo3.1', [...full, 'extend']],
    ['veo3.1-fast', [...full, 'extend']],
    ['omni_flash-10s', seedance],
    ['gemini-omni-1.1-flash', seedance],
    ['grok-imagine-video-1.5', [...full, 'edit', 'extend']],
    ['sora-2', ['first_frame', 'text']],
    ['sora-2-pro', ['first_frame', 'text']],
  ])('%s exposes %j', (model, modes) => {
    expect(videoModeIds(model)).toEqual(modes);
  });
});

describe('video input validation', () => {
  it('rejects combinations the selected model does not implement', () => {
    expect(videoInputError({ model: 'sora-2', refMode: 'omni', images: [first, last], duration: 10, resolution: '720P', aspectRatio: '16:9' })).toMatch(/尚未接入/);
    expect(videoInputError({ model: 'omni_flash-10s', refMode: 'omni', images: Array.from({ length: 8 }, () => first), duration: 10, resolution: '720P', aspectRatio: '16:9' })).toMatch(/7 项/);
    expect(videoInputError({ model: 'omni_flash-10s', refMode: 'text', duration: 10, resolution: '720P', aspectRatio: '1:1' })).toMatch(/比例/);
    expect(videoInputError({ model: 'grok-imagine-video-1.5', refMode: 'omni', images: Array.from({ length: 15 }, () => first), duration: 5, resolution: '720P', aspectRatio: '16:9' })).toMatch(/14 张/);
    expect(videoInputError({ model: 'MiniMax-H3', refMode: 'omni', images: [first], videos: [clip, clip, clip, clip], duration: 5, resolution: '720P', aspectRatio: '16:9' })).toMatch(/3 个参考视频/);
    expect(videoInputError({ model: 'viduq3-pro', refMode: 'omni', images: [first, last], duration: 5, resolution: '720P', aspectRatio: '16:9' })).toMatch(/尚未接入/);
    expect(videoInputError({ model: 'viduq3-turbo', refMode: 'omni', images: Array.from({ length: 8 }, () => first), duration: 5, resolution: '720P', aspectRatio: '16:9' })).toMatch(/7 张/);
    expect(videoInputError({ model: 'viduq4-preview', refMode: 'text', duration: 5, resolution: '720P', aspectRatio: '16:9' })).toMatch(/尚未接入/);
  });
});

const h3Model = 'MiniMax-H3';
const metasoUrl = 'https://metaso.cn/api/minimax/v2';

describe('MiniMax H3 channel capabilities', () => {
  it.each(['https://metaso.cn', 'https://metaso.cn/api', metasoUrl])('identifies the exact Metaso host from %s', (url) => {
    expect(isMetasoH3(h3Model, url)).toBe(true);
    expect(getVideoModelById(h3Model, url)?.supportedResolutions).toEqual(['480P', '768P', '1080P', '2K']);
  });

  it.each([undefined, 'invalid', 'https://api.minimax.cn', 'https://ai.comfly.org', 'https://metaso.cn.example.com', 'https://example.com/metaso.cn'])('does not widen other H3 routes for %s', (url) => {
    expect(isMetasoH3(h3Model, url)).toBe(false);
    expect(videoDurationOptions(h3Model, '1080P', 'omni', url).at(-1)).toBe(15);
    expect(videoInputError({ model: h3Model, baseUrl: url, duration: 30, resolution: '1080P' })).toContain('时长');
    expect(getVideoModelById(h3Model, url)?.supportedResolutions).toEqual(['720P', '1080P']);
  });

  it.each(['480P', '768P', '1080P', '2K'])('limits Metaso %s to four through fifteen seconds', (resolution) => {
    const allowed = Array.from({ length: 12 }, (_, index) => index + 4);
    expect(videoDurationOptions(h3Model, resolution, 'omni', metasoUrl)).toEqual(allowed);
    expect(videoInputError({ model: h3Model, baseUrl: metasoUrl, duration: 15, resolution, images: ['/person.jpg'], audios: ['/voice.wav'] })).toBeNull();
    for (const duration of [3, 16, 30, 15.5]) expect(videoInputError({ model: h3Model, baseUrl: metasoUrl, resolution, duration })).toContain('时长');
  });

  it('keeps Metaso 1080P separate from 2K and preserves legacy 720P as 768P', () => {
    expect(videoResolutionLabel(h3Model, '1080P', metasoUrl)).toBe('1080P');
    expect(videoResolutionLabel(h3Model, '1080P', 'https://api.minimax.cn')).toBe('2K');
    expect(resolveVideoResolution('720P', getVideoModelById(h3Model, metasoUrl)?.supportedResolutions)).toBe('768P');
    expect(videoDurationOptions(h3Model, '2K', 'omni', metasoUrl).at(-1)).toBe(15);
    expect(videoInputError({ model: h3Model, baseUrl: metasoUrl, duration: 16, resolution: '2K' })).toContain('时长');
    expect(videoInputError({ model: h3Model, baseUrl: metasoUrl, duration: 15, resolution: '2K' })).toBeNull();
    expect(videoInputError({ model: h3Model, baseUrl: metasoUrl, duration: 15, resolution: '720P' })).toBeNull();
  });

  it('does not widen another model when routed through Metaso', () => {
    expect(isMetasoH3('veo3.1', metasoUrl)).toBe(false);
    expect(videoDurationOptions('veo3.1', '720P', 'text', metasoUrl)).toEqual([4, 6, 8]);
  });
});

const comflyUrl = 'https://ai.comfly.org';
for (const profile of listApprovedModels('video')) for (const mode of videoModeIds(profile.id, comflyUrl)) {
  it(`${profile.id} / ${mode} validates its selected channel input`, () => {
    const baseUrl = profile.adapter === 'fal-omni' ? 'https://queue.fal.run'
      : profile.id.startsWith('kling-4.0') ? 'https://api-singapore.klingai.com' : comflyUrl;
    const images = mode === 'text' || mode === 'extend' || mode === 'edit' ? [] : mode === 'first_last_frame' ? [first, last] : [first];
    const videos = ['edit', 'extend', 'motion_control'].includes(mode) ? [clip] : [];
    const resolution = videoResolutionOptions(profile.id, mode, baseUrl)?.[0] || '720P';
    const duration = videoDurationOptions(profile.id, resolution, mode, baseUrl)[0];
    const aspectRatio = videoRatioLocked(profile.id, mode, baseUrl) ? 'adaptive' : '16:9';
    const input = { model: profile.id, baseUrl, refMode: mode, prompt: '人物向前走', images, videos, resolution, duration, aspectRatio };
    expect(videoInputError(input)).toBeNull();
  });
}
it('shows the adaptive ratio actually submitted for Comfly H3 frame generation', () => {
  expect(videoRatioLocked('MiniMax-H3', 'first_frame', comflyUrl)).toBe(true);
  expect(videoInputError({ model: 'MiniMax-H3', baseUrl: comflyUrl, refMode: 'first_frame', images: [first], resolution: '768P', duration: 5, aspectRatio: 'adaptive' })).toBeNull();
});
it('does not send Grok 1.5 into the legacy-only Comfly edit and extension endpoints', () => {
  expect(videoModeIds('grok-imagine-video-1.5', comflyUrl)).not.toContain('extend');
  expect(videoModeIds('grok-imagine-video-1.5', comflyUrl)).not.toContain('edit');
  for (const refMode of ['edit', 'extend']) expect(videoInputError({ model: 'grok-imagine-video-1.5', baseUrl: comflyUrl, refMode, videos: [clip], duration: 6, resolution: '720P', aspectRatio: '16:9' })).toBeTruthy();
});

const coverageBase = { duration: 10, resolution: '720P', aspectRatio: '16:9' };
it('exposes Omni Flash frame and extension modes', () => {
  expect(videoModeIds('omni_flash-10s')).toEqual(['omni', 'first_frame', 'first_last_frame', 'text', 'edit', 'extend']);
});
it('limits Kling Omni to one reference video', () => {
  expect(videoModeIds('kling-video-v3-omni')).toContain('edit');
  expect(videoInputError({ ...coverageBase, model: 'kling-video-v3-omni', refMode: 'omni', videos: [clip, clip] })).toMatch(/1/);
});
it('offers only generation modes accepted by the official Grok 1.5 route', () => {
  expect(videoModeIds('grok-imagine-video-1.5', 'https://api.x.ai/v1')).toEqual(['omni', 'first_frame', 'first_last_frame', 'text']);
});
it('allows an H3 end frame only on native routes', () => {
  for (const baseUrl of ['https://api.minimax.cn', 'https://metaso.cn/api']) {
    expect(videoModeIds('MiniMax-H3', baseUrl)).toContain('last_frame');
    expect(videoInputError({ ...coverageBase, model: 'MiniMax-H3', baseUrl, refMode: 'last_frame', images: [first], aspectRatio: 'adaptive' })).toBeNull();
  }
  expect(videoModeIds('MiniMax-H3', 'https://gateway.example')).not.toContain('last_frame');
});
it('offers official Kling motion control only on supported routes', () => {
  const baseUrl = 'https://api-singapore.klingai.com/v1';
  for (const model of ['kling-video-v3', 'kling-video-v2-6']) {
    expect(videoModeIds(model, baseUrl)).toContain('motion_control');
    expect(videoModeIds(model, 'https://gateway.example')).not.toContain('motion_control');
  }
  expect(videoModeIds('kling-video-v3', baseUrl)).not.toContain('last_frame');
});

describe('default video resolution', () => {
  it('uses 480P when the model supports it', () => {
    expect(defaultVideoResolution(['480P', '720P', '1080P'])).toBe('480P');
    expect(defaultVideoResolution(getVideoModelById('doubao-seedance-2.0-mini')?.supportedResolutions)).toBe('480P');
    expect(defaultVideoResolution(getVideoModelById('wan3.0-video')?.supportedResolutions)).toBe('480P');
  });

  it('drops 480P and uses 720P when that is the lowest supported tier', () => {
    expect(defaultVideoResolution(['720P', '1080P', '4K'])).toBe('720P');
    expect(resolveVideoResolution('480P', ['720P', '1080P'])).toBe('720P');
    expect(defaultVideoResolution(getVideoModelById('kling-video-v3')?.supportedResolutions)).toBe('720P');
    expect(defaultVideoResolution(getVideoModelById('veo3.1')?.supportedResolutions)).toBe('720P');
    expect(defaultVideoResolution(getVideoModelById('MiniMax-H3')?.supportedResolutions)).toBe('720P');
  });

  it('uses the lowest listed tier when neither 480P nor 720P exists', () => {
    expect(defaultVideoResolution(['4K', '1080P'])).toBe('1080P');
    expect(resolveVideoResolution('480P', ['1080P', '4K'])).toBe('1080P');
  });

  it('keeps a selected tier the model still supports', () => {
    expect(resolveVideoResolution('1080P', ['480P', '720P', '1080P'])).toBe('1080P');
    expect(resolveVideoResolution('4K', ['720P', '1080P', '4K'])).toBe('4K');
    expect(resolveVideoResolution('4K', ['480P', '720P'])).toBe('480P');
  });
});

const vertex = 'https://us-central1-aiplatform.googleapis.com/v1/projects/project-a/locations/us-central1/publishers/google';
const veoBase = { model: 'veo3.1', prompt: '人物继续向前走', refMode: 'extend', videos: [clip], aspectRatio: '16:9', resolution: '720P' };

it('offers real extension tasks and distinguishes native seven-second extension from gateway continuation', () => {
  expect(videoModeIds('veo3.1')).toContain('extend');
  expect(videoDurationOptions('veo3.1', '720P', 'extend', vertex)).toEqual([7]);
  expect(videoDurationOptions('veo3.1', '720P', 'extend', comflyUrl)).toEqual([8]);
  expect(videoInputError({ ...veoBase, baseUrl: vertex, duration: 7 })).toBeNull();
  expect(videoInputError({ ...veoBase, baseUrl: vertex, duration: 7, images: ['https://cdn.example/image.png'] })).toMatch(/一段视频/);
});
