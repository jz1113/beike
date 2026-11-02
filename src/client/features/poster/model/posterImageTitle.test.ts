import { describe, expect, it } from 'vitest';
import { normalizePosterProductionSettings, posterItemFromUploadedImage, titleFromImageFileName } from './posterDraft';

describe('titleFromImageFileName', () => {
  it('uses the file name without its extension or copy suffix', () => {
    expect(titleFromImageFileName('洗衣机洗完不发灰.jpg')).toBe('洗衣机洗完不发灰');
    expect(titleFromImageFileName('洗衣机洗完不发灰 (1).png')).toBe('洗衣机洗完不发灰');
    expect(titleFromImageFileName('洗衣机洗完不发灰-副本.webp')).toBe('洗衣机洗完不发灰');
    expect(titleFromImageFileName('folder/耳机_copy.jpeg')).toBe('耳机');
  });

  it('builds a portrait production item from an uploaded image', () => {
    const item = posterItemFromUploadedImage('https://cdn.example/a.jpg', '戴一天耳朵不累.jpg');
    expect(item.originalTitle).toBe('戴一天耳朵不累');
    expect(item.coverTitle).toBe('戴一天耳朵不累');
    expect(item.format.aspectRatio).toBe('3:4');
    expect(item.status).toBe('idle');
  });
});

describe('poster supplementary requirements', () => {
  it('restores new settings and safely reads legacy batches', () => {
    expect(normalizePosterProductionSettings({ supplementaryRequirements: '  暖白配色，保留手持  ' }).supplementaryRequirements).toBe('暖白配色，保留手持');
    expect(normalizePosterProductionSettings({ memorySampleId: 'sample-a' }).supplementaryRequirements).toBe('');
    expect(normalizePosterProductionSettings({ supplementaryRequirements: 123 }).supplementaryRequirements).toBe('');
    expect(normalizePosterProductionSettings({ supplementaryRequirements: '字'.repeat(2001) }).supplementaryRequirements).toHaveLength(2000);
  });
});
