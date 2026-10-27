import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupPreviewImageSources } from './groupPreviewImageSources';

vi.mock('@client/shared/api/apiClient', () => ({
  proxyMediaUrl: (url: string, options?: { thumb?: boolean; width?: number }) => {
    if (url.startsWith('//')) url = `https:${url}`;
    if (url.startsWith('/')) return url;
    const query = options?.thumb ? `&thumb=1&w=${options.width || 640}` : options?.width ? `&w=${options.width}` : '';
    return `/api/system/proxy-image?url=${encodeURIComponent(url)}${query}`;
  },
}));

const source = 'https://images.example/group-1.png';
const proxy = (width: number) => `/api/system/proxy-image?url=${encodeURIComponent(source)}&thumb=1&w=${width}`;

afterEach(() => vi.unstubAllGlobals());

describe('图组预览图片来源', () => {
  it('没有已加载图片时先显示卡片缩略图并请求弹窗清晰图', () => {
    vi.stubGlobal('document', { baseURI: 'http://localhost/', images: [] });
    const result = groupPreviewImageSources(source, 'group');
    expect(result.preview).toContain('&w=320');
    expect(result.sources[0]).toContain('&w=640');
  });

  it('复用已解码的较大图片，同时不阻塞弹窗显示', () => {
    vi.stubGlobal('document', {
      baseURI: 'http://localhost/',
      images: [{ currentSrc: proxy(960), src: proxy(960), complete: true, naturalWidth: 960, naturalHeight: 1280 }],
    });
    const result = groupPreviewImageSources(source, 'group');
    expect(result.preview).toBe(proxy(960));
    expect(result.previewLoaded).toBe(true);
    expect(result.sources[0]).toBe(proxy(960));
  });
});
