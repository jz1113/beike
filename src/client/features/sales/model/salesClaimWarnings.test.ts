import { describe, expect, it } from 'vitest';
import { salesUnverifiedClaims } from './salesClaimWarnings';

describe('supplied evidence for experiential narration', () => {
  it('flags effects that cannot be inferred from fabric and ribbing', () => {
    expect(salesUnverifiedClaims('初秋单穿不闷，袖口不往上滑', '棉56%，领口与袖口罗纹')).toEqual(['不闷', '不往上滑']);
  });
  it('accepts explicitly supplied performance and plain visible features', () => {
    expect(salesUnverifiedClaims('防水面料，胸前小刺绣', '产品资料：防水')).toEqual([]);
  });
});
