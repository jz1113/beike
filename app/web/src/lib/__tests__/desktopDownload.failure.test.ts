import { afterEach, expect, it, vi } from 'vitest';
import { saveToDownloadDir } from '../desktopDownload';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('keeps the object URL alive while WebKit starts its browser download', async () => {
  vi.useFakeTimers();
  const revoke = vi.fn();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: () => 'blob:test-download', revokeObjectURL: revoke }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  expect(await saveToDownloadDir('image.png', new Uint8Array([1, 2]))).toBe('browser');
  expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000);
  expect(revoke).toHaveBeenCalledWith('blob:test-download');
});
