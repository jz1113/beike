import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { resizeImageBlob } from '@client/shared/media/imageResize';
import { finishWorkshopSingleOutput } from './workshopSingleOutput';

vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: vi.fn(), readClientStorageConfig: () => ({}), storageConfigHeaders: () => ({}),
}));
vi.mock('@client/shared/media/downloadMedia', () => ({ fetchMediaBlob: vi.fn() }));
vi.mock('@client/shared/media/imageResize', () => ({ resizeImageBlob: vi.fn() }));

const generated = { url: 'https://images.example/generated.png', temporary: true };
const bitmap = { width: 1536, height: 2048, close: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  bitmap.width = 1536; bitmap.height = 2048;
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  vi.mocked(fetchMediaBlob).mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
  vi.mocked(resizeImageBlob).mockResolvedValue(new Blob(['resized'], { type: 'image/jpeg' }));
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, urls: ['/storage/generated/shot.jpg'] })));
});
afterEach(() => vi.unstubAllGlobals());

describe('workshop single-shot delivery', () => {
  it('recovers a generated 1536x2048 image when both saved sizes requested 2480x3312', async () => {
    await expect(finishWorkshopSingleOutput(generated, '2480x3312', '2480x3312', 'shot.jpg'))
      .resolves.toEqual({ url: '/storage/generated/shot.jpg', temporary: false });
    expect(resizeImageBlob).toHaveBeenCalledWith(expect.any(Blob), 2480, 3312);
    const [url, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(url).toBe('/api/assets/storage/upload');
    expect(init?.method).toBe('POST');
    expect((init?.body as FormData).get('file')).toHaveProperty('name', 'shot.jpg');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('keeps the original when its actual dimensions already match delivery, even if the requested canvas differed', async () => {
    await expect(finishWorkshopSingleOutput(generated, '2480x3312', '1536x2048')).resolves.toEqual(generated);
    expect(resizeImageBlob).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('resizes legacy shots which saved only the delivery size', async () => {
    await finishWorkshopSingleOutput(generated, undefined, '2480x3312');
    expect(resizeImageBlob).toHaveBeenCalledWith(expect.any(Blob), 2480, 3312);
  });

  it('keeps the original recoverable if decoding fails', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error('invalid image'));
    await expect(finishWorkshopSingleOutput(generated, '2480x3312', '2480x3312'))
      .rejects.toMatchObject({ recoveryRequired: true, message: expect.stringContaining('不必重新生图') });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('keeps the original recoverable when storage fails without submitting generation', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: false, error: '保存失败' }), { status: 503 }));
    await expect(finishWorkshopSingleOutput(generated, '2480x3312', '2480x3312'))
      .rejects.toMatchObject({ recoveryRequired: true, message: expect.stringContaining('保存失败') });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/assets/storage/upload', expect.any(Object));
  });
});
