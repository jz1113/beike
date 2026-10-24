import { describe, expect, it } from 'vitest';
import { imageCapabilities, isDashScopeBase, isNativeDashscopeImageModel } from './imageCapabilities';

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
