import { describe, expect, it } from 'vitest';
import { posterItemFromUploadedImage, titleFromImageFileName } from './posterDraft';

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