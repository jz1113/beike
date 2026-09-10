import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseSocialLinkViaQiyun, mapQiyunErrorCode } from '../qiyunScraper';

describe('qiyunScraper', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps standard error codes properly', () => {
    expect(mapQiyunErrorCode(200)).toBe('解析成功');
    expect(mapQiyunErrorCode(204)).toContain('不支持解析该平台');
    expect(mapQiyunErrorCode(3002)).toContain('调用次数不足');
    expect(mapQiyunErrorCode(9999, '自定义未知错误')).toBe('自定义未知错误');
  });

  it('returns failure when appId or appKey is missing', async () => {
    const res = await parseSocialLinkViaQiyun('https://v.douyin.com/test/', { appId: '', appKey: '' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('未配置奇云');
    }
  });

  it('parses images and strips live photos correctly from Qiyun API', async () => {
    const mockData = {
      code: 200,
      msg: '解析成功',
      data: {
        video_url: 'https://live-stream.mp4',
        cover_url: 'https://cover.jpg',
        title: '测试爆款标题',
        content: '测试小红书正文说明',
        images: [
          { url: 'https://img1.jpg', live_photo_url: '' },
          { url: 'https://img2.jpg', live_photo_url: 'https://live-photo.mp4' },
          { url: 'https://leak-video.mp4', live_photo_url: '' },
        ],
        author: {
          uid: '12345',
          name: '测试创作者',
          avatar: 'https://avatar.jpg',
        },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as any);

    const res = await parseSocialLinkViaQiyun('https://v.douyin.com/abc1234/', {
      appId: 'test_app_id',
      appKey: 'test_app_key',
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.media.title).toBe('测试爆款标题');
      expect(res.media.description).toBe('测试小红书正文说明');
      expect(res.media.author).toBe('测试创作者');
      // 图集/实况图笔记中：去掉实况，video 置空，只保留静态图片
      expect(res.media.video).toBeNull();
      expect(res.media.images).toEqual(['https://img1.jpg', 'https://img2.jpg']);
      expect(res.media.livePhotos).toBeUndefined();
    }
  });

  it('preserves video when note has no images (pure video work)', async () => {
    const mockData = {
      code: 200,
      msg: '解析成功',
      data: {
        video_url: 'https://video.mp4',
        cover_url: 'https://cover.jpg',
        title: '纯视频作品',
        images: [],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as any);

    const res = await parseSocialLinkViaQiyun('https://v.douyin.com/video123/', {
      appId: 'test_app_id',
      appKey: 'test_app_key',
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.media.video).toBe('https://video.mp4');
      expect(res.media.images).toEqual([]);
    }
  });

  it('handles error response from Qiyun API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 3002,
        msg: '调用次数不足',
      }),
    } as any);

    const res = await parseSocialLinkViaQiyun('https://v.douyin.com/abc1234/', {
      appId: 'test_app_id',
      appKey: 'test_app_key',
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('调用次数不足');
      expect(res.upstreamCode).toBe(3002);
    }
  });
});
