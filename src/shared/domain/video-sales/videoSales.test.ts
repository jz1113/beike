import { describe, expect, it } from 'vitest';
import { applyImageAssignments, applyStrictImageAssignments, buildSalesImageCatalog, visionImageBudget } from './imageCatalog';
import { applyFinalPrompts, editSalesShot } from './planRules';
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

  it('prefers main images and clamps shot image indexes', () => {
    const catalog = buildSalesImageCatalog({
      descImages: ['https://example.com/detail.jpg'],
      skuImages: ['https://example.com/sku.jpg'],
      mainImages: ['https://example.com/main.jpg', 'https://example.com/main.jpg'],
    });
    expect(visionImageBudget(catalog, 2).map((image) => image.role)).toEqual(['main', 'sku']);
    const shots: VideoSalesShot[] = [
      { shotId: 1, type: 'hook', duration: 3, description: '正面', camera: '推近', visualSource: 'product_image', transition: 'direct_concat', voiceover: '看这里' },
      { shotId: 2, type: 'demo', duration: 4, description: '细节', camera: '特写', visualSource: 'product_image', transition: 'direct_concat', voiceover: '再看' },
    ];
    const assigned = applyImageAssignments(shots, [{ shotId: 1, imageIndex: 8 }, { shotId: 2, imageIndex: 1 }], catalog.length);
    expect(assigned[0].imageIndex).toBe(0);
    expect(assigned[1].imageIndex).toBe(1);
  });

  it('rejects incomplete image choices and marks edited shots stale', () => {
    const catalog = buildSalesImageCatalog({ mainImages: ['https://example.com/main.jpg'], skuImages: ['https://example.com/sku.jpg'] });
    const shots: VideoSalesShot[] = [
      { shotId: 1, type: 'hook', duration: 3, description: '正面', camera: '推近', visualSource: 'product_image', transition: 'direct_concat', voiceover: '看这里', prompt: '旧提示词' },
    ];
    expect(() => applyStrictImageAssignments(shots, [{ shotId: 1, imageIndex: 4, reason: '没有这张图' }], catalog)).toThrow(/没有可用参考图/);
    const assigned = applyStrictImageAssignments(shots, [{ shotId: 1, imageIndex: 0, reason: '主图能看清包装' }], catalog);
    expect(assigned[0].selectionReason).toBe('主图能看清包装');
    expect(assigned[0].visualSource).toBe('product_image');
    const edited = editSalesShot({ ...assigned[0], referenceFrameUrl: 'https://example.com/frame.jpg' }, { description: '改为侧面' });
    expect(edited.promptStale).toBe(true);
    expect(edited.assetUrl).toBeUndefined();
    expect(edited.referenceFrameUrl).toBeUndefined();
    expect(editSalesShot({ ...assigned[0], referenceFrameUrl: 'https://example.com/frame.jpg' }, { description: assigned[0].description }).referenceFrameUrl).toBe('https://example.com/frame.jpg');
    const prompted = applyFinalPrompts([edited], [{ shotId: 1, prompt: '保持白色包装，镜头缓慢推近', imagePrompt: '多余的静帧' }]);
    expect(prompted[0].promptStale).toBe(false);
    expect(prompted[0].finalPrompt).toContain('白色包装');
    expect(prompted[0].imagePrompt).toBeUndefined();
  });

  it('invalidates audio and generated frames when the speech source changes', () => {
    const shot: VideoSalesShot = { shotId: 1, type: 'demo', duration: 5, description: '讲解', camera: '中景', visualSource: 'ai_generate', transition: 'direct_concat', voiceover: '看看领口', speechMode: 'voiceover', promptStale: false, audioUrl: '/audio.mp3', referenceFrameUrl: '/frame.jpg', assetUrl: '/video.mp4' };
    const edited = editSalesShot(shot, { speechMode: 'on_camera' });
    expect(edited).toMatchObject({ speechMode: 'on_camera', promptStale: true, status: 'pending' });
    expect(edited.audioUrl).toBeUndefined();
    expect(edited.referenceFrameUrl).toBeUndefined();
    expect(editSalesShot(shot, { speechMode: 'voiceover' }).assetUrl).toBe('/video.mp4');
  });

  it('keeps a scene shot and requires its still prompt', () => {
    const catalog = buildSalesImageCatalog({ mainImages: ['https://example.com/main.jpg'] });
    const shots: VideoSalesShot[] = [
      { shotId: 1, type: 'demo', duration: 4, description: '人在客厅里使用', camera: '中景', visualSource: 'ai_generate', transition: 'direct_concat', voiceover: '看这里' },
    ];
    const assigned = applyStrictImageAssignments(shots, [{ shotId: 1, imageIndex: 0, reason: '主图能看清商品' }], catalog);
    expect(assigned[0].visualSource).toBe('ai_generate');
    expect(() => applyFinalPrompts(assigned, [{ shotId: 1, prompt: '视频提示词' }])).toThrow(/绘图提示词/);
    const prompted = applyFinalPrompts(assigned, [{ shotId: 1, prompt: '视频提示词', imagePrompt: '  实拍客厅  ' }]);
    expect(prompted[0].imagePrompt).toBe('实拍客厅');
    const redrawn = editSalesShot({ ...prompted[0], referenceFrameUrl: 'https://example.com/frame.jpg' }, { imagePrompt: '改为窗边' });
    expect(redrawn.imagePrompt).toBe('改为窗边');
    expect(redrawn.referenceFrameUrl).toBeUndefined();
    expect(redrawn.promptStale).toBeFalsy();
  });
});
