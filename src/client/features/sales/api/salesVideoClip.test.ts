import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@client/shared/api/apiRequest';
import { prepareSalesDepthVideoClip } from './salesVideoClip';

vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));

beforeEach(() => { vi.resetAllMocks(); });

describe('local depth reference prefix', () => {
  it('prepares a silent source prefix without changing the requested source or boundary', async () => {
    const clip = { url: '/storage/local/derived.mp4', startSec: 0, endSec: 12.6, durationSec: 12.6 };
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ success: true, ...clip })));
    const signal = new AbortController().signal;
    await expect(prepareSalesDepthVideoClip({ sourceUrl: '/storage/local/depth.mp4', endSec: 12.6, maxDurationSec: 15 }, signal)).resolves.toEqual(clip);
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/sales/video-clip', {
      signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: '/storage/local/depth.mp4', endSec: 12.6, maxDurationSec: 15 }),
    });
  });

  it('surfaces a failed crop and rejects mismatched or external results', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ success: false, error: '动作结束超过原视频' }), { status: 400 }));
    await expect(prepareSalesDepthVideoClip({ sourceUrl: '/storage/local/depth.mp4', endSec: 15 }, new AbortController().signal)).rejects.toThrow('动作结束超过原视频');
    for (const result of [
      { url: '/storage/local/derived.mp4', startSec: 0, endSec: 14, durationSec: 14 },
      { url: 'https://external.example/derived.mp4', startSec: 0, endSec: 15, durationSec: 15 },
      { url: '/storage/local/derived.mp4', startSec: 0, endSec: 15, durationSec: 15.015 },
    ]) {
      vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ success: true, ...result })));
      await expect(prepareSalesDepthVideoClip({ sourceUrl: '/storage/local/depth.mp4', endSec: 15, maxDurationSec: 15 }, new AbortController().signal)).rejects.toThrow('返回结果不完整');
    }
  });

  it('does not prepare or adopt a cancelled derivative', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepareSalesDepthVideoClip({ sourceUrl: '/storage/local/depth.mp4', endSec: 15 }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
