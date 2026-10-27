import { describe, expect, it } from 'vitest';
import { inspirationComposerState } from './inspirationComposer';
import { inspirationVideoUseOptions } from './inspirationMedia';
import type { InspirationItem } from './inspirationItem';

const video: InspirationItem = { id: 'video', title: '案例', prompt: '视频', category: 'video', tag: '', image: '/movie.mp4', aspectRatio: '16:9', quality: '1080p', videoDuration: 15, model: 'video-model' };

describe('apply home inspiration', () => {
  it('applies video parameters even when the example has no reference images', () => {
    const patch = inspirationComposerState(video.prompt, video.image, inspirationVideoUseOptions(video));
    expect(patch).toMatchObject({ quickGenMode: 'video', quickVideoModel: 'video-model', quickVideoDuration: 15, quickVideoAspectId: '16:9', quickVideoResolution: '1080P', quickRefImages: ['/movie.mp4'] });
  });

  it('clears previous frame references when applying an image or a text-only example', () => {
    for (const image of [undefined, '/image.png']) {
      expect(inspirationComposerState('prompt', image)).toMatchObject({ quickGenMode: 'image', quickVideoFirstFrame: null, quickVideoLastFrame: null, quickVideoMultiFrames: [], quickRefImages: image ? [image] : [] });
    }
  });

  it('applies attached references instead of the finished video and does not mutate them', () => {
    const references = ['/person.png', '/dress.png'];
    const patch = inspirationComposerState('prompt', '/finished.mp4', { referenceImages: references });
    expect(patch.quickRefImages).toEqual(references);
    expect(patch.quickRefImages).not.toBe(references);
    expect(patch.quickRefImage).toBe('/person.png');
  });

  it('places first/last-frame and multi-frame references in the slots consumed by submission', () => {
    const referenceImages = ['/first.png', '/last.png'];
    expect(inspirationComposerState('prompt', '/finished.mp4', { referenceImages, videoRefMode: 'first_last_frame' })).toMatchObject({ quickRefImages: [], quickRefImage: null, quickVideoFirstFrame: '/first.png', quickVideoLastFrame: '/last.png' });
    expect(inspirationComposerState('prompt', '/finished.mp4', { referenceImages, videoRefMode: 'multi_frame' })).toMatchObject({ quickRefImages: [], quickVideoMultiFrames: referenceImages });
  });

  it('normalizes unsupported quality text instead of casting it into resolution controls', () => {
    expect(inspirationVideoUseOptions({ ...video, quality: '4K超清' }).videoResolution).toBe('480P');
  });
});
