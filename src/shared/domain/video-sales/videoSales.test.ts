import { describe, expect, it } from 'vitest';
import {
  VIDEO_SALES_CATEGORY_LABELS,
  VIDEO_SALES_PRESET_TEMPLATES,
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

  it('should contain robust preset templates with shots and SEO', () => {
    expect(VIDEO_SALES_PRESET_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    for (const preset of VIDEO_SALES_PRESET_TEMPLATES) {
      expect(preset.shots.length).toBeGreaterThanOrEqual(4);
      expect(preset.shots[0].type).toBe('hook');
      expect(preset.seo.title).toBeTruthy();
      expect(preset.seo.hashtags.length).toBeGreaterThan(0);
      expect(preset.seo.coverText).toBeTruthy();
    }
  });
});
