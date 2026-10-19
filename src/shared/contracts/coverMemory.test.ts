import { describe, expect, it } from 'vitest';
import { CoverMemoryResponseSchema } from './coverMemory';

describe('cover memory contract', () => {
  it('accepts entries, samples and usage records', () => {
    const parsed = CoverMemoryResponseSchema.parse({
      success: true,
      entries: [{
        id: 'entry_1', branch: 'layout', rule: '标题压住商品上沿', evidence: '顶部两行',
        sampleId: 'sample_1', status: 'pending', source: 'sample', useCount: 0, createdAt: '2026-10-19T00:00:00Z',
      }],
      samples: [{
        id: 'sample_1', title: '样张', imageUrls: ['/storage/a.jpg'], model: 'gemini', status: 'completed', error: '', createdAt: '2026-10-19T00:00:00Z',
      }],
      usages: [{
        id: 'usage_1', batchId: 'batch', itemId: 'item', itemTitle: '台灯很好用',
        entryIds: ['entry_1'], design: { layout: '居中压顶' }, createdAt: '2026-10-19T00:00:00Z',
      }],
    });
    expect(parsed.entries[0]?.branch).toBe('layout');
    expect(parsed.usages[0]?.design.layout).toBe('居中压顶');
  });
});
