import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareSalesProductionVideos } from './salesDepthReference';
import { prepareSalesDepthVideoClip } from './salesVideoClip';

vi.mock('./salesVideoClip', () => ({ prepareSalesDepthVideoClip: vi.fn() }));
const input = { imitationMode: 'depth_imitation' as const, sourceUrl: '/source.mp4', endSec: 2,
  videos: ['/source.mp4'], model: 'doubao-seedance-2.0-mini', durationSec: 2 };
const signal = new AbortController().signal;
beforeEach(() => { vi.resetAllMocks(); });

describe('model-aware derived depth video references', () => {
  it('accepts the final source frame past 2 seconds when it fits the reference limit', async () => {
    vi.mocked(prepareSalesDepthVideoClip).mockResolvedValue({ url: '/clip.mp4', startSec: 0, endSec: 2, durationSec: 2.002 });
    expect(await prepareSalesProductionVideos(input, signal, vi.fn())).toEqual(['/clip.mp4']);
    expect(prepareSalesDepthVideoClip).toHaveBeenCalledWith({ sourceUrl: '/source.mp4', endSec: 2, maxDurationSec: 15 }, signal);
    expect(input.videos).toEqual(['/source.mp4']);
  });

  it.each([1.969, 15.02])('rejects a measured %s-second reference before paid video submission', async (durationSec) => {
    vi.mocked(prepareSalesDepthVideoClip).mockResolvedValue({ url: '/clip.mp4', startSec: 0, endSec: 2, durationSec });
    await expect(prepareSalesProductionVideos(input, signal, vi.fn())).rejects.toThrow('实测');
  });

  it('passes the combined Wan reference and output budget to the clip service', async () => {
    vi.mocked(prepareSalesDepthVideoClip).mockResolvedValue({ url: '/clip.mp4', startSec: 0, endSec: 10, durationSec: 9.98 });
    await prepareSalesProductionVideos({ ...input, model: 'wan3.0-video', durationSec: 20, endSec: 10 }, signal, vi.fn());
    expect(prepareSalesDepthVideoClip).toHaveBeenCalledWith({ sourceUrl: '/source.mp4', endSec: 10, maxDurationSec: 10 }, signal);
  });

  it('keeps plain storyboard references unchanged without cropping', async () => {
    expect(await prepareSalesProductionVideos({ ...input, imitationMode: 'script_only', videos: [] }, signal, vi.fn())).toEqual([]);
    expect(prepareSalesDepthVideoClip).not.toHaveBeenCalled();
  });
});
