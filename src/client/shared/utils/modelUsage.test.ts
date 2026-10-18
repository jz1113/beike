import { afterEach, describe, expect, it, vi } from 'vitest';
import { readReportedUsage, recordMediaTaskUsage } from './modelUsage';
import { clearUsageLogs, getUsageLogs, getUsageSummary } from './usageTracker';

function installStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, dispatchEvent: () => true });
}

describe('reported model usage', () => {
  afterEach(() => {
    clearUsageLogs();
    vi.unstubAllGlobals();
  });

  it('reads prompt and image token names', () => {
    expect(readReportedUsage({ prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 })).toEqual({
      promptTokens: 3, completionTokens: 4, totalTokens: 7,
    });
    expect(readReportedUsage({ input_tokens: 11, output_tokens: 22 })).toEqual({
      promptTokens: 11, completionTokens: 22, totalTokens: 33,
    });
    expect(readReportedUsage({ prompt_tokens: 0 })).toBeNull();
  });

  it('fills tokens on the same task without counting another image', () => {
    installStorage();
    recordMediaTaskUsage({ taskId: 'task-1', modelId: 'gpt-image-2', type: 'image', mediaCount: 1 });
    recordMediaTaskUsage({
      taskId: 'task-1', modelId: 'gpt-image-2', type: 'image', mediaCount: 1,
      usage: { promptTokens: 11, completionTokens: 22, totalTokens: 33 },
    });
    const logs = getUsageLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.totalTokens).toBe(33);
    expect(logs[0]?.mediaCount).toBe(1);
    expect(getUsageSummary('today').totalTokens).toBe(33);
    expect(getUsageSummary('today').imageCount).toBe(1);
  });
});
