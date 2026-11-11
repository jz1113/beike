import { extractPromptMentions, mentionTokenToName } from '@shared/domain/prompts/prompt-engine/mentions';
import { mediaReferenceSlots, normalizeVideoReferenceMentions } from '@client/shared/media/videoReferences';
import { INSPIRATION_ITEMS } from '../data/inspirationData';
import { describe, expect, it } from 'vitest';
import {
  fitShowcaseCanvas,
  inspirationAspectRatio,
  inspirationComposerState,
  inspirationImageUseOptions,
  inspirationVideoUseOptions,
  matchesInspirationSearch,
  visibleJustifiedRows,
  type InspirationItem,
} from './inspirationItem';

const video: InspirationItem = { id: 'video', title: '案例', prompt: '视频', category: 'video', tag: '', image: '/movie.mp4', aspectRatio: '16:9', quality: '1080p', videoDuration: 15, model: 'video-model' };

describe('apply home inspiration', () => {
  it('restores image settings without treating image options as a video request', () => {
    const image: InspirationItem = { ...video, image: '/poster.png', video: undefined, model: 'gpt-image-2', aspectRatio: '2:3', quality: '4K超清' };
    const options = inspirationImageUseOptions(image);
    expect(inspirationComposerState(image.prompt, undefined, options)).toMatchObject({
      quickGenMode: 'image', quickModel: 'gpt-image-2', quickAspectId: '2:3', quickQuality: 'high', quickRefImages: [],
    });
    expect(inspirationComposerState(image.prompt, image.image, { ...options, referenceImages: [image.image] })).toMatchObject({
      quickGenMode: 'image', quickAspectId: '2:3', quickQuality: 'high', quickRefImages: ['/poster.png'],
    });
    expect(inspirationImageUseOptions({ ...image, quality: '未知画质' }).imageQuality).toBeUndefined();
  });

  it('applies video parameters even when the example has no reference images', () => {
    const patch = inspirationComposerState(video.prompt, video.image, inspirationVideoUseOptions(video));
    expect(patch).toMatchObject({ quickGenMode: 'video', quickVideoModel: 'video-model', quickVideoDuration: 15, quickVideoAspectId: '16:9', quickVideoResolution: '1080P', quickRefImages: [] });
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
    expect(inspirationVideoUseOptions({ ...video, quality: '4K超清' }).videoResolution).toBeUndefined();
  });
});

const poster = { title: '皇家猫粮海报', prompt: '黑金产品摄影', category: 'poster', tag: '广告', author: { name: 'Studio ABC' } };
describe('home inspiration search', () => {
  it('requires all search terms to match', () => {
    expect(matchesInspirationSearch(poster, '皇家 黑金')).toBe(true);
    expect(matchesInspirationSearch(poster, '皇家 不存在')).toBe(false);
  });

  it('searches category labels and authors with normalized case and full-width input', () => {
    expect(matchesInspirationSearch(poster, '平面设计 ａｂｃ')).toBe(true);
  });

  it('keeps published works with unknown categories searchable', () => {
    expect(matchesInspirationSearch({ ...poster, category: 'custom' }, '皇家')).toBe(true);
  });
});

it.each(INSPIRATION_ITEMS.filter(item => item.mediaType === 'video'))('binds video example reference mentions for $id', item => {
  const refs = inspirationVideoUseOptions(item).referenceImages ?? [];
  const prompt = normalizeVideoReferenceMentions(item.referencePrompt || item.prompt, refs, []);
  const slots = mediaReferenceSlots(refs).map(slot => slot.name);
  for (const token of extractPromptMentions(prompt)) {
    expect(slots).toContain(mentionTokenToName(token));
  }
});

