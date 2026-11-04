import { describe, expect, it } from 'vitest';
import { getVideoModelById, resolveVideoResolution } from './video';
import { isMetasoH3 } from './videoChannels';
import { videoDurationOptions, videoInputError, videoResolutionLabel } from './videoCapabilities';
import { buildVideoRequest } from '@shared/domain/models/model-adapters';

const model = 'MiniMax-H3';
const baseUrl = 'https://metaso.cn/api/minimax/v2';

describe('MiniMax H3 channel capabilities', () => {
  it.each(['https://metaso.cn', 'https://metaso.cn/api', baseUrl])('identifies the exact Metaso host from %s', (url) => {
    expect(isMetasoH3(model, url)).toBe(true);
    expect(getVideoModelById(model, url)?.supportedResolutions).toEqual(['480P', '768P', '1080P', '2K']);
  });

  it.each([undefined, 'invalid', 'https://api.minimax.cn', 'https://ai.comfly.org', 'https://metaso.cn.example.com', 'https://example.com/metaso.cn'])('does not widen other H3 routes for %s', (url) => {
    expect(isMetasoH3(model, url)).toBe(false);
    expect(videoDurationOptions(model, '1080P', 'omni', url).at(-1)).toBe(15);
    expect(videoInputError({ model, baseUrl: url, duration: 30, resolution: '1080P' })).toContain('时长');
    expect(getVideoModelById(model, url)?.supportedResolutions).toEqual(['720P', '1080P']);
  });

  it.each(['480P', '768P', '1080P', '2K'])('limits Metaso %s to four through fifteen seconds', (resolution) => {
    const allowed = Array.from({ length: 12 }, (_, index) => index + 4);
    expect(videoDurationOptions(model, resolution, 'omni', baseUrl)).toEqual(allowed);
    expect(videoInputError({ model, baseUrl, duration: 15, resolution, images: ['/person.jpg'], audios: ['/voice.wav'] })).toBeNull();
    for (const duration of [3, 16, 30, 15.5]) expect(videoInputError({ model, baseUrl, resolution, duration })).toContain('时长');
  });

  it('keeps Metaso 1080P separate from 2K and preserves legacy 720P as 768P', () => {
    expect(videoResolutionLabel(model, '1080P', baseUrl)).toBe('1080P');
    expect(videoResolutionLabel(model, '1080P', 'https://api.minimax.cn')).toBe('2K');
    expect(resolveVideoResolution('720P', getVideoModelById(model, baseUrl)?.supportedResolutions)).toBe('768P');
    expect(videoDurationOptions(model, '2K', 'omni', baseUrl).at(-1)).toBe(15);
    expect(videoInputError({ model, baseUrl, duration: 16, resolution: '2K' })).toContain('时长');
    expect(videoInputError({ model, baseUrl, duration: 15, resolution: '2K' })).toBeNull();
    expect(videoInputError({ model, baseUrl, duration: 15, resolution: '720P' })).toBeNull();
  });

  it('does not widen another model when routed through Metaso', () => {
    expect(isMetasoH3('veo3.1', baseUrl)).toBe(false);
    expect(videoDurationOptions('veo3.1', '720P', 'text', baseUrl)).toEqual([4, 6, 8]);
  });

  it.each(['https://metaso.cn', 'https://metaso.cn/api', 'https://metaso.cn/api/minimax', baseUrl])('builds native content and canonical channel endpoints for %s', (route) => {
    const request = buildVideoRequest({ model, baseUrl: route, prompt: '当前口播内容', resolution: '1080P', duration: 15,
      refMode: 'omni', images: ['/person.jpg'], videos: ['/action.mp4'], audios: ['/voice.wav'], audio: true });
    expect(request.payload).toEqual({ model, duration: 15, resolution: '1080P', ratio: '16:9', fast_mode: false, context_ir_enabled: true, content: [
      { type: 'text', text: '当前口播内容' },
      { type: 'image_url', image_url: { url: '/person.jpg' }, role: 'reference_image' },
      { type: 'video_url', video_url: { url: '/action.mp4' }, role: 'reference_video' },
      { type: 'audio_url', audio_url: { url: '/voice.wav' }, role: 'reference_audio' },
    ] });
    expect(request.endpoints(route)).toEqual({ submit: ['https://metaso.cn/api/minimax/v2/video_generation'],
      query: ['https://metaso.cn/api/minimax/v2/query/video_generation/{taskId}'] });
  });
});
