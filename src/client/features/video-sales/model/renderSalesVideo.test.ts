import { describe, expect, it } from 'vitest';
import type { VideoSalesShot } from '@shared/domain/video-sales';
import { renderSalesVideo, type SalesRenderGenerators } from './renderSalesVideo';

function shot(id: number): VideoSalesShot {
  return {
    shotId: id,
    type: 'demo',
    duration: 4,
    description: '场景',
    camera: '推近',
    visualSource: 'ai_generate',
    transition: 'direct_concat',
    voiceover: '看这里',
    prompt: '保持商品外观',
    imagePrompt: '客厅里的人拿着商品',
    status: 'pending',
  };
}

function harness(initial: VideoSalesShot[]) {
  const shots = initial.map((item) => ({ ...item }));
  return {
    shots,
    getShots: () => shots,
    patchShot: (index: number, patch: Partial<VideoSalesShot>) => {
      shots[index] = { ...shots[index], ...patch };
    },
  };
}

function generators(partial: Partial<SalesRenderGenerators>): SalesRenderGenerators {
  return {
    generateFrame: async () => 'https://frame.jpg',
    generateVideo: async () => 'https://video.mp4',
    compose: async () => 'https://final.mp4',
    ...partial,
  };
}

describe('sales reference frames before video', () => {
  it('finishes every reference frame before the first video submit', async () => {
    const state = harness([shot(1), shot(2)]);
    const log: string[] = [];
    const releaseFrames: Array<() => void> = [];
    let opened!: () => void;
    const bothStarted = new Promise<void>((resolve) => { opened = resolve; });
    const running = renderSalesVideo({
      shots: state.shots,
      images: ['a.jpg', 'b.jpg'],
      imageModel: 'gpt-image',
      aspectRatio: '9:16',
      redraw: true,
      resumeOnly: false,
      signal: new AbortController().signal,
      getShots: state.getShots,
      patchShot: state.patchShot,
      onPhase: (phase) => log.push(`phase:${phase}`),
    }, generators({
      generateFrame: async (input) => {
        log.push(`frame:${input.referenceImage}`);
        log.push(`prompt:${input.prompt}`);
        await new Promise<void>((resolve) => {
          releaseFrames.push(resolve);
          if (releaseFrames.length === 2) opened();
        });
        return `https://frame/${input.referenceImage}`;
      },
      generateVideo: async (input) => {
        log.push(`video:${input.referenceImage}`);
        return `https://video/${input.referenceImage}`;
      },
    }));
    await bothStarted;
    expect(log.filter((item) => item.startsWith('video:'))).toEqual([]);
    releaseFrames.forEach((release) => release());
    await running;
    const firstVideo = log.findIndex((item) => item.startsWith('video:'));
    const lastFrame = log.reduce((latest, item, index) => (item.startsWith('frame:') ? index : latest), -1);
    expect(lastFrame).toBeLessThan(firstVideo);
    expect(log.filter((item) => item.startsWith('video:')).sort()).toEqual([
      'video:https://frame/a.jpg',
      'video:https://frame/b.jpg',
    ]);
    expect(log.filter((item) => item.startsWith('prompt:')).sort()).toEqual([
      'prompt:客厅里的人拿着商品',
      'prompt:客厅里的人拿着商品',
    ]);
    expect(log[0]).toBe('phase:redrawing');
    expect(log).toContain('phase:generating');
    expect(log.at(-1)).toBe('phase:composing');
  });

  it('skips video for a shot whose reference frame failed', async () => {
    const state = harness([shot(1), shot(2)]);
    const videos: string[] = [];
    await expect(renderSalesVideo({
      shots: state.shots,
      images: ['a.jpg', 'b.jpg'],
      imageModel: 'gpt-image',
      aspectRatio: '9:16',
      redraw: true,
      resumeOnly: false,
      signal: new AbortController().signal,
      getShots: state.getShots,
      patchShot: state.patchShot,
      onPhase: () => undefined,
    }, generators({
      generateFrame: async (input) => {
        if (input.referenceImage === 'b.jpg') throw new Error('出图失败');
        return 'https://frame/a.jpg';
      },
      generateVideo: async (input) => {
        videos.push(input.referenceImage || '');
        return 'https://video/a.mp4';
      },
    }))).rejects.toThrow(/没有生成视频/);
    expect(videos).toEqual(['https://frame/a.jpg']);
    expect(state.shots[1].status).toBe('failed');
    expect(state.shots[1].failReason).toMatch(/出图失败/);
  });

  it('reuses a saved reference frame instead of redrawing it', async () => {
    const state = harness([{ ...shot(1), referenceFrameUrl: 'https://saved-frame.jpg' }]);
    let frames = 0;
    const videos: string[] = [];
    await renderSalesVideo({
      shots: state.shots,
      images: ['a.jpg'],
      imageModel: 'gpt-image',
      aspectRatio: '9:16',
      redraw: true,
      resumeOnly: false,
      signal: new AbortController().signal,
      getShots: state.getShots,
      patchShot: state.patchShot,
      onPhase: () => undefined,
    }, generators({
      generateFrame: async () => { frames += 1; return 'https://new-frame.jpg'; },
      generateVideo: async (input) => { videos.push(input.referenceImage || ''); return 'https://video.mp4'; },
    }));
    expect(frames).toBe(0);
    expect(videos).toEqual(['https://saved-frame.jpg']);
  });

  it('keeps a product shot on the original image', async () => {
    const state = harness([shot(1), { ...shot(2), visualSource: 'product_image', imagePrompt: undefined }]);
    const frames: string[] = [];
    const videos: string[] = [];
    await renderSalesVideo({
      shots: state.shots,
      images: ['a.jpg', 'b.jpg'],
      imageModel: 'gpt-image',
      aspectRatio: '9:16',
      redraw: true,
      resumeOnly: false,
      signal: new AbortController().signal,
      getShots: state.getShots,
      patchShot: state.patchShot,
      onPhase: () => undefined,
    }, generators({
      generateFrame: async (input) => { frames.push(input.prompt); return 'https://frame.jpg'; },
      generateVideo: async (input) => { videos.push(input.referenceImage || ''); return 'https://video.mp4'; },
    }));
    expect(frames).toEqual(['客厅里的人拿着商品']);
    expect(videos.sort()).toEqual(['b.jpg', 'https://frame.jpg']);
  });

  it('asks for an image model before redrawing', async () => {
    const state = harness([shot(1)]);
    await expect(renderSalesVideo({
      shots: state.shots,
      images: ['a.jpg'],
      aspectRatio: '9:16',
      redraw: true,
      resumeOnly: false,
      signal: new AbortController().signal,
      getShots: state.getShots,
      patchShot: state.patchShot,
      onPhase: () => undefined,
    }, generators({}))).rejects.toThrow(/绘图模型/);
  });
});
