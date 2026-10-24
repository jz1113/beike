import { describe, expect, it } from 'vitest';
import { workshopOutputSettings } from './workshopOutputSettings';

describe('workshopOutputSettings', () => {
  it('shows the actual normalized pixel size for each quality tier', () => {
    const result = workshopOutputSettings('gpt-image-2', '3:4', 'high');
    expect(result.fixedQuality).toBe(false);
    expect(result.choices.map(choice => choice.size)).toEqual(['960x1280', '1536x2048', '2480x3312']);
    expect(result.size).toBe('2480x3312');
  });

  it('locks quality for dedicated image routes', () => {
    const result = workshopOutputSettings('gpt-image-2-4k', '3:4', 'low');
    expect(result.fixedQuality).toBe(true);
    expect(result.size).toBe('2480x3312');
  });
});
