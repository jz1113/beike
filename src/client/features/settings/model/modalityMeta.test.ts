import { describe, expect, it } from 'vitest';
import { inferVendorFromModelId, vendorOption, isModelMatchModality } from './modalityMeta';

describe('modalityMeta vendor inference', () => {
  it('identifies vendors accurately even when requested from image modality', () => {
    const cases = [
      { id: 'claude-fable-5', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'claude-haiku-4-5-20250929', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'claude-opus-4-7', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'claude-opus-5', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'claude-sonnet-5', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'deepseek-v4-flash', expectedVendor: 'deepseek', expectedName: 'DeepSeek' },
      { id: 'deepseek-v4.1-flash', expectedVendor: 'deepseek', expectedName: 'DeepSeek' },
      { id: 'flux', expectedVendor: 'flux', expectedName: 'Flux' },
      { id: 'flux-pro-max', expectedVendor: 'flux', expectedName: 'Flux' },
      { id: 'kimi-k3', expectedVendor: 'moonshot', expectedName: 'Moonshot' },
      { id: 'MiniMax-H3', expectedVendor: 'minimax', expectedName: 'MiniMax' },
      { id: 'omni_flash-10s', expectedVendor: 'google', expectedName: 'Google' },
      { id: 'viduq3', expectedVendor: 'vidu', expectedName: 'Vidu' },
      { id: 'viduq3-mix', expectedVendor: 'vidu', expectedName: 'Vidu' },
      { id: 'viduq3-pro', expectedVendor: 'vidu', expectedName: 'Vidu' },
      { id: 'viduq3-turbo', expectedVendor: 'vidu', expectedName: 'Vidu' },
      { id: 'z-image-turbo', expectedVendor: 'qwen', expectedName: 'Qwen' },
      { id: 'sora-2', expectedVendor: 'openai', expectedName: 'OpenAI' },
      { id: 'sora-2-pro', expectedVendor: 'openai', expectedName: 'OpenAI' },
      { id: 'veo3.1', expectedVendor: 'google', expectedName: 'Google' },
      { id: 'veo3.1-fast', expectedVendor: 'google', expectedName: 'Google' },
    ];

    for (const item of cases) {
      const vendorId = inferVendorFromModelId(item.id, 'image');
      expect(vendorId).toBe(item.expectedVendor);
      const option = vendorOption('image', vendorId);
      expect(option?.name).toBe(item.expectedName);
    }
  });

  it('correctly matches image modality for flux and z-image', () => {
    expect(isModelMatchModality('flux', 'image')).toBe(true);
    expect(isModelMatchModality('flux-pro-max', 'image')).toBe(true);
    expect(isModelMatchModality('z-image-turbo', 'image')).toBe(true);
    expect(isModelMatchModality('claude-opus-5', 'image')).toBe(false);
  });
});
