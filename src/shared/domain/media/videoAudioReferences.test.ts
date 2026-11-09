import { describe, expect, it } from 'vitest';
import { imageCapabilities, isDashScopeBase, isNativeDashscopeImageModel } from './imageCapabilities';
import { normalizeImageUrlToStandardJpg } from './imageUrls';
import { collectedProductImageIdentity, normalizeCollectedProductImage, parseCollectedProductImage } from './productImageUrls';
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

const jd = 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/product.jpg';

describe('collected product image URLs', () => {
  it.each([
    ['//img14.360buyimg.com/n0/s60x60_jfs/t1/product.jpg!q70', jd],
    ['jfs/t1/product.jpg', jd],
    ['https://img13.360buyimg.com/n1/jfs/t1/product.jpg.dpg.webp', jd],
    ['https://img.alicdn.com/imgextra/a.jpg_60x60.jpg_.webp', 'https://img.alicdn.com/imgextra/a.jpg'],
    ['https://img.alicdn.com/imgextra/a.png_300x300.jpg', 'https://img.alicdn.com/imgextra/a.png'],
    ['https://cdn.example.com/native.webp', 'https://cdn.example.com/native.webp'],
    ['https://img10.360buyimg.com/jfs/t1/native.webp', 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/native.webp'],
    ['https://img.pddpic.com/native.webp', 'https://img.pddpic.com/native.webp'],
    ['https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/product.jpg', 'https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/product.jpg'],
    ['https://img.alicdn.com/a.jpg_80x80q90.jpg?sign=x', ''],
    ['https://img.alicdn.com/a.jpg_80x80.unrecognized', ''],
    ['https://img.alicdn.com/a.jpg_80x80q90.jpg', 'https://img.alicdn.com/a.jpg'],
    ['https://cdn.example.com/a-80x80.jpg', ''],
    ['https://example.com/s60x60/a.jpg', ''],
    ['https://example.com/a.jpg?width=60&height=60', ''],
    ['https://item.jd.com/1234567.html', ''],
    ['https://example.com/video.mp4', ''],
    ['https://example.com/blank.gif', ''],
    ['javascript:alert(1)', ''],
  ])('normalizes %s safely', (source, expected) => {
    expect(normalizeCollectedProductImage(source)).toBe(expected);
  });

  it('keeps every byte of signed addresses', () => {
    const source = 'https://img14.360buyimg.com/n1/jfs/t1/product.jpg?sign=a%2fb+Z&expires=9#keep';
    expect(normalizeCollectedProductImage(source)).toBe(source);
    expect(collectedProductImageIdentity(source)).toBe(collectedProductImageIdentity(jd));
    expect(normalizeCollectedProductImage('https://img14.360buyimg.com/n1/s60x60_jfs/t1/product.jpg?sign=x')).toBe('');
  });

  it.each([
    ['https://img14.360buyimg.com/n5/jfs/t1/a.webp?sign=x', true],
    ['https://img12.360buyimg.com/n0/s1200x1200_jfs/t1/a.webp?sign=x', false],
    ['https://cdn.example.com/a.jpg?imageView2/1/w/80/h/80&sign=x', true],
    ['https://cdn.example.com/a.jpg?x-oss-process=image/resize,w_80,h_80&Signature=x', true],
    ['https://cdn.example.com/a.jpg?w=80&sign=x', true],
  ])('matches Go thumbnail classification for %s', (source, small) => {
    expect(parseCollectedProductImage(source)).toMatchObject({ url: source, small });
  });

  it('preserves empty trailing queries', () => {
    const source = 'https://img14.360buyimg.com/n0/jfs/t1/a.webp?';
    expect(normalizeCollectedProductImage(source)).toBe(source);
  });

  it('does not merge unknown CDN query variants', () => {
    expect(collectedProductImageIdentity('https://cdn.example.com/a.jpg?variant=1'))
      .not.toBe(collectedProductImageIdentity('https://cdn.example.com/a.jpg?variant=2'));
  });

  it('preserves high-resolution and signed URLs during downstream rendering', () => {
    for (const source of [
      'https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/product.jpg',
      'https://img14.360buyimg.com/n0/jfs/t1/a.webp?',
      'https://img.alicdn.com/a.jpg_unknown.webp',
    ]) expect(normalizeImageUrlToStandardJpg(source)).toBe(source);
  });

  it('does not change native formats during downstream rendering', () => {
    for (const source of ['https://img10.360buyimg.com/jfs/t1/a.webp', 'https://img.alicdn.com/a.webp', 'https://img.pddpic.com/a.webp']) {
      expect(normalizeImageUrlToStandardJpg(source)).toMatch(/\.webp$/);
    }
  });
});

describe('imageCapabilities', () => {
  it('limits qwen image models on DashScope to 2K and prompt rewriting', () => {
    const caps = imageCapabilities('qwen-image-3.0-pro', 'dashscope');
    expect(caps.resolutions).toEqual(['1K', '2K']);
    expect(caps.strength).toBe('prompt-extend');
    expect(caps.sendsQuality).toBe(false);
  });

  it('keeps gateway qwen models free of a quality tier', () => {
    const caps = imageCapabilities('qwen-image-max', 'openai', 'https://ai.comfly.org');
    expect(caps.resolutions).toEqual(['1K', '2K', '4K']);
    expect(caps.strength).toBe('none');
    expect(caps.sendsQuality).toBe(false);
    expect(imageCapabilities('qwen-image', 'openai').strength).toBe('none');
    expect(imageCapabilities('flux-pro-max', 'openai').strength).toBe('none');
    expect(imageCapabilities('nano-banana-pro', 'openai').strength).toBe('none');
  });

  it('infers DashScope from the provider host', () => {
    expect(isDashScopeBase('https://maas.qianwenaiapi.com')).toBe(true);
    expect(isDashScopeBase('https://dashscope-intl.aliyuncs.com/api/v1')).toBe(true);
    expect(isDashScopeBase('https://evil-dashscope.example.com')).toBe(false);
    expect(imageCapabilities('qwen-image-3.0', 'openai', 'https://maas.qianwenaiapi.com').resolutions).toEqual(['1K', '2K']);
  });

  it('treats versioned qwen and wan image models as native', () => {
    expect(isNativeDashscopeImageModel('qwen-image-3.0-pro')).toBe(true);
    expect(isNativeDashscopeImageModel('qwen-image-2.0-pro')).toBe(true);
    expect(isNativeDashscopeImageModel('qwen-image-2.1-turbo')).toBe(true);
    expect(isNativeDashscopeImageModel('wan2.6-t2i')).toBe(true);
    expect(isNativeDashscopeImageModel('wan2.7-image-pro')).toBe(true);
    expect(isNativeDashscopeImageModel('qwen-image')).toBe(false);
    expect(isNativeDashscopeImageModel('qwen-image-edit')).toBe(false);
    expect(isNativeDashscopeImageModel('qwen-image-max')).toBe(false);
    expect(isNativeDashscopeImageModel('gpt-image-2')).toBe(false);
  });

  it('gives a quality tier only to gpt-image, exposes xhigh/max on 2.5, and locks suffix models', () => {
    expect(imageCapabilities('gpt-image-2', 'openai')).toMatchObject({
      resolutions: ['1K', '2K', '4K'], strength: 'quality', sendsQuality: true,
      qualities: ['low', 'medium', 'high'], maxReferenceImages: 16,
    });
    expect(imageCapabilities('gpt-image-2.5-flare', 'openai')).toMatchObject({
      resolutions: ['1K', '2K', '4K'], strength: 'quality', sendsQuality: true,
      qualities: ['low', 'medium', 'high', 'xhigh', 'max'], maxReferenceImages: 16,
    });
    expect(imageCapabilities('gemini-3.1-flash-lite-image', 'openai')).toMatchObject({
      resolutions: ['1K'], strength: 'none', sendsQuality: false, maxReferenceImages: 14,
    });
    expect(imageCapabilities('gemini-2.5-flash-image', 'openai')).toMatchObject({
      resolutions: ['1K'], strength: 'none', sendsQuality: false, maxReferenceImages: 3,
    });
    expect(imageCapabilities('openai/gpt-image-2', 'openai').strength).toBe('quality');
    expect(imageCapabilities('gpt-image-2-2k', 'openai')).toMatchObject({ resolutions: ['2K'], strength: 'none', sendsQuality: false });
    expect(imageCapabilities('gpt-image-2-4k', 'openai')).toMatchObject({ resolutions: ['4K'], strength: 'none', sendsQuality: false });
    expect(imageCapabilities('seedream-v5-pro', 'openai')).toMatchObject({ resolutions: ['1K', '2K'], strength: 'none', sendsQuality: false });
    expect(imageCapabilities('doubao-seedream-4-5-251128', 'openai').strength).toBe('none');
  });

  it('hides resolution for grok and allows 4K only on wan2.7 pro', () => {
    expect(imageCapabilities('grok-4.1-image', 'openai').resolutions).toEqual([]);
    expect(imageCapabilities('grok-4.1-image', 'openai').strength).toBe('none');
    expect(imageCapabilities('wan2.7-image-pro', 'dashscope').resolutions).toEqual(['1K', '2K', '4K']);
    expect(imageCapabilities('wan2.7-image', 'dashscope').resolutions).toEqual(['1K', '2K']);
    expect(imageCapabilities('wan2.6-t2i', 'dashscope').resolutions).toEqual(['1K']);
  });

  it('configures Gemini Nano Banana resolutions, aspect ratios, and 14-image reference limit', () => {
    const nb21 = imageCapabilities('gemini-nano-banana-2.1', 'openai');
    expect(nb21.resolutions).toEqual(['1K', '2K', '4K']);
    expect(nb21.aspectRatios).toContain('1:4');
    expect(nb21.aspectRatios).toContain('8:1');
    expect(nb21.maxReferenceImages).toBe(14);

    const pro = imageCapabilities('nano-banana-pro', 'openai');
    expect(pro.resolutions).toEqual(['1K', '2K', '4K']);
    expect(pro.aspectRatios).not.toContain('1:4');
    expect(pro.maxReferenceImages).toBe(14);

    expect(imageCapabilities('gemini-3.1-flash-lite-image', 'openai').resolutions).toEqual(['1K']);
    expect(imageCapabilities('gemini-2.5-flash-image', 'openai').resolutions).toEqual(['1K']);
    expect(imageCapabilities('nano-banana', 'openai').resolutions).toEqual(['1K']);
  });
});
