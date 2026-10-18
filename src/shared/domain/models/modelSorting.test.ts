import { describe, expect, it } from 'vitest';
import {
  inferVendorId,
  sortModelsByVendor,
  getVendorDisplayName,
} from './modelSorting';

describe('modelSorting', () => {
  describe('inferVendorId', () => {
    it('accurately identifies vendors for approved and raw model ids', () => {
      expect(inferVendorId('gpt-5.6-luna')).toBe('openai');
      expect(inferVendorId('claude-opus-5')).toBe('anthropic');
      expect(inferVendorId('gemini-3.8-flash')).toBe('google');
      expect(inferVendorId('grok-4.6')).toBe('xai');
      expect(inferVendorId('deepseek-v4-flash')).toBe('deepseek');
      expect(inferVendorId('doubao-seedance-2.0-mini')).toBe('bytedance');
      expect(inferVendorId('qwen3.8-max')).toBe('alibaba');
      expect(inferVendorId('kling-video-v3')).toBe('kuaishou');
      expect(inferVendorId('vidu-video-2.0')).toBe('vidu');
    });

    it('returns human-friendly vendor display names', () => {
      expect(getVendorDisplayName('openai')).toBe('OpenAI');
      expect(getVendorDisplayName('anthropic')).toBe('Anthropic');
      expect(getVendorDisplayName('google')).toBe('Google');
      expect(getVendorDisplayName('xai')).toBe('xAI');
      expect(getVendorDisplayName('deepseek')).toBe('DeepSeek');
    });
  });

  describe('sortModelsByVendor', () => {
    it('places smart model at the very top', () => {
      const list = [
        { id: 'gemini-3.7-flash' },
        { id: 'smart-reasoning', isSmart: true },
        { id: 'gpt-5.6-luna' },
      ];
      const sorted = sortModelsByVendor(list);
      expect(sorted[0].id).toBe('smart-reasoning');
    });

    it('sorts mixed vendors according to vendor priority and model generation', () => {
      // 模拟用户截图中的乱序情况
      const input = [
        { id: 'gpt-5.6-luna' },
        { id: 'grok-4.6' },
        { id: 'gemini-3.7-flash' },
        { id: 'gemini-3.8-flash' },
        { id: 'claude-sonnet-5' },
        { id: 'deepseek-v4-flash' },
      ];

      const sorted = sortModelsByVendor(input);
      const sortedIds = sorted.map((m) => m.id);

      // 厂商预期顺序：OpenAI -> Anthropic -> Google -> xAI -> DeepSeek
      expect(sortedIds).toEqual([
        'gpt-5.6-luna',
        'claude-sonnet-5',
        'gemini-3.8-flash', // Google 内部 3.8 > 3.7
        'gemini-3.7-flash',
        'grok-4.6',
        'deepseek-v4-flash',
      ]);
    });

    it('orders models of the same vendor by generation score and tier', () => {
      const openaiModels = [
        { id: 'gpt-5.4-mini' },
        { id: 'gpt-6-luna' },
        { id: 'gpt-5.6-sol' },
        { id: 'gpt-5.6-luna' },
      ];

      const sorted = sortModelsByVendor(openaiModels);
      expect(sorted.map((m) => m.id)).toEqual([
        'gpt-6-luna',
        'gpt-5.6-sol',
        'gpt-5.6-luna',
        'gpt-5.4-mini',
      ]);
    });
  });
});