describe('home feed layout', () => {
  const gap = 8;
  const ratios = Array.from({ length: 35 }, (_, index) => [3 / 4, 9 / 16, 16 / 9][index % 3]);

  it.each([320, 768, 1200, 1900, 2560])('keeps existing rows and card geometry when loading more at width %i', width => {
    const geometry = (rows: number[][]) => rows.map(indices => {
      const height = (width - gap * (indices.length - 1)) / indices.reduce((sum, index) => sum + ratios[index], 0);
      return { indices, height, widths: indices.map(index => ratios[index] * height) };
    });
    const initial = geometry(visibleJustifiedRows(ratios, width, 10, gap));
    const more = geometry(visibleJustifiedRows(ratios, width, 20, gap));

    expect(more.slice(0, initial.length)).toEqual(initial);
    expect(initial.flatMap(row => row.indices).length).toBeGreaterThanOrEqual(10);
    for (const row of more) {
      expect(row.height).toBeGreaterThan(0);
      expect(row.widths.reduce((sum, value) => sum + value, gap * (row.indices.length - 1))).toBeCloseTo(width);
    }
  });

  it('renders each item once and completes the final row without a partial page', () => {
    const all = visibleJustifiedRows(ratios, 1900, ratios.length, gap);
    expect(all.flat()).toEqual(ratios.map((_, index) => index));
    expect(visibleJustifiedRows(ratios, 1900, all.at(-1)![0] + 1, gap)).toEqual(all);
    expect(visibleJustifiedRows([], 1900, 10, gap)).toEqual([]);
  });

  it('waits for a measured container width', () => {
    expect(visibleJustifiedRows(ratios, 0, 10, gap)).toEqual([]);
    expect(visibleJustifiedRows(ratios, Number.NaN, 10, gap)).toEqual([]);
  });

  it('reserves media ratios before decoding, with a stable fallback for published items', () => {
    expect(inspirationAspectRatio({ aspectRatio: '16:9' })).toBe('16 / 9');
    expect(inspirationAspectRatio({ aspectRatio: '9:16' })).toBe('9 / 16');
    for (const aspectRatio of [undefined, '', 'invalid', '0:4', 'Infinity:4']) {
      expect(inspirationAspectRatio({ aspectRatio })).toBe('3 / 4');
    }
  });
});

const node = { id: 'n', type: 'image', x: 10000, y: -5000, width: 1200, height: 1600 };

describe('home canvas preview fitting', () => {
  it.each([[1200, 800], [320, 640]])('fits and centers distant or negative coordinates inside %i × %i', (width, height) => {
    const { zoom, pan } = fitShowcaseCanvas([node], width, height);
    const x = pan.x + node.x * zoom;
    const y = pan.y + node.y * zoom;
    expect(x).toBeGreaterThanOrEqual(31.99);
    expect(y).toBeGreaterThanOrEqual(31.99);
    expect(x + node.width * zoom).toBeLessThanOrEqual(width - 31.99);
    expect(y + node.height * zoom).toBeLessThanOrEqual(height - 31.99);
  });

  it('fits a large legacy canvas without a minimum zoom cropping its nodes', () => {
    const distant = { ...node, id: 'second', x: 1000000 };
    const view = fitShowcaseCanvas([node, distant], 800, 600);
    expect(view.zoom).toBeLessThan(0.001);
    expect(view.pan.x + (distant.x + distant.width) * view.zoom).toBeLessThanOrEqual(768.01);
    expect(fitShowcaseCanvas([], 800, 600)).toEqual({ zoom: 1, pan: { x: 400, y: 300 } });
  });
});

it('keeps unknown legacy video settings unset and explicit empty references empty', () => {
  const options = inspirationVideoUseOptions({ ...video, quality: undefined, videoDuration: undefined });
  const patch = inspirationComposerState('prompt', '/finished.mp4', options);
  expect(patch.quickRefImages).toEqual([]);
  expect(patch.quickVideoResolution).toBeUndefined();
  expect(patch.quickVideoDuration).toBeUndefined();
});

it('recreates edited images using original inputs and the selected route', () => {
  const options = inspirationImageUseOptions({ ...video, model: 'upstream', modelRouteKey: 'route-2', referenceImages: ['/original.png'], quality: 'medium', imageQuality: 'max', inferenceStrength: 'high' });
  expect(inspirationComposerState('prompt', undefined, options)).toMatchObject({ quickGenMode: 'image', quickModel: 'route-2', quickQuality: 'medium', quickRefImages: ['/original.png'] });
  expect(options).toMatchObject({ imageGenerationQuality: 'max', inferenceStrength: 'high' });
});
