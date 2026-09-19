import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../parse-link';
import * as qiyunScraper from '@beike/server-kit/qiyunScraper';
import * as apiaScraper from '@beike/server-kit/apiaScraper';

vi.mock('@beike/server-kit/qiyunScraper', () => ({
  parseSocialLinkViaQiyun: vi.fn(),
}));

vi.mock('@beike/server-kit/apiaScraper', () => ({
  parseSocialLinkViaApia: vi.fn(),
}));

describe('parse-link route video preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves video and cleans images for video notes with cover image', async () => {
    vi.mocked(qiyunScraper.parseSocialLinkViaQiyun).mockResolvedValue({
      success: true,
      media: {
        title: '车厘子测评视频',
        description: '车厘子真的又大又脆',
        author: '水果博主',
        cover: 'https://sns-webpic-qc.xhscdn.com/cover.jpg',
        images: ['https://sns-webpic-qc.xhscdn.com/cover.jpg', 'https://leak.mp4'],
        video: 'https://sns-video-bd.xhscdn.com/video.mp4',
      },
      apiUsed: '奇云',
    });

    const req = new Request('http://localhost/api/catalog/styles/parse-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-qiyun-appid': 'test_app_id',
        'x-qiyun-appkey': 'test_app_key',
      },
      body: JSON.stringify({
        url: 'https://www.xiaohongshu.com/explore/696b41d4000000001a02ff24',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    // 关键断言：短视频笔记中的 video 必须完整保留，绝不被置为 null
    expect(json.video).toBe('https://sns-video-bd.xhscdn.com/video.mp4');
    expect(json.cover).toBe('https://sns-webpic-qc.xhscdn.com/cover.jpg');
    // 关键断言：images 中的 mp4 混杂流必须被清洗，只保留图片
    expect(json.images).toEqual(['https://sns-webpic-qc.xhscdn.com/cover.jpg']);
  });

  it('falls back to APIA and preserves video when Qiyun fails', async () => {
    vi.mocked(qiyunScraper.parseSocialLinkViaQiyun).mockResolvedValue({
      success: false,
      error: '奇云限流',
    });

    vi.mocked(apiaScraper.parseSocialLinkViaApia).mockResolvedValue({
      success: true,
      media: {
        title: '抖音精选视频',
        description: '爆款素材',
        author: '达人',
        cover: 'https://p3.douyinpic.com/cover.jpg',
        images: ['https://p3.douyinpic.com/cover.jpg'],
        video: 'https://v1.douyinvod.com/video.mp4',
      },
      apiUsed: 'APIA',
    });

    const req = new Request('http://localhost/api/catalog/styles/parse-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-qiyun-appid': 'test_app_id',
        'x-qiyun-appkey': 'test_app_key',
        'x-apia-client-id': 'test_client_id',
        'x-apia-secret-key': 'test_secret_key',
      },
      body: JSON.stringify({
        url: 'https://v.douyin.com/abc1234/',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.video).toBe('https://v1.douyinvod.com/video.mp4');
    expect(json.cover).toBe('https://p3.douyinpic.com/cover.jpg');
  });
});

describe('dual scraper scheduling', () => {
  beforeEach(() => vi.resetAllMocks());
  const request = (preferredScraper?: string) => new Request('http://local/api/catalog/styles/parse-link', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.xiaohongshu.com/explore/example', scraperId: 'id', scraperSecret: 'secret', qiyunAppId: 'id', qiyunAppKey: 'key', preferredScraper }),
  });
  const success = { success: true as const, media: { title: 'test', description: '', author: '', cover: 'a.jpg', images: ['a.jpg', 'b.jpg', 'c.jpg'], video: null }, apiUsed: 'mock' };
  it('uses APIA first and does not charge a second provider after success', async () => {
    vi.mocked(apiaScraper.parseSocialLinkViaApia).mockResolvedValue(success);
    const data = await (await POST(request())).json();
    expect(data.apiUsed).toBe('APIA');
    expect(qiyunScraper.parseSocialLinkViaQiyun).not.toHaveBeenCalled();
  });
  it('falls back on a thrown provider exception and exposes the attempt chain', async () => {
    vi.mocked(apiaScraper.parseSocialLinkViaApia).mockRejectedValue(new Error('internal'));
    vi.mocked(qiyunScraper.parseSocialLinkViaQiyun).mockResolvedValue(success);
    const data = await (await POST(request())).json();
    expect(data.apiUsed).toBe('奇云');
    expect(data.attempts.map((a: {success: boolean}) => a.success)).toEqual([false, true]);
  });
  it('keeps both failure reasons', async () => {
    vi.mocked(apiaScraper.parseSocialLinkViaApia).mockResolvedValue({ success: false, error: 'APIA限流' });
    vi.mocked(qiyunScraper.parseSocialLinkViaQiyun).mockResolvedValue({ success: false, error: '奇云配额不足' });
    const response = await POST(request());
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain('APIA限流'); expect(data.error).toContain('奇云配额不足');
  });
  it('honors explicit Qiyun priority and falls back to APIA', async () => {
    vi.mocked(qiyunScraper.parseSocialLinkViaQiyun).mockResolvedValue({ success: false, error: '失败' });
    vi.mocked(apiaScraper.parseSocialLinkViaApia).mockResolvedValue(success);
    const data = await (await POST(request('qiyun'))).json();
    expect(data.attempts.map((a: {provider: string}) => a.provider)).toEqual(['奇云', 'APIA']);
  });
});
