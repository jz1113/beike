import { describe, it, expect } from 'vitest';
import { buildCollectorAIAssistantPayload } from '../collectorTypes';

describe('buildCollectorAIAssistantPayload', () => {
  it('correctly imports social video item from history with video and companion images', () => {
    const historyItem = {
      id: 'social_xhs_12345',
      type: 'social',
      title: '162 130 | 130斤微胖女生如何靠穿搭逆袭',
      coverImage: 'https://sns-img-hw.xhscdn.com/cover_1.jpg',
      images: ['https://sns-img-hw.xhscdn.com/cover_1.jpg'],
      video: 'https://sns-video-hw.xhscdn.com/video_1.mp4',
      time: '2026-09-03 14:00',
    };

    // User clicked [ AI助手 ] from history card without explicit options
    const payload = buildCollectorAIAssistantPayload({
      item: historyItem,
      selectedVideo: false, // Notice: Single panel state might be false, but history should NOT be polluted!
      selectedSingleImages: ['https://example.com/unrelated_product.jpg'],
      singleCollectedResultId: 'other_single_item_999',
    });

    expect(payload).not.toBeNull();
    expect(payload?.hasVideo).toBe(true);
    expect(payload?.attachments).toHaveLength(2); // 1 image + 1 video

    const imgAtt = payload?.attachments.find(a => a.type === 'image');
    expect(imgAtt).toBeDefined();
    expect(imgAtt?.url).toBe('https://sns-img-hw.xhscdn.com/cover_1.jpg');

    const videoAtt = payload?.attachments.find(a => a.type === 'video');
    expect(videoAtt).toBeDefined();
    expect(videoAtt?.url).toBe('https://sns-video-hw.xhscdn.com/video_1.mp4');
    expect(videoAtt?.thumbnailUrl).toBe('https://sns-img-hw.xhscdn.com/cover_1.jpg');

    // Video-specific prompt
    expect(payload?.prompt).toContain('原视频');
    expect(payload?.prompt).toContain('基于多帧画面理解镜头运动');
  });

  it('supports videoUrl or videos array fallback', () => {
    const itemWithVideoUrl = {
      id: 'social_douyin_777',
      type: 'social',
      title: '抖音穿搭视频爆款',
      coverImage: 'https://douyinpic.com/c1.jpg',
      images: [],
      videoUrl: 'https://v26-web.douyinvod.com/test.mp4',
    };

    const payload = buildCollectorAIAssistantPayload({
      item: itemWithVideoUrl,
    });

    expect(payload).not.toBeNull();
    expect(payload?.hasVideo).toBe(true);
    const videoAtt = payload?.attachments.find(a => a.type === 'video');
    expect(videoAtt?.url).toBe('https://v26-web.douyinvod.com/test.mp4');
  });

  it('respects explicit includeVideo = false', () => {
    const item = {
      id: 'social_xhs_1',
      type: 'social',
      title: '测试只导入图片',
      coverImage: 'https://sns-img-hw.xhscdn.com/c.jpg',
      images: ['https://sns-img-hw.xhscdn.com/c.jpg'],
      video: 'https://sns-video-hw.xhscdn.com/v.mp4',
    };

    const payload = buildCollectorAIAssistantPayload({
      item,
      includeVideo: false,
    });

    expect(payload).not.toBeNull();
    expect(payload?.hasVideo).toBe(false);
    expect(payload?.attachments.every(a => a.type === 'image')).toBe(true);
    expect(payload?.prompt).toContain('爆款素材');
  });

  it('respects explicit includeVideo = true', () => {
    const item = {
      id: 'social_xhs_2',
      type: 'social',
      title: '测试显式导入视频',
      coverImage: 'https://sns-img-hw.xhscdn.com/c.jpg',
      images: ['https://sns-img-hw.xhscdn.com/c.jpg'],
      video: 'https://sns-video-hw.xhscdn.com/v.mp4',
    };

    const payload = buildCollectorAIAssistantPayload({
      item,
      includeVideo: true,
    });

    expect(payload).not.toBeNull();
    expect(payload?.hasVideo).toBe(true);
    expect(payload?.attachments.some(a => a.type === 'video')).toBe(true);
  });

  it('in single panel, respects selectedVideo = false when matching current single item', () => {
    const item = {
      id: 'single_active_item_1',
      type: 'social',
      title: '当前单条解析结果',
      coverImage: 'https://sns-img-hw.xhscdn.com/c.jpg',
      images: ['https://sns-img-hw.xhscdn.com/c.jpg', 'https://sns-img-hw.xhscdn.com/c2.jpg'],
      video: 'https://sns-video-hw.xhscdn.com/v.mp4',
    };

    const payload = buildCollectorAIAssistantPayload({
      item,
      selectedVideo: false, // user unchecked video checkbox in single panel
      singleCollectedResultId: 'single_active_item_1', // matching ID
    });

    expect(payload).not.toBeNull();
    expect(payload?.hasVideo).toBe(false);
    expect(payload?.attachments.some(a => a.type === 'video')).toBe(false);
    expect(payload?.attachments).toHaveLength(2);
  });

  it('uses custom prompt when provided', () => {
    const item = {
      id: 'item_custom',
      type: 'ecommerce',
      title: '复古纯银项链',
      coverImage: 'https://img.alicdn.com/1.jpg',
      images: ['https://img.alicdn.com/1.jpg'],
    };

    const payload = buildCollectorAIAssistantPayload({
      item,
      customPrompt: '请帮我写一段针对欧美独立站的高转化英文文案',
    });

    expect(payload?.prompt).toBe('请帮我写一段针对欧美独立站的高转化英文文案');
  });

  it('returns null safely if item has no valid media and no video', () => {
    const emptyItem = {
      id: 'empty_1',
      title: '空素材',
      images: [],
    };

    const payload = buildCollectorAIAssistantPayload({
      item: emptyItem,
    });

    expect(payload).toBeNull();
  });
});
