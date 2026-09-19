import { describe, expect, it } from 'vitest';
import { getAspectRatioFromSize } from '@beike/domain/drawing';
import {
  GPT_IMAGE_GATEWAY_SAFE_SIZES,
  GPT_IMAGE_SUFFIX_2K_SIZES,
  clampGptImageOfficialPixelSize,
  resolveGptImageSizeForModel,
} from './gptImageSafeSizes';

const ASPECT_IDS = Object.keys(GPT_IMAGE_GATEWAY_SAFE_SIZES).filter((id) => id !== 'smart');

describe('GPT_IMAGE_GATEWAY_SAFE_SIZES aspect ratios', () => {
  for (const aspectId of ASPECT_IDS) {
    for (const tier of ['low', 'medium', 'high'] as const) {
      it(`${aspectId} ${tier} matches pixel aspect ratio`, () => {
        const size = GPT_IMAGE_GATEWAY_SAFE_SIZES[aspectId][tier];
        expect(getAspectRatioFromSize(size)).toBe(aspectId);
      });
    }
  }
});

describe('GPT_IMAGE_SUFFIX_2K_SIZES aspect ratios', () => {
  for (const aspectId of ASPECT_IDS) {
    it(`${aspectId} suffix-2k matches pixel aspect ratio`, () => {
      const size = GPT_IMAGE_SUFFIX_2K_SIZES[aspectId];
      expect(getAspectRatioFromSize(size)).toBe(aspectId);
    });
  }
});

describe('resolveGptImageSizeForModel', () => {
  it('3:4 + gpt-image-2-4k → 3072x4096', () => {
    expect(resolveGptImageSizeForModel('3:4', 'gpt-image-2-4k', 'high')).toBe('3072x4096');
  });

  it('9:16 + gpt-image-2-4k → 2160x3840', () => {
    expect(resolveGptImageSizeForModel('9:16', 'gpt-image-2-4k', 'high')).toBe('2160x3840');
  });

  it('2:3 + gpt-image-2-4k → 2160x3240', () => {
    expect(resolveGptImageSizeForModel('2:3', 'gpt-image-2-4k', 'high')).toBe('2160x3240');
  });

  it('3:4 + gpt-image-2-2k → 1152x2048', () => {
    expect(resolveGptImageSizeForModel('9:16', 'gpt-image-2-2k', 'high')).toBe('1152x2048');
  });
});

describe('clampGptImageOfficialPixelSize', () => {
  it('caps long edge at 3840 and keeps documented square size', () => {
    const [width, height] = clampGptImageOfficialPixelSize('4096x3072').split('x').map(Number);
    expect(width).toBeLessThanOrEqual(3840);
    expect(height).toBeLessThanOrEqual(3840);
    expect(width % 16).toBe(0);
    expect(height % 16).toBe(0);
    expect(width * height).toBeLessThanOrEqual(8_294_400);
    expect(clampGptImageOfficialPixelSize('1024x1024')).toBe('1024x1024');
  });
});
