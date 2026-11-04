import { describe, expect, it } from 'vitest';
import { getVideoModelById } from './video';
import { referenceAudioAllowed, videoInputError, videoResolutionOptions } from './videoCapabilities';

describe('video reference audio capabilities', () => {
  it('rejects unsupported official Grok routes without removing compatible relay modes', () => {
    const input = { model: 'grok-imagine-video-1.5', refMode: 'edit', videos: ['/clip.mp4'] };
    expect(videoInputError({ ...input, baseUrl: 'https://api.x.ai/v1' })).toContain('官方接口暂不支持编辑或延长');
    expect(videoInputError({ ...input, refMode: 'extend', baseUrl: 'https://eu-west-1.api.x.ai/v1' })).toContain('grok-imagine-video');
    expect(videoInputError({ ...input, baseUrl: 'https://us.api.x.ai/v1' })).toContain('美国区域端点');
    expect(videoInputError({ ...input, refMode: 'text', videos: [], baseUrl: 'https://us.api.x.ai/v1' })).toContain('美国区域端点');
    expect(videoInputError({ ...input, baseUrl: 'https://api.x.ai.example.com/v1' })).toBeNull();
    expect(videoInputError({ ...input, baseUrl: 'https://relay.example.com/v1' })).toBeNull();
  });
  it('accepts Grok 1.5 presets separately from partner-only audio files', () => {
    const input = { model: 'grok-imagine-video-1.5', refMode: 'omni', images: ['/product.jpg'], voiceIds: ['eve'], resolution: '720P', audio: true };
    expect(videoInputError(input)).toBeNull();
    expect(referenceAudioAllowed(input.model)).toBe(false);
    expect(videoInputError({ ...input, voiceIds: [], audios: ['/sample.mp3'] })).toContain('xAI 合作伙伴权限');
    expect(videoInputError({ ...input, audios: ['/sample.mp3'] })).toContain('不能与音频文件混用');
    expect(videoInputError({ ...input, audio: false })).toContain('开启生成声音');
    expect(videoInputError({ ...input, refMode: 'edit' })).toContain('编辑与延长');
    expect(videoInputError({ ...input, model: 'veo3.1' })).toContain('不支持 Grok 官方预置音色');
    expect(videoInputError({ ...input, voiceIds: ['eve', 'ara', 'leo', 'rex'] })).toContain('3 个');
    expect(videoInputError({ ...input, resolution: '1080P' })).toContain('720P');
    expect(videoResolutionOptions(input.model, 'omni')).toEqual(['480P', '720P']);
    expect(videoResolutionOptions(input.model, 'first_last_frame')).toEqual(['480P', '720P']);
    expect(videoResolutionOptions(input.model, 'text')).toContain('1080P');
  });
  it.each(['viduq4-preview', 'vidu-q4-preview', 'viduq4'])('exposes an audio switch for %s', (model) => {
    expect(getVideoModelById(model)?.audioSupport).toBe('controllable');
  });

  it.each(['doubao-seedance-2.5', 'doubao-seedance-2-5-260628', 'doubao-seedance-2.0-mini', 'doubao-seedance-2-0-fast-260128', 'wan3.0-video', 'viduq4-preview', 'vidu-q4-preview', 'viduq4', 'MiniMax-H3', 'h3', 'provider/MiniMax-H3'])(
    'accepts %s only with an audible omni request', (model) => {
      expect(referenceAudioAllowed(model)).toBe(true);
      expect(videoInputError({ model, refMode: 'omni', images: ['/person.jpg'], audios: ['/voice.mp3'], audio: true })).toBeNull();
      expect(videoInputError({ model, refMode: 'first_frame', images: ['/person.jpg'], audios: ['/voice.mp3'], audio: true })).toContain('全能参考');
      expect(videoInputError({ model, refMode: 'omni', images: ['/person.jpg'], audios: ['/voice.mp3'], audio: false })).toContain('开启生成声音');
    },
  );

  it.each(['doubao-seedance-1-0-pro-250528', 'veo3.1', 'kling-video-v3', 'wan3.1-video', 'wan3.5-video', 'unknown-video'])(
    'rejects unsupported %s before its reference audio could be dropped', (model) => {
      expect(referenceAudioAllowed(model)).toBe(false);
      expect(videoInputError({ model, refMode: 'omni', images: ['/person.jpg'], audios: ['/voice.mp3'] })).toContain('尚未接入参考音频');
    },
  );

  it.each([
    ['doubao-seedance-2.5', 10], ['doubao-seedance-2.0-mini', 3], ['wan3.0-video', 5],
    ['viduq4-preview', 3], ['vidu-q4-preview', 3], ['viduq4', 3],
    ['MiniMax-H3', 3], ['h3', 3],
  ] as const)('checks %s audio count without truncation', (model, count) => {
    const audios = Array.from({ length: count }, (_, index) => `/voice-${index}.mp3`);
    expect(videoInputError({ model, images: ['/person.jpg'], audios })).toBeNull();
    expect(videoInputError({ model, images: ['/person.jpg'], audios: [...audios, '/extra.mp3'] })).toContain(`${count} 个参考音频`);
  });

  it('requires accompanying visual media for 2.0, while 2.5 and Wan accept audio-only reference', () => {
    expect(videoInputError({ model: 'doubao-seedance-2.0-mini', audios: ['/voice.mp3'] })).toContain('至少搭配');
    expect(videoInputError({ model: 'doubao-seedance-2.5', audios: ['/voice.mp3'] })).toBeNull();
    expect(videoInputError({ model: 'wan3.0-video', audios: ['/voice.mp3'] })).toBeNull();
    expect(videoInputError({ model: 'MiniMax-H3', audios: ['/voice.mp3'] })).toBeNull();
  });

  it.each(['viduq4-preview', 'vidu-q4-preview', 'viduq4'])('requires reference images for %s even when audio is present', (model) => {
    expect(videoInputError({ model, audios: ['/voice.mp3'] })).toContain('需要参考图片');
    expect(videoInputError({ model, images: ['/person.jpg'], videos: ['/action.mp4'], audios: ['/voice.mp3'] })).toContain('参考视频尚未接入');
    expect(videoInputError({ model, images: Array.from({ length: 15 }, () => '/image.jpg'), audios: ['/one.mp3', '/two.mp3', '/three.mp3'] })).toBeNull();
    expect(videoInputError({ model, images: Array.from({ length: 16 }, () => '/image.jpg'), audios: ['/voice.mp3'] })).toContain('15 张参考图片');
  });

  it.each([
    ['doubao-seedance-2.0-mini', 9, 2, 1, 12],
    ['doubao-seedance-2.5', 30, 10, 10, 50],
  ] as const)('counts audio in %s combined material limits', (model, imageCount, videoCount, audioCount, total) => {
    const input = { model, images: Array.from({ length: imageCount }, () => '/image.jpg'),
      videos: Array.from({ length: videoCount }, () => '/depth.mp4'), audios: Array.from({ length: audioCount }, () => '/voice.wav') };
    expect(videoInputError(input)).toBeNull();
    expect(videoInputError({ ...input, videos: [...input.videos, '/extra.mp4'] })).toContain(`合计最多 ${total} 个素材`);
  });

  it('retains existing sound-disabled calls when no audio reference is supplied', () => {
    expect(videoInputError({ model: 'veo3.1', refMode: 'first_frame', images: ['/person.jpg'], audio: false })).toBeNull();
  });

  it.each(['MiniMax-H3', 'h3', 'provider/MiniMax-H3'])('validates %s mixed video and voice references together', (model) => {
    const input = { model, images: ['/person.jpg'], videos: ['/action.mp4'], audios: ['/voice.wav'] };
    expect(videoInputError(input)).toBeNull();
    expect(videoInputError({ ...input, images: Array.from({ length: 10 }, () => '/extra.jpg') })).toContain('9 张参考图');
    expect(videoInputError({ ...input, videos: Array.from({ length: 4 }, () => '/extra.mp4') })).toContain('3 个参考视频');
  });
});
