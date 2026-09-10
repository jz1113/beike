import { afterEach, expect, it, vi } from 'vitest';
import { ensurePermanentImageUrl } from '../batchRunnerExport';
import { apiFetch } from '@/lib/apiClient';
import { fetchMediaBlob } from '@/lib/downloadMedia';
vi.mock('@/lib/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/downloadMedia', () => ({ fetchMediaBlob: vi.fn(), downloadMediaOrOpen: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it('stops export on failed upload instead of exporting a blob URL', async () => {
  vi.mocked(fetchMediaBlob).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ error: 'OSS 上传失败' }), { status: 500 }));
  await expect(ensurePermanentImageUrl('blob:http://127.0.0.1:5173/test', 'slice')).rejects.toThrow('已停止导出');
});
it('rejects local storage fallback', async () => {
  vi.mocked(fetchMediaBlob).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, url: '/storage/test.png' })));
  await expect(ensurePermanentImageUrl('blob:test', 'slice')).rejects.toThrow('已停止导出');
});
it('uploads absolute localhost images and uses the returned cloud URL', async () => {
  vi.mocked(fetchMediaBlob).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, urls: ['https://bucket.oss-cn-hangzhou.aliyuncs.com/test.png'] })));
  await expect(ensurePermanentImageUrl('http://127.0.0.1:5173/storage/test.png', 'slice')).resolves.toContain('aliyuncs.com');
  expect(apiFetch).toHaveBeenCalledOnce();
});
