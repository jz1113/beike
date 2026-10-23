import { describe, expect, it, vi } from 'vitest';
import type { VideoSalesShot } from '@shared/domain/sales';
import { renderSalesVideo, type SalesRenderGenerators } from './renderSalesVideo';

function shot(id: number, patch: Partial<VideoSalesShot> = {}): VideoSalesShot {
  return {
    shotId: id, type: 'demo', duration: 4, description: '场景', camera: '推近',
    visualSource: 'product_image', transition: 'direct_concat', voiceover: '看这里', ...patch,
  };
}

function generators(partial: Partial<SalesRenderGenerators> = {}): SalesRenderGenerators {
  return { generateFrame: async () => '', generateVideo: async () => 'https://video.mp4', compose: async () => 'https://final.mp4', ...partial };
}

describe('historical sales clips', () => {
  it('queries an existing shot receipt and does not create another video', async () => {
    const shots = [shot(1, { taskId: 'old-shot', status: 'generating' })];
    const videos: Array<string | undefined> = [];
    const url = await renderSalesVideo({
      shots, images: ['a.jpg'], aspectRatio: '9:16', redraw: true, resumeOnly: true,
      signal: new AbortController().signal, getShots: () => shots,
      patchShot: (index, patch) => { shots[index] = { ...shots[index], ...patch }; }, onPhase: () => undefined,
    }, generators({ generateVideo: async (input) => { videos.push(input.existingTaskId); return 'https://old.mp4'; } }));
    expect(videos).toEqual(['old-shot']);
    expect(shots[0].assetUrl).toBe('https://old.mp4');
    expect(url).toBe('https://final.mp4');
  });

  it('leaves a shot without a receipt untouched instead of submitting it', async () => {
    const shots = [shot(1, { status: 'pending' }), shot(2, { assetUrl: 'https://saved.mp4', status: 'done' })];
    const generateVideo = vi.fn(async () => 'https://new.mp4');
    const url = await renderSalesVideo({
      shots, images: ['a.jpg'], aspectRatio: '9:16', redraw: false, resumeOnly: true,
      signal: new AbortController().signal, getShots: () => shots, patchShot: () => undefined, onPhase: () => undefined,
    }, generators({ generateVideo }));
    expect(generateVideo).not.toHaveBeenCalled();
    expect(url).toBe('');
  });

  it('submits one whole video from the ordered actual images', async () => {
    const seen: string[][] = [];
    const url = await renderSalesVideo({
      shots: [shot(1)], images: [], videoModel: 'chosen', aspectRatio: '9:16', resolution: '720P', refMode: 'omni',
      redraw: false, resumeOnly: false, signal: new AbortController().signal, getShots: () => [], patchShot: () => undefined, onPhase: () => undefined,
      single: { prompt: '整段', images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'], duration: 15, submissionKey: 'once' },
    }, generators({ generateVideo: async (input) => { seen.push(input.referenceImages || []); expect(input.submissionKey).toBe('once'); expect(input.keepAllImages).toBe(true); return 'https://final.mp4'; } }));
    expect(seen).toEqual([['https://example.com/a.jpg', 'https://example.com/b.jpg']]);
    expect(url).toBe('https://final.mp4');
  });
});
