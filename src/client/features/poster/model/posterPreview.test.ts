import { describe, expect, it } from 'vitest';
import { posterModelImageUrl, posterPreviewImages } from './posterTypes';

describe('posterPreviewImages', () => {
  it('shows only the current cover result for one product', () => {
    expect(posterPreviewImages({
      sourceImageUrl: 'https://example.com/product.jpg',
      generatedSceneUrl: 'https://example.com/generated.png',
      resultUrl: 'blob:finished-cover',
    })).toEqual(['blob:finished-cover']);
  });

  it('falls back to the durable upstream scene and then the input image', () => {
    expect(posterPreviewImages({ sourceImageUrl: 'https://example.com/product.jpg', generatedSceneUrl: 'https://example.com/generated.png' })).toEqual(['https://example.com/generated.png']);
    expect(posterPreviewImages({ sourceImageUrl: 'https://example.com/product.jpg' })).toEqual(['https://example.com/product.jpg']);
  });
});

describe('posterModelImageUrl', () => {
  it('submits local upload paths without the browser development port', () => {
    expect(posterModelImageUrl('http://127.0.0.1:5173/storage/local/product.png', 'http://localhost:5173')).toBe('/storage/local/product.png');
    expect(posterModelImageUrl('https://studio.example.com/storage/product.png?exp=1', 'https://studio.example.com')).toBe('/storage/product.png?exp=1');
  });

  it('preserves remote signed images and does not map other hosts to local storage', () => {
    const remote = 'https://cdn.example.com/storage/product.png?signature=abc';
    expect(posterModelImageUrl(remote, 'https://studio.example.com')).toBe(remote);
  });
});
