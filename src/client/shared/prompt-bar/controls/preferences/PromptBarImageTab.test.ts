import { describe, expect, it } from 'vitest';
import { imageQualityLabel, promptRewriteStrengthLabel } from './PromptBarImageTab';

describe('image tier labels', () => {
  it('labels gpt quality and qwen prompt rewriting', () => {
    expect(imageQualityLabel('low')).toBe('Low');
    expect(imageQualityLabel('medium')).toBe('Medium');
    expect(imageQualityLabel('high')).toBe('High');
    expect(imageQualityLabel('')).toBe('High');
    expect(promptRewriteStrengthLabel('low')).toBe('不改写');
    expect(promptRewriteStrengthLabel('medium')).toBe('改写');
    expect(promptRewriteStrengthLabel('high')).toBe('改写+思考');
    expect(promptRewriteStrengthLabel('xhigh')).toBe('改写+思考');
    expect(promptRewriteStrengthLabel('max')).toBe('改写+思考');
  });
});
