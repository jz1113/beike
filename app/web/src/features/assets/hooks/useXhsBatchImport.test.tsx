import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ api: vi.fn(), parse: vi.fn(), creds: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: mocks.api }));
vi.mock('@/lib/externalScraperCredentials', () => ({ getExternalScraperCredentials: mocks.creds }));
vi.mock('@/lib/xhsLinkBatch', async original => ({ ...await original<typeof import('@/lib/xhsLinkBatch')>(), batchParseXhsLinks: mocks.parse }));
import { useXhsBatchImport } from './useXhsBatchImport';
import type { DeconstructQueueApi } from './useDeconstructQueue';
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function setup(queue: unknown[] = []) {
  const setQueue = vi.fn(); const toast = vi.fn();
  const queueApi = { queue, setQueue, productCategoryId: null, runQueueDeconstruction: vi.fn(), isDeconstructingRef: { current: false } } as unknown as DeconstructQueueApi;
  return { ...renderHook(() => useXhsBatchImport({ queueApi, showToast: toast, onRefreshAssets: vi.fn() })), setQueue };
}
it('skips library entries and short-link aliases before calling the scraper', async () => {
  const old = 'https://www.xiaohongshu.com/explore/65eef3c6653c13fcc5138450';
  const fresh = 'https://www.xiaohongshu.com/explore/65eef3c6653c13fcc5138451';
  const short = 'https://xhslink.com/a/fresh';
  mocks.api.mockResolvedValue(Response.json({ success: true, data: [
    { url: old, resolvedUrl: old, sourceKey: 'xhs:old', state: 'approved' },
    { url: fresh, resolvedUrl: fresh, sourceKey: 'xhs:fresh', state: 'new' },
    { url: short, resolvedUrl: fresh, sourceKey: 'xhs:fresh', state: 'new' },
  ] }));
  mocks.creds.mockResolvedValue({});
  mocks.parse.mockResolvedValue({ queueItems: [{ id: 'new', sourceUrl: fresh, images: ['image'] }], skipped: [] });
  const { result, setQueue } = setup();
  act(() => result.current.setXhsLinksInput([old, fresh, short].join('\n')));
  await act(async () => { await result.current.handleBatchParseXhsLinks(); });
  expect(mocks.parse.mock.calls[0][0]).toBe(fresh);
  expect(setQueue.mock.calls[0][0]).toHaveLength(1);
  expect(result.current.collectionIssues.filter(item => item.kind === 'duplicate')).toHaveLength(2);
});
it('does not start collection when the duplicate check is unavailable', async () => {
  mocks.api.mockResolvedValue(Response.json({ error: '数据库不可用' }, { status: 503 }));
  const { result } = setup();
  act(() => result.current.setXhsLinksInput('https://www.xiaohongshu.com/explore/65eef3c6653c13fcc5138450'));
  await act(async () => { await result.current.handleBatchParseXhsLinks(); });
  expect(mocks.parse).not.toHaveBeenCalled();
  expect(mocks.creds).not.toHaveBeenCalled();
});

it('allows a failed queue entry to be collected again and replaces the failed row', async () => {
  const url = 'https://www.xiaohongshu.com/explore/65eef3c6653c13fcc5138450';
  mocks.api.mockResolvedValue(Response.json({ success: true, data: [{ url, resolvedUrl: url, sourceKey: 'xhs:65eef3c6653c13fcc5138450', state: 'new' }] }));
  mocks.creds.mockResolvedValue({});
  mocks.parse.mockResolvedValue({ queueItems: [{ id: 'retry', sourceUrl: url, status: 'pending', images: ['image'] }], skipped: [] });
  const { result, setQueue } = setup([{ id: 'failed', sourceUrl: url, status: 'error', images: ['old'] }]);
  act(() => result.current.setXhsLinksInput(url));
  await act(async () => { await result.current.handleBatchParseXhsLinks(); });
  expect(mocks.parse).toHaveBeenCalledTimes(1);
  expect(setQueue.mock.calls[0][0]).toHaveLength(1);
  expect(setQueue.mock.calls[0][0][0].id).toBe('retry');
});
