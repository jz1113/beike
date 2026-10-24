import { describe, expect, it } from 'vitest';
import { buildImageRequest } from '@shared/domain/models/model-adapters';
import {
  GEMINI_EXTENDED_ASPECT_RATIOS,
  GEMINI_STANDARD_ASPECT_RATIOS,
  geminiSupportedAspectRatios,
  geminiSupportedResolutions,
  resolveGeminiAspectRatio,
  resolveGeminiImageSizeTier,
  resolveGeminiPixelSize,
} from './geminiImageSizes';

describe('geminiImageSizes & geminiImageAdapter', () => {
  it('supports all 14 official aspect ratios on gemini-nano-banana-2.1 and gemini-3.1-flash-image', () => {
    expect(geminiSupportedAspectRatios('gemini-nano-banana-2.1')).toEqual(GEMINI_EXTENDED_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('gemini-3.1-flash-image')).toEqual(GEMINI_EXTENDED_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('nano-banana-2')).toEqual(GEMINI_EXTENDED_ASPECT_RATIOS);
    for (const ratio of GEMINI_EXTENDED_ASPECT_RATIOS) {
      expect(resolveGeminiAspectRatio('gemini-nano-banana-2.1', ratio)).toBe(ratio);
    }
  });

  it('restricts Pro, Lite, and 2.5 Flash to the 10 standard aspect ratios and maps extreme ratios', () => {
    expect(geminiSupportedAspectRatios('gemini-3-pro-image')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('nano-banana-pro')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('gemini-3.1-flash-lite-image')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('gemini-2.5-flash-image')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS);
    expect(resolveGeminiAspectRatio('nano-banana-pro', '1:8')).toBe('9:16');
    expect(resolveGeminiAspectRatio('nano-banana-pro', '8:1')).toBe('21:9');
  });

  it('omits aspectRatio for auto/default/smart and resolves exact official pixel sizes', () => {
    expect(resolveGeminiAspectRatio('gemini-nano-banana-2.1', 'auto')).toBeUndefined();
    expect(resolveGeminiAspectRatio('gemini-nano-banana-2.1', 'smart')).toBeUndefined();
    expect(resolveGeminiAspectRatio('gemini-nano-banana-2.1', 'default')).toBeUndefined();

    expect(resolveGeminiPixelSize('3:4', 'gemini-nano-banana-2.1', 'low')).toBe('896x1200');
    expect(resolveGeminiPixelSize('3:4', 'gemini-nano-banana-2.1', 'medium')).toBe('1792x2400');
    expect(resolveGeminiPixelSize('3:4', 'gemini-nano-banana-2.1', 'high')).toBe('3584x4800');
    expect(resolveGeminiPixelSize('1:4', 'gemini-nano-banana-2.1', 'high')).toBe('2048x8192');
    expect(resolveGeminiPixelSize('8:1', 'gemini-nano-banana-2.1', 'medium')).toBe('6144x768');
    expect(resolveGeminiPixelSize('3:4', 'nano-banana', 'high')).toBe('864x1184');
  });

  it('enforces uppercase K for image_size and respects Lite / 2.5 Flash resolution limits', () => {
    expect(geminiSupportedResolutions('gemini-nano-banana-2.1')).toEqual(['1K', '2K', '4K']);
    expect(geminiSupportedResolutions('gemini-3.1-flash-lite-image')).toEqual(['1K']);
    expect(geminiSupportedResolutions('gemini-2.5-flash-image')).toEqual(['1K']);
    expect(resolveGeminiImageSizeTier('gemini-nano-banana-2.1', '1k')).toBe('1K');
    expect(resolveGeminiImageSizeTier('gemini-nano-banana-2.1', 'high')).toBe('4K');
    expect(resolveGeminiImageSizeTier('gemini-3.1-flash-lite-image', 'high')).toBe('1K');
    expect(resolveGeminiImageSizeTier('nano-banana', 'high')).toBeUndefined();
    expect(resolveGeminiImageSizeTier('nano-banana-pro', 'high')).toBe('4K');
  });

  it('builds OpenAI-compatible gemini-nano payload without size/n/quality and rejects >14 references', () => {
    const built = buildImageRequest({
      model: 'gemini-nano-banana-2.1',
      prompt: '中式美食海报',
      size: '1152x1536',
      quality: 'high',
      plainMode: true,
    });
    expect(built.family).toBe('gemini-nano');
    expect(built.payload).toMatchObject({
      model: 'gemini-nano-banana-2.1',
      aspect_ratio: '3:4',
      aspectRatio: '3:4',
      image_size: '4K',
      imageSize: '4K',
      response_format: 'url',
    });
    expect(built.payload.size).toBeUndefined();
    expect(built.payload.quality).toBeUndefined();

    const autoBuilt = buildImageRequest({
      model: 'gemini-nano-banana-2.1',
      prompt: '自适应构图',
      size: 'auto',
      quality: 'medium',
      plainMode: true,
    });
    expect(autoBuilt.payload.aspect_ratio).toBeUndefined();
    expect(autoBuilt.payload.image_size).toBe('2K');

    expect(() =>
      buildImageRequest({
        model: 'gemini-nano-banana-2.1',
        prompt: '多图合成',
        images: Array.from({ length: 15 }, (_, i) => `https://example.com/${i}.png`),
      }),
    ).toThrow('14');
  });
});
