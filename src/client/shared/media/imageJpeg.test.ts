import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertImageToJpeg } from './imageJpeg';

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const input = () => new Blob([pngBytes], { type: 'image/png' });
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
let context: { fillStyle: string; fillRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };
let canvas: { width: number; height: number; getContext: ReturnType<typeof vi.fn>; toBlob: ReturnType<typeof vi.fn> };
let encoded: Blob;

beforeEach(() => {
  encoded = new Blob([jpegBytes], { type: 'image/jpeg' });
  bitmap = { width: 1800, height: 2400, close: vi.fn() };
  context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  canvas = {
    width: 0, height: 0, getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback) => callback(encoded)),
  };
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('convertImageToJpeg', () => {
  it('preserves existing JPEG bytes without recompression and corrects their MIME type', async () => {
    const jpeg = new Blob([jpegBytes], { type: 'image/jpeg' });
    expect(await convertImageToJpeg(jpeg)).toBe(jpeg);
    const mislabeled = await convertImageToJpeg(new Blob([jpegBytes], { type: 'image/png' }));
    expect(mislabeled.type).toBe('image/jpeg');
    expect(await mislabeled.arrayBuffer()).toEqual(await jpeg.arrayBuffer());
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(document.createElement).not.toHaveBeenCalled();
  });

  it('encodes a white background at the original resolution even when input MIME claims JPEG', async () => {
    canvas.toBlob.mockImplementation((callback: BlobCallback, mime: string, quality: number) => {
      expect([canvas.width, canvas.height]).toEqual([1800, 2400]);
      expect([mime, quality]).toEqual(['image/jpeg', 0.96]);
      callback(encoded);
    });
    const result = await convertImageToJpeg(new Blob([pngBytes], { type: 'image/jpeg' }));
    expect(result).toBe(encoded);
    expect(context.fillStyle).toBe('#ffffff');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1800, 2400);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(context.fillRect.mock.invocationCallOrder[0]).toBeLessThan(context.drawImage.mock.invocationCallOrder[0]);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it.each([
    [null, '图片转换 JPG 失败'],
    [new Blob([pngBytes], { type: 'image/png' }), '未返回有效的 JPG'],
    [new Blob([pngBytes], { type: 'image/jpeg' }), '未返回有效的 JPG'],
  ])('rejects failed or non-JPEG encoding and releases resources: %j', async (output, error) => {
    canvas.toBlob.mockImplementation((callback: BlobCallback) => callback(output));
    await expect(convertImageToJpeg(input())).rejects.toThrow(error);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('releases the decoded bitmap when no drawing context is available', async () => {
    canvas.getContext.mockReturnValue(null);
    await expect(convertImageToJpeg(input())).rejects.toThrow('无法创建图片处理画布');
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('does not decode an already cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(convertImageToJpeg(input(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('releases a bitmap that finishes decoding after cancellation', async () => {
    const controller = new AbortController();
    vi.mocked(createImageBitmap).mockImplementation(async () => { controller.abort(); return bitmap as unknown as ImageBitmap; });
    await expect(convertImageToJpeg(input(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(document.createElement).not.toHaveBeenCalled();
  });

  it('discards output and releases resources if encoding is cancelled', async () => {
    const controller = new AbortController();
    canvas.toBlob.mockImplementation((callback: BlobCallback) => { controller.abort(); callback(encoded); });
    await expect(convertImageToJpeg(input(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('uses and releases an object URL when ImageBitmap is unavailable', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const fallback = { src: '', naturalWidth: 640, naturalHeight: 480, decode: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('Image', class { constructor() { return fallback; } });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:jpeg-test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    expect(await convertImageToJpeg(input())).toBe(encoded);
    expect(context.drawImage).toHaveBeenCalledWith(fallback, 0, 0);
    expect(revoke).toHaveBeenCalledWith('blob:jpeg-test');
    expect(fallback.src).toBe('');
  });

  it('cleans up the fallback object URL if decoding fails', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const fallback = { src: '', decode: vi.fn().mockRejectedValue(new Error('invalid image')) };
    vi.stubGlobal('Image', class { constructor() { return fallback; } });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invalid');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await expect(convertImageToJpeg(input())).rejects.toThrow('invalid image');
    expect(revoke).toHaveBeenCalledWith('blob:invalid');
    expect(fallback.src).toBe('');
  });
});
