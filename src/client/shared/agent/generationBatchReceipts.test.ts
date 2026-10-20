import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readGenerationBatchReceipts, reserveGenerationBatch, type GenerationBatchReceipt } from './generationBatchReceipts';

const KEY = 'beike_agent_generation_receipts_v1';
const receipt = (overrides: Partial<GenerationBatchReceipt> = {}): GenerationBatchReceipt => ({
  sourceId: 'assistant:session:reply:hash', batchId: 'batch-1', sessionId: 'generation-session',
  taskIds: ['task-1'], entryIds: ['entry-1'], createdAt: 1, ...overrides,
});
let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('generation receipt journal', () => {
  it('starts empty and persists exact task-to-entry linkage across module reloads', async () => {
    expect(readGenerationBatchReceipts('source')).toEqual([]);
    const original = receipt();
    reserveGenerationBatch(original);
    expect(readGenerationBatchReceipts(original.sourceId)).toEqual([original]);
    vi.resetModules();
    const reloaded = await import('./generationBatchReceipts');
    expect(reloaded.readGenerationBatchReceipts(original.sourceId)).toEqual([original]);
    expect(() => reloaded.reserveGenerationBatch(original)).toThrow('已经提交');
  });

  it('appends only disjoint entries and keeps identical entry IDs in other sources independent', () => {
    const first = receipt();
    const second = receipt({ batchId: 'batch-2', taskIds: ['task-2'], entryIds: ['entry-2'] });
    reserveGenerationBatch(first); reserveGenerationBatch(second);
    reserveGenerationBatch(receipt({ sourceId: 'another-session-source' }));
    expect(readGenerationBatchReceipts(first.sourceId)).toEqual([first, second]);
    expect(readGenerationBatchReceipts('another-session-source')).toHaveLength(1);
    const before = values.get(KEY);
    expect(() => reserveGenerationBatch(receipt({ taskIds: ['task-3', 'task-4'], entryIds: ['entry-3', 'entry-2'] }))).toThrow('已经提交');
    expect(values.get(KEY)).toBe(before);
  });

  it.each(['{', 'null', '[]', '17', '"text"', JSON.stringify({ source: {} }),
    JSON.stringify({ source: [{ ...receipt(), taskIds: ['task-1', 'task-2'] }] }),
    JSON.stringify({ source: [{ ...receipt(), entryIds: [7] }] }),
    JSON.stringify({ source: [{ ...receipt(), taskIds: [null] }] }),
    JSON.stringify({ source: [{ ...receipt(), sessionId: null }] }),
  ])('fails closed for a corrupted journal: %s', raw => {
    values.set(KEY, raw);
    expect(() => readGenerationBatchReceipts(receipt().sourceId)).toThrow();
    expect(() => reserveGenerationBatch(receipt())).toThrow();
    expect(values.get(KEY)).toBe(raw);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('does not discard corrupt receipts for a different source', () => {
    values.set(KEY, JSON.stringify({ unrelated: [{ taskIds: [] }] }));
    expect(() => readGenerationBatchReceipts('fresh-source')).toThrow('损坏');
    expect(() => reserveGenerationBatch(receipt({ sourceId: 'fresh-source' }))).toThrow('损坏');
  });

  it('surfaces storage read denial rather than treating the journal as empty', () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error('SecurityError'); });
    expect(() => readGenerationBatchReceipts(receipt().sourceId)).toThrow('SecurityError');
    expect(() => reserveGenerationBatch(receipt())).toThrow('SecurityError');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejects quota denial while preserving the previously committed receipts', () => {
    const first = receipt(); reserveGenerationBatch(first);
    const before = values.get(KEY);
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => reserveGenerationBatch(receipt({ taskIds: ['task-2'], entryIds: ['entry-2'] }))).toThrow('已阻止提交');
    expect(values.get(KEY)).toBe(before);
    expect(readGenerationBatchReceipts(first.sourceId)).toEqual([first]);
  });
});
