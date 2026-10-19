import { describe, expect, it } from 'vitest';
import { imageCapabilities, isDashScopeBase, isNativeDashscopeImageModel } from './imageCapabilities';

describe('imageCapabilities', () => {
  it('limits qwen image models on DashScope to 2K and prompt rewriting', () => {
    const caps = imageCapabilities('qwen-image-3.0-pro', 'dashscope');
    expect(caps.resolutions).toEqual(['1K', '2K']);
    expect(caps.strength).toBe('prompt-extend');
    expect(caps.sendsQuality).toBe(false);
  });

  it('keeps gateway qwen models on the OpenAI quality scale', () => {
    const caps = imageCapabilities('qwen-image-max', 'openai', 'https://ai.comfly.org');
    expect(caps.resolutions).toEqual(['1K', '2K', '4K']);
    expect(caps.sendsQuality).toBe(true);
  });

  it('infers DashScope from the provider host', () => {
    expect(isDashScopeBase('https://maas.qianwenaiapi.com')).toBe(true);
    expect(isDashScopeBase('https://dashscope-intl.aliyuncs.com/api/v1')).toBe(true);
    expect(isDashScopeBase('https://evil-dashscope.example.com')).toBe(false);
    expect(imageCapabilities('qwen-image-3.0', 'openai', 'https://maas.qianwenaiapi.com').resolutions).toEqual(['1K', '2K']);
  });

  it('treats qwen and wan image models as native, except the gateway max model', () => {
    expect(isNativeDashscopeImageModel('qwen-image-3.0-pro')).toBe(true);
    expect(isNativeDashscopeImageModel('wan2.6-t2i')).toBe(true);
    expect(isNativeDashscopeImageModel('wan2.7-image-pro')).toBe(true);
    expect(isNativeDashscopeImageModel('qwen-image-max')).toBe(false);
    expect(isNativeDashscopeImageModel('gpt-image-2')).toBe(false);
  });

  it('hides resolution for grok and allows 4K only on wan2.7 pro', () => {
    expect(imageCapabilities('grok-4.1-image', 'openai').resolutions).toEqual([]);
    expect(imageCapabilities('grok-4.1-image', 'openai').strength).toBe('none');
    expect(imageCapabilities('wan2.7-image-pro', 'dashscope').resolutions).toEqual(['1K', '2K', '4K']);
    expect(imageCapabilities('wan2.7-image', 'dashscope').resolutions).toEqual(['1K', '2K']);
    expect(imageCapabilities('wan2.6-t2i', 'dashscope').resolutions).toEqual(['1K']);
  });
});
