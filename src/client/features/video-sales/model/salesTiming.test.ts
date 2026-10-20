import { describe, expect, it } from 'vitest';
import { salesAspectError, salesShotTiming } from './salesTiming';

describe('sales shot timing', () => {
  it('keeps the requested cut when the model must generate a longer clip', () => {
    const timing = salesShotTiming('doubao-seedance-2.5', 3);
    expect(timing.modelDuration).toBeGreaterThanOrEqual(4);
    expect(timing.keepDuration).toBe(3);
    expect(timing.adjusted).toBe(true);
  });

  it('reports an unsupported aspect instead of changing it', () => {
    expect(salesAspectError('veo3.1', '3:4')).toMatch(/不支持/);
    expect(salesAspectError('veo3.1', '9:16')).toBeNull();
  });
});
