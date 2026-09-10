import { describe, it, expect } from 'vitest';
import { buildVideoRequest, resolveVideoAdapter } from '../../index';

describe('Seedance 官方转适配器测试 (seedanceVideoAdapter)', () => {
  const BASE_URL = 'https://api.aggregator.com';

  it('正确匹配 Seedance 系列模型', () => {
    const adapter1 = resolveVideoAdapter('doubao-seedance-2.5');
    expect(adapter1.id).toBe('seedance');

    const adapter2 = resolveVideoAdapter('seedance-2.0-mini');
    expect(adapter2.id).toBe('seedance');

    const adapter3 = resolveVideoAdapter('seedance-1.5-pro');
    expect(adapter3.id).toBe('seedance');
  });

  it('提交与查询端点优先使用官方转路径', () => {
    const res = buildVideoRequest({
      model: 'doubao-seedance-2.5',
      prompt: '一只小猫在阳光下奔跑',
    });

    const endpoints = res.endpoints(BASE_URL);
    expect(endpoints.submit[0]).toBe('https://api.aggregator.com/seedance/v3/contents/generations/tasks');
    expect(endpoints.query[0]).toBe('https://api.aggregator.com/seedance/v3/contents/generations/tasks/{taskId}');
  });

  it('文生视频正确组装官方 content 数组与参数', () => {
    const res = buildVideoRequest({
      model: 'doubao-seedance-2.5',
      prompt: '科技感赛博朋克城市夜景',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
      watermark: false,
    });

    expect(res.family).toBe('seedance');
    expect(res.modelId).toBe('doubao-seedance-2.5');

    const payload = res.payload as any;
    expect(payload.model).toBe('doubao-seedance-2.5');
    expect(payload.duration).toBe(5);
    expect(payload.ratio).toBe('16:9');
    expect(payload.resolution).toBe('720p');
    expect(payload.watermark).toBe(false);
    expect(payload.generate_audio).toBe(true);

    expect(Array.isArray(payload.content)).toBe(true);
    expect(payload.content).toHaveLength(1);
    expect(payload.content[0]).toEqual({
      type: 'text',
      text: '科技感赛博朋克城市夜景',
    });
  });

  it('单图图生视频正确标记 role 为 first_frame', () => {
    const res = buildVideoRequest({
      model: 'doubao-seedance-2.0-mini',
      prompt: '使画面中的人物微笑',
      images: ['https://example.com/start.png'],
      aspectRatio: '9:16',
    });

    const payload = res.payload as any;
    expect(payload.content).toHaveLength(2);
    expect(payload.content[0]).toEqual({
      type: 'text',
      text: '使画面中的人物微笑',
    });
    expect(payload.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://example.com/start.png' },
      role: 'first_frame',
    });
    // 2.0 mini 保留用户指定的 ratio
    expect(payload.ratio).toBe('9:16');
  });

  it('首尾帧模式正确生成 first_frame 与 last_frame，且 Seedance 2.5 自动适配 adaptive 比例', () => {
    const res = buildVideoRequest({
      model: 'doubao-seedance-2.5',
      prompt: '镜头向前平滑推移过渡',
      firstFrame: 'https://example.com/first.jpg',
      lastFrame: 'https://example.com/last.jpg',
      refMode: 'first_last_frame',
      aspectRatio: '16:9',
    });

    const payload = res.payload as any;
    expect(payload.content).toHaveLength(3);
    expect(payload.content[0].type).toBe('text');
    expect(payload.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://example.com/first.jpg' },
      role: 'first_frame',
    });
    expect(payload.content[2]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://example.com/last.jpg' },
      role: 'last_frame',
    });

    // 官方规范：Seedance 2.5 图生首尾帧必须为 adaptive
    expect(payload.ratio).toBe('adaptive');
  });

  it('多图全模态参考生视频正确标记为 reference_image', () => {
    const res = buildVideoRequest({
      model: 'doubao-seedance-2.5',
      prompt: '根据参考图生成产品多角度展示',
      images: [
        'https://example.com/ref1.jpg',
        'https://example.com/ref2.jpg',
        'https://example.com/ref3.jpg',
      ],
      refMode: 'omni',
    });

    const payload = res.payload as any;
    expect(payload.content).toHaveLength(4);
    expect(payload.content[0].type).toBe('text');
    expect(payload.content[1].role).toBe('reference_image');
    expect(payload.content[2].role).toBe('reference_image');
    expect(payload.content[3].role).toBe('reference_image');
  });

  it('包含参考视频时正确映射为 reference_video', () => {
    const res = buildVideoRequest({
      model: 'doubao-seedance-2.5',
      prompt: '延续参考视频的动态运动风格',
      videos: ['https://example.com/motion.mp4'],
    });

    const payload = res.payload as any;
    expect(payload.content).toHaveLength(2);
    expect(payload.content[1]).toEqual({
      type: 'video_url',
      video_url: { url: 'https://example.com/motion.mp4' },
      role: 'reference_video',
    });
  });
});
