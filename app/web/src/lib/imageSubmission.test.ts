import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImageForSubmission } from './image-utils';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function mockImage(load = true) {
  const img = { naturalWidth: 4000, naturalHeight: 3000, onload: null as null | (() => void), onerror: null as null | (() => void), set src(value: string) { if (value && load) queueMicrotask(() => this.onload?.()); } };
  vi.stubGlobal('Image', class { constructor() { return img; } });
  return img;
}
describe('strict image encoder', () => {
  it('reduces quality and dimensions until the requested budget is met', async () => {
    mockImage();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const sizes: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push(this.width);
      return 'data:image/jpeg;base64,' + 'A'.repeat(this.width > 1024 ? 5000 : 2500);
    });
    expect((await compressImageForSubmission('blob:large', 3000)).length).toBeLessThan(3000);
    expect(sizes).toContain(1600);
    expect(sizes).toContain(1024);
  });
  it('rejects decode errors instead of returning the original', async () => {
    const img = mockImage(false);
    const pending = compressImageForSubmission('blob:broken', 3000);
    img.onerror?.();
    await expect(pending).rejects.toThrow('无法解码');
  });
  it('rejects encoder exceptions', async () => {
    mockImage();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => { throw new Error('encoder failure'); });
    await expect(compressImageForSubmission('blob:large', 3000)).rejects.toThrow('encoder failure');
  });
  it('supports abort during decoding', async () => {
    mockImage(false);
    const controller = new AbortController();
    const pending = compressImageForSubmission('blob:large', 3000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
