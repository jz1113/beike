import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistAssistantImages } from '../persistAssistantImages';
import { apiFetch } from '@/lib/apiClient';
vi.mock('@/lib/apiClient', () => ({ apiFetch: vi.fn(), proxyMediaUrl: (url: string) => url }));
vi.mock('@/lib/image-utils', () => ({ compressImageForSubmission: vi.fn(async () => 'data:image/jpeg;base64,YQ==') }));
beforeEach(() => { vi.mocked(apiFetch).mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });
describe('persist before sending', () => {
  it('uploads intact bytes without fetch(data:) under desktop CSP', async () => {
    const fetchMock = vi.fn(() => { throw new TypeError('Load failed'); });
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true, url: '/storage/assistant-attachments/saved.jpg' }));
    await persistAssistantImages([{ type: 'image', url: 'data:image/png;base64,YQ==' }]);
    expect(fetchMock).not.toHaveBeenCalled();
    const blob = vi.mocked(apiFetch).mock.calls[0][1]!.body as Blob;
    expect(blob.type).toBe('image/jpeg');
    expect(await blob.text()).toBe('a');
  });
  it('explains upload network failure and leaves attachments unchanged', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new TypeError('Load failed'));
    const attachments = [{ type: 'image' as const, url: 'data:image/png;base64,YQ==' }];
    await expect(persistAssistantImages(attachments)).rejects.toThrow('无法连接本地服务');
    expect(attachments[0].url).toContain('data:');
  });
  it('saves once and preserves order and repeated numbered references', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true, url: '/storage/assistant-attachments/saved.jpg' }));
    const original = [{ type: 'image' as const, url: 'data:image/png;base64,YQ==', name: '原图' }];
    const saved = await persistAssistantImages([...original, ...original]);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(2);
    expect(saved[0].url).toBe(saved[1].url);
    expect(saved[0].name).toBe('原图');
    expect(original[0].url).toContain('data:');
    expect((await persistAssistantImages(saved))[0].url).toBe(saved[0].url);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
  it('fails explicitly when storage fails instead of returning a transient URL', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ error: '磁盘写入失败' }, { status: 500 }));
    await expect(persistAssistantImages([{ type: 'image', url: 'data:image/png;base64,YQ==' }])).rejects.toThrow('磁盘写入失败');
  });
});
