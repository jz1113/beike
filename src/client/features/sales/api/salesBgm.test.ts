import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { fetchSalesBuiltinBgms, importSalesBgm } from './salesBgm';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/assetLibraryCache', () => ({ invalidateGlobalAssetCache: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const bgm = { id: 'bgm_custom_test', title: '短配乐', durationSec: 10, audioUrl: '/storage/local/music.m4a' };
const respond = (body: unknown, status = 200) => vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('BGM import API', () => {
  it('loads optional builtins without changing the saved library', async () => {
    respond({ success: true, bgms: [bgm] });
    expect(await fetchSalesBuiltinBgms()).toEqual([expect.objectContaining(bgm)]);
    expect(invalidateGlobalAssetCache).not.toHaveBeenCalled();
  });

  it('saves the selected reference excerpt and uses the measured response duration', async () => {
    respond({ success: true, bgm: { ...bgm, durationSec: 7.25 } });
    const signal = new AbortController().signal;
    expect((await importSalesBgm({ videoUrl: '/storage/local/ref.mp4', startSec: 2, durationSec: 10 }, signal)).durationSec).toBe(7.25);
    expect(apiFetch).toHaveBeenCalledWith('/api/sales/studio-bgms/import', expect.objectContaining({
      signal, body: JSON.stringify({ videoUrl: '/storage/local/ref.mp4', startSec: 2, durationSec: 10 }),
    }));
    expect(invalidateGlobalAssetCache).toHaveBeenCalledOnce();
  });

  it('preserves the existing catalog on a missing audio track or malformed success response', async () => {
    respond({ success: false, error: '参考视频没有音轨' }, 400);
    await expect(importSalesBgm({ videoUrl: '/ref.mp4' })).rejects.toThrow('参考视频没有音轨');
    respond({ success: true });
    await expect(importSalesBgm({ audioUrl: '/music.mp3' })).rejects.toThrow('数据不完整');
    expect(invalidateGlobalAssetCache).not.toHaveBeenCalled();
  });

  it.each([{}, { success: false, error: '接口不存在' }])('explains how to enable missing routes for response %j', async (body) => {
    respond(body, 404);
    await expect(importSalesBgm({ videoUrl: '/ref.mp4' })).rejects.toThrow('请重启贝壳服务后重试');
    respond(body, 404);
    await expect(fetchSalesBuiltinBgms()).rejects.toThrow('请重启贝壳服务后重试');
    expect(invalidateGlobalAssetCache).not.toHaveBeenCalled();
  });

  it('preserves specific missing-resource errors from an available import route', async () => {
    respond({ success: false, error: '参考视频文件不存在' }, 404);
    await expect(importSalesBgm({ videoUrl: '/ref.mp4' })).rejects.toThrow('参考视频文件不存在');
    expect(invalidateGlobalAssetCache).not.toHaveBeenCalled();
  });

  it('rejects ambiguous sources and invalid excerpt bounds before a request', async () => {
    for (const input of [{}, { audioUrl: '/a.mp3', videoUrl: '/v.mp4' }, { builtinId: 'a', startSec: -1 }, { audioUrl: '/a.mp3', durationSec: Infinity }]) {
      await expect(importSalesBgm(input)).rejects.toThrow();
    }
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
