import { describe, expect, it, vi } from 'vitest';
import { videoPlaybackManager } from '../videoPlaybackManager';

describe('videoPlaybackManager', () => {
  it('registers and unregisters player cleanly', () => {
    const el = { dataset: {} } as unknown as HTMLElement;
    const cb = vi.fn();
    const unregister = videoPlaybackManager.register('test-vid-1', el, cb);
    expect((el as any).dataset.vpmId).toBe('test-vid-1');

    unregister();
    expect((el as any).dataset.vpmId).toBe('test-vid-1');
  });

  it('safePlay handles play errors gracefully without crashing', async () => {
    const video = {
      muted: false,
      play: vi.fn().mockRejectedValue(new Error('AbortError')),
    } as unknown as HTMLVideoElement;

    const ok = await videoPlaybackManager.constructor.safePlay(video);
    expect(ok).toBe(false);
    expect(video.muted).toBe(true);
  });

  it('safePause pauses video without throwing', () => {
    const video = {
      pause: vi.fn(),
    } as unknown as HTMLVideoElement;

    videoPlaybackManager.constructor.safePause(video);
    expect(video.pause).toHaveBeenCalled();
  });
});
