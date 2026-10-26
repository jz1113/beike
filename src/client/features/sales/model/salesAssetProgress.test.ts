import { describe, expect, it } from 'vitest';
import type { SalesCreativeAsset } from '@shared/domain/sales';
import { salesAssetProgress, salesAssetRecovery } from './salesAssetProgress';

const asset: SalesCreativeAsset = { id: 'scene', kind: 'scene', label: '场景', prompt: '场景图', required: true };

describe('sales asset recovery and progress', () => {
  it('distinguishes queryable receipts from unknown submissions and explicit rejections', () => {
    expect(salesAssetRecovery({ ...asset, status: 'generating', taskId: 'task' })).toBe('query');
    expect(salesAssetRecovery({ ...asset, status: 'uncertain', submissionKey: 'key' })).toBe('query');
    expect(salesAssetRecovery({ ...asset, status: 'uncertain' })).toBe('verify');
    expect(salesAssetRecovery({ ...asset, status: 'uncertain', error: '参考图无法读取' })).toBeNull();
    expect(salesAssetRecovery({ ...asset, status: 'done', taskId: 'task', url: '/done.jpg' })).toBeNull();
  });
  it('counts completed required assets separately from optional and failed ones', () => {
    expect(salesAssetProgress([
      { ...asset, status: 'done', url: '/scene.jpg', validation: 'passed', validationSource: 'manual' },
      { ...asset, id: 'optional', required: false, status: 'failed' },
      { ...asset, id: 'pending', status: 'uncertain', submissionKey: 'key' },
    ])).toEqual({ total: 3, generated: 1, confirmed: 1, required: 2, requiredGenerated: 1, failed: 1, queryable: true, unresolved: false });
  });
});
