import { appendSalesImages } from './imageCatalog';
import { describe, expect, it } from 'vitest';
import { applyStrictImageAssignments, buildSalesImageCatalog } from './imageCatalog';
import { editSalesShot } from './planRules';
import {
  VIDEO_SALES_CATEGORY_LABELS,
  VIDEO_SALES_SHOT_TYPE_CONFIG,
} from './templates';
import type { VideoSalesShot } from './types';

describe('videoSales domain and templates', () => {
  it('should have all 6 categories labeled', () => {
    expect(VIDEO_SALES_CATEGORY_LABELS.beauty).toBe('美妆护肤');
    expect(VIDEO_SALES_CATEGORY_LABELS.food).toBe('食品零食');
    expect(VIDEO_SALES_CATEGORY_LABELS.home).toBe('家居日用');
    expect(VIDEO_SALES_CATEGORY_LABELS.fashion).toBe('服饰鞋包');
    expect(VIDEO_SALES_CATEGORY_LABELS.tech).toBe('数码3C');
    expect(VIDEO_SALES_CATEGORY_LABELS.other).toBe('通用百货');
  });

  it('should define all 6 AIDA shot types', () => {
    const types: VideoSalesShot['type'][] = [
      'hook',
      'pain_point',
      'product_reveal',
      'demo',
      'social_proof',
      'cta',
    ];
    for (const t of types) {
      expect(VIDEO_SALES_SHOT_TYPE_CONFIG[t]).toBeDefined();
      expect(VIDEO_SALES_SHOT_TYPE_CONFIG[t].label).toBeTruthy();
    }
  });

  it('rejects incomplete image choices and marks edited shots stale', () => {
    const catalog = buildSalesImageCatalog({ mainImages: ['https://example.com/main.jpg'], skuImages: ['https://example.com/sku.jpg'] });
    const shots: VideoSalesShot[] = [
      { shotId: 1, type: 'hook', duration: 3, description: '正面', camera: '推近', visualSource: 'product_image', transition: 'direct_concat', speechMode: 'voiceover', voiceover: '看这里', prompt: '旧提示词' },
    ];
    expect(() => applyStrictImageAssignments(shots, [{ shotId: 1, imageIndex: 4, reason: '没有这张图' }], catalog)).toThrow(/没有可用参考图/);
    const assigned = applyStrictImageAssignments(shots, [{ shotId: 1, imageIndex: 0, reason: '主图能看清包装' }], catalog);
    expect(assigned[0].selectionReason).toBe('主图能看清包装');
    expect(assigned[0].visualSource).toBe('product_image');
    const edited = editSalesShot({ ...assigned[0], assetUrl: '/old.mp4' }, { description: '改为侧面' });
    expect(edited.promptStale).toBe(true);
    expect(edited.assetUrl).toBeUndefined();
    expect(editSalesShot({ ...assigned[0], assetUrl: '/saved.mp4' }, { description: assigned[0].description }).assetUrl).toBe('/saved.mp4');
  });

  it('invalidates a video when the speech source changes', () => {
    const shot: VideoSalesShot = { shotId: 1, type: 'demo', duration: 5, description: '讲解', camera: '中景', visualSource: 'ai_generate', transition: 'direct_concat', voiceover: '看看领口', speechMode: 'voiceover', promptStale: false, assetUrl: '/video.mp4' };
    expect(editSalesShot(shot, { speechMode: 'on_camera' })).toMatchObject({ speechMode: 'on_camera', promptStale: true, status: 'pending', assetUrl: undefined });
    expect(editSalesShot(shot, { speechMode: 'voiceover' }).assetUrl).toBe('/video.mp4');
  });
});

it('preserves catalog identifiers when uploads are appended to a sparse saved catalog', () => {
  const original = [{ index: 2, role: 'main' as const, url: '/front.jpg' }, { index: 8, role: 'detail' as const, url: '/back.jpg' }];
  expect(appendSalesImages(original, ['/new.jpg', '/front.jpg', '/other.jpg'])).toEqual([
    ...original, { index: 9, role: 'main', url: '/new.jpg' }, { index: 10, role: 'main', url: '/other.jpg' },
  ]);
  expect(original.map((image) => image.index)).toEqual([2, 8]);
});
