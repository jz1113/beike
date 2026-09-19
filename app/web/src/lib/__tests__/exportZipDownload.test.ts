import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), save: vi.fn() }));
vi.mock('../apiClient', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../desktopDownload', () => ({ saveToDownloadDir: mocks.save }));
import { exportZipDownload, formatExportProgress } from '../exportZipDownload';

beforeEach(() => { vi.resetAllMocks(); });

describe('ZIP export', () => {
  it('downloads via the server packager and saves in the browser', async () => {
    mocks.apiFetch.mockResolvedValue(new Response('zip', { headers: { 'Content-Type': 'application/zip' } }));
    await exportZipDownload({}, 'test.zip', vi.fn());
    expect(mocks.save).toHaveBeenCalledWith('test.zip', expect.any(Blob));
    mocks.apiFetch.mockResolvedValue(new Response('{"error":"读取失败"}', { status: 500 }));
    await expect(exportZipDownload({}, 'test.zip', vi.fn())).rejects.toThrow('读取失败');
  });

  it('distinguishes packing from saving', () => {
    expect(formatExportProgress({ phase: 'packing', downloaded: 0 })).toContain('打包');
    expect(formatExportProgress({ phase: 'saving', downloaded: 50, total: 100 })).toBe('正在保存 50%');
  });
});
