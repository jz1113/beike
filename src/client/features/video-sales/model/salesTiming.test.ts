import { describe, expect, it } from 'vitest';
import { salesAspectConflict } from './salesWorkspace';

describe('sales video parameters', () => {
  it('reports an unsupported aspect instead of changing it', () => {
    expect(salesAspectConflict('veo3.1', '3:4')).toMatch(/不支持/);
    expect(salesAspectConflict('veo3.1', '9:16')).toBeNull();
  });
});
