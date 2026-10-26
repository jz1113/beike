import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLightboxImageSources } from './lightboxImageSources';

vi.mock('@client/shared/api/apiClient', () => ({
  proxyMediaUrl: (url: string, options?: { width?: number }) => {
    if (url.startsWith('//')) url = `https:${url}`;
    return url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')
      ? url : `/api/system/proxy-image?url=${encodeURIComponent(url)}${options?.width ? `&w=${options.width}` : ''}`;
  },
}));

const original = 'https://images.example/generated.png';
const proxy = (width: number) => `http://localhost/api/system/proxy-image?url=${encodeURIComponent(original)}&thumb=1&w=${width}&sig=session`;
function image(src: string, width = 640, complete = true) {
  return { src, currentSrc: src, naturalWidth: width, naturalHeight: width / 2, complete };
}
function documentWith(...images: ReturnType<typeof image>[]) {
  vi.stubGlobal('document', { baseURI: 'http://localhost/', images });
}
afterEach(() => vi.unstubAllGlobals());

describe('lightbox image sources', () => {
  it('reuses the loaded original without an extra proxy download', () => {
    documentWith(image(original, 4096));
    const { sources, preview } = resolveLightboxImageSources(original);
    expect(sources[0]).toBe(original);
    expect(preview).toEqual({ src: original, width: 4096, height: 2048 });
  });

  it('keeps the best decoded thumbnail visible while requesting high resolution', () => {
    documentWith(image(proxy(640)), image(proxy(960), 960));
    const { sources, preview } = resolveLightboxImageSources(original);
    expect(preview?.src).toBe(proxy(960));
    expect(sources[0]).toContain('&w=1920');
    expect(sources[1]).toBe(original);
  });

  it('ignores incomplete, broken and unrelated images', () => {
    documentWith(image(original, 640, false), image(original, 0), image('https://other.example/a.png', 1920));
    expect(resolveLightboxImageSources(original).preview).toBeNull();
  });

  it('matches relative local storage and protocol-relative originals', () => {
    documentWith(image('http://localhost/storage/result.png', 2048));
    expect(resolveLightboxImageSources('/storage/result.png').sources[0]).toBe('http://localhost/storage/result.png');
    documentWith(image(original));
    expect(resolveLightboxImageSources('//images.example/generated.png').preview?.src).toBe(original);
  });

  it('preserves valid 400 by 400 images and inline images', () => {
    documentWith({ ...image(original, 400), naturalHeight: 400 });
    expect(resolveLightboxImageSources(original).sources[0]).toBe(original);
    documentWith();
    expect(resolveLightboxImageSources('data:image/png;base64,abc').sources).toEqual(['data:image/png;base64,abc']);
    expect(resolveLightboxImageSources('blob:http://localhost/image').sources).toEqual(['blob:http://localhost/image']);
  });

  it('works without a browser document', () => {
    vi.stubGlobal('document', undefined);
    expect(resolveLightboxImageSources(original).preview).toBeNull();
  });
});
