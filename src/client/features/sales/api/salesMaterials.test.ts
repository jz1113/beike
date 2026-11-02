import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { createSalesMaterial, createSalesSound } from './salesMaterials';
import { importSalesBgm } from './salesBgm';
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/assetLibraryCache', () => ({ invalidateGlobalAssetCache: vi.fn() }));
vi.mock('./salesBgm', () => ({ importSalesBgm: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe('save reusable sales materials', () => {
  it('keeps both persona anchors and invalidates the shared library after confirmed save', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true })));
    await createSalesMaterial('persona', { name: '人物', avatarUrl: '/face.jpg', sourceImages: ['/body.jpg', '/face.jpg'] });
    const request = vi.mocked(apiFetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ assetType: 'persona', data: { avatarUrl: '/face.jpg', sourceImages: ['/body.jpg', '/face.jpg'] } });
    expect(invalidateGlobalAssetCache).toHaveBeenCalledOnce();
  });
  it('surfaces server failure and retains the current cache', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: false, error: '工作区不可写' }), { status: 403 }));
    await expect(createSalesMaterial('action', { action: '转身' })).rejects.toThrow('工作区不可写');
    expect(invalidateGlobalAssetCache).not.toHaveBeenCalled();
  });
  it('imports single music uploads through the measured audio path before saving their labels', async () => {
    vi.mocked(importSalesBgm).mockResolvedValue({ id: 'bgm_custom_new', title: '短配乐', audioUrl: '/new.m4a',
      durationSec: 8, description: '', moodTags: [], bpm: 100, license: '上传音频', suitableCategories: [] });
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true })));
    await createSalesSound({ soundType: 'bgm', title: '短配乐', audioUrl: '/original.wav', moodTags: ['轻快'] });
    expect(importSalesBgm).toHaveBeenCalledWith({ title: '短配乐', audioUrl: '/original.wav' }, undefined);
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(apiFetch).toHaveBeenCalledWith('/api/sales/studio-sounds/bgm_custom_new', expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toEqual({ soundType: 'bgm', title: '短配乐', moodTags: ['轻快'] });
  });
});
