import { describe, it, expect } from 'vitest';
import { buildVideoRequest, resolveVideoAdapter } from '../../index';

describe('Wan 万相官方转聚合平台适配器测试 (wanVideoAdapter)', () => {
  const BASE_URL = 'https://api.aggregator.com';

  it('正确匹配 Wan 各种官方与版本模型名称', () => {
    const a1 = resolveVideoAdapter('wan3.0-video');
    expect(a1.id).toBe('wan');

    const a2 = resolveVideoAdapter('wan3.0-video-prime');
    expect(a2.id).toBe('wan');

    const a3 = resolveVideoAdapter('wan2.6-t2v');
    expect(a3.id).toBe('wan');

    const a4 = resolveVideoAdapter('wan2.6-i2v');
    expect(a4.id).toBe('wan');

    const a5 = resolveVideoAdapter('wanx-v1');
    expect(a5.id).toBe('wan');
  });

  it('提交与查询端点优先使用聚合平台官方转接路径，并携带 X-DashScope-Async 请求头', () => {
    const res = buildVideoRequest({
      model: 'wan3.0-video',
      prompt: '一只小猫在月光下的屋顶上奔跑',
    });

    expect(res.family).toBe('wan');
    expect(res.modelId).toBe('wan3.0-video');
    expect(res.headers).toEqual({
      'X-DashScope-Async': 'enable',
    });

    const endpoints = res.endpoints(BASE_URL);
    expect(endpoints.submit[0]).toBe('https://api.aggregator.com/qwen/api/v1/services/aigc/video-generation/video-synthesis');
    expect(endpoints.submit[1]).toBe('https://api.aggregator.com/api/v1/services/aigc/video-generation/video-synthesis');

    expect(endpoints.query[0]).toBe('https://api.aggregator.com/qwen/api/v1/tasks/{taskId}');
    expect(endpoints.query[1]).toBe('https://api.aggregator.com/api/v1/tasks/{taskId}');
  });

  it('文生视频正确组装官方结构，严禁传入 media 属性', () => {
    const res = buildVideoRequest({
      model: 'wan3.0-video',
      prompt: '一只小猫在月光下的屋顶上奔跑，城市的霓虹灯在远处闪烁',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
      watermark: false,
      audio: true,
    });

    const payload = res.payload as any;
    expect(payload.model).toBe('wan3.0-video');
    expect(payload.input).toBeDefined();
    expect(payload.input.prompt).toBe('一只小猫在月光下的屋顶上奔跑，城市的霓虹灯在远处闪烁');
    // 关键校验：文生视频绝不能有 media 属性
    expect(payload.input.media).toBeUndefined();

    expect(payload.parameters).toBeDefined();
    expect(payload.parameters.resolution).toBe('720P');
    expect(payload.parameters.ratio).toBe('16:9');
    expect(payload.parameters.duration).toBe(5);
    expect(payload.parameters.audio).toBe(true);
    expect(payload.parameters.prompt_extend).toBe(true);
    expect(payload.parameters.watermark).toBe(false);
  });

  it('单图图生视频正确组装 first_frame，且默认 ratio 为 adaptive', () => {
    const res = buildVideoRequest({
      model: 'wan3.0-video-prime',
      prompt: '一只猫在草地上奔跑',
      images: ['https://cdn.translate.alibaba.com/r/wanx-demo-1.png'],
    });

    const payload = res.payload as any;
    expect(payload.model).toBe('wan3.0-video-prime');
    expect(payload.input.prompt).toBe('一只猫在草地上奔跑');
    expect(payload.input.media).toEqual([
      {
        type: 'first_frame',
        url: 'https://cdn.translate.alibaba.com/r/wanx-demo-1.png',
      },
    ]);
    expect(payload.parameters.resolution).toBe('1080P');
    expect(payload.parameters.ratio).toBe('adaptive');
  });

  it('首尾帧生视频正确组装 first_frame 与 last_frame 且互斥于 reference_*', () => {
    const res = buildVideoRequest({
      model: 'wan3.0-video',
      prompt: '年轻女孩微笑到大笑',
      firstFrame: 'https://example.com/first.png',
      lastFrame: 'https://example.com/last.png',
      refMode: 'first_last_frame',
      resolution: '480P',
      duration: 10,
    });

    const payload = res.payload as any;
    expect(payload.input.media).toEqual([
      { type: 'first_frame', url: 'https://example.com/first.png' },
      { type: 'last_frame', url: 'https://example.com/last.png' },
    ]);
    expect(payload.parameters.resolution).toBe('480P');
    expect(payload.parameters.duration).toBe(10);
  });

  it('多图参考模式正确组装 reference_image 列表', () => {
    const res = buildVideoRequest({
      model: 'wan3.0-video',
      prompt: '图1拿着图2在跳舞',
      images: [
        'https://example.com/img1.png',
        'https://example.com/img2.png',
      ],
      refMode: 'reference_image',
    });

    const payload = res.payload as any;
    expect(payload.input.media).toEqual([
      { type: 'reference_image', url: 'https://example.com/img1.png' },
      { type: 'reference_image', url: 'https://example.com/img2.png' },
    ]);
  });

  it('参考视频模式正确组装 reference_video 列表', () => {
    const res = buildVideoRequest({
      model: 'wan3.0-video',
      prompt: '将视频1转换为黏土风格',
      videos: ['https://example.com/video1.mp4'],
      aspectRatio: '16:9',
    });

    const payload = res.payload as any;
    expect(payload.input.media).toEqual([
      { type: 'reference_video', url: 'https://example.com/video1.mp4' },
    ]);
    expect(payload.parameters.ratio).toBe('16:9');
  });
});
