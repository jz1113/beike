import { describe, it, expect, vi, beforeEach } from 'vitest';
import { persistCanvasMedia } from '../canvasMediaImport';

vi.mock('@/lib/apiClient', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, url: '/storage/media.mp4' }),
  }),
}));

vi.mock('@/lib/refMediaRegistry', () => ({
  registerRefMedia: vi.fn(),
}));

vi.mock('@/lib/mediaHelper', () => ({
  extractVideoMetadataFromFile: vi.fn(),
  extractImageDimensionsFromFile: vi.fn(),
}));

import { extractVideoMetadataFromFile, extractImageDimensionsFromFile } from '@/lib/mediaHelper';

describe('persistCanvasMedia 媒体导入尺寸测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('导入 16:9 横屏视频时，卡片采用横屏等比尺寸并记录原始 1920x1080 分辨率', async () => {
    vi.mocked(extractVideoMetadataFromFile).mockResolvedValueOnce({
      thumbnailUrl: 'data:image/jpeg;base64,thumb',
      width: 1920,
      height: 1080,
      duration: 10,
    });

    const file = new File(['dummy content'], 'horizontal.mp4', { type: 'video/mp4' });
    const node = await persistCanvasMedia(file, 500, 500);

    expect(node.type).toBe('video');
    expect(node.resultWidth).toBe(1920);
    expect(node.resultHeight).toBe(1080);
    // 16:9 横屏视频宽度为 360，高度为 360 / (1920/1080) = 203
    expect(node.width).toBe(360);
    expect(node.height).toBe(203);
    expect(node.videoUrl).toBe('/storage/media.mp4');
    expect(node.imageUrl).toBe('data:image/jpeg;base64,thumb');
  });

  it('导入 9:16 竖屏视频时，卡片采用竖屏等比尺寸并记录原始 1080x1920 分辨率', async () => {
    vi.mocked(extractVideoMetadataFromFile).mockResolvedValueOnce({
      thumbnailUrl: 'data:image/jpeg;base64,thumb',
      width: 1080,
      height: 1920,
      duration: 15,
    });

    const file = new File(['dummy content'], 'vertical.mp4', { type: 'video/mp4' });
    const node = await persistCanvasMedia(file, 500, 500);

    expect(node.type).toBe('video');
    expect(node.resultWidth).toBe(1080);
    expect(node.resultHeight).toBe(1920);
    // 9:16 竖屏视频宽度为 280，高度为 280 / (1080/1920) = 498
    expect(node.width).toBe(280);
    expect(node.height).toBe(498);
  });

  it('导入 4:3 图片时，卡片按比例计算尺寸并记录原始分辨率', async () => {
    vi.mocked(extractImageDimensionsFromFile).mockResolvedValueOnce({
      width: 1600,
      height: 1200,
    });

    const file = new File(['dummy content'], 'photo.jpg', { type: 'image/jpeg' });
    const node = await persistCanvasMedia(file, 500, 500);

    expect(node.type).toBe('image');
    expect(node.resultWidth).toBe(1600);
    expect(node.resultHeight).toBe(1200);
    expect(node.width).toBe(300);
    expect(node.height).toBe(225); // 300 / (1600/1200) = 225
  });

  it('支持导入大于 90MB 的大视频（如 200MB），不再被旧的 90MB 限制阻断', async () => {
    vi.mocked(extractVideoMetadataFromFile).mockResolvedValueOnce({
      thumbnailUrl: 'data:image/jpeg;base64,thumb',
      width: 1920,
      height: 1080,
      duration: 60,
    });

    const file = new File(['x'], 'large-video.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 200 * 1024 * 1024 });

    const node = await persistCanvasMedia(file, 500, 500);
    expect(node.type).toBe('video');
    expect(node.width).toBe(360);
    expect(node.height).toBe(203);
  });

  it('当视频超过 500MB 时给出明确且友好的错误提示', async () => {
    const file = new File(['x'], 'huge-video.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 550 * 1024 * 1024 });

    await expect(persistCanvasMedia(file, 500, 500)).rejects.toThrow(
      '单个视频素材请控制在 500 MB 以内，超大素材请先裁切或压缩'
    );
  });
});
