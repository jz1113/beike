import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadVideosInBrowser } from './browserVideoDownloads';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: mocks.fetch }));
vi.mock('@client/shared/media/saveDownload', () => ({ saveToDownloadDir: mocks.save }));
vi.mock('./collectorExportResponse', () => ({ MAX_VIDEO_DOWNLOAD_BYTES: 200 * 1024 * 1024, readExportBlob: mocks.read }));

describe('browser video downloads', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetch.mockResolvedValue(new Response('video'));
    mocks.read.mockResolvedValue(new Blob(['video']));
    mocks.save.mockResolvedValue('browser');
  });

  it('uses bounded media responses and hands files to the browser without server paths', async () => {
    const status = vi.fn();
    await downloadVideosInBrowser([{ id: 'one', filename: 'one.mp4', url: 'https://example.test/one' }], new AbortController().signal, status);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/system/proxy-video?url=https%3A%2F%2Fexample.test%2Fone', { signal: expect.any(AbortSignal) });
    expect(mocks.read).toHaveBeenCalledWith(expect.any(Response), 200 * 1024 * 1024, expect.any(AbortSignal));
    expect(mocks.save).toHaveBeenCalledWith('one.mp4', expect.any(Blob));
    expect(status.mock.calls).toEqual([['one', 'running'], ['one', 'success']]);
  });

  it('keeps failed items retryable and proceeds to the next file', async () => {
    mocks.read.mockRejectedValueOnce(new Error('too large'));
    const status = vi.fn();
    await downloadVideosInBrowser([{ id: 'one', filename: 'one.mp4', url: 'one' }, { id: 'two', filename: 'two.mp4', url: 'two' }], new AbortController().signal, status);
    expect(status.mock.calls).toEqual([['one', 'running'], ['one', 'failed', 'too large'], ['two', 'running'], ['two', 'success']]);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('cancels before saving and leaves the item pending', async () => {
    const controller = new AbortController();
    mocks.read.mockImplementationOnce(() => { controller.abort(); throw new Error('cancelled'); });
    const status = vi.fn();
    await downloadVideosInBrowser([{ id: 'one', filename: 'one.mp4', url: 'one' }, { id: 'two', filename: 'two.mp4', url: 'two' }], controller.signal, status);
    expect(status.mock.calls).toEqual([['one', 'running'], ['one', 'pending']]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
