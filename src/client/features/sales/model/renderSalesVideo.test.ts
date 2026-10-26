import { describe, expect, it, vi } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/sales';
import { renderSalesVideo } from './renderSalesVideo';
import { queryHistoricalSalesShots } from './querySalesHistory';

function history(): VideoSalesScript {
  return { id: 'old', title: '旧方案', totalDuration: 4,
    shots: [{ shotId: 1, type: 'demo', duration: 4, description: '场景', camera: '中景', visualSource: 'product_image', transition: 'direct_concat', voiceover: '看这里', taskId: 'old-shot', status: 'generating' }],
    seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
  };
}

describe('sales delivery and historical receipts', () => {
  it('queries only existing historical receipts and retains the returned clip without composition', async () => {
    const script = history();
    const query = vi.fn(async () => '/old.mp4');
    await queryHistoricalSalesShots({ script, signal: new AbortController().signal, getShots: () => script.shots,
      patchShot: (index, patch) => { script.shots[index] = { ...script.shots[index], ...patch }; },
    }, query);
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ existingTaskId: 'old-shot', prompt: '' }));
    expect(script.shots[0]).toMatchObject({ taskId: 'old-shot', status: 'done', assetUrl: '/old.mp4' });
  });

  it('does not submit historical shots without a receipt or query completed clips', async () => {
    const script = history();
    script.shots = [{ ...script.shots[0], taskId: undefined, status: 'pending' }, { ...script.shots[0], assetUrl: '/saved.mp4', status: 'done' }];
    const query = vi.fn(async () => '/unexpected.mp4');
    await queryHistoricalSalesShots({ script, signal: new AbortController().signal, getShots: () => script.shots, patchShot: vi.fn() }, query);
    expect(query).not.toHaveBeenCalled();
  });

  it('recovers uncertain historical shots with a receipt without submitting a replacement', async () => {
    const script = history();
    script.shots[0].status = 'uncertain';
    const query = vi.fn(async () => '/recovered.mp4');
    const patchShot = vi.fn();
    await queryHistoricalSalesShots({ script, signal: new AbortController().signal, getShots: () => script.shots, patchShot }, query);
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ existingTaskId: 'old-shot', prompt: '' }));
    expect(patchShot).toHaveBeenCalledWith(0, { status: 'done', assetUrl: '/recovered.mp4', failReason: undefined });
  });

  it('submits exactly one whole video from the ordered actual images', async () => {
    const generateVideo = vi.fn(async () => '/final.mp4');
    const url = await renderSalesVideo({ videoModel: 'chosen', aspectRatio: '9:16', resolution: '720P', refMode: 'omni',
      signal: new AbortController().signal, onPhase: vi.fn(),
      single: { prompt: '整段', images: ['/a.jpg', '/b.jpg'], duration: 15, submissionKey: 'once' },
    }, { generateVideo });
    expect(generateVideo).toHaveBeenCalledOnce();
    expect(generateVideo).toHaveBeenCalledWith(expect.objectContaining({ referenceImages: ['/a.jpg', '/b.jpg'], keepAllImages: true, submissionKey: 'once', duration: 15 }));
    expect(url).toBe('/final.mp4');
  });
});
