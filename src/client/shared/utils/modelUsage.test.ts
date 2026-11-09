import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPreferredScraperSync,
  setPreferredScraper,
  getExternalScraperCredentials,
} from '@client/shared/modals/style-extract/useStyleExtractWorkflow';
import { readReportedUsage, recordChatTokens, recordMediaTaskUsage } from './modelUsage';
import { prepareTextOperationUsage, replayTextOperationUsage } from './textOperationUsage';
import { clearUsageLogs, estimateModelCost, getUsageLogs, getUsageSummary } from './usageTracker';

vi.mock('@client/shared/api/gatewayClient', () => ({ getMultimodalClientOverrides: () => ({}), getGatewayClientHeaders: () => ({}) }));

function installStorage() {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, addEventListener: () => {}, dispatchEvent: () => true });
}

describe('reported model usage', () => {
  it('S09 counts a replayed text phase only once, including a failed paid response', () => {
    installStorage();
    const input = { modelId: 'gpt-6-luna', operationId: 'poster:batch:item:title', usage: { total_tokens: 7 }, success: false };
    recordChatTokens(input); recordChatTokens(input);
    expect(getUsageLogs()).toHaveLength(1);
    expect(getUsageLogs()[0]).toMatchObject({ taskId: 'text:poster:batch:item:title', totalTokens: 7, success: false });
    expect(getUsageSummary('today').totalTokens).toBe(7);
  });
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

  it('keeps one row when the upstream id arrives after the local task id', () => {
    installStorage();
    recordMediaTaskUsage({ localTaskId: 'local-1', modelId: 'gpt-image-2', type: 'image', mediaCount: 1 });
    recordMediaTaskUsage({
      localTaskId: 'local-1', taskId: 'upstream-1', modelId: 'gpt-image-2', type: 'image', mediaCount: 1,
      usage: { promptTokens: 11, completionTokens: 22, totalTokens: 33 },
    });
    const logs = getUsageLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.taskId).toBe('upstream-1');
    expect(logs[0]?.localTaskId).toBe('local-1');
    expect(logs[0]?.totalTokens).toBe(33);
    expect(logs[0]?.mediaCount).toBe(1);
    recordMediaTaskUsage({ localTaskId: 'local-1', taskId: 'upstream-1', modelId: 'gpt-image-2', type: 'image', mediaCount: 1 });
    expect(getUsageLogs()).toHaveLength(1);
    expect(getUsageSummary('today').imageCount).toBe(1);
  });

  it('counts a video once across submission and completion receipts', () => {
    installStorage();
    recordMediaTaskUsage({ localTaskId: 'sales-video-1', taskId: 'video-1', modelId: 'wan3.0-video', type: 'video', mediaCount: 1, duration: 15, resolution: '480P' });
    recordMediaTaskUsage({ taskId: 'video-1', modelId: 'wan3.0-video', type: 'video', mediaCount: 1, duration: 15, resolution: '480P' });
    expect(getUsageLogs()).toHaveLength(1);
    expect(getUsageSummary('today').videoCount).toBe(1);
    expect(getUsageLogs()[0]?.costUsd).toBe(6.75);
  });

  it('uses the default-group Wan price for each supported resolution', () => {
    expect(estimateModelCost('wan3.0-video', 'video', { duration: 15, resolution: '480P' })).toBe(6.75);
    expect(estimateModelCost('wan3.0-video', 'video', { duration: 15, resolution: '720p' })).toBe(13.5);
    expect(estimateModelCost('wan3.0-video', 'video', { duration: 15, resolution: '1080P' })).toBe(27);
  });
});

describe('textOperationUsage & externalScraperCredentials', () => {
  beforeEach(() => installStorage());
  afterEach(() => vi.unstubAllGlobals());

  it.each(['chat', 'vision'] as const)('S13 %s recovered partial usage upgrades once using original attribution', type => {
    const scope = prepareTextOperationUsage('original', 'original-model', type, { customBaseUrl: 'https://original.test', customApiKey: 'private' });
    replayTextOperationUsage('original', { prompt_tokens: 3 });
    prepareTextOperationUsage('original', 'changed-model', type, { customBaseUrl: 'https://changed.test' });
    replayTextOperationUsage('original', { prompt_tokens: 3, completion_tokens: 4, total_totalTokens: 7 }, true);
    replayTextOperationUsage('original', { prompt_tokens: 3, completion_tokens: 4, total_totalTokens: 7 }, true);
    const rows = getUsageLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ modelId: 'original-model', scope, totalTokens: 7, success: true });
  });

  it.each(['chat', 'vision'] as const)('S13 %s old receipts stay cleared after refresh', type => {
    prepareTextOperationUsage('old', 'model', type);
    replayTextOperationUsage('old', { total_tokens: 9 }, true);
    clearUsageLogs();
    replayTextOperationUsage('old', { total_tokens: 12 }, true);
    expect(getUsageLogs()).toHaveLength(0);
  });

  it('defaults preferredScraper to auto when nothing stored', () => {
    expect(getPreferredScraperSync()).toBe('auto');
  });

  it('stores and retrieves preferredScraper correctly', () => {
    setPreferredScraper('apia');
    expect(getPreferredScraperSync()).toBe('apia');

    setPreferredScraper('qiyun');
    expect(getPreferredScraperSync()).toBe('qiyun');

    setPreferredScraper('auto');
    expect(getPreferredScraperSync()).toBe('auto');

    setPreferredScraper('wanbang');
    expect(getPreferredScraperSync()).toBe('wanbang');
  });

  it('ignores an unknown preferredScraper value', () => {
    localStorage.setItem('preferred_scraper', 'unknown');
    expect(getPreferredScraperSync()).toBe('auto');
  });

  it('returns preferredScraper in getExternalScraperCredentials', async () => {
    setPreferredScraper('qiyun');
    const creds = await getExternalScraperCredentials();
    expect(creds.preferredScraper).toBe('qiyun');
  });
});
